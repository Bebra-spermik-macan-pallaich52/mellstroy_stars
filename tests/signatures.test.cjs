const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const context=vm.createContext({console});
for(const name of ['assets','collision','projectile','characters','player','map','donationsMode','cottageMode','teamfightMode','gameManager','bot','simulation','effects'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),context);
vm.runInContext('globalThis.api={Simulation,Projectile,characterDefinitions,VisualEffects};',context);
const{Simulation,Projectile,characterDefinitions,VisualEffects}=context.api;
const close=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function make(index=0){const sim=new Simulation({characterIndex:index,humanSlots:[0,1,2,3,4,5],enhancements:false});sim.map.walls=[];sim.actors.forEach((a,i)=>{a.x=i<3?100:1000;a.y=100+i%3*300;});return sim;}
function run(sim,seconds){for(let elapsed=0;elapsed<seconds-1e-9;elapsed+=.01)sim.step(Math.min(.01,seconds-elapsed));}
function fire(sim,target){sim.addProjectile(sim.actors[0].attack(target));}

test('all five normal attacks have independent mechanics and visual styles',()=>{
 assert.equal(new Set(characterDefinitions.map(c=>c.attack.kind)).size,5);
 assert.equal(new Set(characterDefinitions.map(c=>c.attack.style)).size,5);
 assert.equal(new Set(characterDefinitions.map(c=>c.super.kind)).size,5);
});
test('Arthur precision attack is a single fast propeller shot',()=>{const sim=make();fire(sim,{x:600,y:132});assert.equal(sim.projectiles.length,1);assert.equal(sim.pendingShots.length,0);assert.equal(sim.projectiles[0].style,'propeller');assert.equal(sim.projectiles[0].damage,200);});
test('Kotost fires three simultaneous claws with a symmetric spread and one cooldown',()=>{
 const sim=make(1),actor=sim.actors[0],target=sim.actors[3];target.x=190;target.y=100;fire(sim,target.center);
 assert.equal(sim.projectiles.length,3);assert.equal(sim.pendingShots.length,0);close(sim.projectiles[0].direction.y,-sim.projectiles[2].direction.y);assert.equal(actor.attack(target.center),null);
 run(sim,.25);assert.equal(target.health,target.maxHealth-240);
});
test('Fog fires two timed shots instead of two simultaneous pellets',()=>{
 const sim=make(4);fire(sim,{x:600,y:132});assert.equal(sim.projectiles.length,1);assert.equal(sim.pendingShots.length,1);
 run(sim,.06);assert.equal(sim.projectiles.length,1);run(sim,.05);assert.equal(sim.projectiles.length,2);assert.equal(sim.pendingShots.length,0);
});
test('death cancels pending burst shots but does not erase an already flying projectile',()=>{
 const sim=make(4);fire(sim,{x:600,y:132});sim.drainEvents();sim.actors[0].takeDamage(99999);run(sim,.11);
 assert.equal(sim.pendingShots.length,0);assert.equal(sim.projectiles.length,1);assert.equal(sim.drainEvents().filter(e=>e.type==='shot').length,0);
});
test('a delayed shot cannot leak into a new life even with an accelerated respawn',()=>{
 const sim=make(4);fire(sim,{x:600,y:132});sim.actors[0].takeDamage(99999);sim.actors[0].respawnRemaining=.001;run(sim,.12);
 assert(sim.actors[0].alive);assert.equal(sim.pendingShots.length,0);assert.equal(sim.projectiles.length,1);
});
test('flying and pending shots share the same global cap',()=>{
 const sim=make(4);for(let i=0;i<200;i++){sim.actors[0].cooldownRemaining=0;fire(sim,{x:600,y:132});}
 assert.equal(sim.projectiles.length+sim.pendingShots.length,160);run(sim,.12);assert(sim.projectiles.length<=160);assert.equal(sim.pendingShots.length,0);
});
test('Drun sphere hits two different enemies once and stops at the second',()=>{
 const sim=make(3);sim.actors.slice(3).forEach((a,i)=>{a.x=240+i*100;a.y=100;});fire(sim,{x:700,y:132});run(sim,1);
 assert.equal(sim.actors[3].health,sim.actors[3].maxHealth-140);assert.equal(sim.actors[4].health,sim.actors[4].maxHealth-140);assert.equal(sim.actors[5].health,sim.actors[5].maxHealth);
});
test('a piercing projectile sweeps multiple actors within a single large step',()=>{
 const sim=make(3);sim.actors.slice(3).forEach((a,i)=>{a.x=240+i*90;a.y=100;});const shot=sim.actors[0].attack({x:700,y:132});const hit=shot.update(1,sim.map,sim.actors);
 assert.equal(hit.hits.length,2);assert.equal(new Set(hit.hits.map(e=>e.target)).size,2);assert.equal(shot.active,false);
});
test('piercing does not repeatedly hit a target while inside its hitbox',()=>{
 const sim=make(3),target=sim.actors[3];target.x=180;target.y=100;target.width=300;fire(sim,target.center);run(sim,.7);
 assert.equal(target.health,target.maxHealth-140);close(sim.actors[0].superCharge,14);
});
test('Arthur super pierces three enemies and still stops at a thin wall',()=>{
 const sim=make();sim.actors.slice(3).forEach((a,i)=>{a.x=230+i*100;a.y=100;});const actor=sim.actors[0];actor.superCharge=100;actor.useSuper({x:700,y:132},sim.world);run(sim,.6);
 for(const target of sim.actors.slice(3))assert.equal(target.health,target.maxHealth-600);
 const blocked=make();blocked.actors[3].x=230;blocked.actors[3].y=100;blocked.actors[4].x=430;blocked.actors[4].y=100;blocked.map.walls=[{x:340,y:0,width:1,height:800}];blocked.actors[0].superCharge=100;blocked.actors[0].useSuper({x:700,y:132},blocked.world);run(blocked,.6);
 assert.equal(blocked.actors[3].health,blocked.actors[3].maxHealth-600);assert.equal(blocked.actors[4].health,blocked.actors[4].maxHealth);
});
test('bomb splash damages nearby opponents once, excludes allies and charges from actual damage',()=>{
 const sim=make(2),a=sim.actors[0],first=sim.actors[3],second=sim.actors[4],ally=sim.actors[1];first.x=220;first.y=100;second.x=250;second.y=170;ally.x=220;ally.y=80;
 fire(sim,first.center);run(sim,.6);assert.equal(first.health,first.maxHealth-260);assert.equal(second.health,second.maxHealth-260);assert.equal(ally.health,ally.maxHealth);assert.equal(a.superCharge,52);
 run(sim,.4);assert.equal(first.health,first.maxHealth-260);assert.equal(sim.drainEvents().filter(e=>e.type==='blast').length,1);
});
test('explosions cannot pass through cover or damage the impact wall twice',()=>{
 const sim=make(2),target=sim.actors[3];target.x=310;target.y=100;const wall={id:'cover',x:250,y:0,width:20,height:800,destructible:true,health:600};sim.map.walls=[wall];fire(sim,{x:600,y:132});run(sim,1);
 assert.equal(wall.health,340);assert.equal(target.health,target.maxHealth);assert.equal(sim.actors[0].superCharge,0);
});
test('a bomb detonates at maximum range without waiting for a target',()=>{const sim=make(2);fire(sim,{x:900,y:132});run(sim,1);assert.equal(sim.projectiles.length,0);assert.equal(sim.drainEvents().filter(e=>e.type==='blast').length,1);});
test('ricochets preserve remaining travel distance and agree across frame partitions',()=>{
 const sim=make(4),settings={speed:1000,range:600,radius:5,damage:10,bounces:1},map={width:1000,height:800,walls:[{x:250,y:0,width:1,height:800}]};
 const a=new Projectile(sim.actors[0],{x:1,y:0},settings),b=new Projectile(sim.actors[0],{x:1,y:0},settings);a.update(.2,map,[]);for(let i=0;i<10;i++)b.update(.02,map,[]);
 close(a.x,166);close(a.x,b.x);close(a.traveled,200);close(a.traveled,b.traveled);assert.equal(a.direction.x,-1);assert.equal(a.bouncesRemaining,0);
});
test('Fog super uses five needles with exactly one ricochet and cannot hit allies',()=>{
 const sim=make(4),actor=sim.actors[0];actor.superCharge=100;actor.useSuper({x:800,y:132},sim.world);assert.equal(sim.projectiles.length,5);assert(sim.projectiles.every(p=>p.bouncesRemaining===1&&p.style==='fogfan'));
 const shot=sim.projectiles[2];sim.map.walls=[{x:250,y:0,width:1,height:800},{x:50,y:0,width:20,height:800}];shot.update(1,sim.map,sim.actors);assert.equal(shot.active,false);close(shot.x,75);assert.equal(actor.health,actor.maxHealth);
});
test('Kotost super heals immediately and regenerates only its affected live allies for three seconds',()=>{
 const sim=make(1),actor=sim.actors[0],ally=sim.actors[1],enemy=sim.actors[3];ally.x=130;ally.y=100;enemy.x=150;enemy.y=100;
 [actor,ally,enemy].forEach(a=>a.takeDamage(800));actor.superCharge=100;actor.useSuper(actor.center,sim.world);
 assert.equal(actor.health,actor.maxHealth-350);run(sim,3.5);close(actor.health,actor.maxHealth-170);close(ally.health,ally.maxHealth-170);assert.equal(enemy.health,enemy.maxHealth-800);assert.equal(actor.buffs.regen,undefined);assert.equal(actor.superCharge,0);
});
test('partial and full super charge survive death and respawn for every character',()=>{
 for(let index=0;index<5;index++)for(const charge of [0,42.5,100]){const sim=make(index),actor=sim.actors[0],life=actor.lifeId;actor.superCharge=charge;actor.takeDamage(99999);assert.equal(actor.superCharge,charge);assert.equal(actor.useSuper({x:700,y:132},sim.world),false);actor.updateTimers(3.01);assert.equal(actor.superCharge,charge);assert.equal(actor.health,actor.maxHealth);assert.equal(actor.lifeId,life+1);}
});
test('death does not restore a spent super; explicit reset and new matches start with zero',()=>{
 const sim=make(3),actor=sim.actors[0];actor.superCharge=100;actor.useSuper(actor.center,sim.world);actor.takeDamage(99999);actor.updateTimers(3.1);assert.equal(actor.superCharge,0);assert.equal(actor.buffs.superShield,undefined);
 actor.superCharge=80;actor.reset();assert.equal(actor.superCharge,0);assert(make(3).actors.every(a=>a.superCharge===0));
});
test('abilities emit distinct bounded signature effects and reduced motion keeps a static marker',()=>{
 const signatures=[];for(const [index,kind]of ['heavy','heal','nova','shield','fan'].entries()){const effects=new VisualEffects();effects.emit({type:'ability',kind,characterId:characterDefinitions[index].id,x:20,y:30,radius:170,dx:1,dy:0});const item=effects.items.find(i=>i.kind==='signature');assert(item);signatures.push(item.signature);effects.update(2);assert.equal(effects.items.length,0);}
 assert.equal(new Set(signatures).size,5);const reduced=new VisualEffects({reducedMotion:true});reduced.emit({type:'blast',characterId:'mellstroy_fat',x:20,y:30,radius:90});assert.equal(reduced.items.length,1);assert.equal(reduced.items[0].kind,'ring');
});
