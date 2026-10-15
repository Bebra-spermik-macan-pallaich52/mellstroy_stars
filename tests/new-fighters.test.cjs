const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({console});
for(const name of ['assets','collision','projectile','spriteManifest','characters','player','map','donationsMode','cottageMode','teamfightMode','gameManager','bot','simulation','profile','effects'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),context);
vm.runInContext('globalThis.api={Simulation,ProfileStore,Player,getCharacterConfig,characterDefinitions,spriteManifest,VisualEffects};',context);
const {Simulation,ProfileStore,Player,getCharacterConfig,characterDefinitions,spriteManifest,VisualEffects}=context.api;
const close=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
function battle(index){const s=new Simulation({characterIndex:index,characterIndices:[index,0,1,0,1,2],humanSlots:[0,1,2,3,4,5],enhancements:false});s.map.walls=[];s.actors.forEach((a,i)=>{a.x=100+i*180;a.y=100+(i%3)*300;});return s;}
function run(s,t){for(let at=0;at<t-1e-9;at+=.01)s.step(Math.min(.01,t-at));}
test('all eight fighters have valid sprite sheets and each new walk has sixteen complete source rectangles',()=>{
 assert.equal(characterDefinitions.length,8);assert.equal(characterDefinitions[6].name,'Заяц-бурмалдаец');
 for(const index of [5,6,7]){const c=getCharacterConfig(index),m=spriteManifest[c.id],png=fs.readFileSync(path.join(__dirname,'..',c.image));assert.equal(m.frames.length,16);assert.equal(png.readUInt32BE(16),m.sheetSize.width);assert.equal(png.readUInt32BE(20),m.sheetSize.height);assert.equal(png[25],6);assert.equal(new Set(m.frames.map(f=>`${f.x},${f.y}`)).size,16);
 for(const f of m.frames){assert(f.width>100&&f.height>100);assert(f.x>=0&&f.y>=0&&f.x+f.width<=m.sheetSize.width&&f.y+f.height<=m.sheetSize.height);assert(f.width<=m.frameSize.width&&f.height<=m.frameSize.height);}
 for(const direction of ['up','down','left','right'])assert.equal(c.animation.animations['walk_'+direction].length,4);}
});
test('original fighters cannot be purchased even with sufficient coins, new fighters cannot be granted by levels',()=>{
 const p=new ProfileStore(memory());p.profile.coins=9999;
 for(const i of [1,2,3,4]){assert.equal(p.unlockCharacter(i).ok,false);assert.equal(p.profile.coins,9999);assert(!p.isUnlocked(i));}
 p.profile.xp=30000;p.claimAllRoadRewards();assert.deepEqual(Array.from(p.profile.unlocked),[0,1,2,3,4]);for(const i of [5,6,7])assert(!p.isUnlocked(i));
});
test('new coin fighters purchase once at their prices and survive reload and selection',()=>{
 const mem=memory(),p=new ProfileStore(mem);p.profile.coins=1650;
 for(const [index,price]of [[5,400],[6,550],[7,700]]){const before=p.profile.coins;assert(p.unlockCharacter(index).ok);assert.equal(p.profile.coins,before-price);assert(p.unlockCharacter(index).ok);assert.equal(p.profile.coins,before-price);const q=new ProfileStore(mem);assert(q.isUnlocked(index));assert.equal(q.profile.selectedCharacter,index);}
 assert.equal(p.profile.coins,0);
});
test('an old save retains original purchased fighters and all settings under the new acquisition rules',()=>{
 const mem=memory(),raw=new ProfileStore(mem).defaults();raw.profile.unlocked=[0,1,4];raw.profile.selectedCharacter=4;raw.profile.coins=77;raw.profile.xp=500;raw.settings.nickname='Старый профиль';mem.setItem('mellstroy-stars.profile.v1',JSON.stringify(raw));const p=new ProfileStore(mem);
 assert.deepEqual(Array.from(p.profile.unlocked),[0,1,4]);assert.equal(p.profile.selectedCharacter,4);assert.equal(p.profile.coins,77);assert.equal(p.settings.nickname,'Старый профиль');assert(!p.isUnlocked(5));
});
test('Chekunets cork ricochets and shatter creates eight radial glass shots with one bounce',()=>{
 const s=battle(5),a=s.actors[0];const shot=a.attack({x:600,y:a.center.y});assert.equal(shot.style,'cork');assert.equal(shot.bouncesRemaining,1);s.map.walls=[{x:240,y:0,width:1,height:1000}];shot.update(.3,s.map,[]);assert.equal(shot.direction.x,-1);assert.equal(shot.bouncesRemaining,0);
 a.superCharge=100;assert(a.useSuper(a.center,s.world));assert.equal(s.projectiles.length,8);assert(s.projectiles.every(p=>p.style==='glass'&&p.bouncesRemaining===1));close(s.projectiles.reduce((sum,p)=>sum+p.direction.x,0),0);close(s.projectiles.reduce((sum,p)=>sum+p.direction.y,0),0);
});
test('Hare fires two carrots for one charge and restock replenishes ammo without bypassing attack cooldown',()=>{
 const s=battle(6),a=s.actors[0],shot=a.attack({x:600,y:a.center.y});assert.equal(shot.style,'carrot');assert.equal(shot.companions.length,1);assert.equal(a.ammo,2);a.ammo=0;a.superCharge=100;assert(a.useSuper(a.center,s.world));assert.equal(a.ammo,3);assert.equal(a.attack({x:600,y:a.center.y}),null);
 a.updateTimers(.6);const boosted=a.attack({x:600,y:a.center.y});close(boosted.damage,133);a.updateTimers(3.5);assert.equal(a.buffs.restock,undefined);a.cooldownRemaining=0;close(a.attack({x:600,y:a.center.y}).damage,95);
});
test('Hare boost coexists with damage pickups using the stronger multiplier rather than stacking',()=>{
 const s=battle(6),a=s.actors[0];a.buffs.damage={multiplier:1.3,remaining:8};a.superCharge=100;a.useSuper(a.center,s.world);close(a.attack({x:600,y:a.center.y}).damage,133);a.updateTimers(4.1);close(a.attack({x:600,y:a.center.y}).damage,123.5);
});
test('Mytost bubble bursts once with splash damage and does not hit allies',()=>{
 const s=battle(7),a=s.actors[0],target=s.actors[3],ally=s.actors[1];target.x=220;target.y=100;ally.x=220;ally.y=100;s.addProjectile(a.attack(target.center));run(s,.4);assert.equal(target.health,target.maxHealth-160);assert.equal(ally.health,ally.maxHealth);assert.equal(s.drainEvents().filter(e=>e.type==='blast').length,1);
});
test('Foam wave pierces, slows for two seconds, respects walls, and never affects allies',()=>{
 const s=battle(7),a=s.actors[0],target=s.actors[3],ally=s.actors[1];target.x=260;target.y=100;ally.x=190;ally.y=100;a.superCharge=100;assert(a.useSuper({x:700,y:a.center.y},s.world));assert.equal(s.projectiles.length,3);assert(s.projectiles.every(p=>p.style==='water'&&p.pierceRemaining===2));run(s,.4);assert(target.buffs.slow);assert.equal(target.buffs.slow.factor,.6);assert.equal(ally.buffs.slow,undefined);
 const from=target.x;target.update(1,{direction:()=>({x:1,y:0})},s.map);close(target.x-from,target.config.speed*.6);run(s,2.1);assert.equal(target.buffs.slow,undefined);
 const blocked=battle(7);blocked.actors[3].x=260;blocked.actors[3].y=100;blocked.map.walls=[{x:200,y:0,width:1,height:1200}];blocked.actors[0].superCharge=100;blocked.actors[0].useSuper({x:700,y:132},blocked.world);run(blocked,.5);assert.equal(blocked.actors[3].buffs.slow,undefined);assert.equal(blocked.actors[3].health,blocked.actors[3].maxHealth);
});
test('slow and restock buffs clear on death, while super charge is preserved for all new fighters',()=>{
 for(const i of [5,6,7]){const a=new Player({x:100,y:100},getCharacterConfig(i));a.buffs.slow={factor:.6,remaining:2};a.buffs.restock={multiplier:1.4,remaining:4};a.superCharge=73;a.takeDamage(99999);assert.equal(Object.keys(a.buffs).length,0);a.updateTimers(3);assert.equal(a.superCharge,73);assert.equal(a.ammo,a.maxAmmo);}
});
test('bots understand each new super and recovering bots do not use offensive powers',()=>{
 for(const i of [5,6,7]){const s=new Simulation({characterIndex:i,humanSlots:[],enhancements:false});s.map.walls=[];const b=s.bots.find(b=>b.actor.id===0),a=b.actor; s.actors.forEach((p,j)=>{p.x=j<3?100:280;p.y=j%3*300+100;});a.superCharge=100;a.ammo=0;s.botSuper(b);assert.equal(a.superCharge,0);if(i===6)assert.equal(a.ammo,3);else assert(s.projectiles.length>0);a.superCharge=100;b.recovering=true;s.botSuper(b);assert.equal(a.superCharge,100);}
});
test('new ability effects have unique signatures, remain bounded and respect reduced motion',()=>{
 const effects=new VisualEffects();for(const [index,kind]of [[5,'shatter'],[6,'restock'],[7,'wave']])effects.emit({type:'ability',kind,characterId:characterDefinitions[index].id,x:20,y:30});assert.equal(new Set(effects.items.filter(i=>i.kind==='signature').map(i=>i.signature)).size,3);effects.update(2);assert.equal(effects.items.length,0);
 const reduced=new VisualEffects({reducedMotion:true});reduced.emit({type:'ability',kind:'wave',characterId:'mytost',x:20,y:30});assert(!reduced.items.some(i=>i.kind==='signature'));
});
