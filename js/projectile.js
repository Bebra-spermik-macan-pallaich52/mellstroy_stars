'use strict';

class Projectile {
  constructor(owner, direction, settings = {}) {
    this.owner = owner;
    this.x = owner.x + owner.width / 2;
    this.y = owner.y + owner.height / 2;
    const length = Math.hypot(direction.x, direction.y);
    this.direction = length > 0
      ? { x: direction.x / length, y: direction.y / length }
      : { x: 0, y: 0 };
    this.speed = settings.speed ?? 560;
    this.damage = settings.damage ?? 25;
    this.range = settings.range ?? 480;
    this.radius = settings.radius ?? 4;
    this.traveled = 0;
    this.active = Number.isFinite(length) && length > 0 && Number.isFinite(this.speed) && this.speed > 0 && Number.isFinite(this.range) && this.range > 0;
  }

  update(dt, map, actors = []) {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return null;
    const distance = Math.min(this.speed * dt, this.range - this.traveled);
    const endX = this.x + this.direction.x * distance;
    const endY = this.y + this.direction.y * distance;
    let hitTime = segmentMapExit(this.x, this.y, endX, endY, map, this.radius);
    let target = null;
    let wallTarget = null;

    // Check obstacles first: an actor standing against a wall cannot take a
    // hit through it. Strict comparisons preserve that order for tied hits.
    for (const wall of map.walls) {
      const time = segmentRectIntersection(this.x, this.y, endX, endY, wall, this.radius);
      if (time !== null && (hitTime === null || time < hitTime)) {
        hitTime = time; wallTarget = wall;
      }
    }
    for (const actor of actors) {
      if (actor === this.owner || !actor.alive || actor.team === this.owner.team) continue;
      const time = segmentRectIntersection(this.x, this.y, endX, endY, actor, this.radius);
      if (time !== null && (hitTime === null || time < hitTime - 1e-10)) {
        hitTime = time;
        target = actor;
        wallTarget = null;
      }
    }

    const fraction = hitTime === null ? 1 : hitTime;
    this.x += (endX - this.x) * fraction;
    this.y += (endY - this.y) * fraction;
    this.traveled += distance * fraction;
    if (hitTime !== null || this.traveled >= this.range) this.active = false;
    if (target) return { target, damage: this.damage, owner: this.owner };
    return wallTarget?.destructible ? { wall: wallTarget, damage: this.damage, owner: this.owner } : null;
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.fillStyle = this.owner.team === 0 ? '#73e3e8' : '#ff8c7d';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
