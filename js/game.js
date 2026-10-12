'use strict';

const trainingConfig = { enemySpawn: { x: 550, y: 310 }, enemyCharacter: 3 };

class Game {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.input = new Input(window, canvas);
    this.player = new Player(arena.spawn);
    this.enemy = new Player(trainingConfig.enemySpawn, characterConfig, { team: 1, characterIndex: trainingConfig.enemyCharacter });
    this.actors = [this.player, this.enemy];
    this.projectiles = [];
    this.stats = { kills: 0, deaths: 0 };
    this.message = 'Обойдите стену и атакуйте тестового противника.';
    this.ui = new UI();
    this.lastTime = null; this.running = false;
    this.tick = this.tick.bind(this);
    document.getElementById('character').addEventListener('change', event => {
      this.player.characterIndex = Number(event.target.value); this.input.clear();
      this.canvas.focus({ preventScroll: true });
    });
    document.getElementById('enemy-fire').addEventListener('change', () => {
      this.input.clear(); this.canvas.focus({ preventScroll: true });
    });
    window.addEventListener('blur', () => { this.lastTime = null; });
    document.addEventListener('visibilitychange', () => { this.lastTime = null; });
    document.getElementById('restart').addEventListener('click', () => this.reset());
  }
  reset() {
    this.input.clear();
    for (const actor of this.actors) actor.reset();
    this.projectiles = [];
    this.stats = { kills: 0, deaths: 0 };
    this.message = 'Тренировка начата заново.';
    this.lastTime = null;
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
    if (actor === this.player) {
      this.input.clear(); this.stats.deaths++;
      this.message = `Вы погибли. Возрождение на стартовой точке через ${actor.config.respawnDelay} с.`;
    } else {
      this.stats.kills++;
      this.message = `Противник повержен. Возрождение через ${actor.config.respawnDelay} с.`;
    }
  }
  update(dt) {
    for (const actor of this.actors) {
      if (actor.updateTimers(dt) && actor === this.player) {
        this.input.clear(); this.message = 'Вы возродились. Здоровье восстановлено.';
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
    // A stationary test opponent verifies incoming damage, without pathfinding or game modes.
    if (this.ui.enemyFire.checked && this.enemy.alive && this.player.alive) {
      const from = this.enemy.center, to = this.player.center;
      if (Math.hypot(to.x - from.x, to.y - from.y) <= this.enemy.config.attack.range) {
        const shot = this.enemy.attack(to);
        if (shot) this.projectiles.push(shot);
      }
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
  }
  draw() {
    arena.draw(this.ctx);
    // Aim indicator is separate from walking direction and animation.
    if (this.player.alive && this.input.aim()) {
      const from = this.player.center, direction = this.player.aimDirection;
      this.ctx.strokeStyle = 'rgba(115, 227, 192, 0.5)'; this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath(); this.ctx.moveTo(from.x, from.y);
      this.ctx.lineTo(from.x + direction.x * 85, from.y + direction.y * 85); this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
    for (const actor of this.actors) actor.draw(this.ctx);
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
