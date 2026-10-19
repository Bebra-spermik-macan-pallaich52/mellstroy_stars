'use strict';
class Camera {
  constructor(width = 960, height = 640) {
    this.width = width;
    this.height = height;
    this.x = 0;
    this.y = 0;
    this.followRate = 9;
    this.flight = null;
  }
  update(target, map, deltaTime = 0, snap = false) {
    const x = Math.max(0, Math.min(Math.max(0, map.width - this.width), target.x - this.width / 2));
    const y = Math.max(
      0,
      Math.min(Math.max(0, map.height - this.height), target.y - this.height / 2)
    );
    if (snap) {
      this.flight = null;
    }
    const amount = snap
      ? 1
      : 1 - Math.exp(-this.followRate * Math.max(0, Math.min(deltaTime, 0.1)));
    this.x += (x - this.x) * amount;
    this.y += (y - this.y) * amount;
    this.x = Math.max(0, Math.min(Math.max(0, map.width - this.width), this.x));
    this.y = Math.max(0, Math.min(Math.max(0, map.height - this.height), this.y));
  }
  flyTo(target, map, duration = 1.2) {
    const to = {
      x: Math.max(0, Math.min(Math.max(0, map.width - this.width), target.x - this.width / 2)),
      y: Math.max(0, Math.min(Math.max(0, map.height - this.height), target.y - this.height / 2))
    };
    if (!(duration > 0)) {
      this.x = to.x;
      this.y = to.y;
      this.flight = null;
      return;
    }
    this.flight = {
      from: {
        x: this.x,
        y: this.y
      },
      to,
      elapsed: 0,
      duration
    };
  }
  updateFlight(deltaTime) {
    if (!this.flight) {
      return false;
    }
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return true;
    }
    const flight = this.flight;
    flight.elapsed = Math.min(flight.duration, flight.elapsed + Math.min(deltaTime, 0.1));
    if (flight.duration - flight.elapsed < 1e-9) {
      flight.elapsed = flight.duration;
    }
    const t = flight.elapsed / flight.duration;
    const smooth = t * t * (3 - 2 * t);
    this.x = flight.from.x + (flight.to.x - flight.from.x) * smooth;
    this.y = flight.from.y + (flight.to.y - flight.from.y) * smooth;
    if (t >= 1) {
      this.flight = null;
    }
    return true;
  }
  screenToWorld(point) {
    return {
      x: point.x + this.x,
      y: point.y + this.y
    };
  }
  worldToScreen(point) {
    return {
      x: point.x - this.x,
      y: point.y - this.y
    };
  }
  visible(rect, padding = 100) {
    return (
      rect.x + (rect.width || 0) >= this.x - padding &&
      rect.x <= this.x + this.width + padding &&
      rect.y + (rect.height || 0) >= this.y - padding &&
      rect.y <= this.y + this.height + padding
    );
  }
}
