'use strict';

class Game {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.input = new Input(window, canvas);
    if (arena.teamSpawns.some(spawns => spawns.length < matchConfig.teamSize)) throw new Error('Недостаточно точек появления для выбранного размера команды.');
    this.actors = arena.teamSpawns.flatMap((spawns, team) => spawns.slice(0, matchConfig.teamSize).map((spawn, index) =>
      new Player(spawn, characterConfig, { team, characterIndex: team === 0 ? index : [3, 4, 1][index] })));
    this.player = this.actors[0];
    this.player.isHuman = true;
    this.bots = this.actors.slice(1).map((actor, index) => new Bot(actor, index));
    this.ui = new UI();
    this.lastTime = null; this.running = false;
    this.tick = this.tick.bind(this);
    this.reset('donations');
    document.getElementById('character').addEventListener('change', event => {
      this.player.characterIndex = Number(event.target.value); this.input.clear();
      this.canvas.focus({ preventScroll: true });
    });
    this.ui.modeSelect.addEventListener('change', event => this.reset(event.target.value));
    this.ui.enemyFire.addEventListener('change', () => {
      this.input.clear(); this.canvas.focus({ preventScroll: true });
    });
    window.addEventListener('blur', () => { this.lastTime = null; });
    document.addEventListener('visibilitychange', () => { this.lastTime = null; });
    document.getElementById('restart').addEventListener('click', () => this.reset());
    document.getElementById('result-restart').addEventListener('click', () => this.reset());
  }
  reset(modeId = this.modeId || 'donations') {
    this.modeId = modeId;
    this.input.clear();
    for (const actor of this.actors) actor.reset();
    for (const bot of this.bots) bot.reset();
    this.projectiles = [];
    this.stats = { kills: 0, deaths: 0 };
    this.manager = new GameManager(modeId, arena, this.actors);
    this.world = { map: arena, actors: this.actors, manager: this.manager, bots: this.bots };
    this.message = modeId === 'donations'
      ? 'Собирайте золотые донаты в центре. Часть донатов выпадает после смерти.'
      : 'Займите коттедж вместе с союзниками. Обе команды внутри — захват остановлен.';
    this.ui.modeSelect.value = modeId;
    this.lastTime = null;
    this.canvas.focus({ preventScroll: true });
  }
  async start() {
    if (this.running) return;
    this.running = true;
    const loader = new ImageLoader();
    const images = await Promise.all(this.actors.map(actor => actor.config.image ? loader.load(actor.config.image) : null));
    this.actors.forEach((actor, i) => { actor.image = images[i]; });
    requestAnimationFrame(this.tick);
  }
  onDeath(actor) {
    this.manager.onDeath(actor);
    this.bots.find(bot => bot.actor === actor)?.reset();
    if (actor === this.player) {
      this.input.clear(); this.stats.deaths++;
      this.message = `Вы погибли. Возрождение на стартовой точке через ${actor.config.respawnDelay} с.`;
    } else if (actor.team !== this.player.team) {
      this.stats.kills++;
      this.message = `Противник повержен. Возрождение через ${actor.config.respawnDelay} с.`;
    }
  }
  update(dt) {
    if (this.manager.state !== 'playing' || dt <= 0) return;
    // Combat, mode and timer consume the same interval, including the final step.
    dt = Math.min(dt, this.manager.remaining);
    for (const actor of this.actors) {
      if (actor.updateTimers(dt)) {
        this.bots.find(bot => bot.actor === actor)?.reset();
        if (actor === this.player) {
          this.input.clear(); this.message = 'Вы возродились. Здоровье восстановлено.';
        }
      }
    }
    this.player.update(dt, this.input, arena);
    const aim = this.input.aim();
    if (aim && this.player.alive) {
      this.player.aimAt(aim);
      if (this.input.mouse.firing) {
        const shot = this.player.attack(aim);
        if (shot) this.projectiles.push(shot);
      }
    }
    for (const bot of this.bots) {
      const shot = bot.update(dt, this.world, this.ui.enemyFire.checked);
      if (shot) this.projectiles.push(shot);
    }
    for (const projectile of this.projectiles) {
      const hit = projectile.update(dt, arena, this.actors);
      if (!hit) continue;
      const wasAlive = hit.target.alive;
      const actualDamage = hit.target.takeDamage(hit.damage);
      hit.owner.chargeSuper(actualDamage);
      if (wasAlive && !hit.target.alive) this.onDeath(hit.target);
    }
    this.projectiles = this.projectiles.filter(projectile => projectile.active);
    this.manager.update(dt, this.actors);
    if (this.manager.state === 'finished') this.input.clear();
  }
  draw() {
    arena.draw(this.ctx);
    this.manager.mode.draw(this.ctx);
    if (this.manager.state === 'playing' && this.player.alive && this.input.aim()) {
      const from = this.player.center, direction = this.player.aimDirection;
      this.ctx.strokeStyle = 'rgba(115, 227, 192, 0.5)'; this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath(); this.ctx.moveTo(from.x, from.y);
      this.ctx.lineTo(from.x + direction.x * 85, from.y + direction.y * 85); this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
    const labelBounds = [];
    this.ctx.font = '12px system-ui';
    for (const actor of this.actors) {
      const label = `${characterImages[actor.characterIndex].name}${actor.isHuman ? ' · вы' : ''}`;
      const labelWidth = this.ctx.measureText(label).width + 4;
      const bounds = { x: actor.center.x - labelWidth / 2, y: actor.y - 32, width: labelWidth, height: 14 };
      const crowded = this.actors.some(other => other !== actor && other.alive && overlaps(bounds,
        { x: other.x - 3, y: other.y - 15, width: other.width + 6, height: other.height + 15 }));
      const showLabel = actor.isHuman || (!crowded && !labelBounds.some(other => overlaps(bounds, other)));
      if (actor.alive && showLabel) labelBounds.push(bounds);
      actor.draw(this.ctx, showLabel);
      if (actor.alive && this.modeId === 'donations') {
        const held = this.manager.mode.carried.get(actor) || 0;
        if (held) {
          this.ctx.fillStyle = '#ffd479'; this.ctx.font = '12px system-ui'; this.ctx.textAlign = 'center';
          this.ctx.fillText(`${held} дон.`, actor.center.x, actor.y + actor.height + 18);
        }
      }
    }
    for (const projectile of this.projectiles) projectile.draw(this.ctx);
    this.ui.render(this, document.hidden || !document.hasFocus());
  }
  tick(timestamp) {
    const dt = this.lastTime === null ? 0 : Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    if (!document.hidden && document.hasFocus()) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < steps; i++) this.update(dt / steps);
    } else { this.input.clear(); this.player.moving = false; }
    this.draw();
    requestAnimationFrame(this.tick);
  }
}
