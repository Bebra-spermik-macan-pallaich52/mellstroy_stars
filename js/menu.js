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
    this.portraitLoader = new ImageLoader();
    this.currentScreen = 'lobby';
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
    on('open-roster', 'click', () => this.openScreen('roster'));
    on('change-character', 'click', () => this.openScreen('roster'));
    on('open-events', 'click', () => this.openScreen('events'));
    on('open-arenas', 'click', () => this.openScreen('events'));
    on('open-profile', 'click', () => this.openScreen('progress'));
    on('confirm-event', 'click', () => this.openScreen('lobby'));
    document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => this.openScreen('lobby')));
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
      if (event.code === 'Escape' && !this.game.active && this.currentScreen !== 'lobby') {
        event.preventDefault(); this.openScreen('lobby'); return;
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
    this.byId('selected-mode-name').textContent = mode.name;
    this.byId('selected-map-name').textContent = map.name;
    this.byId('open-events').dataset.mode = this.byId('mode').value;
    this.renderEvents();
  }

  renderProfile() {
    const data = this.profile.profile;
    const fields = { 'profile-name': this.profile.settings.nickname, 'profile-coins': data.coins, 'profile-level': `Ур. ${this.profile.level}`, 'profile-xp': `${data.xp % 300} / 300 опыта`, 'profile-matches': data.matches, 'profile-wins': data.wins, 'profile-losses': data.losses, 'profile-draws': data.draws, 'profile-kills': data.kills, 'roster-count': `${data.unlocked.length} / ${this.definitions.length} открыто` };
    for (const [id, value] of Object.entries(fields)) this.byId(id).textContent = value;
    this.byId('lobby-roster-count').textContent = `${data.unlocked.length} / ${this.definitions.length}`;
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

  openScreen(screen) {
    this.currentScreen = screen;
    this.byId('menu-message').textContent = this.profile.storageMessage || '';
    for (const name of ['lobby', 'roster', 'events', 'progress']) this.byId(`${name}-screen`).hidden = name !== screen;
    this.byId('main-menu').dataset.screen = screen;
    if (screen === 'lobby') this.byId('start-match').focus({ preventScroll: true });
    else this.byId(`${screen}-screen`).querySelector('[data-back]').focus({ preventScroll: true });
  }

  icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
  }

  renderEvents() {
    const holder = this.byId('event-cards'); holder.replaceChildren();
    const art = { donations: ['coin', 'СОБИРАЙ И БЕРЕГИ', 0], cottage: ['cottage', 'ЗАЙМИ. ЗАХВАТИ. УДЕРЖИ.', 1], teamfight: ['battle', 'ДЕСЯТЬ ПОБЕД ДО ФИНИША', 2] };
    for (const [id, mode] of Object.entries(this.modes)) {
      const button = document.createElement('button'); button.className = `event-card event-${id}`;
      button.dataset.mode = id; button.type = 'button';
      button.setAttribute('aria-pressed', String(this.byId('mode').value === id));
      const stripe = document.createElement('span'); stripe.className = 'event-card-stripe';
      stripe.append(this.icon(art[id][0]));
      const title = document.createElement('strong'); title.textContent = mode.name; stripe.append(title);
      const illustration = document.createElement('span'); illustration.className = 'event-illustration'; illustration.style.setProperty('--scene', art[id][2]);
      const tag = document.createElement('small'); tag.textContent = art[id][1]; illustration.append(tag);
      const rule = document.createElement('span'); rule.className = 'event-rule'; rule.textContent = mode.description;
      const tick = document.createElement('span'); tick.className = 'selection-tick'; tick.textContent = '✓'; tick.setAttribute('aria-hidden', 'true');
      button.append(stripe, illustration, rule, tick);
      button.addEventListener('click', () => { this.byId('mode').value = id; this.updateChoices(); this.byId('event-cards').querySelector(`[data-mode="${id}"]`).focus({ preventScroll: true }); });
      holder.append(button);
    }
    const maps = this.byId('map-cards'); maps.replaceChildren();
    mapCatalog.forEach((map, index) => {
      const button = document.createElement('button'); button.className = 'map-card'; button.type = 'button'; button.dataset.map = map.id;
      button.setAttribute('aria-pressed', String(this.byId('map').value === map.id));
      const preview = document.createElement('span'); preview.className = 'map-preview'; preview.style.setProperty('--scene', index); preview.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.textContent = map.name;
      const caption = document.createElement('small'); caption.textContent = ['ПЕСОК И ТЕРРАКОТА', 'ТРАВА И САДОВЫЙ КАМЕНЬ', 'БРУСЧАТКА И КИРПИЧ'][index];
      button.append(preview, name, caption);
      button.addEventListener('click', () => { this.byId('map').value = map.id; this.updateChoices(); this.byId('map-cards').querySelector(`[data-map="${map.id}"]`).focus({ preventScroll: true }); });
      maps.append(button);
    });
  }

  async paintPortrait(canvas, index, hero = false) {
    const definition = this.definitions[index];
    const image = await this.portraitLoader.load(`assets/characters/${definition.id}-walk.png`);
    if (hero && this.profile.profile.selectedCharacter !== index) return;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (hero) {
      ctx.fillStyle = 'rgba(68,32,45,0.20)'; ctx.beginPath();
      ctx.ellipse(canvas.width / 2, canvas.height - 16, 105, 15, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (!image) {
      ctx.font = 'bold 80px sans-serif'; ctx.fillStyle = '#fff1cf'; ctx.textAlign = 'center'; ctx.fillText(definition.name[0], canvas.width / 2, canvas.height / 2); return;
    }
    const frame = spriteManifest[definition.id]?.frames[0] || { x: 0, y: 0, width: image.width / 4, height: image.height / 4 };
    const scale = Math.min(canvas.width * 0.87 / frame.width, (canvas.height - (hero ? 36 : 10)) / frame.height);
    const width = frame.width * scale, height = frame.height * scale;
    ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height, (canvas.width - width) / 2, canvas.height - height - (hero ? 17 : 0), width, height);
  }

  renderCharacters() {
    const holder = this.byId('character-cards'); holder.replaceChildren();
    const roles = ['СТРЕЛОК', 'ПОДДЕРЖКА', 'ТАНК', 'ЗАЩИТНИК', 'ШТУРМОВИК'];
    this.definitions.forEach((definition, index) => {
      const unlocked = this.profile.isUnlocked(index), selected = this.profile.profile.selectedCharacter === index;
      const card = document.createElement('article'); card.className = `character-card fighter-${index}${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'character-pick'; pick.setAttribute('aria-label', `${definition.name}${unlocked ? ', выбрать персонажа' : ', ещё не открыт'}`); pick.setAttribute('aria-pressed', String(selected));
      const role = document.createElement('span'); role.className = 'fighter-role'; role.textContent = roles[index];
      const portrait = document.createElement('canvas'); portrait.width = 300; portrait.height = 240; portrait.className = 'character-portrait'; portrait.setAttribute('aria-hidden', 'true');
      this.paintPortrait(portrait, index);
      const name = document.createElement('strong'); name.className = 'character-name'; name.textContent = definition.name;
      const marker = document.createElement('span'); marker.className = 'character-marker'; marker.textContent = selected ? '✓ ВЫБРАН' : unlocked ? 'ВЫБРАТЬ' : 'ЗАКРЫТ';
      pick.append(role, portrait, name, marker);
      pick.addEventListener('click', () => {
        if (unlocked) { this.selectCharacter(index); this.openScreen('lobby'); }
        else this.byId('menu-message').textContent = `${definition.name}: открывается за ${definition.unlockCost} монет. Завершай матчи, чтобы получать награды.`;
      });
      card.append(pick);
      const unlock = document.createElement('button'); unlock.className = 'character-unlock'; unlock.type = 'button'; unlock.textContent = unlocked ? `${definition.maxHealth} HP · УРОН ${definition.attack.damage}` : `ОТКРЫТЬ · ${definition.unlockCost} МОНЕТ`;
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
    this.byId('character-name').parentElement.classList.toggle('long-name', definition.name.length > 15);
    this.byId('character-description').textContent = `${definition.maxHealth} здоровья / ${definition.attack.damage} урон`;
    this.byId('character-super').textContent = definition.description;
    const hero = this.byId('hero-character'); hero.setAttribute('aria-label', `Выбранный персонаж: ${definition.name}`);
    this.paintPortrait(hero, selected, true);
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
    this.setInert(false); this.renderProfile(); this.renderCharacters(); this.openScreen('lobby');
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
