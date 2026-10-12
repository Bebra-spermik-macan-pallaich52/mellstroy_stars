'use strict';
const characterImages = [
  { name: 'Артур', x: 0, y: 130, width: 424, height: 500 },
  { name: 'Котость', x: 430, y: 150, width: 465, height: 480 },
  { name: 'Меллстрой Жирность', x: 900, y: 230, width: 484, height: 390 },
  { name: 'Тёмный Друн', x: 1385, y: 65, width: 385, height: 605 },
  { name: 'Фог', x: 1870, y: 130, width: 270, height: 515 }
];
const characterConfig = { speed: 200, width: 32, height: 32, animation: { fps: 8 }, image: 'assets/characters/characters.png' };
class Player {
  constructor(spawn, config = characterConfig) {
    Object.assign(this, { x: spawn.x, y: spawn.y, width: config.width, height: config.height });
    this.config = config; this.direction = 'down'; this.moving = false;
    this.image = null; this.characterIndex = 0; this.animator = new SpriteAnimator(config.animation);
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
      else {
        // Explicit source rectangles preserve each static image’s proportions.
        const source = characterImages[this.characterIndex];
        const cellWidth = source.width;
        const cellHeight = source.height;
        const scale = Math.min(76 / cellWidth, 76 / cellHeight);
        const width = cellWidth * scale, height = cellHeight * scale;
        ctx.drawImage(this.image, source.x, source.y, cellWidth, cellHeight,
          this.x + this.width / 2 - width / 2, this.y + this.height - height, width, height);
        const offsets = { up: [16, -5], down: [16, 37], left: [-5, 16], right: [37, 16] };
        const [x, y] = offsets[this.direction];
        ctx.fillStyle = '#73e3c0'; ctx.beginPath();
        ctx.arc(this.x + x, this.y + y, 3, 0, Math.PI * 2); ctx.fill();
      }
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
