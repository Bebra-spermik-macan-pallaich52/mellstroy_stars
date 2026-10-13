'use strict';

// Browser coordinator: simulation has no knowledge of menus, sound or storage.
class Game {
  constructor(canvas, { audio = null, profile = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.profile = profile;
    this.input = new Input(window, canvas);
    this.ui = new UI();
    this.effects = new VisualEffects({ reducedMotion: Boolean(profile?.settings?.reducedMotion) });
    this.sim = null;
    this.images = [];
    this.photo = null;
    this.active = false;
    this.paused = false;
    this.running = false;
    this.lastTime = null;
    this.stats = { kills: 0, deaths: 0 };
    this.message = '';
    this.lastOptions = { modeId: 'donations', mapId: 'arena', characterIndex: 0, botFire: true, enhancements: true };
    this.matchCounter = 0;
    this.tick = this.tick.bind(this);
    window.addEventListener('blur', () => { this.lastTime = null; this.input.clear(); this.audio?.pause(); });
    window.addEventListener('focus', () => { this.lastTime = null; if (this.active && !this.paused) this.audio?.resume?.(); });
    document.addEventListener('visibilitychange', () => { this.lastTime = null; if (document.hidden) this.input.clear(); });
  }

  get actors() { return this.sim?.actors || []; }
  get bots() { return this.sim?.bots || []; }
  get player() { return this.actors[0]; }
  get map() { return this.sim?.map || arena; }
  get manager() { return this.sim?.manager; }
  get projectiles() { return this.sim?.projectiles || []; }
  get modeId() { return this.sim?.modeId || this.lastOptions.modeId; }

  async start() {
    if (this.running) return;
    this.running = true;
    const loader = new ImageLoader();
    this.ready = Promise.all(characterDefinitions.map((_, index) => loader.load(getCharacterConfig(index).image)));
    this.images = await this.ready;
    if (this.images.some(image => !image)) this.photo = await loader.load('assets/characters/characters.png');
    this.attachImages();
    requestAnimationFrame(this.tick);
  }

  attachImages() {
    for (const actor of this.actors) {
      actor.image = this.images[actor.characterIndex] || this.photo;
      actor.photoFallback = !this.images[actor.characterIndex];
    }
  }

  startMatch(options = {}) {
    this.lastOptions = { ...this.lastOptions, ...options };
    const index = this.lastOptions.characterIndex;
    if (this.profile && !this.profile.isUnlocked(index)) {
      this.message = 'Этот персонаж ещё не открыт.';
      return false;
    }
    const seed = Number.isFinite(this.lastOptions.seed) ? this.lastOptions.seed : Math.floor(Math.random() * 0x100000000);
    this.sim = new Simulation({ ...this.lastOptions, seed });
    this.attachImages();
    this.stats = { kills: 0, deaths: 0 };
    this.matchId = `${Date.now()}-${++this.matchCounter}-${Math.random().toString(36).slice(2)}`;
    this.finishedProcessed = false;
    this.reward = null;
    this.active = true;
    this.paused = false;
    this.message = this.modeId === 'donations' ? 'Собирайте донаты вместе с союзниками.'
      : this.modeId === 'cottage' ? 'Займите коттедж и удерживайте контроль.' : 'Побеждайте противников. Каждая победа даёт очко команде.';
    this.effects.clear();
    this.input.clear();
    this.lastTime = null;
    this.canvas.focus({ preventScroll: true });
    this.audio?.unlock();
    return true;
  }

  reset() { return this.startMatch(this.lastOptions); }

  pause(paused = !this.paused) {
    if (!this.active || this.manager?.state === 'finished') return;
    this.paused = Boolean(paused);
    this.input.clear();
    this.lastTime = null;
    if (this.paused) this.audio?.pause();
    else { this.canvas.focus({ preventScroll: true }); this.audio?.resume?.(); }
    this.onPauseRequested?.(this.paused);
  }

  leaveMatch() {
    this.active = false;
    this.paused = false;
    this.input.clear();
    this.effects.clear();
    this.lastTime = null;
  }

  setBotFire(enabled) {
    this.lastOptions.botFire = Boolean(enabled);
    if (this.sim) this.sim.botFire = Boolean(enabled);
  }

  update(dt) {
    if (!this.sim || !this.active || this.paused || this.manager.state !== 'playing') return;
    const direction = this.input.direction();
    const aim = this.input.aim() || {
      x: this.player.center.x + this.player.aimDirection.x * 100,
      y: this.player.center.y + this.player.aimDirection.y * 100
    };
    const wasAlive = this.player.alive;
    this.sim.step(dt, { 0: { x: direction.x, y: direction.y, aim,
      fire: this.input.mouse.firing && Boolean(this.input.aim()), super: this.input.consumeAction('super') } });
    for (const event of this.sim.drainEvents()) {
      this.effects.emit(event);
      this.audio?.handle(event, { localTeam: this.player.team });
      if (event.type === 'death') {
        if (event.actorId === this.player.id) {
          this.stats.deaths++;
          this.message = `Вы погибли. Возрождение через ${this.player.config.respawnDelay} с.`;
        }
        if (event.sourceId === this.player.id && event.team !== this.player.team) this.stats.kills++;
      }
      if (event.type === 'respawn' && event.actorId === this.player.id) this.message = 'Вы снова в игре.';
    }
    if (wasAlive !== this.player.alive) this.input.clear();
    if (this.manager.state === 'finished' && !this.finishedProcessed) {
      this.finishedProcessed = true;
      this.input.clear();
      this.reward = this.onFinish?.(this.manager.result, {
        matchId: this.matchId, characterIndex: this.player.characterIndex, modeId: this.modeId,
        mapId: this.sim.mapId, team: this.player.team, kills: this.stats.kills, deaths: this.stats.deaths
      }) || null;
    }
  }

  drawPowerups() {
    const icons = { heal: '+', damage: '↑', shield: '◇' };
    for (const pickup of this.sim.powerups || []) {
      this.ctx.save();
      this.ctx.fillStyle = pickup.kind === 'heal' || pickup.type === 'heal' ? '#73e3c0' : '#ffd479';
      this.ctx.beginPath(); this.ctx.arc(pickup.x, pickup.y, pickup.radius || 13, 0, Math.PI * 2); this.ctx.fill();
      this.ctx.fillStyle = '#101722'; this.ctx.font = 'bold 18px system-ui'; this.ctx.textAlign = 'center';
      this.ctx.fillText(icons[pickup.kind || pickup.type] || '+', pickup.x, pickup.y + 6);
      this.ctx.restore();
    }
  }

  draw() {
    if (!this.sim || !this.active) return;
    this.map.draw(this.ctx);
    this.manager.mode.draw(this.ctx);
    this.drawPowerups();
    if (this.manager.state === 'playing' && this.player.alive && this.input.aim()) {
      const from = this.player.center, direction = this.player.aimDirection;
      this.ctx.save(); this.ctx.strokeStyle = 'rgba(115,227,192,0.5)'; this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath(); this.ctx.moveTo(from.x, from.y);
      this.ctx.lineTo(from.x + direction.x * 85, from.y + direction.y * 85); this.ctx.stroke(); this.ctx.restore();
    }
    const labels = [];
    for (const actor of this.actors.slice().sort((a, b) => a.y - b.y)) {
      const name = `${characterImages[actor.characterIndex].name}${actor.isHuman ? ' · вы' : ''}`;
      this.ctx.font = '12px system-ui';
      const width = this.ctx.measureText(name).width + 4;
      const rect = { x: actor.center.x - width / 2, y: actor.y - 32, width, height: 14 };
      const crowded = this.actors.some(other => other !== actor && other.alive && overlaps(rect,
        { x: other.x - 3, y: other.y - 15, width: other.width + 6, height: other.height + 15 }));
      const showLabel = actor.isHuman || (!crowded && !labels.some(other => overlaps(rect, other)));
      if (actor.alive && showLabel) labels.push(rect);
      actor.draw(this.ctx, showLabel);
      if (actor.alive && this.modeId === 'donations') {
        const held = this.manager.mode.carried.get(actor) || 0;
        if (held) {
          this.ctx.fillStyle = '#ffd479'; this.ctx.font = '12px system-ui'; this.ctx.textAlign = 'center';
          this.ctx.fillText(`${held} дон.`, actor.center.x, actor.y + actor.height + 18);
        }
      }
    }
    for (const shot of this.projectiles) shot.draw(this.ctx);
    this.effects.draw(this.ctx);
    this.ui.render(this, this.paused || document.hidden || !document.hasFocus());
  }

  tick(timestamp) {
    const dt = this.lastTime === null ? 0 : Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    if (this.input.consumeAction('pause') && this.active) this.pause();
    const focused = !document.hidden && document.hasFocus();
    if (this.active && !this.paused && focused) {
      this.update(dt);
      this.effects.update(dt);
    } else this.input.clear();
    this.draw();
    requestAnimationFrame(this.tick);
  }
}
