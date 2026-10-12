'use strict';
class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    target.addEventListener('keydown', event => {
      if (!this.codes.has(event.code) || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
      event.preventDefault(); this.keys.add(event.code);
    });
    target.addEventListener('keyup', event => { this.keys.delete(event.code); });
    target.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
  }
  clear() { this.keys.clear(); }
  direction() {
    const x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const y = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    const length = Math.hypot(x, y);
    return length ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }
}
