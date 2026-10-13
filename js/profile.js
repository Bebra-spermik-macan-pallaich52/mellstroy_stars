'use strict';

// Only local progress is saved. Match state and input never enter localStorage.
class ProfileStore {
  constructor(storage) {
    this.key = 'mellstroy-stars.profile.v1';
    this.storageAvailable = true;
    this.storageMessage = '';
    try { this.storage = storage === undefined ? globalThis.localStorage : storage; }
    catch (_) { this.storage = null; }
    this.data = this.defaults();
    this.load();
  }

  defaults() {
    return {
      version: 1,
      settings: { sound: true, music: false, volume: 0.45, reducedMotion: false, nickname: 'Игрок', botFire: true, enhancements: true },
      profile: { coins: 0, xp: 0, selectedCharacter: 0, unlocked: [0], matches: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, characters: {} },
      history: [], completed: []
    };
  }

  get settings() { return this.data.settings; }
  get profile() { return this.data.profile; }
  get history() { return this.data.history; }
  get level() { return 1 + Math.floor(this.profile.xp / 300); }
  definitions() {
    if (typeof characterDefinitions !== 'undefined') return characterDefinitions;
    return typeof characterDefs !== 'undefined' ? characterDefs : [];
  }
  validCharacter(index) { return Number.isInteger(index) && index >= 0 && index < (this.definitions().length || 5); }
  counter(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }

  sanitize(raw) {
    if (!raw || raw.version !== 1 || !raw.profile || !raw.settings) throw new Error('Формат сохранения не поддерживается');
    const clean = this.defaults(), source = raw.profile;
    for (const key of ['coins', 'xp', 'matches', 'wins', 'losses', 'draws', 'kills', 'deaths']) clean.profile[key] = this.counter(source[key]);
    clean.profile.unlocked = [...new Set([0, ...(Array.isArray(source.unlocked) ? source.unlocked.filter(index => this.validCharacter(index)) : [])])];
    clean.profile.selectedCharacter = clean.profile.unlocked.includes(source.selectedCharacter) ? source.selectedCharacter : 0;
    if (source.characters && typeof source.characters === 'object') {
      for (let i = 0; i < (this.definitions().length || 5); i++) {
        const stats = source.characters[i];
        if (!stats || typeof stats !== 'object') continue;
        clean.profile.characters[i] = {};
        for (const key of ['matches', 'wins', 'kills', 'deaths']) clean.profile.characters[i][key] = this.counter(stats[key]);
      }
    }
    for (const key of ['sound', 'music', 'reducedMotion', 'botFire', 'enhancements']) if (typeof raw.settings[key] === 'boolean') clean.settings[key] = raw.settings[key];
    if (Number.isFinite(raw.settings.volume)) clean.settings.volume = Math.max(0, Math.min(1, raw.settings.volume));
    if (typeof raw.settings.nickname === 'string') clean.settings.nickname = raw.settings.nickname.trim().slice(0, 24) || 'Игрок';
    clean.completed = Array.isArray(raw.completed) ? [...new Set(raw.completed.filter(id => typeof id === 'string' && id.length <= 100))].slice(-100) : [];
    clean.history = Array.isArray(raw.history) ? raw.history.filter(entry => entry && typeof entry.matchId === 'string' && ['win', 'loss', 'draw'].includes(entry.outcome)).slice(-20).map(entry => ({
      matchId: entry.matchId.slice(0, 100), outcome: entry.outcome,
      modeId: ['donations', 'cottage', 'teamfight'].includes(entry.modeId) ? entry.modeId : 'donations',
      characterIndex: this.validCharacter(entry.characterIndex) ? entry.characterIndex : 0,
      kills: this.counter(entry.kills), deaths: this.counter(entry.deaths), coins: this.counter(entry.coins), xp: this.counter(entry.xp)
    })) : [];
    return clean;
  }

  load() {
    if (!this.storage) { this.unavailable(); return; }
    try {
      const saved = this.storage.getItem(this.key);
      if (saved) this.data = this.sanitize(JSON.parse(saved));
    } catch (error) {
      this.data = this.defaults();
      this.storageMessage = 'Сохранение не удалось прочитать. Игра доступна с новым локальным профилем.';
      if (error && error.name === 'SecurityError') this.unavailable();
    }
  }

  unavailable() {
    this.storageAvailable = false;
    this.storageMessage = 'Браузер не разрешает сохранение. Прогресс доступен до закрытия страницы.';
  }

  save() {
    if (!this.storage) { this.unavailable(); return false; }
    try { this.storage.setItem(this.key, JSON.stringify(this.data)); this.storageAvailable = true; return true; }
    catch (_) { this.unavailable(); return false; }
  }

  updateSettings(changes) {
    for (const key of ['sound', 'music', 'reducedMotion', 'botFire', 'enhancements']) if (typeof changes[key] === 'boolean') this.settings[key] = changes[key];
    if (Number.isFinite(changes.volume)) this.settings.volume = Math.max(0, Math.min(1, changes.volume));
    if (typeof changes.nickname === 'string') this.settings.nickname = changes.nickname.trim().slice(0, 24) || 'Игрок';
    this.save();
    return this.settings;
  }

  isUnlocked(index) { return this.validCharacter(index) && this.profile.unlocked.includes(index); }
  selectCharacter(index) {
    if (!this.isUnlocked(index)) return false;
    this.profile.selectedCharacter = index;
    this.save();
    return true;
  }

  unlockCharacter(index) {
    if (!this.validCharacter(index)) return { ok: false, message: 'Персонаж не найден.' };
    if (this.isUnlocked(index)) return { ok: true, message: 'Персонаж уже открыт.' };
    const cost = this.definitions()[index]?.unlockCost ?? [0, 80, 140, 200, 260][index];
    if (!Number.isSafeInteger(cost) || cost < 0) return { ok: false, message: 'Персонаж пока недоступен.' };
    if (this.profile.coins < cost) return { ok: false, message: `Не хватает ${cost - this.profile.coins} монет. Завершайте матчи для наград.` };
    this.profile.coins -= cost;
    this.profile.unlocked.push(index);
    this.profile.selectedCharacter = index;
    this.save();
    return { ok: true, message: 'Персонаж открыт!' };
  }

  recordMatch(result, context) {
    if (!result || !context || typeof context.matchId !== 'string' || !context.matchId || context.matchId.length > 100) return null;
    if (![null, 0, 1].includes(result.winner) || ![0, 1].includes(context.team)) return null;
    if (this.data.completed.includes(context.matchId)) return null;
    const outcome = result.winner === null ? 'draw' : result.winner === context.team ? 'win' : 'loss';
    const kills = this.counter(context.kills), deaths = this.counter(context.deaths);
    const coins = { win: 45, draw: 25, loss: 15 }[outcome] + Math.min(kills, 10) * 2;
    const xp = { win: 120, draw: 80, loss: 50 }[outcome];
    const characterIndex = this.validCharacter(context.characterIndex) ? context.characterIndex : 0;
    const reward = { matchId: context.matchId, outcome, coins, xp, kills, deaths, characterIndex, modeId: ['donations', 'cottage', 'teamfight'].includes(context.modeId) ? context.modeId : 'donations' };
    const profile = this.profile;
    profile.coins += coins; profile.xp += xp; profile.matches++;
    profile[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws']++;
    profile.kills += kills; profile.deaths += deaths;
    const stats = profile.characters[characterIndex] ||= { matches: 0, wins: 0, kills: 0, deaths: 0 };
    stats.matches++; stats.wins += outcome === 'win' ? 1 : 0; stats.kills += kills; stats.deaths += deaths;
    this.data.history.push(reward); this.data.history = this.data.history.slice(-20);
    this.data.completed.push(context.matchId); this.data.completed = this.data.completed.slice(-100);
    this.save();
    return reward;
  }
}
