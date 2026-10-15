const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),context=vm.createContext({console});
for(const name of ['assets','collision','camera','projectile','characters','player','map','donationsMode','cottageMode','teamfightMode','gameManager','bot','simulation'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),context);
vm.runInContext('globalThis.api={Player,getCharacterConfig,Camera,Simulation,Bot,overlaps};',context);
const {Player,getCharacterConfig,Camera,Simulation,Bot,overlaps}=context.api;
const actor=index=>new Player({x:100,y:100},getCharacterConfig(index));
const close=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const aim={x:500,y:132};
function battle(){const s=new Simulation({humanSlots:[0,1,2,3,4,5],enhancements:false});s.map.walls=[];s.actors.forEach((a,i)=>{a.x=100+i*250;a.y=i<3?100:900;});return s;}
function run(sim,seconds){for(let time=0;time<seconds-1e-9;time+=.05)sim.step(Math.min(.05,seconds-time));}
function pen(){const calls=[];const ctx=new Proxy({},{get:(o,k)=>k==='calls'?calls:o[k]??((...args)=>calls.push({method:k,args,color:o.fillStyle,stroke:o.strokeStyle})),set:(o,k,v)=>(o[k]=v,true)});return ctx;}
test('all five fighters start passive recovery after three seconds at 13 percent max HP per second',()=>{
 for(let i=0;i<5;i++){const a=actor(i);a.takeDamage(a.maxHealth*.8);a.updateTimers(3);close(a.health,a.maxHealth*.2);assert.equal(a.passiveHealing,false);a.updateTimers(.5);close(a.health,a.maxHealth*.265);assert(a.passiveHealing);a.updateTimers(20);assert.equal(a.health,a.maxHealth);}
});
test('partial steps crossing the recovery delay and frame partitions heal the same amount',()=>{
 const a=actor(0),b=actor(0);a.takeDamage(800);b.takeDamage(800);a.updateTimers(2.9);a.updateTimers(.4);
 for(let i=0;i<330;i++)b.updateTimers(.01);close(a.health,239);close(a.health,b.health);
});
test('movement does not delay recovery, but an actual attack or damage starts a fresh wait',()=>{
 const a=actor(0);a.takeDamage(800);a.updateTimers(3.5);a.update(.2,{direction:()=>({x:1,y:0})},{width:1000,height:1000,walls:[]});
 a.updateTimers(.5);close(a.health,330);a.attack(aim);assert.equal(a.quietTime,0);a.updateTimers(2.9);close(a.health,330);a.takeDamage(10);a.updateTimers(3);close(a.health,320);a.updateTimers(1);close(a.health,450);
});
test('dry fire, invalid aim, failed super and invalid damage do not interrupt healing',()=>{
 const a=actor(0);a.takeDamage(800);a.updateTimers(4);const time=a.quietTime;
 a.ammo=0;assert.equal(a.attack(aim),null);a.takeDamage(NaN);a.takeDamage(0);assert.equal(a.useSuper(aim,{}),false);assert.equal(a.quietTime,time);
 a.ammo=1;assert.equal(a.attack(a.center),null);assert.equal(a.quietTime,time);
});
test('successful super interrupts recovery, dead actors cannot heal, respawn resets recovery',()=>{
 const s=battle(),a=s.actors[0];a.takeDamage(800);a.updateTimers(4);a.superCharge=100;assert(a.useSuper(aim,s.world));assert.equal(a.quietTime,0);
 a.takeDamage(99999);a.updateTimers(1);assert.equal(a.health,0);assert.equal(a.passiveHealing,false);a.updateTimers(2);assert.equal(a.health,a.maxHealth);assert.equal(a.quietTime,0);
});
test('invalid timer values never create health or recovery time',()=>{const a=actor(0);a.takeDamage(500);for(const dt of [NaN,Infinity,-1])a.updateTimers(dt);assert.equal(a.quietTime,0);assert.equal(a.health,500);});
test('a recovering bot stops firing and waits safely until healed before rejoining',()=>{
 const s=battle(),a=s.actors[0],enemy=s.actors[3];a.takeDamage(700);enemy.x=900;enemy.y=100;
 s.humanSlots.delete(0);const bot=new Bot(a,0);s.bots=[bot];s.world.bots=s.bots;
 run(s,3);assert(bot.recovering);assert.equal(a.health,300);assert.equal(s.drainEvents().filter(e=>e.type==='shot'&&e.actorId===0).length,0);
 run(s,4.4);assert(a.health>=850);assert.equal(bot.recovering,false);
});
test('recovery hysteresis prevents wounded bots from immediately starting to shoot again',()=>{
 const s=battle(),a=s.actors[0],b=new Bot(a,0);a.health=400;b.update(.1,s.world,true);assert(b.recovering);
 a.health=700;b.update(.1,s.world,true);assert(b.recovering);a.health=850;b.update(.1,s.world,true);assert.equal(b.recovering,false);
});
test('an exposed wounded bot routes to cover without firing or crossing walls',()=>{
 const s=battle(),a=s.actors[0],enemy=s.actors[3];a.x=400;a.y=400;enemy.x=650;enemy.y=400;
 s.map.walls=[{x:300,y:300,width:70,height:300}];a.takeDamage(700);const bot=new Bot(a,0);
 assert.equal(bot.update(.1,s.world,true),null);assert(bot.recovering);assert.equal(bot.state,'recover');assert(bot.path.length>0);assert(!s.map.walls.some(w=>overlaps(a,w)));
});
test('recovering bots can pursue a health pickup and use a heal super, but not an offensive super',()=>{
 const s=battle(),a=s.actors[0],enemy=s.actors[3];enemy.x=300;enemy.y=100;a.health=300;a.superCharge=100;
 const b=new Bot(a,0);s.powerups=[{kind:'heal',x:150,y:100,radius:13,remaining:10}];b.update(.1,s.world,true);assert.equal(b.state,'heal');s.botSuper(b);assert.equal(a.superCharge,100);assert.equal(s.projectiles.length,0);
 const healer=s.actors[1];healer.health=300;healer.superCharge=100;const healingBot=new Bot(healer,1);healingBot.recovering=true;s.botSuper(healingBot);assert.equal(healer.superCharge,0);assert(healer.health>300);
});
test('camera flight is smooth, clamped and finishes exactly at spawn without following death position',()=>{
 const c=new Camera(),map={width:2560,height:1600};c.update({x:2200,y:1200},map,0,true);const start=c.x;c.flyTo({x:100,y:100},map,1.2);
 c.updateFlight(.1);assert(c.x<start&&c.x>0);for(let i=0;i<11;i++)c.updateFlight(.1);close(c.x,0);close(c.y,0);assert.equal(c.flight,null);
});
test('camera flights agree across frame rates and ignore invalid time; snap clears old flight',()=>{
 const a=new Camera(),b=new Camera(),map={width:2560,height:1600};a.flyTo({x:1900,y:1000},map);b.flyTo({x:1900,y:1000},map);
 for(let i=0;i<30;i++)a.updateFlight(.02);for(let i=0;i<60;i++)b.updateFlight(.01);close(a.x,b.x);close(a.y,b.y);
 const x=a.x;for(const dt of [NaN,-1,Infinity])a.updateFlight(dt);close(a.x,x);a.update({x:24,y:32},map,0,true);assert.equal(a.flight,null);close(a.x,0);
 a.flyTo({x:999,y:999},{width:100,height:100},0);close(a.x,0);close(a.y,0);
});
test('world HUD exposes nickname and ammo only to the local player with correct team colors',()=>{
 const a=actor(0);a.ammo=1;a.superCharge=60;
 const own=pen();a.drawVitals(own,{local:true,localTeam:0,nickname:'Мой ник'});assert(own.calls.some(c=>c.method==='fillText'&&c.args[0]==='Мой ник'&&c.color==='#a5f477'));assert(own.calls.some(c=>c.method==='fillRect'&&c.color==='#79dc59'));assert(own.calls.some(c=>c.method==='fillRect'&&c.color==='#f5c455'));
 for(const [team,color] of [[0,'#5ec9ee'],[1,'#ed645d']]){a.team=team;const other=pen();a.drawVitals(other,{local:false,localTeam:0});assert(other.calls.some(c=>c.method==='fillRect'&&c.color===color));assert(!other.calls.some(c=>c.method==='fillText'&&c.args[0]==='Мой ник'));assert(!other.calls.some(c=>c.method==='fillRect'&&c.color==='#f5c455'));}
});
test('only ready supers of other actors are drawn, with segmented rotating rings beneath feet',()=>{
 const a=actor(0),hidden=pen();a.superCharge=99;a.drawSuperIndicator(hidden,{local:false});assert.equal(hidden.calls.length,0);
 a.superCharge=100;const one=pen(),two=pen();a.drawSuperIndicator(one,{local:false,time:0});a.drawSuperIndicator(two,{local:false,time:1});
 const arcs=one.calls.filter(c=>c.method==='arc');assert.equal(arcs.length,16);assert(arcs[0].args[4]-arcs[0].args[3]<Math.PI/4);assert.notEqual(arcs[0].args[3],two.calls.find(c=>c.method==='arc').args[3]);
 const reduced=pen();a.drawSuperIndicator(reduced,{local:false,time:1,reducedMotion:true});close(reduced.calls.find(c=>c.method==='arc').args[3],arcs[0].args[3]);
 a.takeDamage(99999);const dead=pen();a.drawVitals(dead,{local:true});a.drawSuperIndicator(dead,{local:true});assert.equal(dead.calls.length,0);
});
test('attached vitals remain inside the visible world at top and side borders',()=>{
 const a=actor(0);a.x=0;a.y=0;const ctx=pen();a.drawVitals(ctx,{local:true,nickname:'Очень длинный никнейм',view:{x:0,y:0,width:960,height:640}});
 for(const call of ctx.calls.filter(c=>c.method==='fillRect')){assert(call.args[0]>=0);assert(call.args[1]>=0);assert(call.args[0]+call.args[2]<=960);}
 assert(ctx.calls.find(c=>c.method==='fillText'&&c.args[0]==='Очень длинный никнейм').args[2]>=13);
});
