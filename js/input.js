'use strict';

class Input {
  constructor(target = window, canvas = null) {
    this.keys = new Set();
    this.codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'Escape']);
    this.actions = new Set();
    this.canvas = canvas;
    this.camera = null;
    this.enabled = true;
    this.mouse = { clientX: 0, clientY: 0, hasPosition: false, firing: false };
    target.addEventListener('keydown', (event) => {
      if (
        !this.codes.has(event.code) ||
        /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) ||
        event.target.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      if (event.code === 'KeyQ' || event.code === 'Escape') {
        if (!event.repeat) {
          if (event.code === 'KeyQ') {
            this.actions.add('super');
          } else {
            this.actions.add('pause');
          }
        }
      } else {
        this.keys.add(event.code);
      }
    });
    target.addEventListener('keyup', (event) => this.keys.delete(event.code));
    target.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clear();
      }
    });
    if (canvas) {
      const rememberPointer = (event) => {
        this.mouse.clientX = event.clientX;
        this.mouse.clientY = event.clientY;
        this.mouse.hasPosition = true;
      };
      target.addEventListener('pointermove', rememberPointer);
      target.addEventListener('pointerdown', (event) => {
        if (!this.enabled || event.button !== 0 || !event.isPrimary) {
          return;
        }
        if (
          event.target.closest?.(
            'button, a, input, textarea, select, [role=dialog], [contenteditable=true]'
          )
        ) {
          return;
        }
        event.preventDefault();
        canvas.focus({ preventScroll: true });
        rememberPointer(event);
        this.mouse.firing = true;
        if (canvas.setPointerCapture) {
          canvas.setPointerCapture(event.pointerId);
        }
      });
      canvas.addEventListener('lostpointercapture', () => {
        this.mouse.firing = false;
      });
      target.addEventListener('pointerup', (event) => {
        if (event.button === 0) {
          this.mouse.firing = false;
        }
      });
      target.addEventListener('pointercancel', () => {
        this.mouse.firing = false;
      });
    }
  }
  clear() {
    this.keys.clear();
    this.actions.clear();
    this.mouse.firing = false;
  }
  consumeAction(action) {
    const present = this.actions.has(action);
    this.actions.delete(action);
    return present;
  }
  direction() {
    let x = 0;
    let y = 0;

    if (this.keys.has('KeyD')) {
      x += 1;
    }
    if (this.keys.has('KeyA')) {
      x -= 1;
    }
    if (this.keys.has('KeyS')) {
      y += 1;
    }
    if (this.keys.has('KeyW')) {
      y -= 1;
    }

    const length = Math.hypot(x, y);
    if (length === 0) {
      return { x: 0, y: 0 };
    }

    return { x: x / length, y: y / length };
  }
  aim() {
    if (!this.canvas || !this.mouse.hasPosition) {
      return null;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (!this.canvas.clientWidth || !this.canvas.clientHeight) {
      return null;
    }
    const displayWidth = rect.width
      ? rect.width - this.canvas.clientLeft * 2
      : this.canvas.clientWidth;
    const displayHeight = rect.height
      ? rect.height - this.canvas.clientTop * 2
      : this.canvas.clientHeight;
    const x =
      ((this.mouse.clientX - rect.left - this.canvas.clientLeft) * this.canvas.width) /
      displayWidth;
    const y =
      ((this.mouse.clientY - rect.top - this.canvas.clientTop) * this.canvas.height) /
      displayHeight;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    if (this.camera) {
      return this.camera.screenToWorld({ x, y });
    } else {
      return { x, y };
    }
  }
}
