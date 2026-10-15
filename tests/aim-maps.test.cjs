const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const context = vm.createContext({ console, document: { hidden: false, addEventListener() {} }, window: { addEventListener() {} } });
for (const name of ['camera', 'input', 'assets', 'collision', 'projectile', 'characters', 'player', 'map', 'donationsMode', 'cottageMode', 'teamfightMode', 'gameManager', 'bot', 'simulation']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name + '.js'), 'utf8'), context);
}
vm.runInContext('globalThis.api = { Input, Camera, Simulation, Player, Bot, createMap, mapCatalog, getCharacterConfig, overlaps };', context);
const { Input, Camera, Simulation, Player, Bot, createMap, mapCatalog, getCharacterConfig, overlaps } = context.api;
function mouseFixture() {
  const handlers = {}, capture = [];
  const target = { addEventListener(name, callback) { handlers[name] = callback; } };
  const canvas = { width: 960, height: 640, clientWidth: 480, clientHeight: 320, clientLeft: 0, clientTop: 0,
    getBoundingClientRect() { return { left: 100, top: 50, width: 480, height: 320 }; },
    addEventListener(name, callback) { handlers['canvas-' + name] = callback; },
    focus() {}, setPointerCapture(id) { capture.push(id); } };
  const input = new Input(target, canvas);
  input.camera = new Camera(); input.camera.x = 120; input.camera.y = 60;
  const send = (name, overrides = {}) => handlers[name]?.({ button: 0, isPrimary: true, pointerId: 7,
    clientX: 300, clientY: 200, target: { closest() { return null; } }, preventDefault() {}, ...overrides });
  return { input, send, capture };
}

test('holding fire continues past every canvas edge with unbounded camera-aware aiming', () => {
  const { input, send, capture } = mouseFixture();
  send('pointerdown'); assert.equal(input.mouse.firing, true); assert.deepEqual(capture, [7]);
  for (const [clientX, clientY] of [[-200,200],[1200,200],[300,-100],[300,1000]]) {
    send('pointermove', { clientX, clientY }); send('canvas-pointerleave');
    assert.equal(input.mouse.firing, true);
    assert.equal(input.aim().x, (clientX - 100) * 2 + 120);
    assert.equal(input.aim().y, (clientY - 50) * 2 + 60);
  }
  send('pointerup'); assert.equal(input.mouse.firing, false);
});

test('a new press outside the canvas starts firing but buttons and disabled input do not', () => {
  const { input, send } = mouseFixture();
  send('pointerdown', { clientX: 800 }); assert.equal(input.mouse.firing, true); assert(input.aim().x > 960);
  input.clear(); send('pointerdown', { target: { closest() { return {}; } } }); assert.equal(input.mouse.firing, false);
  input.enabled = false; send('pointerdown'); assert.equal(input.mouse.firing, false);
  input.enabled = true; send('pointerdown'); assert.equal(input.mouse.firing, true);
});

test('release, capture loss, cancellation, blur and clear stop held firing and movement', () => {
  const { input, send } = mouseFixture();
  for (const event of ['pointerup', 'pointercancel', 'canvas-lostpointercapture', 'blur']) {
    send('pointerdown'); send(event); assert.equal(input.mouse.firing, false, event);
  }
  input.keys.add('KeyD'); input.actions.add('super'); send('pointerdown'); send('blur');
  assert.equal(input.keys.size, 0); assert.equal(input.actions.size, 0); assert.equal(input.direction().x, 0);
});

test('missing position and zero-sized canvas cannot generate invalid aim', () => {
  const { input, send } = mouseFixture(); assert.equal(input.aim(), null);
  send('pointermove'); input.canvas.clientWidth = 0; assert.equal(input.aim(), null);
});

test('every mode uses compact dimensions and teamfight is smaller while keeping six participants', () => {
  for (const definition of mapCatalog) {
    const normal = new Simulation({ mapId: definition.id, modeId: 'donations' });
    const fight = new Simulation({ mapId: definition.id, modeId: 'teamfight' });
    assert.equal(normal.map.width, definition.width); assert.equal(normal.actors.length, 6); assert.equal(fight.actors.length, 6);
    assert(fight.map.width < normal.map.width && fight.map.height < normal.map.height);
    assert(fight.map.width >= 960 && fight.map.height >= 640);
    assert(fight.map.width <= 1384 && fight.map.height <= 896);
    const camera = new Camera(); camera.update({ x: 9999, y: 9999 }, fight.map, 0, true);
    assert.equal(camera.x, fight.map.width - 960); assert.equal(camera.y, fight.map.height - 640);
  }
});

test('both map sizes keep every spawn and central zone clear and all six routes walkable', () => {
  for (const definition of mapCatalog) for (const mode of ['donations', 'teamfight']) {
    const map = createMap(definition.id, mode);
    assert(!map.walls.some(wall => overlaps(wall, map.captureZone)));
    for (const spawn of map.teamSpawns.flat()) {
      const actor = new Player(spawn, getCharacterConfig(0)), bot = new Bot(actor, 0);
      assert(actor.x >= 0 && actor.y >= 0 && actor.x + actor.width <= map.width && actor.y + actor.height <= map.height);
      assert(!map.walls.some(wall => overlaps(actor, wall)), `${definition.id}/${mode} spawn intersects wall`);
      assert(bot.planTo(map.resourcePoint, map), `${definition.id}/${mode} route unavailable`);
      let previous = actor.center;
      for (const point of bot.path) { assert(bot.clearSegment(previous, point, bot.navigation)); previous = point; }
    }
    for (const road of map.roads) for (const point of road) assert(point.x >= 0 && point.y >= 0 && point.x <= map.width && point.y <= map.height);
  }
});

test('compact and normal map instances keep destructible walls and spawns independent', () => {
  const compact = createMap('crossroads', 'teamfight'), normal = createMap('crossroads');
  compact.walls[10].health = 1; compact.teamSpawns[0][0].x = 999;
  assert.equal(normal.walls[10].health, 600); assert.equal(normal.teamSpawns[0][0].x, 72);
});
