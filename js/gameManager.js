'use strict';

const matchConfig = Object.freeze({
  duration: 180,
  teamSize: 3,
  donations: Object.freeze({ goal: 15, spawnInterval: 2.5, lossFraction: 0.5, itemRadius: 10, maxItems: 40 }),
  cottage: Object.freeze({ goal: 100, captureRate: 20, pointsPerSecond: 5 })
});

class GameManager {
  constructor(modeId, map, actors, overrides = {}) {
    this.modeId = modeId || 'donations';
    if (this.modeId !== 'donations' && this.modeId !== 'cottage') throw new Error(`Неизвестный режим: ${this.modeId}`);
    this.config = {
      ...matchConfig, ...overrides,
      donations: { ...matchConfig.donations, ...overrides.donations },
      cottage: { ...matchConfig.cottage, ...overrides.cottage }
    };
    this.duration = this.config.duration;
    this.remaining = this.duration;
    this.goal = this.config[this.modeId].goal;
    this.actors = actors;
    this.mode = this.modeId === 'donations' ?
      new DonationsMode(map, actors, this.config.donations) : new CottageMode(map, actors, this.config.cottage);
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
    if (this.mode.scores.some(score => score >= this.goal)) { this.finish('goal'); return; }
    if (this.remaining <= 0) { this.finish('time'); return; }
    const step = Math.min(Number.isFinite(dt) ? Math.max(0, dt) : 0, this.remaining);
    this.mode.update(step, actors);
    this.remaining = Math.max(0, this.remaining - step);
    if (this.remaining < 1e-9) this.remaining = 0;
    if (this.mode.scores.some(score => score >= this.goal)) this.finish('goal');
    else if (this.remaining === 0) this.finish('time');
  }

  onDeath(actor) {
    if (this.state === 'playing') this.mode.onDeath(actor);
  }
}
