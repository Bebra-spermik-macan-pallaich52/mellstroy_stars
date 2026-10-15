// node --test tests/features.test.cjs — entirely local, no packages or browser.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
for (const file of ['assets.js', 'collision.js', 'projectile.js', 'characters.js', 'player.js', 'map.js',
  'donationsMode.js', 'cottageMode.js', 'teamfightMode.js', 'gameManager.js', 'bot.js', 'simulation.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
}
vm.runInContext('globalThis.subject = { Simulation, Player, Projectile, Bot, getCharacterConfig, characterConfig, characterDefinitions, createMap, mapCatalog, arena, overlaps };', context);
const { Simulation, Player, Projectile, Bot, getCharacterConfig, characterConfig, characterDefinitions, createMap, mapCatalog, arena, overlaps } = context.subject;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function make(index = 0, settings = {}) {
  const sim = new Simulation({ characterIndex: index, humanSlots: [0, 1, 2, 3, 4, 5], enhancements: false, ...settings });
  sim.map.walls = [];
  sim.actors.forEach((actor, slot) => { actor.x = slot < 3 ? 100 : 700; actor.y = 80 + slot % 3 * 190; });
  return sim;
}
function run(sim, seconds, command = {}, dt = 1 / 60) {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt) sim.step(Math.min(dt, seconds - elapsed), command);
}

test('eight definitions have independent stats, real powers, and slower shared movement', () => {
  assert.equal(characterDefinitions.length, 8);
  assert.equal(new Set(characterDefinitions.map(item => item.super.kind)).size, 8);
  assert.equal(getCharacterConfig(1).maxHealth, 1300); assert.equal(getCharacterConfig(4).speed, 157.5);
  assert.equal(characterConfig.maxHealth, 1000); assert.equal(characterConfig.speed, 150);
  const a = getCharacterConfig(0), b = getCharacterConfig(0); a.attack.damage = 1;
  assert.equal(b.attack.damage, 200); assert.equal(characterConfig.attack.damage, 200);
});

test('sprite animation switches frames with time, preserves facing on idle, and has four directions', () => {
  const actor = new Player({ x: 100, y: 100 }, getCharacterConfig(0));
  const map = { width: 960, height: 640, walls: [] };
  actor.update(0.13, { direction: () => ({ x: 1, y: 0 }) }, map);
  assert.equal(actor.animator.state, 'walk_right'); assert.equal(actor.animator.frame().x, 128);
  actor.update(0.1, { direction: () => ({ x: 0, y: 0 }) }, map);
  assert.equal(actor.direction, 'right'); assert.equal(actor.animator.state, 'idle_right');
  assert.equal(actor.animator.frame().x, 0);
  for (const direction of ['up', 'down', 'left', 'right']) assert.equal(actor.config.animation.animations[`walk_${direction}`].length, 4);
});

test('cropped sprite frames share a fixed render scale and foot anchor across different poses', () => {
  // Deliberately uneven frame bounds model generated sheets after alpha cropping.
  vm.runInContext(`const spriteManifest = { arthur: {
    frameSize: { width: 200, height: 300 },
    frames: Array.from({ length: 16 }, (_, index) => ({ x: index * 30, y: index * 10,
      width: index % 2 ? 180 : 100, height: index % 2 ? 240 : 150 }))
  } };`, context);
  const actor = new Player({ x: 100, y: 100 }, getCharacterConfig(0));
  actor.image = { naturalWidth: 1024, naturalHeight: 1024 };
  const calls = [];
  const ctx = new Proxy({}, { get: (object, key) => key === 'drawImage' ? (...args) => calls.push(args) : (() => {}) });
  actor.animator.update('right', true, 0); actor.draw(ctx, false);
  actor.animator.update('right', true, 0.13); actor.draw(ctx, false);
  assert.equal(calls[0][1], 8 * 30); assert.equal(calls[1][1], 9 * 30);
  close(calls[0][7] / calls[0][3], calls[1][7] / calls[1][3]);
  close(calls[0][8] / calls[0][4], calls[1][8] / calls[1][4]);
  close(calls[0][6] + calls[0][8], actor.y + actor.height);
  close(calls[1][6] + calls[1][8], actor.y + actor.height);
  close(calls[0][5] + calls[0][7] / 2, actor.center.x);
});

test('Arthur super sends one powerful swept projectile and cannot be used twice', () => {
  const sim = make(), actor = sim.actors[0], enemy = sim.actors[3];
  enemy.x = 300; enemy.y = actor.y; actor.superCharge = 100;
  assert.equal(actor.useSuper(enemy.center, sim.world), true);
  assert.equal(actor.useSuper(enemy.center, sim.world), false);
  assert.equal(actor.superCharge, 0); assert.equal(sim.projectiles.length, 1);
  run(sim, 0.3); assert.equal(enemy.health, enemy.maxHealth - 600);
  assert.equal(sim.drainEvents().filter(event => event.type === 'ability').length, 1);
});

test('Kotost heals self and nearby live allies while excluding enemies and distant allies', () => {
  const sim = make(1), actor = sim.actors[0], ally = sim.actors[1], distant = sim.actors[2], enemy = sim.actors[3];
  ally.x = 150; ally.y = actor.y; enemy.x = 190; enemy.y = actor.y;
  [actor, ally, distant, enemy].forEach(item => item.takeDamage(500)); actor.superCharge = 100;
  actor.useSuper(actor.center, sim.world);
  assert.equal(actor.health, actor.maxHealth - 50); assert.equal(ally.health, ally.maxHealth - 50);
  assert.equal(distant.health, distant.maxHealth - 500); assert.equal(enemy.health, enemy.maxHealth - 500);
  assert.equal(sim.projectiles.length, 0);
});

test('Mellstroy nova damages nearby enemies and destructible walls without hurting allies', () => {
  const sim = make(2), actor = sim.actors[0], enemy = sim.actors[3], ally = sim.actors[1];
  enemy.x = 180; enemy.y = actor.y; ally.x = 150; ally.y = actor.y;
  const wall = { id: 'piece', x: 230, y: 80, width: 20, height: 60, destructible: true, health: 600 };
  const stone = { x: 250, y: 80, width: 20, height: 60 };
  sim.map.walls = [wall, stone]; actor.superCharge = 100;
  actor.useSuper(enemy.center, sim.world);
  assert.equal(enemy.health, enemy.maxHealth - 400); assert.equal(ally.health, ally.maxHealth);
  assert.ok(!sim.map.walls.includes(wall)); assert.ok(sim.map.walls.includes(stone));
  assert.equal(sim.map.navVersion, 1); assert.equal(actor.superCharge, 0);
});

test('Drun shield reduces damage by 60 percent for five seconds then expires', () => {
  const sim = make(3), actor = sim.actors[0]; actor.superCharge = 100;
  actor.useSuper(actor.center, sim.world); close(actor.takeDamage(200), 80);
  actor.updateTimers(4.99); close(actor.takeDamage(100), 40);
  actor.updateTimers(0.02); assert.equal(actor.takeDamage(100), 100);
  assert.equal(actor.buffs.superShield, undefined);
});

test('Fog super creates a symmetric five-shot fan instead of extra movement', () => {
  const sim = make(4), actor = sim.actors[0]; actor.superCharge = 100;
  const x = actor.x, y = actor.y; actor.useSuper({ x: actor.center.x + 100, y: actor.center.y }, sim.world);
  assert.equal(sim.projectiles.length, 5); close(sim.projectiles[0].direction.y, -sim.projectiles[4].direction.y);
  close(sim.projectiles[2].direction.y, 0);
  assert.ok(sim.projectiles.every(shot => shot.damage === 180 && shot.range === 550));
  assert.equal(actor.x, x); assert.equal(actor.y, y);
});

test('dead or uncharged actors cannot use abilities; invalid aim does not spend a aimed power', () => {
  const sim = make(), actor = sim.actors[0];
  assert.equal(actor.useSuper(actor.center, sim.world), false);
  actor.superCharge = 100; assert.equal(actor.useSuper({ x: NaN, y: 1 }, sim.world), false);
  assert.equal(actor.superCharge, 100); actor.takeDamage(10000);
  assert.equal(actor.useSuper({ x: 600, y: 100 }, sim.world), false); assert.equal(sim.projectiles.length, 0);
});

test('map instances isolate destroyed pieces, health, spawn objects, and nav versions', () => {
  const a = createMap('arena'), b = createMap('arena');
  a.walls[1].health = 0; a.walls.splice(1, 1); a.teamSpawns[0][0].x = 500; a.navVersion++;
  assert.equal(b.walls.length, arena.walls.length); assert.equal(b.walls[1].health, 600);
  assert.equal(b.teamSpawns[0][0].x, 120); assert.equal(b.navVersion, 0);
  assert.equal(Object.isFrozen(arena.walls[1]), true);
});

test('all three maps have distinct layouts, six free spawns, and an unobstructed resource point', () => {
  assert.equal(mapCatalog.length, 3);
  const layouts = new Set();
  for (const item of mapCatalog) {
    const map = createMap(item.id); layouts.add(JSON.stringify(map.walls));
    assert.equal(map.teamSpawns.flat().length, 6);
    for (const spawn of map.teamSpawns.flat()) {
      const body = { ...spawn, width: 48, height: 64 };
      assert.ok(!map.walls.some(wall => overlaps(body, wall)));
      assert.ok(body.x >= 0 && body.y >= 0 && body.x + body.width <= map.width && body.y + body.height <= map.height);
    }
    assert.ok(!map.walls.some(wall => overlaps({ x: map.resourcePoint.x - 12, y: map.resourcePoint.y - 12, width: 24, height: 24 }, wall)));
    assert.ok(map.walls.filter(wall => wall.destructible).length >= 4);
  }
  assert.equal(layouts.size, 3);
});

test('swept projectiles damage the first destructible piece once without tunnelling', () => {
  const sim = make(), actor = sim.actors[0];
  const wall = { id: 'thin', x: 200, y: actor.y, width: 1, height: 64, destructible: true, health: 600 };
  sim.map.walls = [wall];
  sim.addProjectile(new Projectile(actor, { x: 1, y: 0 }, { damage: 200, speed: 10000, range: 1000 }));
  sim.step(0.1); assert.equal(wall.health, 400);
  sim.step(0.1); assert.equal(wall.health, 400);
  sim.damageWall(wall, 400, actor); assert.equal(sim.map.walls.length, 0); assert.equal(sim.map.navVersion, 1);
  sim.damageWall(wall, 400, actor); assert.equal(sim.map.navVersion, 1);
  assert.equal(sim.drainEvents().filter(event => event.type === 'wallDestroyed').length, 1);
});

test('destroyed walls invalidate navigation graphs and let bots plan through the opening', () => {
  const sim = make(); const actor = sim.actors[0]; actor.x = 100; actor.y = 250;
  const wall = { id: 'partition', x: 220, y: 0, width: 20, height: sim.map.height, destructible: true, health: 600 };
  sim.map.walls = [wall]; const bot = new Bot(actor, 0);
  assert.equal(bot.planTo({ x: 500, y: 282 }, sim.map), false);
  const oldGraph = bot.navigation; sim.damageWall(wall, 600, actor);
  assert.equal(bot.planTo({ x: 500, y: 282 }, sim.map), true);
  assert.notEqual(bot.navigation, oldGraph); assert.equal(bot.navigation.version, 1); assert.equal(bot.path.length, 1);
});

test('damage and shield pickups expire, heal pickup caps at max health, and speed never changes', () => {
  const sim = make(0, { enhancements: true }), actor = sim.actors[0];
  actor.takeDamage(200); const speed = actor.config.speed;
  const add = kind => sim.powerups.push({ id: 1, kind, ...actor.center, radius: 13, remaining: 20 });
  add('heal'); sim.step(0.01); assert.equal(actor.health, actor.maxHealth);
  add('damage'); sim.step(0.01);
  const shot = actor.attack({ x: 500, y: actor.center.y }); close(shot.damage, 260);
  add('shield'); sim.step(0.01); close(actor.takeDamage(100), 50);
  actor.updateTimers(8.01); assert.equal(actor.buffs.damage, undefined); assert.equal(actor.buffs.shield, undefined);
  assert.equal(actor.config.speed, speed); assert.equal(sim.powerups.length, 0);
});

test('buffs clear on death and revival rather than carrying into the next life', () => {
  const actor = new Player({ x: 100, y: 100 }, getCharacterConfig(0));
  actor.buffs.damage = { multiplier: 1.3, remaining: 8 }; actor.buffs.shield = { reduction: 0.5, remaining: 5 };
  actor.takeDamage(10000); assert.equal(Object.keys(actor.buffs).length, 0);
  actor.updateTimers(3.1); assert.equal(Object.keys(actor.buffs).length, 0); assert.equal(actor.health, actor.maxHealth);
});

test('random pickups use reproducible seeds, free positions, a count cap, and bounded lifetimes', () => {
  const a = make(0, { seed: 123, enhancements: true }), b = make(0, { seed: 123, enhancements: true });
  a.map = createMap('crossroads'); b.map = createMap('crossroads');
  for (let i = 0; i < 10; i++) { a.spawnPowerup(); b.spawnPowerup(); }
  assert.equal(JSON.stringify(a.powerups), JSON.stringify(b.powerups)); assert.equal(a.powerups.length, 3);
  for (const item of a.powerups) {
    assert.ok(!a.map.walls.some(wall => overlaps({ x: item.x - item.radius, y: item.y - item.radius, width: item.radius * 2, height: item.radius * 2 }, wall)));
    item.remaining = 0.01;
  }
  a.updatePowerups(0.02); assert.equal(a.powerups.length, 0);
});

test('simulation inputs normalize diagonal movement and reject non-finite values without huge tab jumps', () => {
  const a = make(), b = make(); const start = a.actors[0].center;
  a.step(0.25, { 0: { x: 1, y: 0 } }); b.step(0.25, { 0: { x: 1, y: 1 } });
  close(a.actors[0].center.x - start.x, 37.5);
  close(Math.hypot(b.actors[0].center.x - start.x, b.actors[0].center.y - start.y), 37.5);
  const actor = a.actors[0], x = actor.x;
  a.step(100, { 0: { x: NaN, y: Infinity, fire: true, aim: { x: NaN, y: 1 } } });
  assert.equal(actor.x, x); assert.ok(Number.isFinite(actor.y)); close(a.elapsed, 0.5);
  a.step(NaN, { 0: { x: 1 } }); close(a.elapsed, 0.5);
});

test('only configured human actors consume commands while the other five share bot controllers', () => {
  const sim = new Simulation({ enhancements: false, botFire: false });
  assert.equal(sim.bots.length, 5); assert.equal(sim.actors.filter(actor => actor.isHuman).length, 1);
  const enemy = sim.actors[3], from = enemy.center;
  sim.step(0.01, { 3: { x: 1, y: 0, super: true, fire: true } });
  assert.ok(enemy.center.x < from.x); assert.equal(enemy.cooldownRemaining, 0);
});

test('teamfight credits killers once and ends at goal; friendly damage earns no score', () => {
  const sim = make(0, { modeId: 'teamfight', modeOverrides: { teamfight: { goal: 1 } } });
  const actor = sim.actors[0], enemy = sim.actors[3];
  sim.dealDamage(actor, sim.actors[1], 10000); assert.equal(sim.actors[1].alive, true);
  sim.dealDamage(actor, enemy, 10000); sim.dealDamage(actor, enemy, 10000);
  assert.equal(sim.manager.mode.scores[0], 1); sim.step(0.01);
  assert.equal(sim.manager.state, 'finished'); assert.equal(sim.manager.result.winner, 0);
  const events = sim.drainEvents(); assert.equal(events.filter(event => event.type === 'death').length, 1);
  assert.equal(events.filter(event => event.type === 'finish').length, 1);
  sim.step(0.1); assert.equal(sim.drainEvents().length, 0);
});

test('a teamfight winning hit uses the same substep for physics, elapsed time, and match clock', () => {
  const sim = make(0, { modeId: 'teamfight', modeOverrides: { teamfight: { goal: 1 } } });
  const actor = sim.actors[0], enemy = sim.actors[3]; enemy.x = 300; enemy.y = actor.y; enemy.health = 200;
  run(sim, 0.5, { 0: { fire: true, aim: enemy.center } });
  assert.equal(sim.manager.state, 'finished'); close(sim.elapsed + sim.manager.remaining, sim.manager.duration);
  assert.ok(sim.elapsed > 0 && sim.elapsed < 0.5);
});

test('expired or already decided matches cannot fire or use an ability on their last frame', () => {
  const sim = make(0, { modeOverrides: { duration: 0 } }), actor = sim.actors[0];
  actor.superCharge = 100;
  sim.step(0.05, { 0: { x: 1, fire: true, super: true, aim: { x: 500, y: 100 } } });
  assert.equal(sim.manager.state, 'finished'); assert.equal(sim.elapsed, 0);
  assert.equal(actor.superCharge, 100); assert.equal(actor.cooldownRemaining, 0);
  assert.equal(sim.projectiles.length, 0); assert.equal(actor.x, 100);
  assert.equal(sim.drainEvents().length, 1);
});

test('teamfight counts a second death after respawn even within the respawn substep', () => {
  const sim = make(0, { modeId: 'teamfight' }), actor = sim.actors[0], enemy = sim.actors[3];
  sim.dealDamage(actor, enemy, 10000); enemy.respawnRemaining = 0.001;
  sim.step(0.01); assert.equal(enemy.alive, true); sim.dealDamage(actor, enemy, 10000);
  assert.equal(sim.manager.mode.scores[0], 2);
});

test('teamfight bots approach opponents instead of pursuing cottage objectives', () => {
  const sim = make(0, { modeId: 'teamfight' }), actor = sim.actors[0];
  const bot = new Bot(actor, 0); const from = actor.center;
  bot.update(0.1, sim.world, false); assert.equal(bot.targetEnemy, sim.actors[3]);
  assert.ok(actor.center.x > from.x); assert.ok(bot.goal.x > 650);
});

test('death and respawn events identify participants and clear fired commands on the revival frame', () => {
  const sim = make(), actor = sim.actors[0], enemy = sim.actors[3];
  sim.dealDamage(enemy, actor, 10000); actor.respawnRemaining = 0.001;
  sim.step(0.05, { 0: { x: 1, y: 0, fire: true } });
  assert.equal(actor.alive, true); assert.equal(actor.x, actor.spawn.x); assert.equal(actor.cooldownRemaining, 0);
  const events = sim.drainEvents();
  assert.equal(events.find(event => event.type === 'death').sourceId, enemy.id);
  assert.equal(events.filter(event => event.type === 'respawn' && event.actorId === actor.id).length, 1);
});

test('super command is consumed once per outer frame even if an ability recharges immediately', () => {
  const sim = make(), actor = sim.actors[0]; let calls = 0;
  actor.superCharge = 100; actor.useSuper = () => { calls++; actor.superCharge = 100; return true; };
  sim.step(0.05, { 0: { super: true } }); assert.equal(calls, 1);
});

test('event storage stays bounded and draining never replays previous events', () => {
  const sim = make(); for (let i = 0; i < 500; i++) sim.emit({ type: 'impact', x: i, y: 0 });
  assert.equal(sim.drainEvents().length, 256); assert.equal(sim.drainEvents().length, 0);
});

test('different frame partitions give the same movement and donation phase', () => {
  const a = make(), b = make();
  run(a, 1, { 0: { x: 1, y: 0 } }, 1 / 30); run(b, 1, { 0: { x: 1, y: 0 } }, 1 / 144);
  close(a.actors[0].x, b.actors[0].x); close(a.manager.remaining, b.manager.remaining);
  close(a.manager.mode.spawnElapsed, b.manager.mode.spawnElapsed);
});
