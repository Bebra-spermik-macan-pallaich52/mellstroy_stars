// Pure simulation, camera, and input regression checks. No browser packages.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const context=vm.createContext({console,document:{hidden:false,addEventListener(){}},window:{addEventListener(){}}});
for(const file of ['camera','input','assets','collision','projectile','characters','player','map','donationsMode','cottageMode','teamfightMode','gameManager','bot','simulation'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'),context);
vm.runInContext('globalThis.api={Camera,Input,Simulation,Bot,Player,Projectile,createMap,mapCatalog,getCharacterConfig,overlaps};',context);
const {Camera,Input,Simulation,Bot,Player,Projectile,createMap,mapCatalog,getCharacterConfig,overlaps}=context.api;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function battle(){const sim=new Simulation({humanSlots:[0,1,2,3,4,5],enhancements:false});sim.map.width=1600;sim.map.height=1000;sim.map.walls=[];sim.actors.forEach((a,i)=>{a.x=i<3?100:900;a.y=50+i%3*300;});return sim;}
function addBot(sim,slot=0){const bot=new Bot(sim.actors[slot],slot);sim.bots=[bot];return bot;}

test('camera follows both axes, clamps at all map borders, and handles a small world',()=>{
 const camera=new Camera(960,640),map={width:1920,height:1280};
 camera.update({x:960,y:640},map,0,true);close(camera.x,480);close(camera.y,320);
 camera.update({x:5000,y:5000},map,0,true);close(camera.x,960);close(camera.y,640);
 camera.update({x:-5000,y:-5000},map,0,true);close(camera.x,0);close(camera.y,0);
 camera.update({x:500,y:500},{width:400,height:300},0,true);close(camera.x,0);close(camera.y,0);
});
test('camera smoothing is independent of update frequency and has no overshoot',()=>{
 const a=new Camera(),b=new Camera(),map={width:2560,height:1600},target={x:1500,y:900};
 a.update(target,map,.1);for(let i=0;i<10;i++)b.update(target,map,.01);
 close(a.x,b.x);close(a.y,b.y);assert(a.x>0&&a.x<1020);
 a.update(target,map,0);close(a.x,b.x);
});
test('camera transforms are reversible and offscreen entities can be culled',()=>{
 const camera=new Camera();camera.x=700.25;camera.y=300.5;
 const world=camera.screenToWorld({x:400,y:250}),screen=camera.worldToScreen(world);
 close(screen.x,400);close(screen.y,250);assert(camera.visible({x:800,y:350,width:48,height:64}));assert(!camera.visible({x:20,y:20,width:48,height:64}));
});
test('mouse aim includes CSS scaling, borders and fractional camera movement',()=>{
 const canvas={width:960,height:640,clientWidth:480,clientHeight:320,clientLeft:2,clientTop:2,addEventListener(){},getBoundingClientRect(){return{left:100,top:50};}};
 const input=new Input({addEventListener(){}},canvas);input.camera=new Camera();input.camera.x=700.25;input.camera.y=300.5;
 input.mouse={hasPosition:true,clientX:342,clientY:212};const aim=input.aim();close(aim.x,1180.25);close(aim.y,620.5);
 input.mouse.clientX=0;close(input.aim().x,496.25);
});
test('mouse aim keeps subpixel layout sizes after responsive scaling',()=>{
 const rect={left:100,top:50,width:693.3333,height:462.2222};
 const canvas={width:960,height:640,clientWidth:693,clientHeight:462,clientLeft:0,clientTop:0,addEventListener(){},getBoundingClientRect(){return rect;}};
 const input=new Input({addEventListener(){}},canvas);input.camera=new Camera();input.camera.x=400.5;input.camera.y=200.25;
 input.mouse={hasPosition:true,clientX:rect.left+rect.width*.25,clientY:rect.top+rect.height*.7};
 const point=input.aim();close(point.x,640.5);close(point.y,648.25);
});
test('compact maps have distinct sizes, multiple destructible routes and clear central zones',()=>{
 assert.equal(new Set(mapCatalog.map(m=>`${m.width}x${m.height}`)).size,3);
 for(const item of mapCatalog){const map=createMap(item.id);assert(map.width>=960 && map.height>=640 && map.width*map.height<1920*1280);assert(map.walls.length>=18);
  assert(!map.walls.some(wall=>overlaps(wall,map.captureZone)));assert(map.roads.length>=3);
  for(const wall of map.walls){assert(wall.x>=0&&wall.y>=0&&wall.x+wall.width<=map.width&&wall.y+wall.height<=map.height);}
 }
});
test('all compact-map spawns have a walkable route to the objective with the full hitbox',()=>{
 for(const definition of mapCatalog){const map=createMap(definition.id);for(const spawn of map.teamSpawns.flat()){
   const actor=new Player(spawn,getCharacterConfig(0)),bot=new Bot(actor,0);assert(bot.planTo(map.resourcePoint,map),`${map.id}: route from ${spawn.x},${spawn.y}`);
   let previous=actor.center;for(const point of bot.path){assert(bot.clearSegment(previous,point,bot.navigation));previous=point;}
 }}
});
test('same-size bots share immutable navigation graphs and refresh after wall destruction',()=>{
 const sim=battle();sim.map.walls=[{x:450,y:180,width:60,height:300,destructible:true,health:600,id:'box'}];
 const a=new Bot(sim.actors[0],0),b=new Bot(sim.actors[1],1);
 const first=a.prepareNavigation(sim.map,3);assert.equal(first,b.prepareNavigation(sim.map,3));
 sim.damageWall(sim.map.walls[0],600,sim.actors[0]);const next=b.prepareNavigation(sim.map,3);assert.notEqual(first,next);assert.equal(next.version,1);
});
test('target scoring can finish a wounded visible enemy and prioritize a donation carrier',()=>{
 const sim=battle(),actor=sim.actors[0],bot=addBot(sim);actor.x=100;actor.y=200;
 const near=sim.actors[3],weak=sim.actors[4];near.x=330;near.y=200;weak.x=380;weak.y=200;weak.health=50;
 assert.equal(bot.selectEnemy(sim.world),weak);
 weak.health=weak.maxHealth;bot.targetEnemy=null;sim.manager.mode.carried.set(weak,5);assert.equal(bot.selectEnemy(sim.world),weak);
});
test('aim leads observed movement and discards teleport velocity',()=>{
 const sim=battle(),bot=addBot(sim),actor=sim.actors[0],enemy=sim.actors[3];actor.x=100;actor.y=200;enemy.x=400;enemy.y=200;
 bot.observe(.1,sim.world);enemy.y+=enemy.config.speed*.1;bot.observe(.1,sim.world);assert(bot.aimTarget(enemy,sim.map).y>enemy.center.y+enemy.config.speed*.2);
 enemy.y+=500;bot.observe(.1,sim.world);close(bot.aimTarget(enemy,sim.map).y,enemy.center.y);
});
test('predictive aiming falls back to a clear direct shot instead of leading into a wall',()=>{
 const sim=battle(),bot=addBot(sim),actor=sim.actors[0],enemy=sim.actors[3];actor.x=100;actor.y=200;enemy.x=400;enemy.y=200;
 bot.observations.set(enemy,{velocity:{x:0,y:200}});sim.map.walls=[{x:300,y:280,width:50,height:100}];
 const point=bot.aimTarget(enemy,sim.map);close(point.y,enemy.center.y);assert(bot.lineOfFire(actor.center,point,sim.map));
});
test('wounded bots seek real health pickups without modifying health directly',()=>{
 const sim=battle(),bot=addBot(sim),actor=sim.actors[0];actor.takeDamage(400);sim.powerups=[{id:1,kind:'heal',x:250,y:120,radius:13,remaining:24}];
 bot.update(.1,sim.world,true);assert.equal(bot.state,'heal');assert.equal(bot.targetPowerup,sim.powerups[0]);assert.equal(actor.health,600);
});
test('a badly wounded bot under fire retreats and uses the same speed/collisions',()=>{
 const sim=battle(),bot=addBot(sim),actor=sim.actors[0],enemy=sim.actors[3];actor.x=300;actor.y=300;enemy.x=600;enemy.y=300;
 actor.takeDamage(760);const from=actor.center;bot.update(.1,sim.world,true);assert.equal(bot.state,'recover');assert(bot.goal.x<from.x);
 assert(Math.hypot(actor.center.x-from.x,actor.center.y-from.y)<=actor.config.speed*.1+1e-7);
});
test('loaded donation carriers protect their resources rather than rushing the enemy',()=>{
 const sim=battle(),bot=addBot(sim),actor=sim.actors[0],enemy=sim.actors[3];actor.x=600;actor.y=400;enemy.x=850;enemy.y=400;actor.health=500;
 sim.map.resourcePoint={x:700,y:450};sim.manager.mode.carried.set(actor,4);bot.update(.1,sim.world,true);assert.equal(bot.state,'protect');assert(bot.goal.x<sim.map.resourcePoint.x);
});
test('combat movement maintains range and varies laterally instead of standing still',()=>{
 const sim=battle(),bot=addBot(sim),actor=sim.actors[0],enemy=sim.actors[3];actor.x=100;actor.y=200;enemy.x=350;enemy.y=200;
 const from=actor.center;bot.update(.1,sim.world,true);assert.equal(bot.state,'engage');assert(Math.abs(actor.center.y-from.y)>5);
});
test('cottage defenders strafe within the zone instead of abandoning it to chase',()=>{
 const sim=new Simulation({modeId:'cottage',humanSlots:[0,1,2,3,4,5],enhancements:false});sim.map.walls=[];const zone=sim.map.captureZone,actor=sim.actors[0],enemy=sim.actors[3];
 actor.x=zone.x+70;actor.y=zone.y+70;enemy.x=actor.x+200;enemy.y=actor.y;const bot=addBot(sim);bot.update(.1,sim.world,true);
 assert.equal(bot.state,'engage');assert(bot.goal.x>=zone.x+actor.width/2&&bot.goal.x<=zone.x+zone.width-actor.width/2);
 assert(bot.goal.y>=zone.y+actor.height/2&&bot.goal.y<=zone.y+zone.height-actor.height/2);
});
test('bots dodge a threatening projectile after travel time and respect occluding walls',()=>{
 const sim=battle(),bot=addBot(sim),actor=sim.actors[0],enemy=sim.actors[3];actor.x=300;actor.y=300;enemy.x=700;enemy.y=300;
 const shot=new Projectile(enemy,{x:-1,y:0},enemy.config.attack);shot.x=600;shot.y=actor.center.y;shot.traveled=100;sim.projectiles=[shot];
 const direction=bot.steer({x:0,y:0},sim.world,.1);assert(bot.dodgeRemaining>0);assert(Math.abs(direction.y)>.9);
 bot.dodgeRemaining=0;bot.dodgeCooldown=0;sim.map.walls=[{x:440,y:200,width:30,height:300}];bot.steer({x:0,y:0},sim.world,.1);assert.equal(bot.dodgeRemaining,0);
});
test('bots do not react instantaneously to newly created projectiles',()=>{
 const sim=battle(),bot=addBot(sim),actor=sim.actors[0],enemy=sim.actors[3];actor.x=300;actor.y=300;
 const shot=new Projectile(enemy,{x:-1,y:0},enemy.config.attack);shot.x=600;shot.y=actor.center.y;shot.traveled=0;sim.projectiles=[shot];
 bot.steer({x:0,y:0},sim.world,.01);assert.equal(bot.dodgeRemaining,0);
});
test('ally separation changes steering without exceeding normal walking speed',()=>{
 const sim=battle(),bot=addBot(sim),actor=sim.actors[0],ally=sim.actors[1];actor.x=300;actor.y=300;ally.x=300;ally.y=330;
 bot.path=[{x:600,y:330}];const direction=bot.steer({x:1,y:0},sim.world,.1);assert(direction.y<0);assert(Math.hypot(direction.x,direction.y)<=1+1e-9);
});
