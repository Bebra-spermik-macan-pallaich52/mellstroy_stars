'use strict';
class DonationsMode {
  constructor(map, actors, config) {
    this.map = map;
    this.config = config;
    this.scores = [0, 0];
    this.items = [];
    this.carried = new Map();
    this.spawnElapsed = 0;
    this.spawnIndex = 0;
    this.deathsHandled = new Set();
    this.registerActors(actors);
  }
  registerActors(actors) {
    for (const actor of actors) {
      if (!this.carried.has(actor)) {
        this.carried.set(actor, 0);
      }
      if (actor.alive) {
        this.deathsHandled.delete(actor);
      }
    }
  }
  touchesActor(item, actor) {
    const nearestX = Math.max(actor.x, Math.min(item.x, actor.x + actor.width));
    const nearestY = Math.max(actor.y, Math.min(item.y, actor.y + actor.height));
    return (item.x - nearestX) ** 2 + (item.y - nearestY) ** 2 <= item.radius ** 2;
  }
  freePosition(x, y, radius) {
    if (
      x - radius < 0 ||
      y - radius < 0 ||
      x + radius > this.map.width ||
      y + radius > this.map.height
    ) {
      return false;
    }
    return !this.map.walls.some((wall) => this.touchesActor({ x, y, radius }, wall));
  }
  findPosition(point, index, radius) {
    for (let attempt = 0; attempt < 65; attempt++) {
      const slot = (index + attempt) % 65;
      const ring = Math.ceil(slot / 16);
      const angle = ((slot % 16) * Math.PI) / 8;
      const distance = ring * (radius * 2 + 5);
      const x = point.x + Math.cos(angle) * distance;
      const y = point.y + Math.sin(angle) * distance;
      if (this.freePosition(x, y, radius)) {
        return { x, y };
      }
    }
    return null;
  }
  recountScores() {
    this.scores[0] = 0;
    this.scores[1] = 0;
    for (const [actor, amount] of this.carried) {
      if (actor.team === 0 || actor.team === 1) {
        this.scores[actor.team] += amount;
      }
    }
  }
  update(deltaTime, actors) {
    this.registerActors(actors);
    this.spawnElapsed += deltaTime;
    const interval = this.config.spawnInterval;
    if (interval > 0 && this.spawnElapsed + 1e-10 >= interval) {
      const ticks = Math.floor((this.spawnElapsed + 1e-10) / interval);
      this.spawnElapsed = Math.max(0, this.spawnElapsed - ticks * interval);
      const count = Math.min(ticks, Math.max(0, this.config.maxItems - this.items.length));
      for (let i = 0; i < count; i++) {
        const position = this.findPosition(
          this.map.resourcePoint,
          this.spawnIndex++,
          this.config.itemRadius
        );
        if (position) {
          this.items.push({ ...position, radius: this.config.itemRadius, value: 1 });
        }
      }
    }
    this.items = this.items.filter((item) => {
      const collector = actors.find(
        (actor) =>
          actor.alive && (actor.team === 0 || actor.team === 1) && this.touchesActor(item, actor)
      );
      if (!collector) {
        return true;
      }
      this.carried.set(collector, this.carried.get(collector) + (item.value ?? 1));
      return false;
    });
    this.recountScores();
  }
  onDeath(actor) {
    if (this.deathsHandled.has(actor)) {
      return;
    }
    this.deathsHandled.add(actor);
    const held = this.carried.get(actor) || 0;
    const lost = Math.min(held, Math.max(0, Math.ceil(held * this.config.lossFraction)));
    this.carried.set(actor, held - lost);
    const center = actor.center || { x: actor.x + actor.width / 2, y: actor.y + actor.height / 2 };
    for (let i = 0; i < lost; i++) {
      const position = this.findPosition(center, i, this.config.itemRadius) || center;
      this.items.push({ x: position.x, y: position.y, radius: this.config.itemRadius, value: 1 });
    }
    this.recountScores();
  }
  draw(canvasContext) {
    const point = this.map.resourcePoint;
    canvasContext.save();
    canvasContext.strokeStyle = '#755133';
    canvasContext.lineWidth = 2;
    canvasContext.setLineDash([6, 6]);
    canvasContext.beginPath();
    canvasContext.arc(point.x, point.y, 42, 0, Math.PI * 2);
    canvasContext.stroke();
    canvasContext.setLineDash([]);
    canvasContext.font = 'bold 13px sans-serif';
    canvasContext.textAlign = 'center';
    canvasContext.fillStyle = '#513e38';
    canvasContext.fillText('ТОЧКА ДОНАТОВ', point.x, point.y - 120);
    for (const item of this.items) {
      canvasContext.fillStyle = '#ffd257';
      canvasContext.strokeStyle = '#6e4536';
      canvasContext.beginPath();
      canvasContext.moveTo(item.x, item.y - item.radius);
      canvasContext.lineTo(item.x + item.radius, item.y);
      canvasContext.lineTo(item.x, item.y + item.radius);
      canvasContext.lineTo(item.x - item.radius, item.y);
      canvasContext.closePath();
      canvasContext.fill();
      canvasContext.stroke();
    }
    canvasContext.restore();
  }
}
