'use strict';

class TeamfightMode {
  constructor(map, actors, config) {
    this.map = map; this.config = config; this.scores = [0, 0];
    this.deathsHandled = new Set();
  }
  update(dt, actors) {
    for (const actor of actors) if (actor.alive) this.deathsHandled.delete(actor);
  }
  onDeath(actor, source) {
    if (this.deathsHandled.has(actor)) return;
    this.deathsHandled.add(actor);
    if (!source || source === actor || source.team === actor.team) return;
    if (source.team === 0 || source.team === 1) this.scores[source.team]++;
  }
  draw(ctx) {
    ctx.save(); ctx.fillStyle = '#513e4b'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('КОМАНДНЫЙ БОЙ', this.map.width / 2, 36); ctx.restore();
  }
}
