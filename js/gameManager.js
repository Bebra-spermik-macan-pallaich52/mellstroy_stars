'use strict';

const matchConfig = Object.freeze({
  duration: 180,
  teamSize: 3,
  donations: Object.freeze({ goal: 15, spawnInterval: 2.5, lossFraction: 0.5, itemRadius: 10, maxItems: 40 }),
  cottage: Object.freeze({ goal: 100, captureRate: 20, pointsPerSecond: 5 }),
  teamfight: Object.freeze({ goal: 10 })
});

class GameManager {
  constructor(modeId, map, actors, overrides = {}) {
    this.modeId = modeId || 'donations';
    if (!['donations', 'cottage', 'teamfight'].includes(this.modeId)) throw new Error(`Неизвестный режим: ${this.modeId}`);
    this.config = {
      ...matchConfig, ...overrides,
      donations: { ...matchConfig.donations, ...overrides.donations },
      cottage: { ...matchConfig.cottage, ...overrides.cottage },
      teamfight: { ...matchConfig.teamfight, ...overrides.teamfight }
    };
    this.duration = this.config.duration;
    this.remaining = this.duration;
    this.goal = this.config[this.modeId].goal;
    this.actors = actors;
    this.mode = this.modeId === 'donations' ?
      new DonationsMode(map, actors, this.config.donations) : this.modeId === 'cottage' ?
        new CottageMode(map, actors, this.config.cottage) : new TeamfightMode(map, actors, this.config.teamfight);
    this.state = 'playing';
    this.result = null;
  }

  finish(reason) {
    const scores = [...this.mode.scores];
    // Fractional control points can differ by floating-point noise after equal play time.
    const tied = Math.abs(scores[0] - scores[1]) < 1e-7;
    this.result = { winner: tied ? null : scores[0] > scores[1] ? 0 : 1, reason, scores };
    this.state = 'finished';
  }

  update(dt, actors = this.actors) {
    if (this.state !== 'playing') return;
    const reachedGoal = this.mode.scores.some(score => score >= this.goal);
    if (this.remaining <= 0) { this.finish(reachedGoal ? 'goal' : 'time'); return; }
    const step = Math.min(Number.isFinite(dt) ? Math.max(0, dt) : 0, this.remaining);
    // Kills can reach the goal during combat, before the mode update. That
    // physical interval still consumes the same amount of match time.
    if (!reachedGoal) this.mode.update(step, actors);
    this.remaining = Math.max(0, this.remaining - step);
    if (this.remaining < 1e-9) this.remaining = 0;
    if (this.mode.scores.some(score => score >= this.goal)) this.finish('goal');
    else if (this.remaining === 0) this.finish('time');
  }

  onDeath(actor, source) {
    if (this.state === 'playing') this.mode.onDeath(actor, source);
  }
}
