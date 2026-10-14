// No dependencies: node --test tests/effects.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(globals = {}) {
  const context = vm.createContext(globals);
  for (const file of ['audio.js', 'effects.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
  }
  vm.runInContext('globalThis.subject = { AudioManager, VisualEffects };', context);
  return context.subject;
}
function audioEnvironment() {
  const scheduled = new Map(); let serial = 0;
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.oscillators = []; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createGain() {
      return { gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
    createOscillator() {
      const oscillator = { frequency: { values: [], setValueAtTime(value) { this.values.push(value); },
        exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {}, onended: null };
      this.oscillators.push(oscillator); return oscillator;
    }
  }
  return { scheduled, ...load({ AudioContext, setTimeout(fn) { scheduled.set(++serial, fn); return serial; },
    clearTimeout(id) { scheduled.delete(id); } }) };
}

test('visual events with invalid coordinates and unknown types produce no objects', () => {
  const effects = new (load().VisualEffects)();
  for (const event of [null, { type: 'hit', x: Infinity, y: 10 }, { type: 'hit', x: 10, y: NaN },
    { type: 'network', x: 10, y: 10 }]) assert.equal(effects.emit(event), false);
  assert.equal(effects.items.length, 0);
});
test('effects expire, ignore invalid time, and never exceed their memory cap', () => {
  const effects = new (load().VisualEffects)();
  for (let i = 0; i < 1000; i++) effects.emit({ type: 'wallDestroyed', x: 10, y: 20 });
  assert.equal(effects.items.length, 120);
  effects.update(NaN); effects.update(-1); effects.update(Infinity);
  assert.equal(effects.items.length, 120);
  effects.update(2); assert.equal(effects.items.length, 0);
});
test('damage text is finite and disappears after its own lifetime', () => {
  const effects = new (load().VisualEffects)();
  effects.emit({ type: 'hit', x: 10, y: 20, damage: Infinity });
  assert.equal(effects.items.some(item => item.kind === 'text'), false);
  effects.clear(); effects.emit({ type: 'hit', x: 10, y: 20, damage: 125.4 });
  assert.equal(effects.items.find(item => item.kind === 'text').text, '−125');
  effects.update(0.5); assert.equal(effects.items.length, 1);
  effects.update(0.16); assert.equal(effects.items.length, 0);
});
test('reduced motion removes particles and damage floaters, keeping a static short ring', () => {
  const effects = new (load().VisualEffects)();
  effects.emit({ type: 'hit', x: 10, y: 20, damage: 125 });
  effects.setReducedMotion(true); assert.equal(effects.items.length, 0);
  effects.emit({ type: 'hit', x: 10, y: 20, damage: 125 });
  assert.equal(effects.items.length, 1);
  const { x, y } = effects.items[0]; effects.update(0.1);
  assert.equal(effects.items[0].x, x); assert.equal(effects.items[0].y, y);
  effects.update(0.05); assert.equal(effects.items.length, 0);
});
test('draw restores canvas state even if a drawing operation fails', () => {
  const effects = new (load().VisualEffects)(); effects.emit({ type: 'hit', x: 10, y: 20 });
  let restored = 0;
  assert.throws(() => effects.draw({ save() {}, restore() { restored++; }, setLineDash() {},
    beginPath() {}, arc() { throw new Error('draw failed'); } }));
  assert.equal(restored, 1);
});
test('AudioManager needs no AudioContext until a gesture and works with unsupported audio', async () => {
  const audio = new (load().AudioManager)();
  assert.equal(audio.context, null); assert.equal(audio.handle({ type: 'shot' }), false);
  assert.equal(await audio.unlock(), false); assert.equal(await audio.resume(), false);
  audio.pause(); audio.setSettings({ music: true });
});
test('audio clamps volume and ignores invalid settings', () => {
  const audio = new (load().AudioManager)();
  audio.setSettings({ volume: Infinity, sound: 'yes', music: 1 });
  assert.equal(audio.settings.volume, 0.35); assert.equal(audio.settings.sound, true); assert.equal(audio.settings.music, false);
  audio.setSettings({ volume: 10 }); assert.equal(audio.settings.volume, 1);
  audio.setSettings({ volume: -4 }); assert.equal(audio.settings.volume, 0);
  audio.setSettings(null);
});
test('shot cues are rate limited and voices remain bounded under six-player load', async () => {
  const { AudioManager } = audioEnvironment(); const audio = new AudioManager();
  await audio.unlock();
  assert.equal(audio.handle({ type: 'shot' }), true);
  assert.equal(audio.handle({ type: 'shot' }), false);
  for (let i = 0; i < 1000; i++) {
    audio.context.currentTime += 0.06;
    audio.handle({ type: ['shot', 'hit', 'ability', 'pickup'][i % 4] });
  }
  assert.equal(audio.voices.size, audio.maxVoices);
  const oscillator = audio.context.oscillators[0]; oscillator.onended();
  assert.equal(audio.voices.size, audio.maxVoices - 1);
});
test('music starts only when enabled after unlock and pause cleans scheduled notes and voices', async () => {
  const { AudioManager, scheduled } = audioEnvironment(); const audio = new AudioManager({ music: true });
  assert.equal(scheduled.size, 0);
  await audio.unlock(); assert.equal(scheduled.size, 1);
  assert.equal(audio.voices.size, 1);
  audio.handle({ type: 'hit' }); assert.equal(audio.voices.size, 2);
  audio.pause(); assert.equal(audio.voices.size, 0); assert.equal(scheduled.size, 0);
  assert.equal(audio.handle({ type: 'hit' }), false);
  await audio.resume(); assert.equal(scheduled.size, 1);
  audio.setSettings({ music: false }); assert.equal(scheduled.size, 0); assert.equal(audio.voices.size, 0);
});
test('victory, defeat and draw cues depend on the local team', async () => {
  const { AudioManager } = audioEnvironment(); const melodies = [];
  for (const winner of [0, 1, null]) {
    const audio = new AudioManager(); await audio.unlock();
    audio.handle({ type: 'finish', winner }, { localTeam: 0 });
    melodies.push(audio.context.oscillators.map(oscillator => oscillator.frequency.values[0]));
  }
  assert.deepEqual(melodies[0], [392, 494, 587, 784]);
  assert.deepEqual(melodies[1], [392, 330, 262, 196]);
  assert.deepEqual(melodies[2], [392, 392, 330]);
});
test('audio failures never escape event handlers or unlock', async () => {
  const { AudioManager } = load({ AudioContext: class { constructor() { throw new Error('device unavailable'); } } });
  assert.equal(await new AudioManager().unlock(), false);
  const normal = audioEnvironment(); const audio = new normal.AudioManager(); await audio.unlock();
  audio.context.createOscillator = () => { throw new Error('device lost'); };
  assert.equal(audio.handle({ type: 'hit' }), false); assert.equal(audio.voices.size, 0);
});

test('each character has distinct shot and ability sound frequencies', async () => {
  const shots = [], abilities = [];
  for (const characterId of ['arthur', 'kotost', 'mellstroy_fat', 'dark_drun', 'fog']) {
    const { AudioManager } = audioEnvironment(), audio = new AudioManager();
    await audio.unlock(); assert(audio.handle({ type: 'shot', characterId }));
    shots.push(audio.context.oscillators[0].frequency.values[0]);
    const index = audio.context.oscillators.length;
    assert(audio.handle({ type: 'ability', characterId }));
    abilities.push(audio.context.oscillators[index].frequency.values[0]);
  }
  assert.equal(new Set(shots).size, 5); assert.equal(new Set(abilities).size, 5);
});
test('signature rendering restores both canvas layers when a shape draw fails', () => {
  const effects = new (load().VisualEffects)();
  effects.emit({ type: 'ability', characterId: 'kotost', kind: 'heal', x: 10, y: 20, radius: 180 });
  effects.items = effects.items.filter(item => item.kind === 'signature');
  let depth = 0;
  const ctx = new Proxy({}, { get(object, key) {
    if (key === 'save') return () => depth++;
    if (key === 'restore') return () => depth--;
    if (key === 'arc') return () => { throw new Error('signature draw failed'); };
    return () => {};
  } });
  assert.throws(() => effects.draw(ctx)); assert.equal(depth, 0);
});
