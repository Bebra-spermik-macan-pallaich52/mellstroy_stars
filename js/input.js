'use strict';

class Input {
  constructor(target = window, canvas = null) {
    this.keys = new Set();
    this.codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'Escape']);
    this.actions = new Set();
    this.canvas = canvas;
    this.camera = null;
    this.mouse = { clientX: 0, clientY: 0, inside: false, firing: false };
    target.addEventListener('keydown', event => {
      if (!this.codes.has(event.code) || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
      event.preventDefault();
      if (event.code === 'KeyQ' || event.code === 'Escape') {
        if (!event.repeat) this.actions.add(event.code === 'KeyQ' ? 'super' : 'pause');
      } else this.keys.add(event.code);
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
  clear() { this.keys.clear(); this.actions.clear(); this.mouse.firing = false; }
  consumeAction(action) {
    const present = this.actions.has(action); this.actions.delete(action); return present;
  }
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
    // Bounding rectangles retain subpixel CSS sizes; clientHeight is rounded.
    const displayWidth = rect.width ? rect.width - this.canvas.clientLeft * 2 : this.canvas.clientWidth;
    const displayHeight = rect.height ? rect.height - this.canvas.clientTop * 2 : this.canvas.clientHeight;
    const x = (this.mouse.clientX - rect.left - this.canvas.clientLeft) * this.canvas.width / displayWidth;
    const y = (this.mouse.clientY - rect.top - this.canvas.clientTop) * this.canvas.height / displayHeight;
    if (x < 0 || y < 0 || x > this.canvas.width || y > this.canvas.height) return null;
    return this.camera ? this.camera.screenToWorld({ x, y }) : { x, y };
  }
}
