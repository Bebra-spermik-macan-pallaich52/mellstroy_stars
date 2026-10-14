'use strict';

class Projectile {
  constructor(owner, direction, settings = {}) {
    this.owner = owner; this.ownerLife = owner.lifeId;
    this.x = owner.x + owner.width / 2; this.y = owner.y + owner.height / 2;
    const length = Math.hypot(direction.x, direction.y);
    this.direction = length > 0 ? { x: direction.x / length, y: direction.y / length } : { x: 0, y: 0 };
    this.speed = settings.speed ?? 560; this.damage = settings.damage ?? 25;
    this.range = settings.range ?? 480; this.radius = settings.radius ?? 4;
    this.style = settings.style || 'bolt'; this.characterId = owner.config?.id || '';
    this.pierceRemaining = Math.max(1, settings.pierce || 1);
    this.bouncesRemaining = Math.max(0, settings.bounces || 0);
    this.blastRadius = settings.blastRadius || 0; this.exploded = false;
    this.delay = settings.delay || 0; this.hitActors = new Set(); this.ricochets = [];
    this.traveled = 0;
    this.active = Number.isFinite(length) && length > 0 && Number.isFinite(this.speed) && this.speed > 0 && Number.isFinite(this.range) && this.range > 0;
  }

  update(dt, map, actors = []) {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return null;
    let remaining = Math.min(this.speed * dt, this.range - this.traveled);
    const hits = []; let damagedWall = null;
    this.ricochets = [];
    // Sweep every segment; ricochets spend the remaining distance in this step.
    for (let iteration = 0; iteration < 4 && this.active && remaining > 1e-8; iteration++) {
      const startX = this.x, startY = this.y;
      const endX = startX + this.direction.x * remaining, endY = startY + this.direction.y * remaining;
      let stop = segmentMapExit(startX, startY, endX, endY, map, this.radius), wallTarget = null;
      for (const wall of map.walls) {
        const time = segmentRectIntersection(startX, startY, endX, endY, wall, this.radius);
        if (time !== null && (stop === null || time < stop)) { stop = time; wallTarget = wall; }
      }
      const targets = [];
      for (const actor of actors) {
        if (actor === this.owner || !actor.alive || actor.team === this.owner.team || this.hitActors.has(actor)) continue;
        const time = segmentRectIntersection(startX, startY, endX, endY, actor, this.radius);
        if (time !== null && (stop === null || time < stop - 1e-10)) targets.push({ actor, time });
      }
      targets.sort((a, b) => a.time - b.time);
      let fraction = stop ?? 1;
      for (const { actor, time } of targets) {
        this.hitActors.add(actor); this.pierceRemaining--;
        hits.push({ target: actor, damage: this.damage, owner: this.owner });
        if (this.pierceRemaining === 0) { fraction = time; this.active = false; break; }
      }
      this.x = startX + (endX - startX) * fraction; this.y = startY + (endY - startY) * fraction;
      const used = remaining * fraction; this.traveled += used; remaining -= used;
      if (!this.active) break;
      if (stop === null) break;
      if (this.bouncesRemaining > 0 && this.traveled < this.range - 1e-8) {
        const left = wallTarget ? wallTarget.x - this.radius : this.radius;
        const right = wallTarget ? wallTarget.x + wallTarget.width + this.radius : map.width - this.radius;
        const top = wallTarget ? wallTarget.y - this.radius : this.radius;
        const bottom = wallTarget ? wallTarget.y + wallTarget.height + this.radius : map.height - this.radius;
        const reflectX = Math.abs(this.x - left) < 1e-5 || Math.abs(this.x - right) < 1e-5;
        const reflectY = Math.abs(this.y - top) < 1e-5 || Math.abs(this.y - bottom) < 1e-5;
        if (!reflectX && !reflectY) { this.active = false; break; }
        if (reflectX) this.direction.x *= -1;
        if (reflectY) this.direction.y *= -1;
        this.bouncesRemaining--; this.ricochets.push({ x: this.x, y: this.y });
        // Leave the closed collision boundary without tunnelling through it.
        const nudge = Math.min(0.001, remaining);
        this.x += this.direction.x * nudge; this.y += this.direction.y * nudge;
        this.traveled += nudge; remaining -= nudge;
      } else { this.active = false; damagedWall = wallTarget?.destructible ? wallTarget : null; }
    }
    if (this.traveled >= this.range - 1e-8) this.active = false;
    if (hits.length) return { ...hits[0], ...(hits.length > 1 ? { hits } : {}), ...(damagedWall ? { wall: damagedWall } : {}) };
    return damagedWall ? { wall: damagedWall, damage: this.damage, owner: this.owner } : null;
  }

  draw(ctx) {
    if (!this.active) return;
    const colors = { bolt: '#f5ca63', propeller: '#f5ca63', lance: '#fff0a2', claw: '#f2c0a2', bomb: '#dc9059', shadow: '#ae91c2', needle: '#a5c9b1', fogfan: '#d4ead3' };
    const color = colors[this.style] || colors.bolt;
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Math.atan2(this.direction.y, this.direction.x));
    const tail = this.style === 'lance' ? 42 : this.style === 'shadow' ? 23 : 15;
    ctx.strokeStyle = color; ctx.globalAlpha = 0.4; ctx.lineWidth = this.radius;
    ctx.beginPath(); ctx.moveTo(-tail, 0); ctx.lineTo(0, 0); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = color; ctx.strokeStyle = '#30212e'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (this.style === 'claw') {
      ctx.moveTo(9, 0); ctx.quadraticCurveTo(-5, -10, -8, 0); ctx.quadraticCurveTo(-4, 4, 9, 0);
    } else if (this.style === 'needle' || this.style === 'fogfan' || this.style === 'lance') {
      ctx.moveTo(13, 0); ctx.lineTo(-7, -this.radius); ctx.lineTo(-3, 0); ctx.lineTo(-7, this.radius); ctx.closePath();
    } else if (this.style === 'bomb') {
      ctx.roundRect(-8, -7, 16, 14, 3);
    } else if (this.style === 'propeller') {
      ctx.ellipse(0, 0, 10, 4, this.traveled / 22, 0, Math.PI * 2);
    } else ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    if (this.style === 'bomb') { ctx.strokeStyle = '#f8df92'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(3, -12); ctx.stroke(); }
    if (this.style === 'shadow') { ctx.strokeStyle = '#fff0cf'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.5, -1.5, 1.5); ctx.stroke(); }
    ctx.restore();
  }
}
