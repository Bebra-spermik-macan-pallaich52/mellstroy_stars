'use strict';
class Game {
  constructor(canvas, { audio = null, profile = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.profile = profile;
    this.input = new Input(window, canvas);
    this.input.enabled = false;
    this.camera = new Camera(canvas.width, canvas.height);
    this.input.camera = this.camera;
    this.ui = new UI();
    this.reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this.effects = new VisualEffects({ reducedMotion: this.reducedMotion });
    this.sim = null;
    this.images = [];
    this.photo = null;
    this.active = false;
    this.paused = false;
    this.running = false;
    this.lastTime = null;
    this.stats = { kills: 0, deaths: 0 };
    this.message = '';
    this.lastOptions = {
      modeId: 'donations',
      mapId: 'arena',
      characterIndex: 0,
      botFire: true,
      enhancements: false
    };
    this.matchCounter = 0;
    this.tick = this.tick.bind(this);
    window.addEventListener('blur', () => {
      this.lastTime = null;
      this.input.clear();
      this.audio?.pause();
    });
    window.addEventListener('focus', () => {
      this.lastTime = null;
      if (this.active && !this.paused) {
        this.audio?.resume?.();
      }
    });
    document.addEventListener('visibilitychange', () => {
      this.lastTime = null;
      if (document.hidden) {
        this.input.clear();
      }
    });
  }
  get actors() {
    return this.sim?.actors || [];
  }
  get bots() {
    return this.sim?.bots || [];
  }
  get player() {
    return this.actors[0];
  }
  get map() {
    return this.sim?.map || arena;
  }
  get manager() {
    return this.sim?.manager;
  }
  get projectiles() {
    return this.sim?.projectiles || [];
  }
  get modeId() {
    return this.sim?.modeId || this.lastOptions.modeId;
  }
  async start() {
    if (this.running) {
      return;
    }
    this.running = true;
    const loader = new ImageLoader();
    this.ready = Promise.all(
      characterDefinitions.map((_, index) => loader.load(getCharacterConfig(index).image))
    );
    const terrainReady = typeof mapArt !== 'undefined' ? mapArt.load(loader) : Promise.resolve();
    this.images = await this.ready;
    await terrainReady;
    if (this.images.some((image) => !image)) {
      this.photo = await loader.load('assets/characters/characters.png');
    }
    this.attachImages();
    requestAnimationFrame(this.tick);
  }
  attachImages() {
    for (const actor of this.actors) {
      actor.image =
        this.images[actor.characterIndex] ||
        (characterImages[actor.characterIndex]?.photo === false ? null : this.photo);
      actor.photoFallback = !this.images[actor.characterIndex];
    }
  }
  startMatch(options = {}) {
    this.lastOptions = { ...this.lastOptions, ...options, botFire: true, enhancements: false };
    const index = this.lastOptions.characterIndex;
    if (this.profile && !this.profile.isUnlocked(index)) {
      this.message = 'Этот персонаж ещё не открыт.';
      return false;
    }
    const seed = Number.isFinite(this.lastOptions.seed)
      ? this.lastOptions.seed
      : Math.floor(Math.random() * 0x100000000);
    this.sim = new Simulation({ ...this.lastOptions, seed });
    for (const bot of this.bots) {
      bot.prepareNavigation(this.map, bot.config.obstacleMargin);
    }
    this.attachImages();
    this.camera.update(this.player.center, this.map, 0, true);
    this.respawnLife = null;
    this.stats = { kills: 0, deaths: 0 };
    this.matchId = `${Date.now()}-${++this.matchCounter}-${Math.random().toString(36).slice(2)}`;
    this.finishedProcessed = false;
    this.reward = null;
    this.active = true;
    this.input.enabled = true;
    this.paused = false;
    this.message =
      this.modeId === 'donations'
        ? 'Собирайте донаты вместе с союзниками.'
        : this.modeId === 'cottage'
          ? 'Займите коттедж и удерживайте контроль.'
          : 'Побеждайте противников. Каждая победа даёт очко команде.';
    this.effects.clear();
    this.input.clear();
    this.lastTime = null;
    this.canvas.focus({ preventScroll: true });
    this.audio?.unlock();
    return true;
  }
  reset() {
    return this.startMatch(this.lastOptions);
  }
  pause(paused = !this.paused) {
    if (!this.active || this.manager?.state === 'finished') {
      return;
    }
    this.paused = Boolean(paused);
    this.input.enabled = !this.paused;
    this.input.clear();
    this.lastTime = null;
    if (this.paused) {
      this.audio?.pause();
    } else {
      this.canvas.focus({ preventScroll: true });
      this.audio?.resume?.();
    }
    this.onPauseRequested?.(this.paused);
  }
  leaveMatch() {
    this.active = false;
    this.input.enabled = false;
    this.paused = false;
    this.input.clear();
    this.effects.clear();
    this.lastTime = null;
  }
  update(deltaTime) {
    if (!this.sim || !this.active || this.paused || this.manager.state !== 'playing') {
      return;
    }
    const direction = this.input.direction();
    const aim = this.input.aim() || {
      x: this.player.center.x + this.player.aimDirection.x * 100,
      y: this.player.center.y + this.player.aimDirection.y * 100
    };
    const wasAlive = this.player.alive;
    this.sim.step(deltaTime, {
      0: {
        x: direction.x,
        y: direction.y,
        aim,
        fire: this.input.mouse.firing,
        super: this.input.consumeAction('super')
      }
    });
    for (const event of this.sim.drainEvents()) {
      this.effects.emit(event);
      this.audio?.handle(event, { localTeam: this.player.team });
      if (event.type === 'death') {
        if (event.actorId === this.player.id) {
          this.stats.deaths++;
          this.message = `Вы погибли. Возрождение через ${this.player.config.respawnDelay} с.`;
        }
        if (event.sourceId === this.player.id && event.team !== this.player.team) {
          this.stats.kills++;
        }
      }
      if (event.type === 'respawn' && event.actorId === this.player.id) {
        this.message = 'Вы снова в игре.';
      }
    }
    if (wasAlive !== this.player.alive) {
      this.input.clear();
      if (this.player.alive) {
        this.camera.update(this.player.center, this.map, 0, true);
      }
    }
    if (this.manager.state === 'finished' && !this.finishedProcessed) {
      this.finishedProcessed = true;
      this.input.enabled = false;
      this.input.clear();
      this.reward =
        this.onFinish?.(this.manager.result, {
          matchId: this.matchId,
          characterIndex: this.player.characterIndex,
          modeId: this.modeId,
          mapId: this.sim.mapId,
          team: this.player.team,
          kills: this.stats.kills,
          deaths: this.stats.deaths
        }) || null;
    }
  }
  updateCamera(deltaTime) {
    if (!this.player) {
      return;
    }
    if (!this.player.alive) {
      if (this.respawnLife !== this.player.lifeId) {
        this.respawnLife = this.player.lifeId;
        this.camera.flyTo(
          {
            x: this.player.spawn.x + this.player.width / 2,
            y: this.player.spawn.y + this.player.height / 2
          },
          this.map,
          this.reducedMotion ? 0 : 1.2
        );
      }
      this.camera.updateFlight(deltaTime);
    } else {
      this.respawnLife = null;
      this.camera.update(this.player.center, this.map, deltaTime);
    }
  }
  drawSpawnMarker() {
    if (this.player.alive || this.manager.state !== 'playing') {
      return;
    }
    const x = this.player.spawn.x + this.player.width / 2;
    const y = this.player.spawn.y + this.player.height - 3;
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(87,211,97,.18)';
    this.ctx.strokeStyle = '#a4f18c';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, 37, 19, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.font = 'bold 13px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = '#263b27';
    this.ctx.strokeText('Точка возрождения', x, y - 34);
    this.ctx.fillStyle = '#c8ffb2';
    this.ctx.fillText('Точка возрождения', x, y - 34);
    this.ctx.restore();
  }
  drawCarriedBadge() {
    const actor = this.player;
    const held = this.manager.mode.carried.get(actor) || 0;
    const right = actor.center.x + 52;
    const x = right + 66 <= this.camera.x + this.camera.width - 4 ? right : actor.center.x - 118;
    const y = Math.max(actor.y, this.camera.y + 60) - 32;
    this.ctx.save();
    this.ctx.fillStyle = '#303025';
    this.ctx.fillRect(x - 2, y - 2, 70, 30);
    this.ctx.fillStyle = '#ffe14e';
    this.ctx.fillRect(x, y, 66, 26);
    this.ctx.beginPath();
    this.ctx.arc(x + 13, y + 13, 8, 0, Math.PI * 2);
    this.ctx.fillStyle = '#ffc326';
    this.ctx.fill();
    this.ctx.strokeStyle = '#8c5f12';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#6a4911';
    this.ctx.fillText('$', x + 13, y + 17);
    this.ctx.font = 'bold 19px sans-serif';
    this.ctx.fillStyle = '#27291e';
    this.ctx.fillText(String(held), x + 44, y + 20, 34);
    this.ctx.restore();
  }
  drawPowerups() {
    const icons = { heal: '+', damage: '↑', shield: '◇' };
    for (const pickup of this.sim.powerups || []) {
      this.ctx.save();
      this.ctx.fillStyle = pickup.kind === 'heal' || pickup.type === 'heal' ? '#73e3c0' : '#ffd479';
      this.ctx.beginPath();
      this.ctx.arc(pickup.x, pickup.y, pickup.radius || 13, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#101722';
      this.ctx.font = 'bold 18px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(icons[pickup.kind || pickup.type] || '+', pickup.x, pickup.y + 6);
      this.ctx.restore();
    }
  }
  drawObjectiveHint() {
    if (this.modeId === 'teamfight' || this.manager.state !== 'playing') {
      return;
    }
    const point =
      this.modeId === 'cottage'
        ? {
            x: this.map.captureZone.x + this.map.captureZone.width / 2,
            y: this.map.captureZone.y + this.map.captureZone.height / 2
          }
        : this.map.resourcePoint;
    const screen = this.camera.worldToScreen(point);
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (screen.x > 25 && screen.x < width - 25 && screen.y > 25 && screen.y < height - 25) {
      return;
    }
    const dx = screen.x - width / 2;
    const dy = screen.y - height / 2;
    const ratio = 1 / Math.max(Math.abs(dx) / (width / 2 - 58), Math.abs(dy) / (height / 2 - 38));
    const x = width / 2 + dx * ratio;
    const y = height / 2 + dy * ratio;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(Math.atan2(dy, dx));
    this.ctx.fillStyle = '#f8c64c';
    this.ctx.strokeStyle = '#30212e';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(12, 0);
    this.ctx.lineTo(-8, -10);
    this.ctx.lineTo(-4, 0);
    this.ctx.lineTo(-8, 10);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();
    this.ctx.save();
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.textAlign = 'center';
    const label = this.modeId === 'cottage' ? 'КОТТЕДЖ' : 'ДОНАТЫ';
    this.ctx.strokeStyle = '#30212e';
    this.ctx.lineWidth = 3;
    this.ctx.strokeText(label, x, y + 26);
    this.ctx.fillStyle = '#fff0cf';
    this.ctx.fillText(label, x, y + 26);
    this.ctx.restore();
  }
  drawAttackArea() {
    const actor = this.player;
    const attack = actor.config.attack;
    const canvasContext = this.ctx;
    const range = attack.range;
    const halfWidth = Math.max(10, attack.radius * 2);
    const spread =
      attack.kind === 'scatter' ? ((Math.max(1, attack.count || 1) - 1) * attack.spread) / 2 : 0;
    const aim = this.input.aim();
    const center = actor.center;
    const angle = aim
      ? Math.atan2(aim.y - center.y, aim.x - center.x)
      : Math.atan2(actor.aimDirection.y, actor.aimDirection.x);
    canvasContext.save();
    canvasContext.translate(center.x, center.y);
    canvasContext.rotate(angle);
    canvasContext.fillStyle = actor.ammo > 0 ? 'rgba(255,250,224,.25)' : 'rgba(255,250,224,.12)';
    canvasContext.strokeStyle = 'rgba(255,252,236,.8)';
    canvasContext.lineWidth = 2;
    canvasContext.beginPath();
    if (spread > 0) {
      const edgeAngle = spread + Math.asin(halfWidth / range);
      canvasContext.moveTo(0, -halfWidth);
      canvasContext.lineTo(Math.cos(edgeAngle) * range, -Math.sin(edgeAngle) * range);
      canvasContext.arc(0, 0, range, -edgeAngle, edgeAngle);
      canvasContext.lineTo(0, halfWidth);
      canvasContext.closePath();
    } else {
      canvasContext.roundRect(0, -halfWidth, range, halfWidth * 2, halfWidth);
    }
    canvasContext.fill();
    canvasContext.stroke();
    canvasContext.restore();
  }
  draw() {
    if (!this.sim || !this.active) {
      return;
    }
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.clip();
    this.ctx.translate(-this.camera.x, -this.camera.y);
    this.map.draw(this.ctx, this.camera);
    this.manager.mode.draw(this.ctx);
    this.drawPowerups();
    this.drawSpawnMarker();
    if (this.manager.state === 'playing' && this.player.alive && this.input.aim()) {
      this.drawAttackArea();
    }
    const visibleActors = this.actors.filter((actor) => this.camera.visible(actor));
    for (const actor of visibleActors.sort((a, b) => a.y - b.y)) {
      actor.draw(this.ctx, false, {
        local: actor === this.player,
        localTeam: this.player.team,
        time: this.sim.elapsed,
        reducedMotion: this.reducedMotion
      });
    }
    for (const shot of this.projectiles) {
      shot.draw(this.ctx);
    }
    this.effects.draw(this.ctx);
    for (const actor of visibleActors.filter((actor) => actor !== this.player)) {
      actor.drawVitals(this.ctx, { local: false, localTeam: this.player.team, view: this.camera });
    }
    if (this.camera.visible(this.player)) {
      this.player.drawVitals(this.ctx, {
        local: true,
        localTeam: this.player.team,
        nickname: this.profile?.settings.nickname,
        view: this.camera
      });
    }
    if (this.player.alive && this.modeId === 'donations') {
      this.drawCarriedBadge();
    }
    this.ctx.restore();
    this.drawObjectiveHint();
    this.ui.render(this, this.paused || document.hidden || !document.hasFocus());
  }
  tick(timestamp) {
    const deltaTime =
      this.lastTime === null ? 0 : Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    if (this.input.consumeAction('pause') && this.active) {
      this.pause();
    }
    const focused = !document.hidden && document.hasFocus();
    if (this.active && !this.paused && focused) {
      this.update(deltaTime);
      this.updateCamera(deltaTime);
      this.effects.update(deltaTime);
    } else {
      this.input.clear();
    }
    this.draw();
    requestAnimationFrame(this.tick);
  }
}
