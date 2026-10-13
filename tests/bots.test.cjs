// Run with node --test tests/bots.test.cjs; no packages are required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
for (const file of ['assets.js', 'collision.js', 'projectile.js', 'player.js', 'map.js',
  'donationsMode.js', 'cottageMode.js', 'gameManager.js', 'bot.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
}
vm.runInContext('globalThis.subject = { Bot, botConfig, Player, GameManager, characterConfig, arena, overlaps };', context);
const { Bot, botConfig, Player, GameManager, characterConfig, arena, overlaps } = context.subject;
const actor = (x = 20, y = 200, team = 0) => new Player({ x, y }, characterConfig, { team });
const map = (walls = []) => ({
  width: 960, height: 640, walls, resourcePoint: { x: 480, y: 320 },
  captureZone: { x: 400, y: 230, width: 230, height: 180 }
});
const world = (actors, field = map(), modeId = 'donations', config = {}) => ({
  map: field, actors, bots: [], manager: new GameManager(modeId, field, actors,
    { donations: { spawnInterval: 1000, goal: 10000 }, duration: 1000, ...config })
});
const item = (x = 480, y = 320, radius = 10) => ({ x, y, radius, value: 1 });
function verifyBody(body, field) {
  assert.ok(body.x >= -1e-8 && body.y >= -1e-8 && body.x + body.width <= field.width + 1e-8 &&
    body.y + body.height <= field.height + 1e-8, 'Character stayed inside map bounds');
  assert.ok(!field.walls.some(wall => overlaps(body, wall)), 'Character never overlapped a wall');
}
function step(subject, dt = 1 / 120, allowFire = false) {
  for (const body of subject.actors) body.updateTimers(dt);
  const shots = subject.bots.map(bot => bot.update(dt, subject, allowFire)).filter(Boolean);
  for (const body of subject.actors) verifyBody(body, subject.map);
  subject.manager.mode.update(dt, subject.actors);
  return shots;
}
function run(subject, seconds, dt = 1 / 120) {
  for (let elapsed = 0; elapsed < seconds - 1e-10; elapsed += dt) step(subject, dt);
}
function single(field = map(), position = { x: 20, y: 200 }, modeId = 'donations', config = {}) {
  const body = actor(position.x, position.y), subject = world([body], field, modeId);
  const bot = new Bot(body, 0, config);
  subject.bots = [bot];
  return { subject, bot, body };
}

test('bots use shared movement speed with normalized diagonal input', () => {
  const field = map(); field.resourcePoint = { x: 800, y: 500 };
  const { subject, body } = single(field);
  const from = body.center;
  step(subject, 0.2);
  assert.ok(Math.abs(Math.hypot(body.center.x - from.x, body.center.y - from.y) - 40) < 1e-8);
  assert.equal(body.config.speed, 200);
});

test('closest donation is collected through mode logic instead of modifying scores', () => {
  const { subject, bot, body } = single();
  const nearest = item(170, 320), far = item(600, 320);
  subject.manager.mode.items.push(far, nearest);
  step(subject); assert.equal(bot.targetItem, nearest);
  run(subject, 1);
  assert.equal(subject.manager.mode.carried.get(body), 1);
  assert.ok(!subject.manager.mode.items.includes(nearest));
  assert.ok(subject.manager.mode.items.includes(far));
});

test('same-team reservation mildly prefers another nearby resource', () => {
  const a = actor(80, 250), b = actor(90, 250), subject = world([a, b]);
  const first = item(220, 280), second = item(245, 280);
  const lead = new Bot(a, 0), follower = new Bot(b, 1);
  subject.bots = [lead, follower]; subject.manager.mode.items.push(first, second);
  step(subject);
  assert.equal(lead.targetItem, first); assert.equal(follower.targetItem, second);
});

test('opponent reservations do not block the closest resource', () => {
  const a = actor(80, 250), b = actor(90, 250, 1), subject = world([a, b]);
  const first = item(220, 280), second = item(245, 280);
  const lead = new Bot(a, 0), enemy = new Bot(b, 1);
  subject.bots = [lead, enemy]; subject.manager.mode.items.push(first, second);
  step(subject);
  assert.equal(lead.targetItem, first); assert.equal(enemy.targetItem, first);
});

test('thin-wall navigation makes a detour instead of tunnelling', () => {
  const field = map([{ x: 220, y: 180, width: 1, height: 280 }]);
  const { subject, bot, body } = single(field);
  subject.manager.mode.items.push(item(500, 320));
  step(subject); assert.ok(bot.path.length >= 3);
  run(subject, 6);
  assert.equal(subject.manager.mode.carried.get(body), 1);
});

test('several offset walls require consecutive safe detours', () => {
  const field = map([
    { x: 220, y: 0, width: 35, height: 390 },
    { x: 400, y: 250, width: 35, height: 390 },
    { x: 610, y: 0, width: 35, height: 360 }
  ]);
  const { subject, body } = single(field);
  subject.manager.mode.items.push(item(850, 320));
  run(subject, 14);
  assert.equal(subject.manager.mode.carried.get(body), 1);
});

test('permanent wall partition stops safely with no reachable path', () => {
  const field = map([{ x: 220, y: 0, width: 1, height: 640 }]);
  const { subject, bot, body } = single(field);
  subject.manager.mode.items.push(item(500, 320));
  run(subject, 2);
  assert.equal(bot.targetItem, null); assert.equal(bot.path.length, 0);
  assert.equal(body.x, 20); assert.equal(body.moving, false);
});

test('a narrow vertical passage admits the 48-pixel width with a reduced margin', () => {
  const field = map([
    { x: 0, y: 250, width: 450, height: 80 },
    { x: 500, y: 250, width: 460, height: 80 }
  ]);
  const { subject, body } = single(field, { x: 100, y: 60 });
  subject.manager.mode.items.push(item(800, 500));
  run(subject, 8);
  assert.equal(subject.manager.mode.carried.get(body), 1);
});

test('a 60-pixel horizontal passage cannot admit the 64-pixel character height', () => {
  const field = map([
    { x: 400, y: 0, width: 80, height: 290 },
    { x: 400, y: 350, width: 80, height: 290 }
  ]);
  const { subject, bot, body } = single(field);
  subject.manager.mode.items.push(item(800, 320));
  run(subject, 4);
  assert.equal(subject.manager.mode.carried.get(body), 0);
  assert.equal(bot.path.length, 0); assert.equal(body.moving, false);
});

test('an actor touching a wall can leave the extra navigation margin', () => {
  const field = map([{ x: 270, y: 140, width: 48, height: 230 }]);
  const { subject, body } = single(field, { x: 222, y: 250 });
  subject.manager.mode.items.push(item(100, 282));
  run(subject, 2);
  assert.equal(subject.manager.mode.carried.get(body), 1);
});

test('donation beside a wall is reached from a valid projected pickup position', () => {
  const field = map([{ x: 760, y: 270, width: 50, height: 200 }]);
  const { subject, body } = single(field, { x: 500, y: 280 });
  subject.manager.mode.items.push(item(749, 350));
  run(subject, 2);
  assert.equal(subject.manager.mode.carried.get(body), 1);
});

test('donation at the map edge remains collectible without leaving bounds', () => {
  const { subject, body } = single(map(), { x: 130, y: 290 });
  subject.manager.mode.items.push(item(10, 320));
  run(subject, 1);
  assert.equal(subject.manager.mode.carried.get(body), 1);
});

test('small edge resource can use a tighter wall approach', () => {
  const field = map([{ x: 760, y: 270, width: 50, height: 200 }]);
  const { subject, body } = single(field, { x: 500, y: 280 });
  subject.manager.mode.items.push(item(758.9, 350, 1));
  run(subject, 2);
  assert.equal(subject.manager.mode.carried.get(body), 1);
});

test('all five real-map spawn positions reach and hold their cottage objectives', () => {
  for (const [index, spawn] of arena.teamSpawns.flat().slice(1).entries()) {
    const { subject, bot, body } = single(arena, spawn, 'cottage');
    bot.index = index;
    run(subject, 9);
    assert.equal(subject.manager.mode.inZone(body), true, `Spawn ${index} reached the cottage`);
    const position = body.center;
    run(subject, 3);
    assert.ok(Math.hypot(body.center.x - position.x, body.center.y - position.y) < 0.2);
    assert.equal(body.moving, false);
  }
});

test('all five real-map spawn positions can collect a center donation', () => {
  for (const [index, spawn] of arena.teamSpawns.flat().slice(1).entries()) {
    const { subject, bot, body } = single(arena, spawn);
    bot.index = index; subject.manager.mode.items.push(item());
    run(subject, 9);
    assert.equal(subject.manager.mode.carried.get(body), 1, `Spawn ${index} collected a donation`);
  }
});

test('cottage teammates use distinct goals and stop the walk animation on arrival', () => {
  const actors = [actor(80, 80), actor(70, 550), actor(800, 80)], subject = world(actors, arena, 'cottage');
  subject.bots = actors.map((body, index) => new Bot(body, index));
  run(subject, 9);
  assert.equal(new Set(subject.bots.map(bot => `${bot.goal.x},${bot.goal.y}`)).size, 3);
  for (const body of actors) {
    assert.equal(subject.manager.mode.inZone(body), true);
    assert.equal(body.moving, false); assert.ok(body.animator.state.startsWith('idle_'));
  }
});

test('bots wait in spread positions when no resources are available', () => {
  const actors = [actor(80, 80), actor(70, 550)], subject = world(actors, arena);
  subject.bots = actors.map((body, index) => new Bot(body, index));
  run(subject, 9);
  assert.ok(Math.hypot(actors[0].center.x - actors[1].center.x, actors[0].center.y - actors[1].center.y) > 30);
  for (const body of actors) assert.equal(body.moving, false);
});

test('movement result is stable across ordinary frame rates', () => {
  const make = () => {
    const scenario = single(map([{ x: 220, y: 180, width: 10, height: 280 }]));
    scenario.subject.manager.mode.items.push(item(600, 320));
    return scenario;
  };
  const a = make(), b = make();
  run(a.subject, 8, 1 / 30); run(b.subject, 8, 1 / 144);
  assert.equal(a.subject.manager.mode.carried.get(a.body), 1);
  assert.equal(b.subject.manager.mode.carried.get(b.body), 1);
  assert.ok(Math.hypot(a.body.x - b.body.x, a.body.y - b.body.y) < 0.2);
});

test('closest shootable opponent is chosen while dead and friendly actors are ignored', () => {
  const body = actor(100, 200), friendly = actor(150, 200), dead = actor(160, 200, 1);
  const near = actor(250, 200, 1), far = actor(400, 200, 1); dead.takeDamage(1000);
  const subject = world([body, friendly, dead, far, near]);
  const bot = new Bot(body, 0); subject.bots = [bot];
  const shot = bot.update(1 / 120, subject);
  assert.ok(shot); assert.equal(bot.targetEnemy, near); assert.equal(shot.owner, body);
});

test('line-of-fire obstacles block attacks without consuming shared cooldown', () => {
  const body = actor(100, 200), enemy = actor(300, 200, 1);
  const subject = world([body, enemy], map([{ x: 220, y: 180, width: 1, height: 160 }]));
  const bot = new Bot(body, 0); subject.bots = [bot];
  assert.equal(bot.update(1 / 120, subject), null); assert.equal(body.cooldownRemaining, 0);
  assert.equal(bot.targetEnemy, enemy);
});

test('a farther visible enemy is attacked when the nearer one is behind a wall', () => {
  const body = actor(100, 200), blocked = actor(250, 200, 1), visible = actor(100, 410, 1);
  const subject = world([body, blocked, visible], map([{ x: 220, y: 180, width: 1, height: 160 }]));
  const bot = new Bot(body, 0); subject.bots = [bot];
  assert.ok(bot.update(1 / 120, subject)); assert.equal(bot.targetEnemy, visible);
});

test('out-of-range enemies are tracked but do not consume cooldown', () => {
  const body = actor(20, 200), enemy = actor(800, 200, 1), subject = world([body, enemy]);
  const bot = new Bot(body, 0); subject.bots = [bot];
  assert.equal(bot.update(1 / 120, subject), null); assert.equal(bot.targetEnemy, enemy);
  assert.equal(body.cooldownRemaining, 0);
});

test('bots return normal projectiles and rely on shared cooldown and damage', () => {
  const body = actor(100, 200), enemy = actor(300, 200, 1), subject = world([body, enemy]);
  const bot = new Bot(body, 0); subject.bots = [bot];
  const shot = bot.update(1 / 120, subject);
  assert.ok(shot); assert.equal(bot.update(1 / 120, subject), null);
  assert.equal(enemy.health, 1000);
  const hit = shot.update(1, subject.map, subject.actors);
  assert.equal(hit.target, enemy); hit.target.takeDamage(hit.damage);
  assert.equal(enemy.health, 800);
  body.updateTimers(characterConfig.attack.cooldown);
  assert.ok(bot.update(1 / 120, subject));
});

test('disabling bot firing preserves movement and prevents attacks for both teams', () => {
  const body = actor(100, 200), enemy = actor(300, 200, 1), subject = world([body, enemy]);
  const bot = new Bot(body, 0); subject.bots = [bot];
  const x = body.x;
  assert.equal(bot.update(0.1, subject, false), null);
  assert.ok(body.x > x); assert.equal(body.cooldownRemaining, 0); assert.equal(bot.targetEnemy, enemy);
});

test('death clears targets and paths; respawn restores objective navigation', () => {
  const { subject, bot, body } = single();
  const donation = item(); subject.manager.mode.items.push(donation);
  step(subject); assert.equal(bot.targetItem, donation); assert.ok(bot.path.length);
  body.takeDamage(1000);
  assert.equal(bot.update(0.1, subject), null);
  assert.equal(bot.targetItem, null); assert.equal(bot.targetEnemy, null);
  assert.equal(bot.path.length, 0); assert.equal(bot.navigation, null);
  assert.equal(body.updateTimers(3), true);
  bot.update(1 / 120, subject, false);
  assert.equal(bot.targetItem, donation); assert.ok(bot.path.length); assert.equal(body.health, 1000);
});

test('manual reset clears cached decisions without changing the actor state', () => {
  const { subject, bot, body } = single(); subject.manager.mode.items.push(item());
  step(subject); body.takeDamage(100); body.cooldownRemaining = 0.3;
  const x = body.x; bot.reset();
  assert.equal(bot.targetItem, null); assert.equal(bot.targetEnemy, null); assert.equal(bot.navigation, null);
  assert.equal(bot.path.length, 0); assert.equal(bot.replanRemaining, 0); assert.equal(bot.stuckElapsed, 0);
  assert.equal(body.x, x); assert.equal(body.health, 900); assert.equal(body.cooldownRemaining, 0.3);
});

test('a new match replaces stale donation decisions with the cottage objective', () => {
  const { subject, bot, body } = single(); subject.manager.mode.items.push(item());
  step(subject); assert.ok(bot.targetItem);
  subject.manager = new GameManager('cottage', subject.map, [body]);
  bot.update(1 / 120, subject, false);
  assert.equal(bot.targetItem, null); assert.equal(bot.manager, subject.manager);
  assert.ok(bot.goal.x > subject.map.captureZone.x && bot.goal.x < subject.map.captureZone.x + subject.map.captureZone.width);
});

test('zero time does not move or fire', () => {
  const body = actor(100, 200), enemy = actor(300, 200, 1), subject = world([body, enemy]);
  const bot = new Bot(body, 0); const x = body.x;
  assert.equal(bot.update(0, subject), null); assert.equal(body.x, x); assert.equal(body.cooldownRemaining, 0);
});

test('navigation graph is reused and full plans are throttled by configuration', () => {
  const { subject, bot } = single();
  let plans = 0; const choose = bot.chooseObjective.bind(bot);
  bot.chooseObjective = state => { plans++; return choose(state); };
  step(subject); const graph = bot.navigation;
  run(subject, 0.4); assert.equal(plans, 1); assert.equal(bot.navigation, graph);
  run(subject, 0.1); assert.equal(plans, 2); assert.equal(bot.navigation, graph);
  assert.equal(botConfig.replanInterval, 0.45);
});

test('a vanished item clears its reservation on the following step', () => {
  const { subject, bot } = single(); const donation = item(); subject.manager.mode.items.push(donation);
  step(subject); assert.equal(bot.targetItem, donation);
  subject.manager.mode.items = [];
  step(subject); assert.equal(bot.targetItem, null); assert.ok(bot.path.length);
});
