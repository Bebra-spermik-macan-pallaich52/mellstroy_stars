// No test dependencies: run `node --test tests/combat.test.cjs`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
for (const file of ['assets.js', 'collision.js', 'projectile.js', 'characters.js', 'player.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
}
vm.runInContext('globalThis.subject = { Player, Projectile, characterConfig };', context);
const { Player, Projectile, characterConfig } = context.subject;
const map = () => ({ width: 1200, height: 700, walls: [] });
const player = (x = 10, y = 100, team = 0) => new Player({ x, y }, characterConfig, { team });
const shot = (owner, overrides = {}) => new Projectile(owner, { x: 1, y: 0 }, { speed: 10000, damage: 200, range: 1000, radius: 5, ...overrides });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('normalized movement has the same straight and diagonal speed', () => {
  const a = player(100, 100), b = player(100, 100);
  a.update(1, { direction: () => ({ x: 1, y: 0 }) }, map());
  b.update(1, { direction: () => ({ x: Math.SQRT1_2, y: Math.SQRT1_2 }) }, map());
  close(a.x - 100, 200); close(Math.hypot(b.x - 100, b.y - 100), 200);
});
test('character cannot cross thin walls and can slide along them', () => {
  const a = player(), world = map(); world.walls = [{ x: 150, y: 0, width: 1, height: 700 }];
  a.update(1, { direction: () => ({ x: 1, y: 0 }) }, world); assert.equal(a.x, 150 - a.width);
  const y = a.y; a.update(0.1, { direction: () => ({ x: Math.SQRT1_2, y: Math.SQRT1_2 }) }, world);
  assert.equal(a.x, 150 - a.width); assert.ok(a.y > y);
});
test('fast projectile stops at a one-pixel wall before an enemy', () => {
  const a = player(), target = player(300, 100, 1), world = map();
  world.walls = [{ x: 150, y: 0, width: 1, height: 700 }];
  const p = shot(a); assert.equal(p.update(1, world, [target]), null);
  assert.equal(p.x, 145); assert.equal(p.active, false); assert.equal(target.health, 1000);
});
test('nearest enemy receives a hit regardless of array order', () => {
  const a = player(), near = player(150, 100, 1), far = player(300, 100, 1);
  const hit = shot(a).update(1, map(), [far, near]); assert.equal(hit.target, near);
});
test('a projectile cannot report the same hit twice', () => {
  const a = player(), target = player(150, 100, 1), p = shot(a);
  const hit = p.update(1, map(), [target]); target.takeDamage(hit.damage);
  assert.equal(p.update(1, map(), [target]), null); assert.equal(target.health, 800);
});
test('walls win a collision tied with an actor', () => {
  const a = player(), target = player(150, 100, 1), world = map();
  world.walls = [{ x: 150, y: 100, width: 1, height: 64 }];
  assert.equal(shot(a).update(1, world, [target]), null);
});
test('owner, allies and dead actors do not intercept a shot', () => {
  const a = player(), ally = player(100, 100), dead = player(200, 100, 1), target = player(300, 100, 1);
  dead.takeDamage(1000);
  assert.equal(shot(a).update(1, map(), [a, ally, dead, target]).target, target);
});
test('range is clipped even with a huge time step', () => {
  const a = player(), p = shot(a, { range: 50 });
  assert.equal(p.update(10, map(), [player(100, 100, 1)]), null);
  close(p.traveled, 50); close(p.x, a.center.x + 50); assert.equal(p.active, false);
});
test('target exactly at the range endpoint can be hit', () => {
  const a = player(), p = shot(a, { range: 50 }), target = player(a.center.x + 55, 100, 1);
  assert.equal(p.update(1, map(), [target]).target, target);
});
test('projectile respects the map boundary and its radius', () => {
  const a = player(), p = shot(a), world = map(); world.width = 100;
  p.update(1, world, []); assert.equal(p.x, 95); assert.equal(p.active, false);
});
test('sweep outcome is independent of frame partition', () => {
  const a = player(), world = map(); world.walls = [{ x: 150, y: 0, width: 1, height: 700 }];
  const fast = shot(a, { speed: 200 }), small = shot(a, { speed: 200 });
  fast.update(1, world, []); for (let i = 0; i < 100; i++) small.update(0.01, world, []);
  close(fast.x, small.x); assert.equal(small.active, false);
});
test('cooldown blocks repeated fire and reopens after configured time', () => {
  const a = player(), aim = { x: 500, y: a.center.y };
  assert.ok(a.attack(aim)); assert.equal(a.attack(aim), null);
  a.updateTimers(0.44); assert.equal(a.attack(aim), null);
  a.updateTimers(0.011); assert.ok(a.attack(aim));
});
test('aim at the exact center does not consume cooldown or create NaN shots', () => {
  const a = player(); assert.equal(a.attack(a.center), null); assert.equal(a.cooldownRemaining, 0);
});
test('projectile direction is normalized', () => {
  const a = player(), p = new Projectile(a, { x: 3, y: 4 }, { speed: 50, range: 100 });
  p.update(1, map(), []); close(p.x - a.center.x, 30); close(p.y - a.center.y, 40);
});
test('damage caps at remaining health; invalid damage has no effect', () => {
  const a = player(); assert.equal(a.takeDamage(-20), 0); assert.equal(a.takeDamage(NaN), 0);
  assert.equal(a.takeDamage(900), 900); assert.equal(a.health, 100);
  assert.equal(a.takeDamage(200), 100); assert.equal(a.health, 0); assert.equal(a.alive, false);
  assert.equal(a.takeDamage(200), 0);
});
test('dead actor cannot move or initiate attacks', () => {
  const a = player(); a.takeDamage(1000);
  const x = a.x; a.update(1, { direction: () => ({ x: 1, y: 0 }) }, map());
  assert.equal(a.x, x); assert.equal(a.attack({ x: 500, y: 100 }), null); assert.equal(a.moving, false);
});
test('respawn restores health and spawn only after the delay', () => {
  const a = player(); a.x = 500; a.superCharge = 70; a.takeDamage(1000);
  assert.equal(a.updateTimers(2.99), false); assert.equal(a.alive, false);
  assert.equal(a.updateTimers(0.02), true); assert.equal(a.alive, true);
  assert.equal(a.health, 1000); assert.equal(a.x, a.spawn.x); assert.equal(a.superCharge, 70);
});
test('super charge uses actual damage, caps at 100, and survives death', () => {
  const a = player(), target = player(150, 100, 1);
  a.chargeSuper(target.takeDamage(950)); assert.equal(a.superCharge, 95);
  a.chargeSuper(target.takeDamage(200)); assert.equal(a.superCharge, 100);
  a.chargeSuper(200); assert.equal(a.superCharge, 100);
  a.takeDamage(1000); assert.equal(a.superCharge, 100); a.chargeSuper(200); assert.equal(a.superCharge, 100);
});
test('reset restores position, health, cooldown and combat state', () => {
  const a = player(); a.x = 400; a.takeDamage(200); a.attack({ x: 500, y: 100 }); a.chargeSuper(300);
  a.reset(); assert.equal(a.x, 10); assert.equal(a.health, 1000);
  assert.equal(a.cooldownRemaining, 0); assert.equal(a.superCharge, 0); assert.equal(a.alive, true);
});
