'use strict';

// Menu coordinates DOM and the browser Game wrapper; simulation stays separate.
class MenuController {
  constructor(game, profile, audio) {
    this.game = game; this.profile = profile; this.audio = audio;
    this.byId = id => document.getElementById(id);
    this.definitions = typeof characterDefinitions !== 'undefined' ? characterDefinitions : characterDefs;
    this.modes = {
      donations: { name: 'Сбор донатов', description: 'Собери 15 донатов своей командой.' },
      cottage: { name: 'Захват коттеджа', description: 'Удерживай коттедж до 100 очков.' },
      teamfight: { name: 'Командный бой', description: 'Победи соперников 10 раз командой.' }
    };
    this.settingsSource = 'menu';
    this.bind();
    this.populateChoices();
    this.syncSettings();
    this.game.onFinish = (result, context) => {
      const reward = this.profile.recordMatch(result, context);
      this.byId('result-reward').textContent = reward ? `+${reward.coins} монет · +${reward.xp} опыта` : '';
      this.renderProfile();
      return reward;
    };
    this.game.onPauseRequested = paused => this.showPause(paused);
    this.game.onMenuRequested = () => this.show();
    this.show();
  }

  bind() {
    const on = (id, event, callback) => this.byId(id).addEventListener(event, callback);
    on('home-link', 'click', event => { event.preventDefault(); this.show(); });
    on('start-match', 'click', () => this.startMatch());
    on('pause-button', 'click', () => this.game.pause(true));
    on('resume-match', 'click', () => this.game.pause(false));
    on('leave-match', 'click', () => this.show());
    on('result-menu', 'click', () => this.show());
    for (const id of ['restart', 'result-restart']) on(id, 'click', () => this.rematch());
    on('open-settings', 'click', () => this.showSettings('menu'));
    on('pause-settings', 'click', () => this.showSettings('pause'));
    on('close-settings', 'click', () => this.closeSettings());
    on('mode', 'change', () => this.updateChoices());
    on('map', 'change', () => this.updateChoices());
    on('character', 'change', event => this.selectCharacter(Number(event.target.value)));
    for (const id of ['sound', 'music', 'volume', 'reduced-motion']) on(id, 'input', () => this.saveSettings());
    on('nickname', 'change', () => this.saveSettings());
    on('enemy-fire', 'change', event => { this.game.setBotFire(event.target.checked); this.saveSettings(); });
    on('enhancements', 'change', () => this.saveSettings());
    // Browser input remains paused while a dialog has focus. Trap Tab inside it.
    document.addEventListener('keydown', event => {
      const settings = this.byId('settings-dialog');
      if (event.code === 'Escape' && !settings.hidden) {
        event.preventDefault(); event.stopPropagation(); this.closeSettings(); return;
      }
      if (event.key !== 'Tab') return;
      const dialog = !settings.hidden ? settings : !this.byId('pause-dialog').hidden ? this.byId('pause-dialog') : !this.byId('result').hidden ? this.byId('result') : null;
      if (!dialog) return;
      const controls = [...dialog.querySelectorAll('button, input, select, [tabindex="0"]')].filter(element => !element.disabled && !element.hidden);
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    });
  }

  populateChoices() {
    const characters = this.byId('character'), maps = this.byId('map');
    characters.replaceChildren(); maps.replaceChildren();
    this.definitions.forEach((definition, index) => {
      const option = document.createElement('option'); option.value = index; option.textContent = definition.name; characters.append(option);
    });
    mapCatalog.forEach(map => {
      const option = document.createElement('option'); option.value = map.id; option.textContent = map.name; maps.append(option);
    });
    this.updateChoices();
  }

  updateChoices() {
    const mode = this.modes[this.byId('mode').value] || this.modes.donations;
    const map = mapCatalog.find(item => item.id === this.byId('map').value) || mapCatalog[0];
    this.byId('mode-description').textContent = mode.description;
    this.byId('map-description').textContent = map?.description || '';
  }

  renderProfile() {
    const data = this.profile.profile;
    const fields = { 'profile-name': this.profile.settings.nickname, 'profile-coins': data.coins, 'profile-level': `Ур. ${this.profile.level}`, 'profile-xp': `${data.xp % 300} / 300 опыта`, 'profile-matches': data.matches, 'profile-wins': data.wins, 'profile-losses': data.losses, 'profile-draws': data.draws, 'profile-kills': data.kills, 'roster-count': `${data.unlocked.length} / ${this.definitions.length} открыто` };
    for (const [id, value] of Object.entries(fields)) this.byId(id).textContent = value;
    const history = this.byId('match-history'); history.replaceChildren();
    for (const match of this.profile.history.slice(-5).reverse()) {
      const row = document.createElement('li');
      const outcome = document.createElement('span'); outcome.className = `history-result ${match.outcome}`; outcome.textContent = { win: 'Победа', draw: 'Ничья', loss: 'Поражение' }[match.outcome];
      const detail = document.createElement('span'); detail.textContent = `${this.modes[match.modeId]?.name || 'Матч'} · ${this.definitions[match.characterIndex]?.name || 'Артур'}`;
      const reward = document.createElement('span'); reward.className = 'history-reward'; reward.textContent = `+${match.coins} ◆`;
      row.append(outcome, detail, reward); history.append(row);
    }
    if (!this.profile.history.length) {
      const empty = document.createElement('li'); empty.className = 'muted'; empty.textContent = 'Первый матч ещё впереди.'; history.append(empty);
    }
  }

  renderCharacters() {
    const holder = this.byId('character-cards'); holder.replaceChildren();
    this.definitions.forEach((definition, index) => {
      const unlocked = this.profile.isUnlocked(index), selected = this.profile.profile.selectedCharacter === index;
      const card = document.createElement('article'); card.className = `character-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'character-pick'; pick.setAttribute('aria-label', `${definition.name}${unlocked ? ', выбрать персонажа' : ', ещё не открыт'}`); pick.setAttribute('aria-pressed', String(selected));
      const portrait = document.createElement('span'); portrait.className = 'character-portrait'; portrait.setAttribute('aria-hidden', 'true');
      const initial = document.createElement('span'); initial.className = 'character-initial'; initial.textContent = definition.name[0]; portrait.append(initial);
      const image = new Image(); image.onload = () => { portrait.style.backgroundImage = `url("assets/characters/${definition.id}-walk.png")`; portrait.classList.add('loaded'); }; image.src = `assets/characters/${definition.id}-walk.png`;
      const name = document.createElement('span'); name.className = 'character-name'; name.textContent = definition.name;
      const marker = document.createElement('span'); marker.className = `character-marker${unlocked ? '' : ' is-locked'}`; marker.textContent = selected ? 'ВЫБРАН' : unlocked ? '' : 'ЗАКРЫТ';
      pick.append(portrait, name, marker);
      pick.addEventListener('click', () => {
        if (unlocked) this.selectCharacter(index);
        else this.byId('menu-message').textContent = `${definition.name}: открывается за ${definition.unlockCost} монет. Завершай матчи, чтобы получать награды.`;
      });
      card.append(pick);
      const unlock = document.createElement('button'); unlock.className = 'character-unlock'; unlock.type = 'button'; unlock.textContent = unlocked ? `${definition.maxHealth} HP · ${definition.speed} скорость` : `ОТКРЫТЬ · ${definition.unlockCost} ◆`;
      if (unlocked) { unlock.disabled = true; unlock.tabIndex = -1; }
      else unlock.addEventListener('click', () => {
        const result = this.profile.unlockCharacter(index);
        this.byId('menu-message').textContent = result.message || '';
        this.renderProfile(); this.renderCharacters();
      });
      card.append(unlock); holder.append(card);
    });
    const selected = this.profile.profile.selectedCharacter;
    this.byId('character').value = selected;
    const definition = this.definitions[selected] || this.definitions[0];
    this.byId('character-name').textContent = definition.name;
    this.byId('character-description').textContent = `${definition.maxHealth} HP · урон ${definition.attack.damage} · скорость ${definition.speed}`;
    this.byId('character-super').textContent = definition.description;
  }

  selectCharacter(index) {
    if (!this.profile.selectCharacter(index)) return;
    this.byId('menu-message').textContent = '';
    this.renderCharacters();
  }

  syncSettings() {
    const settings = this.profile.settings;
    this.byId('nickname').value = settings.nickname;
    this.byId('sound').checked = settings.sound; this.byId('music').checked = settings.music;
    this.byId('volume').value = Math.round(settings.volume * 100);
    this.byId('volume-value').textContent = `${Math.round(settings.volume * 100)}%`;
    this.byId('reduced-motion').checked = settings.reducedMotion;
    this.byId('enemy-fire').checked = settings.botFire;
    this.byId('enhancements').checked = settings.enhancements;
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
  }

  saveSettings() {
    const settings = this.profile.updateSettings({ nickname: this.byId('nickname').value, sound: this.byId('sound').checked, music: this.byId('music').checked, volume: Number(this.byId('volume').value) / 100, reducedMotion: this.byId('reduced-motion').checked, botFire: this.byId('enemy-fire').checked, enhancements: this.byId('enhancements').checked });
    this.audio?.unlock(); this.audio?.setSettings(settings);
    this.game.effects?.setReducedMotion(settings.reducedMotion);
    this.syncSettings(); this.renderProfile();
    if (this.profile.storageMessage) this.byId('menu-message').textContent = this.profile.storageMessage;
  }

  setInert(modalOpen) {
    this.byId('main-menu').inert = modalOpen;
    this.byId('match-view').inert = modalOpen;
  }

  showSettings(source) {
    this.settingsSource = source;
    if (source === 'pause') this.game.pause(true);
    this.byId('pause-dialog').hidden = true;
    this.byId('settings-dialog').hidden = false;
    this.setInert(true); this.syncSettings();
    this.byId('nickname').focus({ preventScroll: true });
  }

  closeSettings() {
    this.saveSettings();
    this.byId('settings-dialog').hidden = true;
    if (this.settingsSource === 'pause' && this.game.active) this.showPause(true);
    else { this.setInert(false); this.byId('open-settings').focus({ preventScroll: true }); }
  }

  showPause(paused) {
    this.byId('settings-dialog').hidden = true;
    this.byId('pause-dialog').hidden = !paused;
    this.setInert(paused);
    if (paused) this.byId('resume-match').focus({ preventScroll: true });
    else this.game.canvas.focus({ preventScroll: true });
  }

  show() {
    if (this.game.active) this.game.leaveMatch();
    this.byId('match-view').hidden = true; this.byId('main-menu').hidden = false;
    this.byId('pause-dialog').hidden = true; this.byId('settings-dialog').hidden = true; this.byId('result').hidden = true;
    this.setInert(false); this.renderProfile(); this.renderCharacters();
    this.byId('menu-message').textContent = this.profile.storageMessage || '';
    this.byId('start-match').focus({ preventScroll: true });
  }

  startMatch() {
    this.audio?.unlock();
    const options = { modeId: this.byId('mode').value, mapId: this.byId('map').value, characterIndex: this.profile.profile.selectedCharacter, botFire: this.byId('enemy-fire').checked, enhancements: this.byId('enhancements').checked };
    if (!this.game.startMatch(options)) { this.byId('menu-message').textContent = this.game.message || 'Не удалось начать матч.'; return; }
    this.showMatch(options.modeId);
  }

  rematch() {
    this.audio?.unlock();
    if (!this.game.reset()) return;
    this.showMatch(this.game.modeId);
  }

  showMatch(modeId) {
    this.byId('main-menu').hidden = true; this.byId('match-view').hidden = false;
    this.byId('pause-dialog').hidden = true; this.byId('settings-dialog').hidden = true; this.byId('result').hidden = true;
    this.byId('result-reward').textContent = '';
    this.byId('match-label').textContent = this.modes[modeId]?.name || 'Матч';
    this.setInert(false); this.game.canvas.focus({ preventScroll: true });
  }
}
