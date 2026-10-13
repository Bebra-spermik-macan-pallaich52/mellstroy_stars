'use strict';

// Короткие косметические эффекты. Они не меняют здоровье, физику или счёт.
class VisualEffects {
  constructor({ reducedMotion = false } = {}) {
    this.items = []; this.maxItems = 120;
    this.reducedMotion = Boolean(reducedMotion);
  }
  setReducedMotion(value) {
    const next = Boolean(value);
    if (next !== this.reducedMotion) this.clear();
    this.reducedMotion = next;
  }
  clear() { this.items.length = 0; }
  emit(event) {
    if (!event || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return false;
    const types = ['shot', 'hit', 'impact', 'death', 'respawn', 'pickup', 'ability', 'wallDestroyed'];
    if (!types.includes(event.type)) return false;
    const color = { shot: '#fff4bc', hit: '#ff967b', impact: '#b4c6d1', death: '#eb8197',
      respawn: '#84e6ca', pickup: '#ffd479', ability: '#b6a0ff', wallDestroyed: '#c69b72' }[event.type];
    const radius = { shot: 8, hit: 16, impact: 9, death: 30, respawn: 30, pickup: 17, ability: 52, wallDestroyed: 24 }[event.type];
    const duration = this.reducedMotion ? 0.14 : event.type === 'ability' ? 0.42 : 0.28;
    this._add({ kind: 'ring', x: event.x, y: event.y, age: 0, life: duration, color, radius });
    if (this.reducedMotion) return true;
    const count = { shot: 0, hit: 5, impact: 3, death: 7, respawn: 4, pickup: 5, ability: 9, wallDestroyed: 10 }[event.type];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i / count) + Math.random() * 0.45;
      const speed = 25 + Math.random() * 60;
      this._add({ kind: 'particle', x: event.x, y: event.y, vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed, age: 0, life: 0.3 + Math.random() * 0.15,
        color, radius: event.type === 'wallDestroyed' ? 3 : 2 });
    }
    if (event.type === 'hit' && Number.isFinite(event.damage) && event.damage > 0) {
      this._add({ kind: 'text', x: event.x, y: event.y - 24, age: 0, life: 0.65,
        color: '#ffe2d7', text: `−${Math.round(Math.min(999999, event.damage))}` });
    }
    return true;
  }
  _add(item) {
    if (this.items.length >= this.maxItems) this.items.shift();
    this.items.push(item);
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const item of this.items) {
      item.age += dt;
      if (item.age >= item.life) continue;
      if (item.kind === 'particle') { item.x += item.vx * dt; item.y += item.vy * dt; }
      else if (item.kind === 'text') item.y -= 20 * dt;
    }
    this.items = this.items.filter(item => item.age < item.life);
  }
  draw(ctx) {
    if (!ctx || !this.items.length) return;
    ctx.save();
    try {
      ctx.setLineDash([]); ctx.lineWidth = 2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 13px system-ui';
      for (const item of this.items) {
        const progress = Math.max(0, Math.min(1, item.age / item.life));
        ctx.globalAlpha = this.reducedMotion ? 0.75 : (1 - progress) * 0.85;
        ctx.fillStyle = item.color; ctx.strokeStyle = item.color;
        if (item.kind === 'text') {
          ctx.strokeStyle = '#172d32'; ctx.lineWidth = 3;
          ctx.strokeText(item.text, item.x, item.y); ctx.fillText(item.text, item.x, item.y);
          ctx.lineWidth = 2;
        } else {
          const radius = item.kind === 'ring' && !this.reducedMotion
            ? item.radius * (0.35 + progress * 0.65) : item.radius;
          ctx.beginPath(); ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
          if (item.kind === 'ring') ctx.stroke(); else ctx.fill();
        }
      }
    } finally { ctx.restore(); }
  }
}
