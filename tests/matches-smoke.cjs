// Run: node tests/matches-smoke.cjs. Nine complete deterministic local matches.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({console});for(const name of ['assets','collision','projectile','characters','player','map','donationsMode','cottageMode','teamfightMode','gameManager','bot','simulation'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',name+'.js'),'utf8'),ctx);
vm.runInContext('globalThis.api={Simulation,overlaps};',ctx);const{Simulation,overlaps}=ctx.api;const all=[];
for(const mapId of ['arena','courtyard','crossroads'])for(const modeId of ['donations','cottage','teamfight']){
 const sim=new Simulation({mapId,modeId,humanSlots:[],seed:187,enhancements:true});const counts={};const states=new Set();let maxProjectiles=0;const start=performance.now();
 for(let i=0;i<750&&sim.manager.state==='playing';i++){
  sim.step(.25);for(const event of sim.drainEvents())counts[event.type]=(counts[event.type]||0)+1;
  for(const bot of sim.bots)states.add(bot.state);
  for(const a of sim.actors){assert(Number.isFinite(a.x)&&Number.isFinite(a.y));assert(a.x>=-1e-5&&a.x+a.width<=sim.map.width+1e-5&&a.y>=-1e-5&&a.y+a.height<=sim.map.height+1e-5);assert(!sim.map.walls.some(w=>overlaps(a,w)),mapId+'/'+modeId+' actor '+a.id+' in wall');}
  maxProjectiles=Math.max(maxProjectiles,sim.projectiles.length);
 }
 assert.equal(sim.manager.state,'finished');assert(counts.shot>0&&counts.hit>0);assert.equal(counts.finish,1);assert(maxProjectiles<=160);
 const record={mapId,modeId,elapsed:sim.elapsed,result:sim.manager.result,counts,states:[...states],cpuMs:performance.now()-start};all.push(record);console.log('PASS', mapId, modeId, 'score='+record.result.scores.map(value=>Math.round(value*100)/100).join(':'), 'seconds='+sim.elapsed.toFixed(2), 'hits='+counts.hit);
}
console.log('Completed', all.length, 'matches; every result reached a valid finish.');
