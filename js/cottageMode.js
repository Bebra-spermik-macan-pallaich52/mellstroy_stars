'use strict';

class CottageMode {
  constructor(map, actors, config) {
    this.map = map;
    this.config = config;
    this.scores = [0, 0];
    this.progress = 0;
    this.owner = null;
    this.occupants = [false, false];
    this.contested = false;
    this.capturingTeam = null;
  }
  inZone(actor) {
    const zone = this.map.captureZone;
    return (
      actor.x < zone.x + zone.width &&
      actor.x + actor.width > zone.x &&
      actor.y < zone.y + zone.height &&
      actor.y + actor.height > zone.y
    );
  }
  addControlPoints(team, deltaTime) {
    this.scores[team] = Math.min(
      this.config.goal,
      this.scores[team] + this.config.pointsPerSecond * deltaTime
    );
  }
  update(deltaTime, actors) {
    this.occupants[0] = false;
    this.occupants[1] = false;
    for (const actor of actors) {
      if (actor.alive && (actor.team === 0 || actor.team === 1) && this.inZone(actor)) {
        this.occupants[actor.team] = true;
      }
    }
    this.contested = this.occupants[0] && this.occupants[1];
    this.capturingTeam = null;
    if (this.contested) {
      return;
    }
    const team = this.occupants[0] ? 0 : this.occupants[1] ? 1 : null;
    if (team === null) {
      if (this.owner !== null && Math.abs(this.progress) === 100) {
        this.addControlPoints(this.owner, deltaTime);
      }
      return;
    }
    const direction = team === 0 ? 1 : -1;
    const target = direction * 100;
    if (this.progress === target) {
      this.owner = team;
      this.addControlPoints(team, deltaTime);
      return;
    }
    this.capturingTeam = team;
    if (!(this.config.captureRate > 0)) {
      return;
    }
    const timeToCapture = Math.abs(target - this.progress) / this.config.captureRate;
    const captureTime = Math.min(deltaTime, timeToCapture);
    this.progress += direction * this.config.captureRate * captureTime;
    if ((this.owner === 0 && this.progress <= 0) || (this.owner === 1 && this.progress >= 0)) {
      this.owner = null;
    }
    if (deltaTime + 1e-10 >= timeToCapture) {
      this.progress = target;
      this.owner = team;
      this.capturingTeam = null;
      this.addControlPoints(team, Math.max(0, deltaTime - timeToCapture));
    }
  }
  onDeath() {}
  draw(canvasContext) {
    const zone = this.map.captureZone;
    const green = '#458bac';
    const red = '#b9575b';
    const color = this.contested
      ? '#e9c46a'
      : this.progress > 0
        ? green
        : this.progress < 0
          ? red
          : '#554451';
    canvasContext.save();
    canvasContext.globalAlpha = 0.14;
    canvasContext.fillStyle = color;
    canvasContext.fillRect(zone.x, zone.y, zone.width, zone.height);
    canvasContext.globalAlpha = 1;
    canvasContext.strokeStyle = color;
    canvasContext.lineWidth = 3;
    canvasContext.setLineDash(this.contested ? [6, 4] : []);
    canvasContext.strokeRect(zone.x, zone.y, zone.width, zone.height);
    canvasContext.setLineDash([]);
    const x = zone.x + zone.width / 2;
    const y = zone.y + zone.height / 2;
    canvasContext.lineWidth = 2;
    canvasContext.beginPath();
    canvasContext.moveTo(x - 24, y - 5);
    canvasContext.lineTo(x, y - 25);
    canvasContext.lineTo(x + 24, y - 5);
    canvasContext.stroke();
    canvasContext.strokeRect(x - 17, y - 5, 34, 25);
    canvasContext.strokeRect(x - 4, y + 6, 8, 14);
    canvasContext.font = 'bold 13px sans-serif';
    canvasContext.textAlign = 'center';
    canvasContext.fillStyle = color;
    canvasContext.fillText('КОТТЕДЖ', x, y + 43);
    canvasContext.restore();
  }
}
