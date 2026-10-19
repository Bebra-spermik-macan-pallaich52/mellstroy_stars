'use strict';
class AudioManager {
  constructor(settings = {}) {
    this.settings = {
      sound: true,
      music: false,
      volume: 0.35
    };
    this.context = null;
    this.master = null;
    this.paused = false;
    this.voices = new Set();
    this.maxVoices = 12;
    this.lastCue = new Map();
    this.recentCues = [];
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextNoteTime = 0;
    this.setSettings(settings);
  }
  setSettings(settings = {}) {
    if (!settings || typeof settings !== 'object') {
      return;
    }
    if (typeof settings.sound === 'boolean') {
      this.settings.sound = settings.sound;
    }
    if (typeof settings.music === 'boolean') {
      this.settings.music = settings.music;
    }
    if (Number.isFinite(settings.volume)) {
      this.settings.volume = Math.max(0, Math.min(1, settings.volume));
    }
    if (this.master && this.context) {
      try {
        this.master.gain.setTargetAtTime(this.settings.volume, this.context.currentTime, 0.02);
      } catch (_) {}
    }
    if (!this.settings.sound || this.settings.volume === 0) {
      this._stopVoices(false);
    }
    if (
      this.settings.music &&
      this.settings.volume > 0 &&
      !this.paused &&
      this.context?.state === 'running'
    ) {
      this._startMusic();
    } else {
      this._stopMusic();
    }
  }
  async unlock() {
    try {
      if (!this.context || this.context.state === 'closed') {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) {
          return false;
        }
        this._stopMusic();
        this._stopVoices(false);
        this.lastCue.clear();
        this.recentCues.length = 0;
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.gain.value = this.settings.volume;
        this.master.connect(this.context.destination);
      }
      await this.context.resume();
      this.paused = false;
      if (this.settings.music && this.settings.volume > 0) {
        this._startMusic();
      }
      return this.context.state === 'running';
    } catch (_) {
      return false;
    }
  }
  pause() {
    this.paused = true;
    this._stopMusic();
    this._stopVoices(false);
    if (this.context && this.context.state === 'running') {
      try {
        const result = this.context.suspend();
        if (result && typeof result.catch === 'function') {
          result.catch(() => {});
        }
      } catch (_) {}
    }
  }
  async resume() {
    return this.unlock();
  }
  handle(event, context = {}) {
    if (
      !event ||
      !this.settings.sound ||
      this.settings.volume <= 0 ||
      this.paused ||
      this.context?.state !== 'running'
    ) {
      return false;
    }
    const cues = {
      shot: [[530, 170, 0.075, 'triangle', 0.075]],
      hit: [[180, 75, 0.085, 'triangle', 0.11]],
      impact: [[120, 75, 0.05, 'triangle', 0.045]],
      death: [[220, 75, 0.3, 'triangle', 0.08]],
      respawn: [
        [330, 440, 0.12, 'sine', 0.07],
        [495, 660, 0.16, 'sine', 0.07, 0.12]
      ],
      pickup: [
        [780, 1050, 0.1, 'sine', 0.075],
        [1320, 1320, 0.1, 'sine', 0.05, 0.06]
      ],
      ability: [
        [196, 392, 0.2, 'triangle', 0.085],
        [588, 784, 0.17, 'sine', 0.06, 0.14]
      ],
      wallDestroyed: [
        [145, 45, 0.22, 'triangle', 0.09],
        [95, 40, 0.2, 'sine', 0.07, 0.07]
      ]
    };
    let notes = cues[event.type];
    if (event.type === 'shot') {
      notes =
        {
          arthur: [[720, 320, 0.07, 'triangle', 0.07]],
          kotost: [[340, 200, 0.09, 'triangle', 0.065]],
          mellstroy_fat: [[155, 75, 0.12, 'triangle', 0.09]],
          dark_drun: [[190, 110, 0.11, 'sine', 0.1]],
          fog: [[1100, 600, 0.045, 'sine', 0.07]],
          chekunets: [[1550, 950, 0.065, 'sine', 0.06]],
          hare: [[540, 290, 0.07, 'triangle', 0.065]],
          mytost: [[480, 780, 0.09, 'sine', 0.07]]
        }[event.characterId] || notes;
    }
    if (event.type === 'ability') {
      notes =
        {
          arthur: [[392, 784, 0.24, 'triangle', 0.085]],
          kotost: [
            [330, 440, 0.2, 'sine', 0.07],
            [550, 660, 0.24, 'sine', 0.06, 0.12]
          ],
          mellstroy_fat: [[120, 40, 0.3, 'triangle', 0.1]],
          dark_drun: [
            [160, 240, 0.25, 'sine', 0.08],
            [320, 240, 0.24, 'sine', 0.05, 0.08]
          ],
          fog: [
            [800, 1200, 0.15, 'sine', 0.075],
            [1200, 900, 0.15, 'sine', 0.05, 0.08]
          ],
          chekunets: [
            [1600, 1100, 0.18, 'sine', 0.07],
            [2200, 1500, 0.16, 'sine', 0.04, 0.07]
          ],
          hare: [
            [440, 660, 0.14, 'triangle', 0.07],
            [660, 880, 0.18, 'sine', 0.06, 0.12]
          ],
          mytost: [
            [300, 720, 0.25, 'sine', 0.07],
            [600, 1000, 0.2, 'sine', 0.05, 0.1]
          ]
        }[event.characterId] || notes;
    }
    if (event.type === 'blast') {
      notes = [[95, 40, 0.18, 'triangle', 0.085]];
    }
    if (event.type === 'ricochet') {
      notes = [[1400, 900, 0.04, 'sine', 0.05]];
    }
    if (event.type === 'finish') {
      const localTeam = Number.isInteger(context.localTeam) ? context.localTeam : 0;
      const melody =
        event.winner == null
          ? [392, 392, 330]
          : event.winner === localTeam
            ? [392, 494, 587, 784]
            : [392, 330, 262, 196];
      notes = melody.map((frequency, i) => [frequency, frequency, 0.21, 'sine', 0.095, i * 0.16]);
    }
    if (!notes) {
      return false;
    }
    const now = this.context.currentTime;
    const spacing =
      {
        shot: 0.055,
        hit: 0.055,
        impact: 0.1,
        pickup: 0.07,
        ability: 0.15,
        finish: 0.5
      }[event.type] ?? 0.12;
    if (now - (this.lastCue.get(event.type) ?? -Infinity) < spacing) {
      return false;
    }
    this.recentCues = this.recentCues.filter((time) => now - time < 0.25);
    if (this.recentCues.length >= 8 || this.voices.size >= this.maxVoices) {
      return false;
    }
    this.lastCue.set(event.type, now);
    this.recentCues.push(now);
    let played = false;
    for (const [from, to, duration, shape, level, delay = 0] of notes) {
      played = this._tone(from, to, duration, shape, level, now + delay, false) || played;
    }
    return played;
  }
  _tone(from, to, duration, shape, level, when, music) {
    if (!this.context || !this.master || this.voices.size >= this.maxVoices) {
      return false;
    }
    let oscillator;
    let envelope;
    try {
      oscillator = this.context.createOscillator();
      envelope = this.context.createGain();
      const start = Math.max(this.context.currentTime, when);
      oscillator.type = shape;
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(level, start + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(this.master);
      const voice = {
        oscillator,
        envelope,
        music
      };
      this.voices.add(voice);
      oscillator.onended = () => {
        this.voices.delete(voice);
        try {
          oscillator.disconnect();
          envelope.disconnect();
        } catch (_) {}
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.025);
      return true;
    } catch (_) {
      if (oscillator) {
        for (const voice of this.voices) {
          if (voice.oscillator === oscillator) {
            this.voices.delete(voice);
          }
        }
        try {
          oscillator.stop();
        } catch (_) {}
        try {
          oscillator.disconnect();
        } catch (_) {}
      }
      if (envelope) {
        try {
          envelope.disconnect();
        } catch (_) {}
      }
      return false;
    }
  }
  _startMusic() {
    if (this.musicTimer !== null || !this.context || typeof globalThis.setTimeout !== 'function') {
      return;
    }
    const melody = [196, 246.94, 293.66, 246.94, 220, 261.63, 329.63, 261.63];
    this.musicStep = 0;
    this.nextNoteTime = this.context.currentTime + 0.05;
    const schedule = () => {
      this.musicTimer = null;
      if (
        !this.settings.music ||
        this.settings.volume <= 0 ||
        this.paused ||
        this.context?.state !== 'running'
      ) {
        return;
      }
      const now = this.context.currentTime;
      if (this.nextNoteTime < now - 0.1) {
        this.nextNoteTime = now + 0.02;
      }
      while (this.nextNoteTime < now + 0.2) {
        const frequency = melody[this.musicStep++ % melody.length];
        this._tone(frequency, frequency, 0.32, 'sine', 0.023, this.nextNoteTime, true);
        this.nextNoteTime += 0.48;
      }
      this.musicTimer = globalThis.setTimeout(schedule, 100);
    };
    schedule();
  }
  _stopVoices(musicOnly) {
    for (const voice of this.voices) {
      if (musicOnly && !voice.music) {
        continue;
      }
      if (!musicOnly && voice.music) {
        continue;
      }
      voice.oscillator.onended = null;
      try {
        voice.oscillator.stop();
      } catch (_) {}
      try {
        voice.oscillator.disconnect();
        voice.envelope.disconnect();
      } catch (_) {}
      this.voices.delete(voice);
    }
  }
  _stopMusic() {
    if (this.musicTimer !== null && typeof globalThis.clearTimeout === 'function') {
      globalThis.clearTimeout(this.musicTimer);
    }
    this.musicTimer = null;
    this._stopVoices(true);
  }
}
