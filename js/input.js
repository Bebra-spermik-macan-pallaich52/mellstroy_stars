'use strict';

class Input {
  constructor(target = window, canvas = null) {
    this.keys = new Set();
    this.codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    this.canvas = canvas;
    this.mouse = { clientX: 0, clientY: 0, inside: false, firing: false };
    target.addEventListener('keydown', event => {
      if (!this.codes.has(event.code) || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
      event.preventDefault(); this.keys.add(event.code);
    });
    target.addEventListener('keyup', event => this.keys.delete(event.code));
    target.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    if (canvas) {
      const rememberPointer = event => {
        this.mouse.clientX = event.clientX;
        this.mouse.clientY = event.clientY;
        this.mouse.inside = true;
      };
      canvas.addEventListener('pointermove', rememberPointer);
      canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); canvas.focus({ preventScroll: true });
        rememberPointer(event); this.mouse.firing = true;
      });
      canvas.addEventListener('pointerleave', () => {
        this.mouse.inside = false; this.mouse.firing = false;
      });
      target.addEventListener('pointerup', event => { if (event.button === 0) this.mouse.firing = false; });
      target.addEventListener('pointercancel', () => { this.mouse.firing = false; });
    }
  }
  clear() { this.keys.clear(); this.mouse.firing = false; }
  direction() {
    const x = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const y = Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW'));
    const length = Math.hypot(x, y);
    return length ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }
  aim() {
    if (!this.canvas || !this.mouse.inside) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!this.canvas.clientWidth || !this.canvas.clientHeight) return null;
    // CSS border is excluded from the playable world, including after resizing.
    const x = (this.mouse.clientX - rect.left - this.canvas.clientLeft) * this.canvas.width / this.canvas.clientWidth;
    const y = (this.mouse.clientY - rect.top - this.canvas.clientTop) * this.canvas.height / this.canvas.clientHeight;
    return x >= 0 && y >= 0 && x <= this.canvas.width && y <= this.canvas.height ? { x, y } : null;
  }
}
