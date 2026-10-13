'use strict';

// Все участники используют одну систему движения и боя.
class Player {
  constructor(spawn, config = characterConfig, options = {}) {
    this.spawn = { ...spawn }; this.config = config;
    this.width = config.width; this.height = config.height;
    this.maxHealth = config.maxHealth;
    this.team = options.team ?? 0; this.characterIndex = options.characterIndex ?? 0;
    this.image = null; this.photoFallback = false; this.animator = new SpriteAnimator(config.animation);
    this.reset();
  }
  get center() { return { x: this.x + this.width / 2, y: this.y + this.height / 2 }; }
  reset() {
    this.x = this.spawn.x; this.y = this.spawn.y;
    this.health = this.maxHealth; this.alive = true;
    this.direction = 'down'; this.moving = false;
    this.cooldownRemaining = 0; this.respawnRemaining = 0;
    this.superCharge = 0; this.hitFlash = 0;
    this.buffs = {};
    this.aimDirection = { x: this.team === 0 ? 1 : -1, y: 0 };
    this.animator.update(this.direction, false, 0);
  }
  // Returns true on revival, so keys pressed while dead can be discarded.
  updateTimers(dt) {
    if (!Number.isFinite(dt) || dt < 0) return false;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    for (const [kind, buff] of Object.entries(this.buffs)) {
      buff.remaining = Math.max(0, buff.remaining - dt);
      if (buff.remaining === 0) delete this.buffs[kind];
    }
    if (this.alive) return false;
    this.respawnRemaining = Math.max(0, this.respawnRemaining - dt);
    if (this.respawnRemaining === 0) { this.reset(); return true; }
    return false;
  }
  update(dt, input, map) {
    if (!this.alive || !Number.isFinite(dt) || dt <= 0) return;
    const raw = input.direction() || {};
    const velocity = { x: Number.isFinite(raw.x) ? raw.x : 0, y: Number.isFinite(raw.y) ? raw.y : 0 };
    const magnitude = Math.hypot(velocity.x, velocity.y);
    if (magnitude > 1) { velocity.x /= magnitude; velocity.y /= magnitude; }
    const oldX = this.x, oldY = this.y;
    if (velocity.x || velocity.y) this.direction = Math.abs(velocity.x) > Math.abs(velocity.y)
      ? (velocity.x > 0 ? 'right' : 'left') : (velocity.y > 0 ? 'down' : 'up');
    moveWithCollisions(this, velocity.x * this.config.speed * dt, velocity.y * this.config.speed * dt, map);
    this.moving = Math.hypot(this.x - oldX, this.y - oldY) > 0.00001;
    this.animator.update(this.direction, this.moving, dt);
  }
  aimAt(target) {
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;
    const center = this.center;
    const dx = target.x - center.x, dy = target.y - center.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.00001) return false;
    this.aimDirection = { x: dx / length, y: dy / length }; return true;
  }
  attack(target) {
    if (!this.alive || this.cooldownRemaining > 0 || !this.aimAt(target)) return null;
    this.cooldownRemaining = this.config.attack.cooldown;
    return new Projectile(this, this.aimDirection, { ...this.config.attack,
      damage: this.config.attack.damage * (this.buffs.damage?.multiplier ?? 1) });
  }
  takeDamage(amount) {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return 0;
    const reduction = Math.max(this.buffs.shield?.reduction ?? 0, this.buffs.superShield?.reduction ?? 0);
    const actualDamage = Math.min(this.health, amount * (1 - reduction));
    this.health -= actualDamage; this.hitFlash = 0.12;
    if (this.health === 0) {
      this.alive = false; this.moving = false;
      this.respawnRemaining = this.config.respawnDelay; this.superCharge = 0;
      this.buffs = {};
      this.animator.update(this.direction, false, 0);
    }
    return actualDamage;
  }
  chargeSuper(actualDamage) {
    if (!this.alive || !Number.isFinite(actualDamage) || actualDamage <= 0) return;
    this.superCharge = Math.min(100, this.superCharge + actualDamage / this.config.super.damageRequired * 100);
  }
  heal(amount) {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return 0;
    const restored = Math.min(this.maxHealth - this.health, amount);
    this.health += restored; return restored;
  }
  // World callbacks centralize damage, kills, wall destruction and events.
  useSuper(target, world) {
    if (!this.alive || this.superCharge < 100 || !this.config.super.kind || !world) return false;
    const settings = this.config.super;
    if (settings.kind === 'heavy' || settings.kind === 'fan') {
      if (!this.aimAt(target)) return false;
    }
    this.superCharge = 0;
    const center = this.center;
    if (settings.kind === 'heavy') {
      world.addProjectile(new Projectile(this, this.aimDirection, settings));
    } else if (settings.kind === 'fan') {
      const angle = Math.atan2(this.aimDirection.y, this.aimDirection.x);
      for (let i = 0; i < settings.count; i++) {
        const current = angle + (i - (settings.count - 1) / 2) * settings.spread;
        world.addProjectile(new Projectile(this, { x: Math.cos(current), y: Math.sin(current) }, settings));
      }
    } else if (settings.kind === 'heal') {
      for (const actor of world.actors) {
        if (actor.alive && actor.team === this.team && Math.hypot(actor.center.x - center.x, actor.center.y - center.y) <= settings.radius) actor.heal(settings.heal);
      }
    } else if (settings.kind === 'nova') {
      for (const actor of world.actors) {
        if (actor.alive && actor.team !== this.team && Math.hypot(actor.center.x - center.x, actor.center.y - center.y) <= settings.radius) world.dealDamage(this, actor, settings.damage, false);
      }
      for (const wall of [...world.map.walls]) {
        const nearestX = Math.max(wall.x, Math.min(center.x, wall.x + wall.width));
        const nearestY = Math.max(wall.y, Math.min(center.y, wall.y + wall.height));
        if (wall.destructible && Math.hypot(nearestX - center.x, nearestY - center.y) <= settings.radius) world.damageWall(wall, wall.health, this);
      }
    } else if (settings.kind === 'shield') {
      this.buffs.superShield = { remaining: settings.duration, reduction: settings.reduction };
    }
    world.emit({ type: 'ability', actorId: this.id, team: this.team, x: center.x, y: center.y, kind: settings.kind, radius: settings.radius || 0 });
    return true;
  }
  draw(ctx, showLabel = true) {
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
      let source = this.photoFallback ? characterImages[this.characterIndex] : (frame || characterImages[this.characterIndex]);
      let frameSize = null;
      // Generated sheets can have any resolution: rows/columns remain 4 × 4.
      if (!this.photoFallback && frame && this.config.id) {
        const column = Math.round(frame.x / frame.width), row = Math.round(frame.y / frame.height);
        const manifest = typeof spriteManifest !== 'undefined' ? spriteManifest[this.config.id] : null;
        if (manifest?.frames?.[row * 4 + column] && manifest.frameSize) {
          source = manifest.frames[row * 4 + column]; frameSize = manifest.frameSize;
        } else {
          const cellWidth = this.image.naturalWidth / 4, cellHeight = this.image.naturalHeight / 4;
          source = { x: column * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight };
        }
      }
      const scale = Math.min(this.width / (frameSize?.width || source.width), this.height / (frameSize?.height || source.height));
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
    if (this.buffs.shield || this.buffs.superShield) {
      ctx.strokeStyle = '#90bafa'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(center.x, center.y, this.width * 0.7, this.height * 0.65, 0, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    }
    ctx.fillStyle = '#101722'; ctx.fillRect(this.x - 3, this.y - 12, this.width + 6, 6);
    ctx.fillStyle = color; ctx.fillRect(this.x - 3, this.y - 12, (this.width + 6) * this.health / this.maxHealth, 6);
    ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    const label = `${characterImages[this.characterIndex].name}${this.isHuman ? ' · вы' : ''}`;
    if (showLabel) ctx.fillText(label, center.x, this.y - 20);
  }
}
