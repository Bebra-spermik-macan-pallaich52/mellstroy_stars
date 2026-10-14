'use strict';

// Local game rules. No canvas, audio, storage, or page state is required.
class Simulation {
  constructor({ modeId = 'donations', mapId = 'arena', characterIndex = 0, characterIndices,
    humanSlots = [0], botFire = true, enhancements = true, seed = 1, modeOverrides = {} } = {}) {
    this.map = createMap(mapId); this.mapId = this.map.id; this.modeId = modeId;
    this.elapsed = 0; this.botFire = botFire; this.enhancements = enhancements;
    this.randomState = (Number.isFinite(seed) ? seed : 1) >>> 0;
    this.events = []; this.projectiles = []; this.pendingShots = []; this.powerups = [];
    this.powerupElapsed = 0; this.powerupId = 0;
    this.humanSlots = new Set(humanSlots.filter(id => Number.isInteger(id) && id >= 0 && id < 6));
    const choices = characterIndices || [characterIndex, 1, 2, 3, 4, 1];
    this.actors = this.map.teamSpawns.flatMap((spawns, team) => spawns.map((spawn, offset) => {
      const id = team * 3 + offset;
      const choice = Number.isInteger(choices[id]) && choices[id] >= 0 && choices[id] < characterDefinitions.length ? choices[id] : 0;
      const actor = new Player(spawn, getCharacterConfig(choice), { team, characterIndex: choice });
      actor.id = id; actor.isHuman = this.humanSlots.has(id); return actor;
    }));
    this.bots = this.actors.filter(actor => !actor.isHuman).map(actor => new Bot(actor, actor.id));
    this.manager = new GameManager(modeId, this.map, this.actors, modeOverrides);
    const simulation = this;
    this.world = {
      get projectiles() { return simulation.projectiles; },
      get powerups() { return simulation.powerups; },
      map: this.map, actors: this.actors, bots: this.bots, manager: this.manager,
      emit: event => this.emit(event), addProjectile: projectile => this.addProjectile(projectile),
      dealDamage: (owner, target, amount, charge = true) => this.dealDamage(owner, target, amount, charge),
      damageWall: (wall, amount, owner) => this.damageWall(wall, amount, owner)
    };
  }
  emit(event) {
    if (this.events.length >= 256) this.events.shift();
    this.events.push(event);
  }
  drainEvents() { const events = this.events; this.events = []; return events; }
  addProjectile(projectile) {
    if (!projectile) return;
    for (const shot of [projectile, ...(projectile.companions || [])]) {
      if (!shot.active || this.projectiles.length + this.pendingShots.length >= 160) continue;
      if (shot.delay > 0) this.pendingShots.push({ projectile: shot, remaining: shot.delay });
      else this.activateProjectile(shot);
    }
  }
  activateProjectile(projectile) {
    this.projectiles.push(projectile);
    this.emit({ type: 'shot', actorId: projectile.owner.id, team: projectile.owner.team,
      characterId: projectile.characterId, style: projectile.style,
      x: projectile.x, y: projectile.y, dx: projectile.direction.x, dy: projectile.direction.y });
  }
  updatePendingShots(dt) {
    this.pendingShots = this.pendingShots.filter(entry => {
      const shot = entry.projectile;
      if (!shot.owner.alive || shot.ownerLife !== shot.owner.lifeId) return false;
      entry.remaining -= dt;
      if (entry.remaining > 1e-9) return true;
      shot.x = shot.owner.center.x; shot.y = shot.owner.center.y;
      this.activateProjectile(shot); return false;
    });
  }
  explode(projectile) {
    if (projectile.exploded) return;
    projectile.exploded = true;
    const walls = [...this.map.walls], radius = projectile.blastRadius;
    const blocked = (x, y, ignored = null) => walls.some(wall => wall !== ignored &&
      segmentRectIntersection(projectile.x, projectile.y, x, y, wall) !== null);
    for (const actor of this.actors) {
      if (!actor.alive || actor.team === projectile.owner.team) continue;
      const x = Math.max(actor.x, Math.min(projectile.x, actor.x + actor.width));
      const y = Math.max(actor.y, Math.min(projectile.y, actor.y + actor.height));
      if (Math.hypot(x - projectile.x, y - projectile.y) <= radius && !blocked(actor.center.x, actor.center.y)) {
        this.dealDamage(projectile.owner, actor, projectile.damage);
      }
    }
    for (const wall of walls) {
      if (!wall.destructible) continue;
      const x = Math.max(wall.x, Math.min(projectile.x, wall.x + wall.width));
      const y = Math.max(wall.y, Math.min(projectile.y, wall.y + wall.height));
      if (Math.hypot(x - projectile.x, y - projectile.y) <= radius && !blocked(x, y, wall)) this.damageWall(wall, projectile.damage, projectile.owner);
    }
    this.emit({ type: 'blast', characterId: projectile.characterId, team: projectile.owner.team,
      x: projectile.x, y: projectile.y, radius });
  }
  dealDamage(owner, target, amount, charge = true) {
    if (this.manager.state !== 'playing' || !target.alive || owner.team === target.team) return 0;
    const damage = target.takeDamage(amount);
    if (charge) owner.chargeSuper(damage);
    if (damage > 0) this.emit({ type: 'hit', actorId: target.id, sourceId: owner.id,
      team: target.team, characterId: owner.config?.id, x: target.center.x, y: target.center.y, damage });
    if (!target.alive) {
      this.manager.onDeath(target, owner);
      this.bots.find(bot => bot.actor === target)?.reset();
      this.emit({ type: 'death', actorId: target.id, sourceId: owner.id,
        team: target.team, x: target.center.x, y: target.center.y });
    }
    return damage;
  }
  damageWall(wall, amount, owner) {
    if (!wall.destructible || !this.map.walls.includes(wall) || !Number.isFinite(amount) || amount <= 0) return false;
    wall.health = Math.max(0, wall.health - amount);
    if (wall.health > 0) return false;
    this.map.walls = this.map.walls.filter(candidate => candidate !== wall);
    this.map.navVersion++;
    this.emit({ type: 'wallDestroyed', id: wall.id, sourceId: owner?.id,
      team: owner?.team, x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 });
    return true;
  }
  random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  freePowerup(x, y, radius) {
    return !this.map.walls.some(wall => {
      const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.width));
      const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.height));
      return (x - closestX) ** 2 + (y - closestY) ** 2 <= radius ** 2;
    }) && !this.powerups.some(item => Math.hypot(item.x - x, item.y - y) < radius * 3);
  }
  spawnPowerup() {
    if (this.powerups.length >= 3) return null;
    const radius = 13, kind = ['heal', 'damage', 'shield'][Math.floor(this.random() * 3)];
    for (let attempt = 0; attempt < 64; attempt++) {
      const x = 170 + this.random() * (this.map.width - 340);
      const y = 60 + this.random() * (this.map.height - 120);
      if (!this.freePowerup(x, y, radius)) continue;
      const item = { id: ++this.powerupId, kind, x, y, radius, remaining: 24 };
      this.powerups.push(item); return item;
    }
    return null;
  }
  updatePowerups(dt) {
    if (!this.enhancements) return;
    this.powerupElapsed += dt;
    if (this.powerupElapsed + 1e-9 >= 12) {
      this.powerupElapsed = Math.max(0, this.powerupElapsed - 12);
      this.spawnPowerup();
    }
    this.powerups = this.powerups.filter(item => {
      item.remaining -= dt;
      if (item.remaining <= 0) return false;
      const collector = this.actors.find(actor => {
        if (!actor.alive) return false;
        const x = Math.max(actor.x, Math.min(item.x, actor.x + actor.width));
        const y = Math.max(actor.y, Math.min(item.y, actor.y + actor.height));
        return (x - item.x) ** 2 + (y - item.y) ** 2 <= item.radius ** 2;
      });
      if (!collector) return true;
      if (item.kind === 'heal') collector.heal(300);
      if (item.kind === 'damage') collector.buffs.damage = { remaining: 8, multiplier: 1.3 };
      if (item.kind === 'shield') collector.buffs.shield = { remaining: 5, reduction: 0.5 };
      this.emit({ type: 'pickup', actorId: collector.id, team: collector.team,
        x: item.x, y: item.y, kind: item.kind });
      return false;
    });
  }
  botSuper(bot) {
    const actor = bot.actor;
    if (!this.botFire || !actor.alive || actor.superCharge < 100) return;
    const enemy = bot.selectEnemy(this.world);
    const kind = actor.config.super.kind;
    if (kind === 'heal') {
      const needsHeal = this.actors.some(ally => ally.alive && ally.team === actor.team &&
        ally.health <= ally.maxHealth - 250 && bot.distance(ally.center, actor.center) <= actor.config.super.radius);
      if (needsHeal) actor.useSuper(actor.center, this.world);
    } else if (kind === 'nova') {
      if (enemy && bot.distance(enemy.center, actor.center) <= actor.config.super.radius) actor.useSuper(enemy.center, this.world);
    } else if (enemy && (kind !== 'shield' || bot.underFire > 0 || bot.distance(enemy.center, actor.center) < actor.config.attack.range * 0.85)) {
      actor.useSuper(bot.aimTarget(enemy, this.map), this.world);
    }
  }
  step(dt, commands = {}) {
    if (!Number.isFinite(dt) || dt <= 0 || this.manager.state !== 'playing') return;
    if (this.manager.remaining <= 0 || this.manager.mode.scores.some(score => score >= this.manager.goal)) {
      this.manager.update(0, this.actors);
      this.emit({ type: 'finish', winner: this.manager.result.winner, reason: this.manager.result.reason,
        x: this.map.width / 2, y: this.map.height / 2 });
      return;
    }
    // Ignore long tab stalls. Substeps keep all timers and collision rules aligned.
    const duration = Math.min(dt, 0.25, this.manager.remaining);
    const steps = Math.max(1, Math.ceil(duration * 120));
    const substep = duration / steps;
    const revivedHumans = new Set();
    for (let iteration = 0; iteration < steps && this.manager.state === 'playing'; iteration++) {
      const delta = Math.min(substep, this.manager.remaining);
      for (const actor of this.actors) {
        if (!actor.updateTimers(delta)) continue;
        this.manager.mode.deathsHandled?.delete(actor);
        this.bots.find(bot => bot.actor === actor)?.reset();
        if (actor.isHuman) revivedHumans.add(actor.id);
        this.emit({ type: 'respawn', actorId: actor.id, team: actor.team, x: actor.center.x, y: actor.center.y });
      }
      this.updatePendingShots(delta);
      for (const id of this.humanSlots) {
        const actor = this.actors[id];
        if (!actor.alive || revivedHumans.has(id)) continue;
        const command = commands?.[id] || {};
        actor.update(delta, { direction: () => ({ x: command.x, y: command.y }) }, this.map);
        const validAim = command.aim && Number.isFinite(command.aim.x) && Number.isFinite(command.aim.y);
        const target = validAim ? command.aim : { x: actor.center.x + actor.aimDirection.x * 100,
          y: actor.center.y + actor.aimDirection.y * 100 };
        if (validAim) actor.aimAt(target);
        if (command.fire === true) this.addProjectile(actor.attack(target));
        if (iteration === 0 && command.super === true) actor.useSuper(target, this.world);
      }
      for (const bot of this.bots) {
        this.addProjectile(bot.update(delta, this.world, this.botFire));
        this.botSuper(bot);
      }
      for (const projectile of this.projectiles) {
        const wasActive = projectile.active;
        const hit = projectile.update(delta, this.map, this.actors);
        if (projectile.blastRadius > 0 && !projectile.active) this.explode(projectile);
        else {
          for (const entry of hit?.hits || (hit?.target ? [hit] : [])) this.dealDamage(entry.owner, entry.target, entry.damage);
          if (hit?.wall) this.damageWall(hit.wall, projectile.damage, projectile.owner);
        }
        for (const point of projectile.ricochets) this.emit({ type: 'ricochet', ...point, characterId: projectile.characterId, team: projectile.owner.team });
        if (wasActive && !projectile.active && !hit?.target && !projectile.blastRadius) this.emit({ type: 'impact',
          team: projectile.owner.team, characterId: projectile.characterId, style: projectile.style,
          x: projectile.x, y: projectile.y, dx: projectile.direction.x, dy: projectile.direction.y });
      }
      this.projectiles = this.projectiles.filter(projectile => projectile.active);
      this.updatePowerups(delta);
      const carried = this.manager.mode.carried;
      const before = carried ? new Map(carried) : null;
      this.manager.update(delta, this.actors);
      if (carried) for (const actor of this.actors) {
        const gain = (carried.get(actor) || 0) - (before.get(actor) || 0);
        if (gain > 0) this.emit({ type: 'pickup', actorId: actor.id, team: actor.team,
          x: actor.center.x, y: actor.center.y, kind: 'donation', amount: gain });
      }
      this.elapsed += delta;
      if (this.manager.state === 'finished') this.emit({ type: 'finish',
        winner: this.manager.result.winner, reason: this.manager.result.reason,
        x: this.map.width / 2, y: this.map.height / 2 });
    }
  }
  drawPowerups(ctx) {
    for (const item of this.powerups) {
      const colors = { heal: '#80e7a1', damage: '#f5b164', shield: '#90bafa' };
      ctx.fillStyle = colors[item.kind]; ctx.strokeStyle = '#eaf1fc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#17242e'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText({ heal: '+', damage: '×', shield: '◇' }[item.kind], item.x, item.y + 5);
    }
    ctx.lineWidth = 1;
  }
}
