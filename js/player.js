'use strict';

const characterImages = [
  { name: 'Артур', x: 0, y: 130, width: 424, height: 500 },
  { name: 'Котость', x: 430, y: 150, width: 465, height: 480 },
  { name: 'Меллстрой Жирность', x: 900, y: 230, width: 484, height: 390 },
  { name: 'Тёмный Друн', x: 1385, y: 65, width: 385, height: 605 },
  { name: 'Фог', x: 1870, y: 130, width: 270, height: 515 }
];

// Пока характеристики общие для пяти изображений; баланс персонажей — позже.
const characterConfig = {
  speed: 200, width: 48, height: 64, maxHealth: 1000, respawnDelay: 3,
  attack: { damage: 200, speed: 620, range: 420, cooldown: 0.45, radius: 5 },
  super: { damageRequired: 1000 },
  animation: { fps: 8 }, image: 'assets/characters/characters.png'
};

// Все участники используют одну систему движения и боя.
class Player {
  constructor(spawn, config = characterConfig, options = {}) {
    this.spawn = { ...spawn }; this.config = config;
    this.width = config.width; this.height = config.height;
    this.maxHealth = config.maxHealth;
    this.team = options.team ?? 0; this.characterIndex = options.characterIndex ?? 0;
    this.image = null; this.animator = new SpriteAnimator(config.animation);
    this.reset();
  }
  get center() { return { x: this.x + this.width / 2, y: this.y + this.height / 2 }; }
  reset() {
    this.x = this.spawn.x; this.y = this.spawn.y;
    this.health = this.maxHealth; this.alive = true;
    this.direction = 'down'; this.moving = false;
    this.cooldownRemaining = 0; this.respawnRemaining = 0;
    this.superCharge = 0; this.hitFlash = 0;
    this.aimDirection = { x: this.team === 0 ? 1 : -1, y: 0 };
    this.animator.update(this.direction, false, 0);
  }
  // Returns true on revival, so keys pressed while dead can be discarded.
  updateTimers(dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    if (this.alive) return false;
    this.respawnRemaining = Math.max(0, this.respawnRemaining - dt);
    if (this.respawnRemaining === 0) { this.reset(); return true; }
    return false;
  }
  update(dt, input, map) {
    if (!this.alive) return;
    const velocity = input.direction(); const oldX = this.x, oldY = this.y;
    if (velocity.x || velocity.y) this.direction = Math.abs(velocity.x) > Math.abs(velocity.y)
      ? (velocity.x > 0 ? 'right' : 'left') : (velocity.y > 0 ? 'down' : 'up');
    moveWithCollisions(this, velocity.x * this.config.speed * dt, velocity.y * this.config.speed * dt, map);
    this.moving = Math.hypot(this.x - oldX, this.y - oldY) > 0.00001;
    this.animator.update(this.direction, this.moving, dt);
  }
  aimAt(target) {
    const center = this.center;
    const dx = target.x - center.x, dy = target.y - center.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.00001) return false;
    this.aimDirection = { x: dx / length, y: dy / length }; return true;
  }
  attack(target) {
    if (!this.alive || this.cooldownRemaining > 0 || !this.aimAt(target)) return null;
    this.cooldownRemaining = this.config.attack.cooldown;
    return new Projectile(this, this.aimDirection, this.config.attack);
  }
  takeDamage(amount) {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return 0;
    const actualDamage = Math.min(this.health, amount);
    this.health -= actualDamage; this.hitFlash = 0.12;
    if (this.health === 0) {
      this.alive = false; this.moving = false;
      this.respawnRemaining = this.config.respawnDelay; this.superCharge = 0;
      this.animator.update(this.direction, false, 0);
    }
    return actualDamage;
  }
  chargeSuper(actualDamage) {
    if (!this.alive || actualDamage <= 0) return;
    this.superCharge = Math.min(100, this.superCharge + actualDamage / this.config.super.damageRequired * 100);
  }
  draw(ctx) {
    const color = this.team === 0 ? '#73e3c0' : '#ff8c86';
    const center = this.center;
    if (!this.alive) {
      ctx.strokeStyle = color; ctx.setLineDash([4, 4]);
      ctx.strokeRect(this.spawn.x, this.spawn.y, this.width, this.height); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = '13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`Возрождение: ${this.respawnRemaining.toFixed(1)} с`, this.spawn.x + this.width / 2, this.spawn.y - 12);
      return;
    }
    // The visible image fits inside the hitbox without stretching.
    ctx.fillStyle = '#10202a'; ctx.beginPath();
    ctx.ellipse(center.x, this.y + this.height - 3, this.width / 2, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.globalAlpha = 0.5;
    ctx.strokeRect(this.x, this.y, this.width, this.height); ctx.globalAlpha = 1;
    const frame = this.animator.frame();
    if (this.image) {
      const source = frame || characterImages[this.characterIndex];
      const scale = Math.min(this.width / source.width, this.height / source.height);
      const width = source.width * scale, height = source.height * scale;
      ctx.drawImage(this.image, source.x, source.y, source.width, source.height,
        center.x - width / 2, this.y + this.height - height, width, height);
    } else {
      const bob = this.moving ? Math.sin(this.animator.elapsed * this.animator.config.fps * Math.PI) * 2 : 0;
      ctx.fillStyle = color; ctx.fillRect(this.x + 2, this.y + 2 + bob, this.width - 4, this.height - 4);
    }
    const offsets = { up: [this.width / 2, -4], down: [this.width / 2, this.height + 4], left: [-4, this.height / 2], right: [this.width + 4, this.height / 2] };
    const [x, y] = offsets[this.direction]; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(this.x + x, this.y + y, 3, 0, Math.PI * 2); ctx.fill();
    if (this.hitFlash > 0) {
      ctx.fillStyle = 'rgba(255, 100, 100, 0.3)'; ctx.fillRect(this.x, this.y, this.width, this.height);
    }
    ctx.fillStyle = '#101722'; ctx.fillRect(this.x - 3, this.y - 12, this.width + 6, 6);
    ctx.fillStyle = color; ctx.fillRect(this.x - 3, this.y - 12, (this.width + 6) * this.health / this.maxHealth, 6);
    ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    const label = `${characterImages[this.characterIndex].name}${this.isHuman ? ' · вы' : ''}`;
    ctx.fillText(label, center.x, this.y - 20);
  }
}
