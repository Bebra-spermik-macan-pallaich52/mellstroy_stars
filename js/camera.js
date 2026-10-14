'use strict';

// Rendering coordinates only. World positions and collision geometry never move.
class Camera {
  constructor(width = 960, height = 640) {
    this.width = width; this.height = height; this.x = 0; this.y = 0;
    this.followRate = 9;
  }
  update(target, map, dt = 0, snap = false) {
    const x = Math.max(0, Math.min(Math.max(0, map.width - this.width), target.x - this.width / 2));
    const y = Math.max(0, Math.min(Math.max(0, map.height - this.height), target.y - this.height / 2));
    const amount = snap ? 1 : 1 - Math.exp(-this.followRate * Math.max(0, Math.min(dt, 0.1)));
    this.x += (x - this.x) * amount; this.y += (y - this.y) * amount;
    this.x = Math.max(0, Math.min(Math.max(0, map.width - this.width), this.x));
    this.y = Math.max(0, Math.min(Math.max(0, map.height - this.height), this.y));
  }
  screenToWorld(point) { return { x: point.x + this.x, y: point.y + this.y }; }
  worldToScreen(point) { return { x: point.x - this.x, y: point.y - this.y }; }
  visible(rect, padding = 100) {
    return rect.x + (rect.width || 0) >= this.x - padding && rect.x <= this.x + this.width + padding &&
      rect.y + (rect.height || 0) >= this.y - padding && rect.y <= this.y + this.height + padding;
  }
}
