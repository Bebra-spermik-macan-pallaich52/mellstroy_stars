'use strict';
class Player {
  constructor(spawn, config = characterConfig, options = {}) {
    this.spawn = {
      ...spawn
    };
    this.config = config;
    this.width = config.width;
    this.height = config.height;
    this.maxHealth = config.maxHealth;
    this.team = options.team ?? 0;
    this.characterIndex = options.characterIndex ?? 0;
    this.image = null;
    this.photoFallback = false;
    this.animator = new SpriteAnimator(config.animation);
    this.reset();
  }
  get maxAmmo() {
    return this.config.attack.ammo;
  }
  get reloadProgress() {
    if (this.ammo < this.maxAmmo) {
      return this.reloadElapsed / this.config.attack.reload;
    } else {
      return 0;
    }
  }
  get center() {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2
    };
  }
  reset({ preserveSuper = false } = {}) {
    const charge = preserveSuper ? this.superCharge || 0 : 0;
    this.lifeId = (this.lifeId || 0) + 1;
    this.x = this.spawn.x;
    this.y = this.spawn.y;
    this.health = this.maxHealth;
    this.alive = true;
    this.direction = 'down';
    this.moving = false;
    this.cooldownRemaining = 0;
    this.respawnRemaining = 0;
    this.ammo = this.maxAmmo;
    this.reloadElapsed = 0;
    this.superCharge = charge;
    this.hitFlash = 0;
    this.superGainFlash = 0;
    this.superGainAmount = 0;
    this.quietTime = 0;
    this.passiveHealing = false;
    this.buffs = {};
    this.aimDirection = {
      x: this.team === 0 ? 1 : -1,
      y: 0
    };
    this.animator.update(this.direction, false, 0);
  }
  updateTimers(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      return false;
    }
    this.hitFlash = Math.max(0, this.hitFlash - deltaTime);
    this.superGainFlash = Math.max(0, this.superGainFlash - deltaTime);
    if (!this.superGainFlash) {
      this.superGainAmount = 0;
    }
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaTime);
    for (const [kind, buff] of Object.entries(this.buffs)) {
      if (kind === 'regen' && this.alive) {
        this.heal(buff.rate * Math.min(deltaTime, buff.remaining));
      }
      buff.remaining = Math.max(0, buff.remaining - deltaTime);
      if (buff.remaining === 0) {
        delete this.buffs[kind];
      }
    }
    this.passiveHealing = false;
    if (this.alive) {
      const recovery = this.config.recovery || characterConfig.recovery;
      this.quietTime += deltaTime;
      const healingTime = Math.max(0, Math.min(deltaTime, this.quietTime - recovery.delay));
      if (healingTime > 0 && this.health < this.maxHealth) {
        this.passiveHealing = this.heal(this.maxHealth * recovery.rate * healingTime) > 0;
      }
      if (this.ammo < this.maxAmmo) {
        const elapsed = this.reloadElapsed + deltaTime;
        const restored = Math.floor((elapsed + 1e-9) / this.config.attack.reload);
        this.ammo = Math.min(this.maxAmmo, this.ammo + restored);
        this.reloadElapsed =
          this.ammo === this.maxAmmo
            ? 0
            : Math.max(0, elapsed - restored * this.config.attack.reload);
      }
      return false;
    }
    this.respawnRemaining = Math.max(0, this.respawnRemaining - deltaTime);
    if (this.respawnRemaining === 0) {
      this.reset({
        preserveSuper: true
      });
      return true;
    }
    return false;
  }
  update(deltaTime, input, map) {
    if (!this.alive || !Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }
    const raw = input.direction() || {};
    const velocity = {
      x: Number.isFinite(raw.x) ? raw.x : 0,
      y: Number.isFinite(raw.y) ? raw.y : 0
    };
    const magnitude = Math.hypot(velocity.x, velocity.y);
    if (magnitude > 1) {
      velocity.x /= magnitude;
      velocity.y /= magnitude;
    }
    const oldX = this.x;
    const oldY = this.y;
    if (velocity.x !== 0 || velocity.y !== 0) {
      if (Math.abs(velocity.x) > Math.abs(velocity.y)) {
        if (velocity.x > 0) {
          this.direction = 'right';
        } else {
          this.direction = 'left';
        }
      } else if (velocity.y > 0) {
        this.direction = 'down';
      } else {
        this.direction = 'up';
      }
    }
    const movementMultiplier = this.buffs.slow?.factor ?? 1;
    moveWithCollisions(
      this,
      velocity.x * this.config.speed * movementMultiplier * deltaTime,
      velocity.y * this.config.speed * movementMultiplier * deltaTime,
      map
    );
    this.moving = Math.hypot(this.x - oldX, this.y - oldY) > 0.00001;
    this.animator.update(this.direction, this.moving, deltaTime);
  }
  aimAt(target) {
    if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      return false;
    }
    const center = this.center;
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.00001) {
      return false;
    }
    this.aimDirection = {
      x: dx / length,
      y: dy / length
    };
    return true;
  }
  attack(target) {
    if (!this.alive || this.ammo <= 0 || this.cooldownRemaining > 0 || !this.aimAt(target)) {
      return null;
    }
    this.ammo--;
    this.interruptRecovery();
    this.cooldownRemaining = this.config.attack.cooldown;
    const attack = this.config.attack;
    const count = Math.max(1, attack.count || 1);
    const angle = Math.atan2(this.aimDirection.y, this.aimDirection.x);
    const shots = [];
    for (let index = 0; index < count; index++) {
      const offset = attack.kind === 'scatter' ? (index - (count - 1) / 2) * attack.spread : 0;
      shots.push(
        new Projectile(
          this,
          {
            x: Math.cos(angle + offset),
            y: Math.sin(angle + offset)
          },
          {
            ...attack,
            delay: attack.kind === 'burst' ? index * attack.interval : 0,
            damage:
              attack.damage *
              Math.max(this.buffs.damage?.multiplier ?? 1, this.buffs.restock?.multiplier ?? 1)
          }
        )
      );
    }
    if (shots.length > 1) {
      shots[0].companions = shots.slice(1);
    }
    return shots[0];
  }
  takeDamage(amount) {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) {
      return 0;
    }
    const reduction = Math.max(
      this.buffs.shield?.reduction ?? 0,
      this.buffs.superShield?.reduction ?? 0
    );
    const actualDamage = Math.min(this.health, amount * (1 - reduction));
    this.health -= actualDamage;
    this.hitFlash = 0.12;
    this.interruptRecovery();
    if (this.health === 0) {
      this.alive = false;
      this.moving = false;
      this.respawnRemaining = this.config.respawnDelay;
      this.buffs = {};
      this.animator.update(this.direction, false, 0);
    }
    return actualDamage;
  }
  interruptRecovery() {
    this.quietTime = 0;
    this.passiveHealing = false;
  }
  chargeSuper(actualDamage) {
    if (!this.alive || !Number.isFinite(actualDamage) || actualDamage <= 0) {
      return;
    }
    const before = this.superCharge;
    this.superCharge = Math.min(
      100,
      this.superCharge + (actualDamage / this.config.super.damageRequired) * 100
    );
    const gained = this.superCharge - before;
    if (gained > 0) {
      this.superGainAmount += gained;
      this.superGainFlash = 0.8;
    }
  }
  heal(amount) {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) {
      return 0;
    }
    const restored = Math.min(this.maxHealth - this.health, amount);
    this.health += restored;
    return restored;
  }
  useSuper(target, world) {
    if (!this.alive || this.superCharge < 100 || !this.config.super.kind || !world) {
      return false;
    }
    const settings = this.config.super;
    if (['heavy', 'fan', 'wave'].includes(settings.kind)) {
      if (!this.aimAt(target)) {
        return false;
      }
    }
    this.superCharge = 0;
    this.superGainFlash = 0;
    this.superGainAmount = 0;
    this.interruptRecovery();
    const center = this.center;
    if (settings.kind === 'heavy') {
      world.addProjectile(new Projectile(this, this.aimDirection, settings));
    } else if (settings.kind === 'fan' || settings.kind === 'wave' || settings.kind === 'shatter') {
      const angle = Math.atan2(this.aimDirection.y, this.aimDirection.x);
      for (let i = 0; i < settings.count; i++) {
        const current =
          settings.kind === 'shatter'
            ? (i * Math.PI * 2) / settings.count
            : angle + (i - (settings.count - 1) / 2) * settings.spread;
        world.addProjectile(
          new Projectile(
            this,
            {
              x: Math.cos(current),
              y: Math.sin(current)
            },
            settings
          )
        );
      }
    } else if (settings.kind === 'restock') {
      this.ammo = this.maxAmmo;
      this.reloadElapsed = 0;
      this.buffs.restock = {
        multiplier: settings.multiplier,
        remaining: settings.duration
      };
    } else if (settings.kind === 'heal') {
      for (const actor of world.actors) {
        if (
          actor.alive &&
          actor.team === this.team &&
          Math.hypot(actor.center.x - center.x, actor.center.y - center.y) <= settings.radius
        ) {
          actor.heal(settings.heal);
          if (settings.regen) {
            actor.buffs.regen = {
              remaining: settings.duration,
              rate: settings.regen
            };
          }
        }
      }
    } else if (settings.kind === 'nova') {
      for (const actor of world.actors) {
        if (
          actor.alive &&
          actor.team !== this.team &&
          Math.hypot(actor.center.x - center.x, actor.center.y - center.y) <= settings.radius
        ) {
          world.dealDamage(this, actor, settings.damage, false);
        }
      }
      for (const wall of [...world.map.walls]) {
        const nearestX = Math.max(wall.x, Math.min(center.x, wall.x + wall.width));
        const nearestY = Math.max(wall.y, Math.min(center.y, wall.y + wall.height));
        if (
          wall.destructible &&
          Math.hypot(nearestX - center.x, nearestY - center.y) <= settings.radius
        ) {
          world.damageWall(wall, wall.health, this);
        }
      }
    } else if (settings.kind === 'shield') {
      this.buffs.superShield = {
        remaining: settings.duration,
        reduction: settings.reduction
      };
    }
    world.emit({
      type: 'ability',
      actorId: this.id,
      team: this.team,
      x: center.x,
      y: center.y,
      kind: settings.kind,
      characterId: this.config.id,
      dx: this.aimDirection.x,
      dy: this.aimDirection.y,
      radius: settings.radius || 0
    });
    return true;
  }
  drawSuperIndicator(
    canvasContext,
    { local = this.isHuman, localTeam = 0, time = 0, reducedMotion = false } = {}
  ) {
    if (!this.alive || (!local && this.superCharge < 100)) {
      return;
    }
    const ready = this.superCharge >= 100;
    const center = this.center;
    canvasContext.save();
    canvasContext.translate(center.x, this.y + this.height - 3);
    canvasContext.scale(1, 0.42);
    const phase = ready && !reducedMotion ? time * 0.9 : 0;
    canvasContext.lineWidth = local ? 8 : 5;
    const radius = local ? 38 : 34;
    const active = local ? Math.max(0, Math.min(1, this.superCharge / 100)) : 1;
    for (let i = 0; i < 8; i++) {
      const angle = phase + (i * Math.PI) / 4;
      const length = Math.PI / 4 - 0.16;
      canvasContext.strokeStyle = local ? '#313126' : 'rgba(28,36,24,.28)';
      canvasContext.beginPath();
      canvasContext.arc(0, 0, radius, angle, angle + length);
      canvasContext.stroke();
      const filled = Math.max(0, Math.min(1, active * 8 - i));
      if (!filled) {
        continue;
      }
      canvasContext.strokeStyle = local
        ? '#ffe52b'
        : this.team === localTeam
          ? '#64d8f4'
          : '#ff645c';
      canvasContext.shadowColor = local ? '#fff16a' : 'transparent';
      canvasContext.shadowBlur = local ? (this.superGainFlash > 0 ? 16 : 7) : 0;
      canvasContext.beginPath();
      canvasContext.arc(0, 0, radius, angle, angle + length * filled);
      canvasContext.stroke();
      canvasContext.shadowBlur = 0;
    }
    canvasContext.restore();
    if (local) {
      canvasContext.save();
      canvasContext.font = 'bold 14px sans-serif';
      canvasContext.textAlign = 'center';
      canvasContext.fillStyle = '#252c24';
      canvasContext.fillRect(center.x - 55, this.y + this.height + 12, 110, 25);
      canvasContext.fillStyle = ready ? '#ffe52b' : '#fff2a1';
      canvasContext.fillRect(center.x - 53, this.y + this.height + 14, 106, 21);
      const text = ready ? 'Q · СУПЕР' : `Q · ${Math.floor(this.superCharge)}%`;
      canvasContext.fillStyle = '#292c20';
      canvasContext.fillText(text, center.x, this.y + this.height + 29);
      if (this.superGainFlash > 0) {
        canvasContext.font = 'bold 14px sans-serif';
        canvasContext.lineWidth = 3;
        canvasContext.strokeStyle = '#283126';
        const gain = `+${Math.round(this.superGainAmount)}%`;
        canvasContext.strokeText(gain, center.x + 78, this.y + this.height + 29);
        canvasContext.fillStyle = '#fff76b';
        canvasContext.fillText(gain, center.x + 78, this.y + this.height + 29);
      }
      canvasContext.restore();
    }
  }
  drawVitals(
    canvasContext,
    { local = this.isHuman, localTeam = 0, nickname = '', view = null } = {}
  ) {
    if (!this.alive) {
      return;
    }
    const margin = local ? 82 : 40;
    const x = view
      ? Math.max(view.x + margin, Math.min(view.x + view.width - margin, this.center.x))
      : this.center.x;
    const top = view ? Math.max(this.y, view.y + (local ? 60 : 34)) : this.y;
    const width = 74;
    canvasContext.save();
    if (local) {
      canvasContext.font = 'bold 13px sans-serif';
      canvasContext.textAlign = 'center';
      canvasContext.lineWidth = 3;
      canvasContext.lineJoin = 'round';
      canvasContext.strokeStyle = '#243425';
      const name = nickname || characterImages[this.characterIndex].name;
      canvasContext.strokeText(name, x, top - 43, 160);
      canvasContext.fillStyle = '#a5f477';
      canvasContext.fillText(name, x, top - 43, 160);
    }
    const color = local ? '#79dc59' : this.team === localTeam ? '#5ec9ee' : '#ed645d';
    canvasContext.fillStyle = '#293329';
    canvasContext.fillRect(x - width / 2 - 2, top - 32, width + 4, 14);
    canvasContext.fillStyle = '#4b5145';
    canvasContext.fillRect(x - width / 2, top - 30, width, 10);
    canvasContext.fillStyle = color;
    canvasContext.fillRect(x - width / 2, top - 30, (width * this.health) / this.maxHealth, 10);
    canvasContext.font = 'bold 10px sans-serif';
    canvasContext.textAlign = 'center';
    canvasContext.lineWidth = 2;
    canvasContext.strokeStyle = '#293329';
    const hp = String(Math.ceil(this.health));
    canvasContext.strokeText(hp, x, top - 22);
    canvasContext.fillStyle = '#fffdf0';
    canvasContext.fillText(hp, x, top - 22);
    if (local) {
      const gap = 3;
      const slotWidth = (width - gap * (this.maxAmmo - 1)) / this.maxAmmo;
      for (let i = 0; i < this.maxAmmo; i++) {
        const left = x - width / 2 + i * (slotWidth + gap);
        canvasContext.fillStyle = '#293329';
        canvasContext.fillRect(left - 1, top - 15, slotWidth + 2, 8);
        canvasContext.fillStyle = '#6a6250';
        canvasContext.fillRect(left, top - 14, slotWidth, 6);
        const fill = i < this.ammo ? 1 : i === this.ammo ? this.reloadProgress : 0;
        canvasContext.fillStyle = '#f5c455';
        canvasContext.fillRect(left, top - 14, slotWidth * fill, 6);
      }
    }
    if (local && this.passiveHealing) {
      canvasContext.fillStyle = '#aff68d';
      canvasContext.font = 'bold 16px sans-serif';
      canvasContext.textAlign = 'left';
      canvasContext.fillText('+', x + width / 2 + 6, top - 20);
    }
    canvasContext.restore();
  }
  draw(canvasContext, showLabel = true, options = {}) {
    const color =
      (options.local ?? this.isHuman)
        ? '#8be46c'
        : this.team === (options.localTeam ?? 0)
          ? '#65bfdf'
          : '#ed827c';
    const center = this.center;
    if (!this.alive) {
      return;
    }
    this.drawSuperIndicator(canvasContext, options);
    canvasContext.fillStyle = 'rgba(48,33,46,.35)';
    canvasContext.beginPath();
    canvasContext.ellipse(center.x, this.y + this.height - 3, this.width / 2, 7, 0, 0, Math.PI * 2);
    canvasContext.fill();
    canvasContext.strokeStyle = color;
    canvasContext.lineWidth = this.isHuman ? 3 : 2;
    canvasContext.beginPath();
    canvasContext.ellipse(
      center.x,
      this.y + this.height - 3,
      this.width / 2 + 3,
      9,
      0,
      0,
      Math.PI * 2
    );
    canvasContext.stroke();
    canvasContext.lineWidth = 1;
    const frame = this.animator.frame();
    if (this.image) {
      let source = this.photoFallback
        ? characterImages[this.characterIndex]
        : frame || characterImages[this.characterIndex];
      let frameSize = null;
      if (!this.photoFallback && frame && this.config.id) {
        const column = Math.round(frame.x / frame.width);
        const row = Math.round(frame.y / frame.height);
        const manifest =
          typeof spriteManifest !== 'undefined' ? spriteManifest[this.config.id] : null;
        if (manifest?.frames?.[row * 4 + column] && manifest.frameSize) {
          source = manifest.frames[row * 4 + column];
          frameSize = manifest.frameSize;
        } else {
          const cellWidth = this.image.naturalWidth / 4;
          const cellHeight = this.image.naturalHeight / 4;
          source = {
            x: column * cellWidth,
            y: row * cellHeight,
            width: cellWidth,
            height: cellHeight
          };
        }
      }
      const scale = Math.min(
        this.width / (frameSize?.width || source.width),
        this.height / (frameSize?.height || source.height)
      );
      const width = source.width * scale;
      const height = source.height * scale;
      canvasContext.drawImage(
        this.image,
        source.x,
        source.y,
        source.width,
        source.height,
        center.x - width / 2,
        this.y + this.height - height,
        width,
        height
      );
    } else {
      const bob = this.moving
        ? Math.sin(this.animator.elapsed * this.animator.config.fps * Math.PI) * 2
        : 0;
      canvasContext.fillStyle = color;
      canvasContext.fillRect(this.x + 2, this.y + 2 + bob, this.width - 4, this.height - 4);
    }
    const offsets = {
      up: [this.width / 2, -4],
      down: [this.width / 2, this.height + 4],
      left: [-4, this.height / 2],
      right: [this.width + 4, this.height / 2]
    };
    const [x, y] = offsets[this.direction];
    canvasContext.fillStyle = color;
    canvasContext.beginPath();
    canvasContext.arc(this.x + x, this.y + y, 3, 0, Math.PI * 2);
    canvasContext.fill();
    if (this.hitFlash > 0) {
      canvasContext.fillStyle = 'rgba(255, 100, 100, 0.3)';
      canvasContext.fillRect(this.x, this.y, this.width, this.height);
    }
    if (this.buffs.shield || this.buffs.superShield) {
      canvasContext.strokeStyle = this.buffs.superShield ? '#ad90be' : '#90bafa';
      canvasContext.lineWidth = 3;
      canvasContext.beginPath();
      canvasContext.ellipse(
        center.x,
        center.y,
        this.width * 0.7,
        this.height * 0.65,
        0,
        0,
        Math.PI * 2
      );
      canvasContext.stroke();
      canvasContext.lineWidth = 1;
    }
    if (this.buffs.regen) {
      canvasContext.strokeStyle = '#85ac78';
      canvasContext.lineWidth = 2;
      canvasContext.beginPath();
      canvasContext.ellipse(
        center.x,
        this.y + this.height,
        this.width * 0.7,
        12,
        0,
        0,
        Math.PI * 2
      );
      canvasContext.stroke();
      canvasContext.lineWidth = 1;
    }
    if (this.buffs.slow) {
      canvasContext.strokeStyle = '#bcefff';
      canvasContext.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        canvasContext.beginPath();
        canvasContext.arc(center.x + i * 14, this.y + this.height - 4, 5, 0, Math.PI * 2);
        canvasContext.stroke();
      }
    }
    if (this.buffs.restock) {
      canvasContext.strokeStyle = '#f2a43f';
      canvasContext.lineWidth = 2;
      canvasContext.beginPath();
      canvasContext.ellipse(
        center.x,
        center.y,
        this.width * 0.65,
        this.height * 0.6,
        0,
        0,
        Math.PI * 2
      );
      canvasContext.stroke();
    }
    if (showLabel) {
      this.drawVitals(canvasContext, {
        local: this.isHuman
      });
    }
  }
}
