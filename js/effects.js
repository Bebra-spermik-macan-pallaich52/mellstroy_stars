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
    const types = ['shot', 'hit', 'impact', 'death', 'respawn', 'pickup', 'ability', 'wallDestroyed', 'blast', 'ricochet'];
    if (!types.includes(event.type)) return false;
    const signatureColor = { arthur: '#f5ca63', kotost: '#a0ba80', mellstroy_fat: '#e49a58', dark_drun: '#ac91bc', fog: '#b9d4c4', chekunets: '#aee3df', hare: '#f4b15b', mytost: '#8ce0f4' }[event.characterId];
    const color = signatureColor || { shot: '#fff4bc', hit: '#ff967b', impact: '#b4c6d1', death: '#eb8197',
      respawn: '#84e6ca', pickup: '#ffd479', ability: '#b6a0ff', wallDestroyed: '#c69b72', blast: '#e49a58', ricochet: '#b9d4c4' }[event.type];
    const radius = Number.isFinite(event.radius) && event.radius > 0 ? Math.min(240, event.radius) : { shot: 8, hit: 16, impact: 9, death: 30, respawn: 30, pickup: 17, ability: 52, wallDestroyed: 24, blast: 90, ricochet: 13 }[event.type];
    const duration = this.reducedMotion ? 0.14 : event.type === 'ability' ? 0.42 : 0.28;
    this._add({ kind: 'ring', x: event.x, y: event.y, age: 0, life: duration, color, radius });
    if (this.reducedMotion) return true;
    if (event.type === 'ability' && event.characterId) {
      this._add({ kind: 'signature', signature: event.kind, x: event.x, y: event.y,
        angle: Math.atan2(event.dy || 0, event.dx || 1), radius, color, age: 0, life: 0.65 });
    }
    if (event.type === 'shot' && ['claw', 'shadow', 'needle'].includes(event.style)) {
      this._add({ kind: 'signature', signature: event.style, x: event.x, y: event.y,
        angle: Math.atan2(event.dy || 0, event.dx || 1), radius: 22, color, age: 0, life: 0.18 });
    }
    if (event.type === 'blast') this._add({ kind: 'signature', signature: event.characterId === 'mytost' ? 'wave' : 'nova', x: event.x, y: event.y, radius, color, age: 0, life: 0.42 });
    const count = { shot: 0, hit: 5, impact: 3, death: 7, respawn: 4, pickup: 5, ability: 9, wallDestroyed: 10, blast: 10, ricochet: 4 }[event.type];
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
  drawSignature(ctx, item, progress) {
    ctx.save();
    try {
      ctx.translate(item.x, item.y);
      const radius = item.radius * (0.25 + progress * 0.75);
      ctx.strokeStyle = item.color; ctx.fillStyle = item.color; ctx.lineWidth = 3;
      if (item.signature === 'shatter') {
        for (let i=0;i<8;i++) { const angle=i*Math.PI/4; ctx.save(); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(radius,0); ctx.lineTo(radius-12,-5); ctx.lineTo(radius-7,7); ctx.closePath(); ctx.stroke(); ctx.restore(); }
      } else if (item.signature === 'restock') {
        for (let i=0;i<3;i++) { ctx.save(); ctx.rotate(i*Math.PI*2/3); ctx.beginPath(); ctx.moveTo(radius,0); ctx.lineTo(radius-20,-7); ctx.lineTo(radius-20,7); ctx.closePath(); ctx.fill(); ctx.restore(); }
      } else if (item.signature === 'wave') {
        for (let i=0;i<7;i++) { const angle=i*Math.PI*2/7; ctx.beginPath(); ctx.arc(Math.cos(angle)*radius*.65,Math.sin(angle)*radius*.65,8+progress*7,0,Math.PI*2); ctx.stroke(); }
      } else if (item.signature === 'heal') {
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3, x = Math.cos(angle) * radius * 0.65, y = Math.sin(angle) * radius * 0.65;
          ctx.fillRect(x - 3, y - 9, 6, 18); ctx.fillRect(x - 9, y - 3, 18, 6);
        }
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
      } else if (item.signature === 'shield') {
        ctx.beginPath(); for (let i = 0; i <= 6; i++) { const angle = i * Math.PI / 3 - Math.PI / 2; const x = Math.cos(angle) * (35 + progress * 10), y = Math.sin(angle) * (48 + progress * 10); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-15, i * 14); ctx.lineTo(0, i * 14 - 8); ctx.lineTo(15, i * 14); ctx.stroke(); }
      } else if (item.signature === 'nova') {
        ctx.beginPath(); for (let i = 0; i <= 24; i++) { const angle = i * Math.PI / 12; const distance = radius * (i % 2 ? 0.85 : 1); const x = Math.cos(angle) * distance, y = Math.sin(angle) * distance; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
        for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; ctx.beginPath(); ctx.ellipse(Math.cos(angle) * radius, Math.sin(angle) * radius, 4, 7, angle, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.rotate(item.angle || 0);
        if (item.signature === 'heavy') {
          ctx.beginPath(); ctx.moveTo(-15, -8); ctx.lineTo(70 + progress * 70, 0); ctx.lineTo(-15, 8); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(20, 0); ctx.lineTo(0, 20); ctx.stroke();
        } else if (item.signature === 'fan') {
          for (let i = -2; i <= 2; i++) { const angle = i * 0.16; ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 20, Math.sin(angle) * 20); ctx.lineTo(Math.cos(angle) * (80 + progress * 80), Math.sin(angle) * (80 + progress * 80)); ctx.stroke(); }
        } else if (item.signature === 'claw') {
          for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(6, i * 11 - 5); ctx.quadraticCurveTo(28, i * 9, 35, i * 9 + 10); ctx.stroke(); }
        } else if (item.signature === 'shadow') {
          ctx.beginPath(); ctx.arc(12, 0, 13 + progress * 10, -1.4, 1.4); ctx.stroke();
        } else { ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(32, 0); ctx.lineTo(0, 5); ctx.stroke(); }
      }
    } finally { ctx.restore(); }
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
        if (item.kind === 'signature') { this.drawSignature(ctx, item, progress); }
        else if (item.kind === 'text') {
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
