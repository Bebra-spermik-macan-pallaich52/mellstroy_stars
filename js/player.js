'use strict';
const characterConfig = { speed: 200, width: 32, height: 32, animation: { fps: 8 }, image: null };
class Player {
  constructor(spawn, config = characterConfig) {
    Object.assign(this, { x: spawn.x, y: spawn.y, width: config.width, height: config.height });
    this.config = config; this.direction = 'down'; this.moving = false;
    this.image = null; this.animator = new SpriteAnimator(config.animation);
  }
  update(dt, input, map) {
    const velocity = input.direction(); const oldX = this.x; const oldY = this.y;
    if (velocity.x || velocity.y) this.direction = Math.abs(velocity.x) > Math.abs(velocity.y)
      ? (velocity.x > 0 ? 'right' : 'left') : (velocity.y > 0 ? 'down' : 'up');
    moveWithCollisions(this, velocity.x * this.config.speed * dt, velocity.y * this.config.speed * dt, map);
    this.moving = Math.hypot(this.x - oldX, this.y - oldY) > 0.00001;
    this.animator.update(this.direction, this.moving, dt);
  }
  draw(ctx) {
    const frame = this.animator.frame();
    if (this.image) {
      if (frame) ctx.drawImage(this.image, frame.x, frame.y, frame.width, frame.height, this.x, this.y, this.width, this.height);
      else ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
      return;
    }
    const bob = this.moving ? Math.sin(this.animator.elapsed * this.animator.config.fps * Math.PI) * 2 : 0;
    ctx.fillStyle = '#10202a'; ctx.fillRect(this.x + 3, this.y + 7, this.width, this.height);
    ctx.fillStyle = '#73e3c0'; ctx.fillRect(this.x, this.y + bob, this.width, this.height);
    const offsets = { up: [16, 6], down: [16, 26], left: [6, 16], right: [26, 16] };
    const [x, y] = offsets[this.direction]; ctx.fillStyle = '#10202a';
    ctx.beginPath(); ctx.arc(this.x + x, this.y + y + bob, 4, 0, Math.PI * 2); ctx.fill();
  }
}
