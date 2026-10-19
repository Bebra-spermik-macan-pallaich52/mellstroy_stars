'use strict';

class TeamfightMode {
  constructor(map, actors, config) {
    this.map = map;
    this.config = config;
    this.scores = [0, 0];
    this.deathsHandled = new Set();
  }
  update(deltaTime, actors) {
    for (const actor of actors) {
      if (actor.alive) {
        this.deathsHandled.delete(actor);
      }
    }
  }
  onDeath(actor, source) {
    if (this.deathsHandled.has(actor)) {
      return;
    }
    this.deathsHandled.add(actor);
    if (!source || source === actor || source.team === actor.team) {
      return;
    }
    if (source.team === 0 || source.team === 1) {
      this.scores[source.team]++;
    }
  }
  draw(canvasContext) {
    canvasContext.save();
    canvasContext.fillStyle = '#513e4b';
    canvasContext.font = 'bold 13px sans-serif';
    canvasContext.textAlign = 'center';
    canvasContext.fillText('КОМАНДНЫЙ БОЙ', this.map.width / 2, 36);
    canvasContext.restore();
  }
}
