'use strict';
class Game {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.input = new Input();
    this.player = new Player(arena.spawn); this.lastTime = null; this.running = false;
    this.status = document.getElementById('status'); this.tick = this.tick.bind(this);
    window.addEventListener('blur', () => { this.lastTime = null; });
    document.addEventListener('visibilitychange', () => { this.lastTime = null; });
    document.getElementById('restart').addEventListener('click', () => this.reset());
  }
  reset() {
    this.input.clear(); this.player.x = arena.spawn.x; this.player.y = arena.spawn.y;
    this.player.direction = 'down'; this.player.moving = false; this.player.animator.update('down', false, 0);
    this.lastTime = null;
  }
  async start() {
    if (this.running) return;
    this.running = true;
    if (this.player.config.image) this.player.image = await new ImageLoader().load(this.player.config.image);
    requestAnimationFrame(this.tick);
  }
  tick(timestamp) {
    const dt = this.lastTime === null ? 0 : Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    if (!document.hidden && document.hasFocus()) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < steps; i++) this.player.update(dt / steps, this.input, arena);
    } else { this.input.clear(); this.player.moving = false; }
    arena.draw(this.ctx); this.player.draw(this.ctx);
    this.status.textContent = `${this.player.moving ? 'Ходьба' : 'Покой'} · ${this.player.direction} · 200 px/s`;
    requestAnimationFrame(this.tick);
  }
}
