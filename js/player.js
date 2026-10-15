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
  get maxAmmo() { return this.config.attack.ammo; }
  get reloadProgress() { return this.ammo < this.maxAmmo ? this.reloadElapsed / this.config.attack.reload : 0; }
  get center() { return { x: this.x + this.width / 2, y: this.y + this.height / 2 }; }
  reset({ preserveSuper = false } = {}) {
    const charge = preserveSuper ? (this.superCharge || 0) : 0;
    this.lifeId = (this.lifeId || 0) + 1;
    this.x = this.spawn.x; this.y = this.spawn.y;
    this.health = this.maxHealth; this.alive = true;
    this.direction = 'down'; this.moving = false;
    this.cooldownRemaining = 0; this.respawnRemaining = 0;
    this.ammo = this.maxAmmo; this.reloadElapsed = 0;
    this.superCharge = charge; this.hitFlash = 0; this.superGainFlash = 0; this.superGainAmount = 0;
    this.quietTime = 0; this.passiveHealing = false;
    this.buffs = {};
    this.aimDirection = { x: this.team === 0 ? 1 : -1, y: 0 };
    this.animator.update(this.direction, false, 0);
  }
  // Returns true on revival, so keys pressed while dead can be discarded.
  updateTimers(dt) {
    if (!Number.isFinite(dt) || dt < 0) return false;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.superGainFlash = Math.max(0, this.superGainFlash - dt);
    if (!this.superGainFlash) this.superGainAmount = 0;
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    for (const [kind, buff] of Object.entries(this.buffs)) {
      if (kind === 'regen' && this.alive) this.heal(buff.rate * Math.min(dt, buff.remaining));
      buff.remaining = Math.max(0, buff.remaining - dt);
      if (buff.remaining === 0) delete this.buffs[kind];
    }
    this.passiveHealing = false;
    if (this.alive) {
      const recovery = this.config.recovery || characterConfig.recovery;
      this.quietTime += dt;
      const healingTime = Math.max(0, Math.min(dt, this.quietTime - recovery.delay));
      if (healingTime > 0 && this.health < this.maxHealth) {
        this.passiveHealing = this.heal(this.maxHealth * recovery.rate * healingTime) > 0;
      }
      // Restore one charge at a time. Shooting does not restart an in-progress refill.
      if (this.ammo < this.maxAmmo) {
        const elapsed = this.reloadElapsed + dt;
        const restored = Math.floor((elapsed + 1e-9) / this.config.attack.reload);
        this.ammo = Math.min(this.maxAmmo, this.ammo + restored);
        this.reloadElapsed = this.ammo === this.maxAmmo ? 0 : Math.max(0, elapsed - restored * this.config.attack.reload);
      }
      return false;
    }
    this.respawnRemaining = Math.max(0, this.respawnRemaining - dt);
    if (this.respawnRemaining === 0) { this.reset({ preserveSuper: true }); return true; }
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
    if (!this.alive || this.ammo <= 0 || this.cooldownRemaining > 0 || !this.aimAt(target)) return null;
    this.ammo--; this.interruptRecovery();
    this.cooldownRemaining = this.config.attack.cooldown;
    const attack = this.config.attack, count = Math.max(1, attack.count || 1);
    const angle = Math.atan2(this.aimDirection.y, this.aimDirection.x), shots = [];
    for (let index = 0; index < count; index++) {
      const offset = attack.kind === 'scatter' ? (index - (count - 1) / 2) * attack.spread : 0;
      shots.push(new Projectile(this, { x: Math.cos(angle + offset), y: Math.sin(angle + offset) }, {
        ...attack, delay: attack.kind === 'burst' ? index * attack.interval : 0,
        damage: attack.damage * (this.buffs.damage?.multiplier ?? 1)
      }));
    }
    if (shots.length > 1) shots[0].companions = shots.slice(1);
    return shots[0];
  }
  takeDamage(amount) {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return 0;
    const reduction = Math.max(this.buffs.shield?.reduction ?? 0, this.buffs.superShield?.reduction ?? 0);
    const actualDamage = Math.min(this.health, amount * (1 - reduction));
    this.health -= actualDamage; this.hitFlash = 0.12;
    this.interruptRecovery();
    if (this.health === 0) {
      this.alive = false; this.moving = false;
      this.respawnRemaining = this.config.respawnDelay;
      this.buffs = {};
      this.animator.update(this.direction, false, 0);
    }
    return actualDamage;
  }
  interruptRecovery() { this.quietTime = 0; this.passiveHealing = false; }
  chargeSuper(actualDamage) {
    if (!this.alive || !Number.isFinite(actualDamage) || actualDamage <= 0) return;
    const before = this.superCharge;
    this.superCharge = Math.min(100, this.superCharge + actualDamage / this.config.super.damageRequired * 100);
    const gained = this.superCharge - before;
    if (gained > 0) { this.superGainAmount += gained; this.superGainFlash = 0.8; }
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
    this.superCharge = 0; this.superGainFlash = 0; this.superGainAmount = 0; this.interruptRecovery();
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
        if (actor.alive && actor.team === this.team && Math.hypot(actor.center.x - center.x, actor.center.y - center.y) <= settings.radius) {
          actor.heal(settings.heal);
          if (settings.regen) actor.buffs.regen = { remaining: settings.duration, rate: settings.regen };
        }
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
    world.emit({ type: 'ability', actorId: this.id, team: this.team, x: center.x, y: center.y, kind: settings.kind, characterId: this.config.id, dx: this.aimDirection.x, dy: this.aimDirection.y, radius: settings.radius || 0 });
    return true;
  }
  drawSuperIndicator(ctx, { local = this.isHuman, localTeam = 0, time = 0, reducedMotion = false } = {}) {
    if (!this.alive || (!local && this.superCharge < 100)) return;
    const ready = this.superCharge >= 100, center = this.center;
    ctx.save(); ctx.translate(center.x, this.y + this.height - 3); ctx.scale(1, 0.42);
    const phase = ready && !reducedMotion ? time * 0.9 : 0;
    ctx.lineWidth = local ? 8 : 5;
    const radius = local ? 38 : 34;
    const active = local ? Math.max(0, Math.min(1, this.superCharge / 100)) : 1;
    for (let i = 0; i < 8; i++) {
      const angle = phase + i * Math.PI / 4, length = Math.PI / 4 - 0.16;
      ctx.strokeStyle = local ? '#313126' : 'rgba(28,36,24,.28)'; ctx.beginPath(); ctx.arc(0, 0, radius, angle, angle + length); ctx.stroke();
      const filled = Math.max(0, Math.min(1, active * 8 - i));
      if (!filled) continue;
      ctx.strokeStyle = local ? '#ffe52b' : this.team === localTeam ? '#64d8f4' : '#ff645c';
      ctx.shadowColor = local ? '#fff16a' : 'transparent'; ctx.shadowBlur = local ? (this.superGainFlash > 0 ? 16 : 7) : 0;
      ctx.beginPath(); ctx.arc(0, 0, radius, angle, angle + length * filled); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    if (local) {
      ctx.save(); ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#252c24'; ctx.fillRect(center.x - 55, this.y + this.height + 12, 110, 25);
      ctx.fillStyle = ready ? '#ffe52b' : '#fff2a1'; ctx.fillRect(center.x - 53, this.y + this.height + 14, 106, 21);
      const text = ready ? 'Q · СУПЕР' : `Q · ${Math.floor(this.superCharge)}%`;
      ctx.fillStyle = '#292c20'; ctx.fillText(text, center.x, this.y + this.height + 29);
      if (this.superGainFlash > 0) {
        ctx.font = 'bold 14px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#283126';
        const gain = `+${Math.round(this.superGainAmount)}%`;
        ctx.strokeText(gain, center.x + 78, this.y + this.height + 29); ctx.fillStyle = '#fff76b'; ctx.fillText(gain, center.x + 78, this.y + this.height + 29);
      }
      ctx.restore();
    }
  }
  drawVitals(ctx, { local = this.isHuman, localTeam = 0, nickname = '', view = null } = {}) {
    if (!this.alive) return;
    const margin = local ? 82 : 40;
    const x = view ? Math.max(view.x + margin, Math.min(view.x + view.width - margin, this.center.x)) : this.center.x;
    const top = view ? Math.max(this.y, view.y + (local ? 60 : 34)) : this.y, width = 74;
    ctx.save();
    if (local) {
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = '#243425';
      const name = nickname || characterImages[this.characterIndex].name;
      ctx.strokeText(name, x, top - 43, 160); ctx.fillStyle = '#a5f477'; ctx.fillText(name, x, top - 43, 160);
    }
    const color = local ? '#79dc59' : this.team === localTeam ? '#5ec9ee' : '#ed645d';
    ctx.fillStyle = '#293329'; ctx.fillRect(x - width / 2 - 2, top - 32, width + 4, 14);
    ctx.fillStyle = '#4b5145'; ctx.fillRect(x - width / 2, top - 30, width, 10);
    ctx.fillStyle = color; ctx.fillRect(x - width / 2, top - 30, width * this.health / this.maxHealth, 10);
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 2; ctx.strokeStyle = '#293329';
    const hp = String(Math.ceil(this.health)); ctx.strokeText(hp, x, top - 22); ctx.fillStyle = '#fffdf0'; ctx.fillText(hp, x, top - 22);
    if (local) {
      const gap = 3, slotWidth = (width - gap * (this.maxAmmo - 1)) / this.maxAmmo;
      for (let i = 0; i < this.maxAmmo; i++) {
        const left = x - width / 2 + i * (slotWidth + gap);
        ctx.fillStyle = '#293329'; ctx.fillRect(left - 1, top - 15, slotWidth + 2, 8);
        ctx.fillStyle = '#6a6250'; ctx.fillRect(left, top - 14, slotWidth, 6);
        const fill = i < this.ammo ? 1 : i === this.ammo ? this.reloadProgress : 0;
        ctx.fillStyle = '#f5c455'; ctx.fillRect(left, top - 14, slotWidth * fill, 6);
      }
    }
    if (local && this.passiveHealing) {
      ctx.fillStyle = '#aff68d'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('+', x + width / 2 + 6, top - 20);
    }
    ctx.restore();
  }
  draw(ctx, showLabel = true, options = {}) {
    const color = (options.local ?? this.isHuman) ? '#8be46c' : this.team === (options.localTeam ?? 0) ? '#65bfdf' : '#ed827c';
    const center = this.center;
    if (!this.alive) return;
    this.drawSuperIndicator(ctx, options);
    // The visible image fits inside the hitbox without stretching.
    ctx.fillStyle = 'rgba(48,33,46,.35)'; ctx.beginPath();
    ctx.ellipse(center.x, this.y + this.height - 3, this.width / 2, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = this.isHuman ? 3 : 2;
    ctx.beginPath(); ctx.ellipse(center.x, this.y + this.height - 3, this.width / 2 + 3, 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
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
      ctx.strokeStyle = this.buffs.superShield ? '#ad90be' : '#90bafa'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(center.x, center.y, this.width * 0.7, this.height * 0.65, 0, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    }
    if (this.buffs.regen) {
      ctx.strokeStyle = '#85ac78'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.ellipse(center.x, this.y + this.height, this.width * 0.7, 12, 0, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    }
    if (showLabel) this.drawVitals(ctx, { local: this.isHuman });
  }
}
