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
    on('open-road', 'click', () => this.openScreen('progress'));
    on('result-road', 'click', () => { this.show(); this.openScreen('progress'); });
    on('claim-road-all', 'click', () => this.claimRoad(true));
    on('road-current', 'click', () => { this.roadStart = Math.max(1, this.profile.profile.roadClaimedLevel); this.renderRoad(); });
    on('road-prev', 'click', () => { this.roadStart = Math.max(1, this.roadStart - 8); this.renderRoad(); });
    on('road-next', 'click', () => { this.roadStart += 8; this.renderRoad(); });
    on('confirm-event', 'click', () => this.openScreen('lobby'));
    document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => this.openScreen('lobby')));
    on('pause-settings', 'click', () => this.showSettings('pause'));
    on('close-settings', 'click', () => this.closeSettings());
    on('mode', 'change', () => this.updateChoices());
    on('map', 'change', () => this.updateChoices());
    on('character', 'change', event => this.selectCharacter(Number(event.target.value)));
    for (const id of ['sound', 'music', 'volume']) on(id, 'input', () => this.saveSettings());
    on('nickname', 'change', () => this.saveSettings());
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
    const column = ['donations', 'cottage', 'teamfight'].indexOf(this.byId('mode').value);
    this.byId('open-events').querySelector('.event-symbol').replaceChildren(this.badge(Math.max(0, column), 0));
    this.renderEvents();
  }

  renderProfile() {
    const data = this.profile.profile;
    const fields = { 'profile-name': this.profile.settings.nickname, 'profile-coins': data.coins, 'profile-level': `Ур. ${this.profile.level}`, 'profile-xp': `${this.profile.levelProgress} / ${this.profile.xpPerLevel} опыта`, 'profile-matches': data.matches, 'profile-wins': data.wins, 'profile-losses': data.losses, 'profile-draws': data.draws, 'profile-kills': data.kills, 'roster-count': `${data.unlocked.length} / ${this.definitions.length} открыто` };
    for (const [id, value] of Object.entries(fields)) this.byId(id).textContent = value;
    this.byId('lobby-roster-count').textContent = `${data.unlocked.length} / ${this.definitions.length}`;
    this.renderRoad();
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

  rewardName(reward) {
    return reward.kind === 'character' && this.profile.isUnlocked(reward.characterIndex)
      ? `${reward.compensation} монет` : reward.name;
  }

  renderRoad() {
    const store = this.profile, target = store.nextRoadReward;
    const remaining = Math.max(0, target.xp - store.profile.xp), ready = store.roadReadyCount;
    const name = this.rewardName(target);
    this.byId('road-level-title').textContent = `Уровень ${store.level}`;
    this.byId('profile-xp-bar').max = store.xpPerLevel;
    this.byId('profile-xp-bar').value = store.levelProgress;
    this.byId('road-title').textContent = ready ? 'Награды доступны' : 'Следующая награда';
    this.byId('road-target').textContent = ready ? `${name} за уровень ${target.level} уже можно забрать.` : `${name} · уровень ${target.level} · ещё ${remaining} опыта.`;
    this.byId('lobby-goal-level').textContent = `Путь бойца · уровень ${target.level}`;
    this.byId('lobby-goal-name').textContent = name;
    this.byId('lobby-goal-detail').textContent = ready ? `Забрать награду${ready > 1 ? ` · ${ready}` : ''} →` : `Ещё ${remaining} опыта →`;
    this.byId('open-road').classList.toggle('reward-ready', ready > 0);
    this.byId('lobby-goal-progress').max = store.xpPerLevel;
    this.byId('lobby-goal-progress').value = ready ? store.xpPerLevel : store.levelProgress;
    this.byId('claim-road-all').hidden = ready < 2;
    this.byId('claim-road-all').textContent = `Забрать доступное · ${ready}`;
    const holder = this.byId('reward-road'); holder.replaceChildren(); holder.scrollLeft = 0;
    const start = this.roadStart || Math.max(1, store.profile.roadClaimedLevel);
    this.roadStart = start;
    for (let level = start; level < start + 8; level++) {
      const reward = store.roadReward(level), claimed = level <= store.profile.roadClaimedLevel;
      if (!reward) break;
      const available = level <= store.level && !claimed, next = level === target.level;
      const step = document.createElement('li'); step.className = `road-step${claimed ? ' claimed' : ''}${available ? ' available' : ''}${next ? ' next' : ''}`;
      const number = document.createElement('span'); number.className = 'road-level'; number.textContent = level;
      const card = document.createElement('div'); card.className = 'road-reward';
      const art = reward.kind === 'character' ? document.createElement('canvas') : this.icon('coin');
      art.classList.add('road-art'); art.setAttribute('aria-hidden', 'true');
      if (reward.kind === 'character') { art.width = 160; art.height = 130; this.paintPortrait(art, reward.characterIndex); }
      const title = document.createElement('strong'); title.textContent = claimed ? reward.name : this.rewardName(reward);
      const detail = document.createElement('small'); detail.textContent = reward.kind === 'character' && store.isUnlocked(reward.characterIndex) && !claimed
        ? `Вместо бойца ${reward.name}` : reward.kind === 'character' ? 'Новый боец' : 'На открытие бойцов';
      const requirement = document.createElement('span'); requirement.className = 'road-requirement'; requirement.textContent = `${reward.xp} опыта`;
      const action = document.createElement('button'); action.type = 'button'; action.className = available && next ? 'primary-button road-claim' : 'quiet-button';
      if (claimed && reward.kind === 'character') {
        action.textContent = 'Выбрать бойца'; action.addEventListener('click', () => { this.selectCharacter(reward.characterIndex); this.openScreen('lobby'); });
      } else {
        action.disabled = !(available && next);
        action.textContent = claimed ? 'Получено ✓' : available && next ? 'Забрать' : available ? `Сначала ур. ${target.level}` : `На уровне ${level}`;
        action.addEventListener('click', () => this.claimRoad(false));
      }
      card.append(art, title, detail, requirement, action); step.append(number, card); holder.append(step);
    }
    this.byId('road-prev').disabled = start <= 1;
    this.byId('road-page').textContent = `Уровни ${start}–${start + 7}`;
  }

  claimRoad(all) {
    const reward = all ? this.profile.claimAllRoadRewards() : this.profile.claimRoadReward();
    if (!reward.ok) { this.byId('road-feedback').textContent = reward.message; return; }
    const parts = [];
    if (reward.coins) parts.push(`+${reward.coins} монет`);
    if (reward.characters.length) parts.push(`${reward.characters.length === 1 ? 'Открыт боец' : 'Открыты бойцы'}: ${reward.characters.map(index => this.definitions[index].name).join(', ')}`);
    if (reward.compensations.length) parts.push(`Компенсация за уже открытых бойцов: ${reward.compensations.join(', ')}`);
    this.roadStart = Math.max(1, this.profile.profile.roadClaimedLevel);
    this.renderProfile(); this.renderCharacters();
    this.byId('road-feedback').textContent = parts.join('. ') + (this.profile.storageAvailable ? '.' : '. ' + this.profile.storageMessage);
    this.byId('road-title').focus({ preventScroll: true });
  }

  openScreen(screen) {
    this.currentScreen = screen;
    if (screen === 'progress') { this.byId('road-feedback').textContent = ''; this.roadStart = Math.max(1, this.profile.profile.roadClaimedLevel); this.renderRoad(); }
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

  badge(column, row) {
    const span = document.createElement('span'); span.className = row === 0 ? 'game-badge mode-glyph' : 'game-badge';
    span.style.setProperty('--icon-x', `${column * 50}%`); span.style.setProperty('--icon-y', `${row * 100}%`);
    span.setAttribute('aria-hidden', 'true'); return span;
  }

  paintMapPreview(canvas, mapId) {
    const map = createMap(mapId, this.byId('mode').value), ctx = canvas.getContext('2d');
    const colors = { arena: ['#d8b579', '#975d3c'], courtyard: ['#98a679', '#455f4d'], crossroads: ['#b4a09c', '#685168'] }[map.id];
    ctx.fillStyle = '#ded9cc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min((canvas.width - 24) / map.width, (canvas.height - 14) / map.height);
    ctx.save(); ctx.translate((canvas.width - map.width * scale) / 2, 7); ctx.scale(scale, scale);
    ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, map.width, map.height);
    ctx.strokeStyle = '#ead8b3'; ctx.lineWidth = 50;
    for (const road of map.roads) { ctx.beginPath(); road.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke(); }
    for (const wall of map.walls) { ctx.fillStyle = wall.destructible ? '#efbe64' : colors[1]; ctx.fillRect(wall.x, wall.y, wall.width, wall.height); }
    const zone = map.captureZone;
    ctx.strokeStyle = '#fff0cf'; ctx.lineWidth = 14; ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
    map.teamSpawns.forEach((spawns, team) => spawns.forEach(spawn => {
      ctx.fillStyle = team ? '#d85d64' : '#348daf'; ctx.beginPath(); ctx.arc(spawn.x + 24, spawn.y + 32, 28, 0, Math.PI * 2); ctx.fill();
    }));
    ctx.restore();
  }

  renderEvents() {
    const holder = this.byId('event-cards'); holder.replaceChildren();
    const art = { donations: ['coin', 'СОБИРАЙ И БЕРЕГИ', 0], cottage: ['cottage', 'ЗАЙМИ. ЗАХВАТИ. УДЕРЖИ.', 1], teamfight: ['battle', 'ДЕСЯТЬ ПОБЕД ДО ФИНИША', 2] };
    for (const [id, mode] of Object.entries(this.modes)) {
      const button = document.createElement('button'); button.className = `event-card event-${id}`;
      button.dataset.mode = id; button.type = 'button';
      button.setAttribute('aria-pressed', String(this.byId('mode').value === id));
      const stripe = document.createElement('span'); stripe.className = 'event-card-stripe';
      stripe.append(this.badge(art[id][2], 0));
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
      const preview = document.createElement('span'); preview.className = 'map-preview'; preview.setAttribute('aria-hidden', 'true');
      const diagram = document.createElement('canvas'); diagram.width = 360; diagram.height = 160; this.paintMapPreview(diagram, map.id);
      const badge = this.badge(index, 1); badge.classList.add('map-badge'); preview.append(diagram, badge);
      const name = document.createElement('strong'); name.textContent = map.name;
      const size = createMap(map.id, this.byId('mode').value);
      const caption = document.createElement('small'); caption.textContent = `${size.width} × ${size.height} · ${['рыночные улицы', 'садовые дворики', 'переулки'][index]}`;
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
    const roles = ['Стрелок', 'Поддержка', 'Танк', 'Защитник', 'Штурмовик'];
    this.definitions.forEach((definition, index) => {
      if (index === 0 || index === 5) { const heading = document.createElement('h3'); heading.className = 'collection-section-title'; heading.textContent = index === 0 ? 'Бойцы пути прогресса' : 'Бойцы за монеты'; holder.append(heading); }
      const unlocked = this.profile.isUnlocked(index), selected = this.profile.profile.selectedCharacter === index;
      const card = document.createElement('article'); card.className = `character-card fighter-${index}${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
      const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'character-pick'; pick.setAttribute('aria-label', `${definition.name}${unlocked ? ', выбрать персонажа' : ', ещё не открыт'}`); pick.setAttribute('aria-pressed', String(selected));
      const role = document.createElement('span'); role.className = 'fighter-role'; role.textContent = definition.role || roles[index];
      const portrait = document.createElement('canvas'); portrait.width = 300; portrait.height = 240; portrait.className = 'character-portrait'; portrait.setAttribute('aria-hidden', 'true');
      this.paintPortrait(portrait, index);
      const name = document.createElement('strong'); name.className = 'character-name'; name.textContent = definition.name;
      const marker = document.createElement('span'); marker.className = 'character-marker'; marker.textContent = selected ? '✓ Выбран' : unlocked ? 'Выбрать' : 'Закрыт';
      pick.append(role, portrait, name, marker);
      pick.addEventListener('click', () => {
        if (unlocked) { this.selectCharacter(index); this.openScreen('lobby'); }
        else this.byId('menu-message').textContent = definition.acquisition === 'coins' ? `${definition.name}: только за ${definition.unlockCost} монет из матчей и пути прогресса.` : `${definition.name}: только на пути прогресса, уровень ${definition.roadLevel}.`;
      });
      card.append(pick);
      const unlock = document.createElement('button'); unlock.className = 'character-unlock'; unlock.type = 'button'; unlock.textContent = unlocked ? `${definition.maxHealth} HP · ${definition.attack.count > 1 ? definition.attack.count + '×' : ''}${definition.attack.damage} урона` : definition.acquisition === 'coins' ? `Купить · ${definition.unlockCost} монет` : `Путь · уровень ${definition.roadLevel}`;
      if (unlocked) { unlock.disabled = true; unlock.tabIndex = -1; }
      else unlock.addEventListener('click', () => {
        if (definition.acquisition !== 'coins') { this.openScreen('progress'); return; }
        const result = this.profile.unlockCharacter(index);
        this.byId('menu-message').textContent = result.message || '';
        this.renderProfile(); this.renderCharacters();
      });
      const supply = document.createElement('p'); supply.className = 'fighter-supply';
      supply.textContent = `${definition.attack.ammo} заряда · +1 / ${String(definition.attack.reload).replace('.', ',')} с`;
      card.append(supply, unlock); holder.append(card);
    });
    const selected = this.profile.profile.selectedCharacter;
    this.byId('character').value = selected;
    const definition = this.definitions[selected] || this.definitions[0];
    this.byId('character-name').textContent = definition.name;
    this.byId('character-name').parentElement.classList.toggle('long-name', definition.name.length > 12);
    this.byId('character-description').textContent = `${definition.maxHealth} здоровья / ${definition.attack.name}: ${definition.attack.count > 1 ? definition.attack.count + '×' : ''}${definition.attack.damage} урона`;
    this.byId('character-super').textContent = definition.description;
    this.byId('character-ammo').textContent = `${definition.attack.ammo} заряда · +1 за ${String(definition.attack.reload).replace('.', ',')} с`;
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
  }

  saveSettings() {
    const settings = this.profile.updateSettings({ nickname: this.byId('nickname').value, sound: this.byId('sound').checked, music: this.byId('music').checked, volume: Number(this.byId('volume').value) / 100 });
    this.audio?.unlock(); this.audio?.setSettings(settings);
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
    const options = { modeId: this.byId('mode').value, mapId: this.byId('map').value, characterIndex: this.profile.profile.selectedCharacter };
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
