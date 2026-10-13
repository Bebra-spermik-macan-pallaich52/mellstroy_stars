const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
for (const file of ['donationsMode.js', 'cottageMode.js', 'teamfightMode.js', 'gameManager.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
}
vm.runInContext('globalThis.subject = { DonationsMode, CottageMode, GameManager, matchConfig };', context);
const { DonationsMode, CottageMode, GameManager, matchConfig } = context.subject;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const world = () => ({
  width: 960, height: 640, walls: [], resourcePoint: { x: 480, y: 320 },
  captureZone: { x: 400, y: 230, width: 230, height: 180 }
});
const actor = (team = 0, x = 460, y = 300) => ({
  x, y, width: 32, height: 64, alive: true, team,
  get center() { return { x: this.x + this.width / 2, y: this.y + this.height / 2 }; }
});
const donations = (actors = [], overrides = {}, map = world()) => new DonationsMode(map, actors, { ...matchConfig.donations, ...overrides });
const cottage = (overrides = {}) => new CottageMode(world(), [], { ...matchConfig.cottage, ...overrides });
const gem = (who, value = 1) => ({ ...who.center, radius: 10, value });

test('donations spawn on intervals and retain fractional elapsed time', () => {
  const mode = donations();
  mode.update(2.49, []); assert.equal(mode.items.length, 0);
  mode.update(0.01, []); assert.equal(mode.items.length, 1);
  mode.update(5.2, []); assert.equal(mode.items.length, 3); close(mode.spawnElapsed, 0.2);
});
test('periodic spawn count and phase are independent of frame partition', () => {
  const one = donations(), many = donations();
  one.update(12.6, []);
  for (let i = 0; i < 126; i++) many.update(0.1, []);
  assert.equal(one.items.length, many.items.length); close(one.spawnElapsed, many.spawnElapsed);
});
test('periodic spawn cap has no backlog after items are removed', () => {
  const mode = donations([], { maxItems: 3 });
  mode.update(10000, []); assert.equal(mode.items.length, 3);
  mode.items.length = 0; mode.update(1, []); assert.equal(mode.items.length, 0);
  mode.update(1.5, []); assert.equal(mode.items.length, 1);
});
test('generated donations fit inside map boundaries and avoid walls', () => {
  const map = world(); map.resourcePoint = { x: 15, y: 15 };
  map.walls.push({ x: 0, y: 0, width: 30, height: 30 });
  const mode = donations([], {}, map); mode.update(100, []);
  assert.ok(mode.items.length > 0);
  for (const item of mode.items) assert.equal(mode.freePosition(item.x, item.y, item.radius), true);
});
test('circle versus rectangle pickup includes edge contact and counts each gem once', () => {
  const a = actor(), b = actor(1), mode = donations([a, b]);
  mode.items.push({ x: a.x - 10, y: a.center.y, radius: 10, value: 2 });
  mode.update(0, [a, b]); assert.equal(mode.carried.get(a), 2); assert.equal(mode.carried.get(b), 0);
  assert.equal(mode.items.length, 0); assert.equal(mode.scores[0], 2);
  mode.update(0, [a, b]); assert.equal(mode.scores[0], 2);
});
test('dead actors cannot collect resources', () => {
  const a = actor(), mode = donations([a]); a.alive = false; mode.items.push(gem(a));
  mode.update(0, [a]); assert.equal(mode.items.length, 1); assert.equal(mode.carried.get(a), 0);
});
test('death drops rounded-up half, retains the rest and supports enemy recovery', () => {
  const a = actor(), b = actor(1, 0, 0), mode = donations([a, b]);
  mode.items.push(gem(a, 5)); mode.update(0, [a, b]); assert.equal(mode.scores[0], 5);
  a.alive = false; mode.onDeath(a);
  assert.equal(mode.carried.get(a), 2); assert.equal(mode.items.length, 3); assert.equal(mode.scores[0], 2);
  for (const item of [...mode.items]) {
    b.x = item.x - b.width / 2; b.y = item.y - b.height / 2; mode.update(0, [a, b]);
  }
  assert.equal(mode.scores[1], 3); assert.equal(mode.items.length, 0);
  a.alive = true; a.x = 100; a.y = 100; mode.update(0, [a, b]); assert.equal(mode.carried.get(a), 2);
});
test('death drops bypass the spawn cap and duplicate death callbacks have no effect', () => {
  const a = actor(), mode = donations([a], { maxItems: 1 });
  mode.carried.set(a, 4); mode.items.push({ x: 100, y: 100, radius: 10, value: 1 });
  a.alive = false; mode.onDeath(a); mode.onDeath(a);
  assert.equal(mode.items.length, 3); assert.equal(mode.carried.get(a), 2);
  assert.ok(mode.items.every(item => mode.freePosition(item.x, item.y, item.radius)));
});
test('a later death after respawn can drop newly collected donations', () => {
  const a = actor(), mode = donations([a]); mode.carried.set(a, 4);
  a.alive = false; mode.onDeath(a); a.alive = true; a.x = 0; a.y = 0;
  mode.update(0, [a]); a.alive = false; mode.onDeath(a);
  assert.equal(mode.carried.get(a), 1); assert.equal(mode.items.length, 3);
});
test('cottage capture excludes dead actors and counts overlapping hitboxes', () => {
  const a = actor(0, 369, 250), dead = actor(1), mode = cottage(); dead.alive = false;
  mode.update(1, [a, dead]); assert.equal(mode.progress, 20); assert.equal(mode.capturingTeam, 0);
  assert.equal(mode.occupants[0], true); assert.equal(mode.occupants[1], false);
});
test('both teams pause capture and scoring', () => {
  const a = actor(), b = actor(1), mode = cottage();
  mode.update(6, [a]); assert.equal(mode.owner, 0); close(mode.scores[0], 5);
  mode.update(5, [a, b]); assert.equal(mode.progress, 100); close(mode.scores[0], 5);
  assert.equal(mode.contested, true); assert.equal(mode.capturingTeam, null);
});
test('empty zone freezes partial capture but a fully controlled empty zone earns points', () => {
  const a = actor(), mode = cottage();
  mode.update(2, [a]); mode.update(10, []); assert.equal(mode.progress, 40); assert.equal(mode.scores[0], 0);
  mode.update(3, [a]); assert.equal(mode.owner, 0); assert.equal(mode.scores[0], 0);
  mode.update(2, []); assert.equal(mode.scores[0], 10);
});
test('enemy presence pauses points until the original team fully restores capture', () => {
  const a = actor(), b = actor(1), mode = cottage();
  mode.update(6, [a]); mode.update(1, [b]); assert.equal(mode.progress, 80); assert.equal(mode.owner, 0);
  mode.update(10, []); assert.equal(mode.scores[0], 5); assert.equal(mode.progress, 80);
  mode.update(0.5, [a]); assert.equal(mode.progress, 90); assert.equal(mode.scores[0], 5);
  mode.update(1.5, [a]); assert.equal(mode.progress, 100); assert.equal(mode.scores[0], 10);
});
test('capture neutralizes at zero, then transfers ownership at the opposite limit', () => {
  const a = actor(), b = actor(1), mode = cottage(); mode.update(5, [a]);
  mode.update(5, [b]); assert.equal(mode.progress, 0); assert.equal(mode.owner, null);
  mode.update(6, [b]); assert.equal(mode.progress, -100); assert.equal(mode.owner, 1);
  assert.equal(mode.scores[0], 0); assert.equal(mode.scores[1], 5);
});
test('capture and recapture award only post-capture time independent of frame partition', () => {
  const a = actor(), b = actor(1), one = cottage(), many = cottage();
  one.update(7.25, [a]); one.update(11.25, [b]);
  for (let i = 0; i < 725; i++) many.update(0.01, [a]);
  for (let i = 0; i < 1125; i++) many.update(0.01, [b]);
  close(one.progress, many.progress); close(one.scores[0], many.scores[0]); close(one.scores[1], many.scores[1]);
  close(one.scores[0], 11.25); close(one.scores[1], 6.25);
});
test('manager merges nested overrides without losing defaults', () => {
  const manager = new GameManager('cottage', world(), [], { duration: 10, cottage: { goal: 20 } });
  assert.equal(manager.goal, 20); assert.equal(manager.duration, 10);
  assert.equal(manager.config.cottage.captureRate, 20); assert.equal(manager.config.donations.goal, 15);
});
test('donations goal ends the match and freezes updates and death losses', () => {
  const a = actor(), manager = new GameManager('donations', world(), [a], { donations: { goal: 2 } });
  manager.mode.items.push(gem(a, 2)); manager.update(0.5);
  assert.equal(manager.state, 'finished'); assert.equal(manager.result.winner, 0); assert.equal(manager.result.reason, 'goal');
  const remaining = manager.remaining; a.alive = false; manager.onDeath(a); manager.update(100);
  assert.equal(manager.remaining, remaining); assert.equal(manager.mode.carried.get(a), 2); assert.equal(manager.mode.items.length, 0);
});
test('enemy cottage goal produces defeat and score is capped at target', () => {
  const b = actor(1), manager = new GameManager('cottage', world(), [b], { cottage: { goal: 10 } });
  manager.update(30); assert.equal(manager.state, 'finished'); assert.equal(manager.result.winner, 1);
  assert.equal(manager.result.reason, 'goal'); assert.equal(manager.result.scores[1], 10);
});
test('timer clips mode updates and awards no control points after expiration', () => {
  const a = actor(), manager = new GameManager('cottage', world(), [a], { duration: 6 });
  manager.update(100); assert.equal(manager.remaining, 0); assert.equal(manager.mode.scores[0], 5);
  assert.equal(manager.result.winner, 0); assert.equal(manager.result.reason, 'time');
});
test('timeout chooses the higher score for either team or a draw', () => {
  for (const scores of [[3, 1], [1, 3], [3, 3]]) {
    const manager = new GameManager('donations', world(), [], { duration: 1 });
    manager.mode.carried.set(actor(0, 0, 0), scores[0]); manager.mode.carried.set(actor(1, 0, 0), scores[1]);
    manager.update(1); assert.equal(manager.result.reason, 'time');
    assert.equal(manager.result.winner, scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1);
  }
});
test('goal at the time boundary wins over timeout', () => {
  const a = actor(), manager = new GameManager('donations', world(), [a], { duration: 1, donations: { goal: 1 } });
  manager.mode.items.push(gem(a)); manager.update(2); assert.equal(manager.remaining, 0); assert.equal(manager.result.reason, 'goal');
});
test('new manager resets timer, result, scores, drops, and cottage ownership', () => {
  const a = actor(), old = new GameManager('cottage', world(), [a], { duration: 6 }); old.update(6);
  const fresh = new GameManager('cottage', world(), [a]);
  assert.equal(fresh.remaining, 180); assert.equal(fresh.state, 'playing'); assert.equal(fresh.result, null);
  assert.equal(fresh.mode.progress, 0); assert.equal(fresh.mode.owner, null); assert.equal(fresh.mode.scores[0], 0);
  const resources = new GameManager('donations', world(), [a]);
  assert.equal(resources.mode.items.length, 0); assert.equal(resources.mode.carried.get(a), 0);
});
test('zero-duration match immediately draws without collecting a last-second item', () => {
  const a = actor(), manager = new GameManager('donations', world(), [a], { duration: 0 }); manager.mode.items.push(gem(a));
  manager.update(0); assert.equal(manager.result.reason, 'time'); assert.equal(manager.result.winner, null);
  assert.equal(manager.mode.scores[0], 0); assert.equal(manager.mode.items.length, 1);
});

test('floating-point noise in equal control points still yields a draw', () => {
  const manager = new GameManager('cottage', world(), [], { duration: 0 });
  manager.mode.scores = [50, 50 + 1e-12];
  manager.update(0);
  assert.equal(manager.result.winner, null);
});
