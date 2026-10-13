'use strict';

class CottageMode {
  constructor(map, actors, config) {
    this.map = map;
    this.config = config;
    this.scores = [0, 0];
    this.progress = 0; // +100: team 0; -100: team 1.
    this.owner = null;
    this.occupants = [false, false];
    this.contested = false;
    this.capturingTeam = null;
  }

  inZone(actor) {
    const zone = this.map.captureZone;
    return actor.x < zone.x + zone.width && actor.x + actor.width > zone.x &&
      actor.y < zone.y + zone.height && actor.y + actor.height > zone.y;
  }

  addControlPoints(team, dt) {
    this.scores[team] = Math.min(this.config.goal, this.scores[team] + this.config.pointsPerSecond * dt);
  }

  update(dt, actors) {
    this.occupants[0] = false;
    this.occupants[1] = false;
    for (const actor of actors) {
      if (actor.alive && (actor.team === 0 || actor.team === 1) && this.inZone(actor)) this.occupants[actor.team] = true;
    }
    this.contested = this.occupants[0] && this.occupants[1];
    this.capturingTeam = null;
    if (this.contested) return;
    const team = this.occupants[0] ? 0 : this.occupants[1] ? 1 : null;
    if (team === null) {
      if (this.owner !== null && Math.abs(this.progress) === 100) this.addControlPoints(this.owner, dt);
      return;
    }

    const direction = team === 0 ? 1 : -1;
    const target = direction * 100;
    if (this.progress === target) {
      this.owner = team;
      this.addControlPoints(team, dt);
      return;
    }
    this.capturingTeam = team;
    if (!(this.config.captureRate > 0)) return;
    const timeToCapture = Math.abs(target - this.progress) / this.config.captureRate;
    const captureTime = Math.min(dt, timeToCapture);
    this.progress += direction * this.config.captureRate * captureTime;
    // An enemy entering immediately pauses points, even before neutralization.
    if ((this.owner === 0 && this.progress <= 0) || (this.owner === 1 && this.progress >= 0)) this.owner = null;
    if (dt + 1e-10 >= timeToCapture) {
      this.progress = target;
      this.owner = team;
      this.capturingTeam = null;
      // Only the time after full capture earns points, regardless of frame size.
      this.addControlPoints(team, Math.max(0, dt - timeToCapture));
    }
  }

  onDeath() {
    // The next update counts only live actors; progress survives respawns.
  }

  draw(ctx) {
    const zone = this.map.captureZone;
    const green = '#73e3c0', red = '#ff8c86';
    const color = this.contested ? '#e9c46a' : this.progress > 0 ? green : this.progress < 0 ? red : '#bac7d5';
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color; ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.setLineDash(this.contested ? [6, 4] : []);
    ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
    ctx.setLineDash([]);
    const x = zone.x + zone.width / 2, y = zone.y + zone.height / 2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 24, y - 5); ctx.lineTo(x, y - 25); ctx.lineTo(x + 24, y - 5); ctx.stroke();
    ctx.strokeRect(x - 17, y - 5, 34, 25);
    ctx.strokeRect(x - 4, y + 6, 8, 14);
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.fillText('КОТТЕДЖ', x, y + 43);
    ctx.restore();
  }
}
