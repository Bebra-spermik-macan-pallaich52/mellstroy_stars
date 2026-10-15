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

test('coin-only unlocking requires enough currency, deducts once and persists ownership', () => {
  const memory = storage(), profile = new ProfileStore(memory);
  assert.equal(profile.unlockCharacter(5).ok, false); assert.equal(profile.profile.coins, 0);
  for (let i=0;i<9;i++) profile.recordMatch(result(0), match('shop-win'+i, { kills: 0 }));
  assert.equal(profile.unlockCharacter(5).ok, true); assert.equal(profile.profile.coins, 5);
  assert.equal(profile.unlockCharacter(5).ok, true); assert.equal(profile.profile.coins, 5);
  const reloaded = new ProfileStore(memory);
  assert.equal(reloaded.isUnlocked(5), true); assert.equal(reloaded.profile.selectedCharacter, 5);
  assert.equal(reloaded.unlockCharacter(-1).ok, false); assert.equal(reloaded.unlockCharacter(99).ok, false);
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

test('level road starts with Kotost and alternates fighters with coins', () => {
  const store = new ProfileStore(storage());
  assert.equal(store.profile.roadClaimedLevel, 1); assert.equal(store.roadReadyCount, 0);
  assert.equal(store.nextRoadReward.level, 2); assert.equal(store.nextRoadReward.xp, 300);
  assert.equal(store.nextRoadReward.characterIndex, 1);
  assert.deepEqual(Array.from([2,4,6,8], level=>store.roadReward(level).characterIndex), [1,2,3,4]);
  assert.equal(store.roadReward(3).coins,60); assert.equal(store.roadReward(10).coins,250);
  assert.equal(store.roadReward(11).coins,100); assert.equal(store.roadReward(500).coins,100);
  assert.equal(store.roadReward(1).characterIndex,0);assert.equal(store.roadReward(1).xp,0);
  for (const value of [0,-1,2.5,NaN,Infinity,'2']) assert.equal(store.roadReward(value),null);
});
test('rewards cannot be claimed early, out of order or twice', () => {
  const store = new ProfileStore(storage());store.profile.xp=299;
  assert.equal(store.claimRoadReward().ok,false);assert.equal(store.isUnlocked(1),false);
  store.profile.xp=600;assert.equal(store.claimRoadReward(3).ok,false);
  assert.equal(store.claimRoadReward().ok,true);assert.equal(store.isUnlocked(1),true);
  assert.equal(store.profile.selectedCharacter,0);assert.equal(store.profile.coins,0);
  assert.equal(store.claimRoadReward(2).ok,false);assert.equal(store.claimRoadReward().coins,60);
  assert.equal(store.claimRoadReward().ok,false);assert.equal(store.profile.coins,60);
});
test('match rewards announce a level crossing without auto-claiming the road', () => {
  const store=new ProfileStore(storage());
  for(let i=0;i<3;i++){
    const reward=store.recordMatch(result(0),match('road-'+i,{kills:0}));
    assert.equal(reward.levelBefore,1);assert.equal(reward.levelAfter,i===2?2:1);
  }
  assert.equal(store.profile.xp,360);assert.equal(store.roadReadyCount,1);
  assert.equal(store.isUnlocked(1),false);store.claimRoadReward();
  assert.equal(store.profile.coins,135);assert.equal(store.isUnlocked(1),true);
});
test('loss experience also reaches a road goal and does not reduce progress', () => {
  const store=new ProfileStore(storage());
  for(let i=0;i<6;i++)store.recordMatch(result(1),match('loss-road-'+i,{kills:0}));
  assert.equal(store.level,2);assert.equal(store.profile.xp,300);assert.equal(store.claimRoadReward().ok,true);
});
test('a fighter bought before the road-only change retains legacy compensation', () => {
  const memory=storage(),raw=new ProfileStore(memory).defaults();raw.profile.coins=20;raw.profile.xp=300;raw.profile.unlocked=[0,1];
  memory.setItem('mellstroy-stars.profile.v1',JSON.stringify(raw));const store=new ProfileStore(memory),reward=store.claimRoadReward();
  assert.equal(reward.coins,80);assert.equal(reward.characters.length,0);assert.equal(reward.compensations[0],'Котость');
  assert.equal(store.profile.coins,100);assert.equal(store.profile.unlocked.filter(i=>i===1).length,1);
});

test('road claims survive reload without duplicate currency or fighters', () => {
  const memory=storage(),store=new ProfileStore(memory);store.profile.xp=600;store.claimAllRoadRewards();
  const reloaded=new ProfileStore(memory);assert.equal(reloaded.profile.roadClaimedLevel,3);
  assert.equal(reloaded.isUnlocked(1),true);assert.equal(reloaded.profile.coins,60);
  assert.equal(reloaded.claimAllRoadRewards().ok,false);assert.equal(reloaded.claimRoadReward(2).ok,false);
  assert.equal(reloaded.profile.coins,60);
});
test('old version-one saves retain XP, coins, purchased ownership and earn earlier rewards', () => {
  const memory=storage(),raw=new ProfileStore(memory).defaults();delete raw.profile.roadClaimedLevel;
  raw.profile.xp=900;raw.profile.coins=37;raw.profile.unlocked=[0,1];raw.profile.selectedCharacter=1;
  raw.profile.matches=8;raw.settings.nickname='Старый игрок';
  memory.setItem('mellstroy-stars.profile.v1',JSON.stringify(raw));const store=new ProfileStore(memory);
  assert.equal(store.level,4);assert.equal(store.profile.coins,37);assert.equal(store.profile.matches,8);
  assert.equal(store.profile.selectedCharacter,1);assert.equal(store.settings.nickname,'Старый игрок');
  const claim=store.claimAllRoadRewards();assert.equal(claim.coins,140);assert.equal(claim.characters[0],2);
  assert.equal(store.profile.coins,177);assert.equal(store.profile.xp,900);assert.equal(store.profile.selectedCharacter,1);
});
test('batch claims grant exactly the same rewards as ordered individual claims', () => {
  const one=new ProfileStore(storage()),batch=new ProfileStore(storage());
  one.profile.xp=batch.profile.xp=3600;
  for(let level=2;level<=13;level++)assert.equal(one.claimRoadReward(level).ok,true);
  const claimed=batch.claimAllRoadRewards();assert.equal(claimed.count,12);assert.equal(claimed.coins,1060);
  assert.equal(batch.profile.coins,one.profile.coins);
  assert.deepEqual(Array.from(batch.profile.unlocked),Array.from(one.profile.unlocked));
  assert.equal(batch.profile.roadClaimedLevel,one.profile.roadClaimedLevel);
});
test('all existing fighters on an old high-level profile receive compensation without duplicates', () => {
  const store=new ProfileStore(storage());store.profile.xp=2700;store.profile.unlocked=[0,1,2,3,4];
  const claim=store.claimAllRoadRewards();assert.equal(claim.coins,1440);
  assert.equal(claim.compensations.length,4);assert.equal(claim.characters.length,0);assert.equal(store.profile.unlocked.length,5);
});
test('reward road remains bounded work for high-level saves and continues beyond level ten', () => {
  const store=new ProfileStore(storage());store.profile.xp=299999700;
  const claim=store.claimAllRoadRewards();assert.equal(claim.count,999999);
  assert.equal(claim.coins,760+(1000000-10)*100);assert.equal(store.profile.roadClaimedLevel,1000000);
  assert.equal(store.nextRoadReward.level,1000001);assert.equal(store.nextRoadReward.coins,100);
});
test('damaged claim markers are clamped to reached levels and claimed fighters stay owned', () => {
  for(const value of [-5,999,'4',2.5]){
    const memory=storage(),raw=new ProfileStore(memory).defaults();raw.profile.xp=900;raw.profile.roadClaimedLevel=value;
    memory.setItem('mellstroy-stars.profile.v1',JSON.stringify(raw));const store=new ProfileStore(memory);
    assert.equal(store.profile.roadClaimedLevel,value===999?4:1);
    if(value===999){assert(store.isUnlocked(1));assert(store.isUnlocked(2));}
  }
});
test('road rewards are available in memory when localStorage is blocked', () => {
  const store=new ProfileStore(null);store.profile.xp=600;
  assert.equal(store.claimAllRoadRewards().coins,60);assert.equal(store.isUnlocked(1),true);
  assert.equal(store.storageAvailable,false);assert.equal(store.claimAllRoadRewards().ok,false);
});
