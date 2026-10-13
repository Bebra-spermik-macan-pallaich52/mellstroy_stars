const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ console });
for (const file of ['characters.js', 'profile.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
vm.runInContext('globalThis.Profile = ProfileStore;', context);
const ProfileStore = context.Profile;
const storage = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), items };
};
const result = winner => ({ winner, reason: 'goal', scores: [15, 10] });
const match = (matchId = 'one', fields = {}) => ({ matchId, team: 0, modeId: 'donations', characterIndex: 0, kills: 3, deaths: 1, ...fields });

test('a new profile owns only Arthur and starts without currency', () => {
  const profile = new ProfileStore(storage());
  assert.equal(profile.profile.coins, 0); assert.equal(profile.profile.xp, 0);
  assert.equal(profile.isUnlocked(0), true); assert.equal(profile.isUnlocked(1), false);
  assert.equal(profile.selectCharacter(1), false); assert.equal(profile.profile.selectedCharacter, 0);
});

test('finished matches reward outcome and personal kills, persist across reload', () => {
  const memory = storage(), profile = new ProfileStore(memory);
  const reward = profile.recordMatch(result(0), match());
  assert.equal(reward.coins, 51); assert.equal(reward.xp, 120);
  assert.equal(profile.profile.wins, 1); assert.equal(profile.profile.characters[0].matches, 1);
  const reloaded = new ProfileStore(memory);
  assert.equal(reloaded.profile.coins, 51); assert.equal(reloaded.profile.xp, 120);
  assert.equal(reloaded.profile.kills, 3); assert.equal(reloaded.profile.deaths, 1);
  assert.equal(reloaded.history[0].matchId, 'one');
});

test('one match can be recorded only once even after reload', () => {
  const memory = storage(), profile = new ProfileStore(memory);
  profile.recordMatch(result(0), match());
  assert.equal(profile.recordMatch(result(0), match()), null);
  const reloaded = new ProfileStore(memory);
  assert.equal(reloaded.recordMatch(result(1), match()), null);
  assert.equal(reloaded.profile.matches, 1); assert.equal(reloaded.profile.coins, 51);
});

test('loss and draw pay specified rewards and kill bonus is capped', () => {
  const profile = new ProfileStore(storage());
  assert.equal(profile.recordMatch(result(1), match('loss', { kills: 0 })).coins, 15);
  const draw = profile.recordMatch(result(null), match('draw', { kills: 100 }));
  assert.equal(draw.coins, 45); assert.equal(draw.xp, 80);
  assert.equal(profile.profile.draws, 1); assert.equal(profile.profile.losses, 1); assert.equal(profile.profile.xp, 130);
});

test('unlocking requires enough coins, deducts once and persists selected ownership', () => {
  const memory = storage(), profile = new ProfileStore(memory);
  assert.equal(profile.unlockCharacter(1).ok, false); assert.equal(profile.profile.coins, 0);
  profile.recordMatch(result(0), match('win1', { kills: 0 }));
  profile.recordMatch(result(0), match('win2', { kills: 0 }));
  assert.equal(profile.unlockCharacter(1).ok, true); assert.equal(profile.profile.coins, 10);
  assert.equal(profile.unlockCharacter(1).ok, true); assert.equal(profile.profile.coins, 10);
  const reloaded = new ProfileStore(memory);
  assert.equal(reloaded.isUnlocked(1), true); assert.equal(reloaded.profile.selectedCharacter, 1);
  assert.equal(reloaded.unlockCharacter(-1).ok, false); assert.equal(reloaded.unlockCharacter(7).ok, false);
});

test('settings round-trip, clamp volume and keep nickname bounded', () => {
  const memory = storage(), profile = new ProfileStore(memory);
  profile.updateSettings({ music: true, sound: false, reducedMotion: true, volume: 7, nickname: ' x '.repeat(20), botFire: false, enhancements: false });
  const reloaded = new ProfileStore(memory);
  assert.equal(reloaded.settings.music, true); assert.equal(reloaded.settings.sound, false);
  assert.equal(reloaded.settings.reducedMotion, true); assert.equal(reloaded.settings.volume, 1);
  assert.equal(reloaded.settings.botFire, false); assert.equal(reloaded.settings.enhancements, false);
  assert.ok(reloaded.settings.nickname.length <= 24);
  reloaded.updateSettings({ volume: NaN, nickname: '   ' });
  assert.equal(reloaded.settings.volume, 1); assert.equal(reloaded.settings.nickname, 'Игрок');
});

test('corrupt and unsupported saves recover with an explanation', () => {
  for (const saved of ['{', JSON.stringify({ version: 999 }), 'null']) {
    const memory = storage(); memory.setItem('mellstroy-stars.profile.v1', saved);
    const profile = new ProfileStore(memory);
    assert.equal(profile.profile.coins, 0); assert.equal(profile.isUnlocked(0), true);
    assert.ok(profile.storageMessage.length > 0);
    assert.equal(profile.recordMatch(result(0), match()).coins, 51);
  }
});

test('blocked or full storage keeps game and rewards available in memory', () => {
  for (const memory of [null, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } }, { getItem() { return null; }, setItem() { throw new Error('full'); } }]) {
    const profile = new ProfileStore(memory);
    assert.doesNotThrow(() => profile.recordMatch(result(0), match()));
    assert.equal(profile.profile.coins, 51); assert.equal(profile.storageAvailable, false);
    assert.ok(profile.storageMessage.length > 0);
  }
});

test('loaded invalid counters and ownership cannot yield invalid selected character', () => {
  const memory = storage(), fresh = new ProfileStore(memory).defaults();
  fresh.profile.coins = -9; fresh.profile.xp = '100'; fresh.profile.matches = Infinity;
  fresh.profile.unlocked = [-1, 1, 1, 9, '2']; fresh.profile.selectedCharacter = 4;
  fresh.profile.characters = { 0: { wins: -3, matches: 5, kills: 'five' } };
  memory.setItem('mellstroy-stars.profile.v1', JSON.stringify(fresh));
  const profile = new ProfileStore(memory);
  assert.equal(profile.profile.coins, 0); assert.equal(profile.profile.xp, 0); assert.equal(profile.profile.matches, 0);
  assert.equal(profile.profile.selectedCharacter, 0); assert.equal(profile.isUnlocked(1), true);
  assert.equal(profile.profile.unlocked.length, 2); assert.equal(profile.profile.characters[0].wins, 0);
});

test('history and deduplication lists remain bounded after many matches', () => {
  const profile = new ProfileStore(storage());
  for (let i = 0; i < 125; i++) profile.recordMatch(result(0), match(`match-${i}`, { kills: 0 }));
  assert.equal(profile.history.length, 20); assert.equal(profile.data.completed.length, 100);
  assert.equal(profile.history[0].matchId, 'match-105'); assert.equal(profile.level, 51);
  assert.equal(profile.recordMatch(result(0), match('match-124')), null);
});

test('invalid finish callbacks grant no currency or statistics', () => {
  const profile = new ProfileStore(storage());
  for (const [outcome, details] of [[null, match()], [result(4), match()], [result(0), match('', {})], [result(0), match('x', { team: 4 })]]) {
    assert.equal(profile.recordMatch(outcome, details), null);
  }
  assert.equal(profile.profile.matches, 0); assert.equal(profile.profile.coins, 0);
});
