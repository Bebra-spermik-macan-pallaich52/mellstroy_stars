const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({console});
for(const name of ['assets','collision','projectile','characters','player','map','donationsMode','cottageMode','teamfightMode','gameManager','bot','simulation'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),context);
vm.runInContext('globalThis.api={Player,getCharacterConfig,Simulation,Bot};',context);
const {Player,getCharacterConfig,Simulation,Bot}=context.api;
const actor=index=>new Player({x:100,y:100},getCharacterConfig(index));
const aim={x:600,y:132};
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function empty(a){for(let i=0;i<a.maxAmmo;i++){a.cooldownRemaining=0;assert(a.attack(aim));}assert.equal(a.ammo,0);}
for(let index=0;index<5;index++){
 test(`Character ${index}: finite charges, one refill at a time and one charge per attack`,()=>{
  const a=actor(index),capacities=[3,3,2,3,4],reloads=[1.5,1.7,2.2,1.8,1.25];
  assert.equal(a.ammo,capacities[index]);assert.equal(a.config.attack.reload,reloads[index]);
  const shot=a.attack(aim);assert(shot);assert.equal(a.ammo,a.maxAmmo-1);
  assert.equal((shot.companions?.length||0)+1,index===1?3:index===4?2:1);
  for(let i=1;i<a.maxAmmo;i++){a.cooldownRemaining=0;assert(a.attack(aim));}
  a.cooldownRemaining=0;assert.equal(a.attack(aim),null);
  a.updateTimers(a.config.attack.reload/2);assert.equal(a.ammo,0);close(a.reloadProgress,.5);assert.equal(a.attack(aim),null);
  a.updateTimers(a.config.attack.reload/2);assert.equal(a.ammo,1);assert(a.attack(aim));assert.equal(a.ammo,0);
 });
}
test('Repeated fire does not restart or accelerate an unfinished refill',()=>{
 const a=actor(0);a.attack(aim);a.updateTimers(.5);a.attack(aim);close(a.reloadElapsed,.5);
 a.updateTimers(.5);a.attack(aim);close(a.reloadElapsed,1);
 for(let i=0;i<100;i++)assert.equal(a.attack(aim),null);
 close(a.reloadElapsed,1);a.updateTimers(.5);assert.equal(a.ammo,1);close(a.reloadElapsed,0);
});
test('Reload elapsed is independent of time partition and does not bank time at full capacity',()=>{
 const a=actor(4),b=actor(4);empty(a);empty(b);a.updateTimers(3.6);for(let i=0;i<360;i++)b.updateTimers(.01);
 assert.equal(a.ammo,2);assert.equal(b.ammo,2);close(a.reloadElapsed,b.reloadElapsed);
 a.updateTimers(100);assert.equal(a.ammo,a.maxAmmo);close(a.reloadElapsed,0);
 a.attack(aim);a.updateTimers(.01);assert.equal(a.ammo,a.maxAmmo-1);close(a.reloadElapsed,.01);
});
test('Bad aim, cooldown and dead actors do not spend charges; invalid time does not reload',()=>{
 const a=actor(2);assert.equal(a.attack(a.center),null);assert.equal(a.ammo,2);a.attack(aim);assert.equal(a.ammo,1);
 assert.equal(a.attack(aim),null);assert.equal(a.ammo,1);for(const dt of [NaN,Infinity,-1])a.updateTimers(dt);
 close(a.reloadElapsed,0);a.takeDamage(99999);assert.equal(a.attack(aim),null);a.updateTimers(.5);assert.equal(a.ammo,1);close(a.reloadElapsed,0);
});
test('Respawn refills ammo and preserves super; a fresh match resets both',()=>{
 const a=actor(0);empty(a);a.superCharge=73;a.takeDamage(99999);a.updateTimers(a.config.respawnDelay);
 assert(a.alive);assert.equal(a.ammo,a.maxAmmo);close(a.reloadElapsed,0);assert.equal(a.superCharge,73);
 a.reset();assert.equal(a.superCharge,0);assert.equal(a.ammo,a.maxAmmo);
});
test('Charged super can be used with no normal ammo and does not refill it',()=>{
 const sim=new Simulation({humanSlots:[0,1,2,3,4,5],enhancements:false}),a=sim.actors[0];empty(a);a.superCharge=100;
 assert(a.useSuper(aim,sim.world));assert.equal(a.ammo,0);assert.equal(a.superCharge,0);assert.equal(sim.projectiles.length,1);
});
test('Bots use the same depleted ammo gate and resume after reload',()=>{
 const sim=new Simulation({humanSlots:[0,1,2,3,4,5],enhancements:false}),a=sim.actors[0];sim.map.walls=[];
 sim.actors.forEach((p,i)=>{p.x=i===3?300:100;p.y=i===0||i===3?100:1000;});
 const bot=new Bot(a,0);empty(a);a.cooldownRemaining=0;
 assert.equal(bot.update(.01,sim.world,true),null);a.updateTimers(a.config.attack.reload);
 assert(bot.update(.01,sim.world,true));assert.equal(a.ammo,0);
});
test('All five movement speeds are reduced by exactly 25 percent for player and bots',()=>{
 [200,190,180,200,210].forEach((speed,index)=>close(getCharacterConfig(index).speed,speed*.75));
});
