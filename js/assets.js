'use strict';
class ImageLoader {
  constructor() { this.cache = new Map(); }
  load(source) {
    if (this.cache.has(source)) return this.cache.get(source);
    const promise = new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { console.warn(`Не удалось загрузить изображение: ${source}. Используется временный маркер.`); resolve(null); };
      image.src = source;
    });
    this.cache.set(source, promise); return promise;
  }
}
// Each frame is an explicit source rectangle; sheets need not share a grid.
class SpriteAnimator {
  constructor(config = {}) { this.config = config; this.state = ''; this.elapsed = 0; }
  update(direction, moving, dt) {
    const state = moving ? `walk_${direction}` : `idle_${direction}`;
    if (state !== this.state) { this.state = state; this.elapsed = 0; }
    if (moving) this.elapsed += dt;
  }
  frame() {
    const frames = this.config.animations?.[this.state] || this.config.animations?.idle;
    if (!frames?.length) return null;
    return frames[Math.floor(this.elapsed * (this.config.fps ?? 8)) % frames.length];
  }
}
