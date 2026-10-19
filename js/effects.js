'use strict';
class VisualEffects {
  constructor({ reducedMotion = false } = {}) {
    this.items = [];
    this.maxItems = 120;
    this.reducedMotion = Boolean(reducedMotion);
  }
  setReducedMotion(value) {
    const next = Boolean(value);
    if (next !== this.reducedMotion) {
      this.clear();
    }
    this.reducedMotion = next;
  }
  clear() {
    this.items.length = 0;
  }
  emit(event) {
    if (!event || !Number.isFinite(event.x) || !Number.isFinite(event.y)) {
      return false;
    }
    const types = [
      'shot',
      'hit',
      'impact',
      'death',
      'respawn',
      'pickup',
      'ability',
      'wallDestroyed',
      'blast',
      'ricochet'
    ];
    if (!types.includes(event.type)) {
      return false;
    }
    const signatureColor = {
      arthur: '#f5ca63',
      kotost: '#a0ba80',
      mellstroy_fat: '#e49a58',
      dark_drun: '#ac91bc',
      fog: '#b9d4c4',
      chekunets: '#aee3df',
      hare: '#f4b15b',
      mytost: '#8ce0f4'
    }[event.characterId];
    const color =
      signatureColor ||
      {
        shot: '#fff4bc',
        hit: '#ff967b',
        impact: '#b4c6d1',
        death: '#eb8197',
        respawn: '#84e6ca',
        pickup: '#ffd479',
        ability: '#b6a0ff',
        wallDestroyed: '#c69b72',
        blast: '#e49a58',
        ricochet: '#b9d4c4'
      }[event.type];
    const radius =
      Number.isFinite(event.radius) && event.radius > 0
        ? Math.min(240, event.radius)
        : {
            shot: 8,
            hit: 16,
            impact: 9,
            death: 30,
            respawn: 30,
            pickup: 17,
            ability: 52,
            wallDestroyed: 24,
            blast: 90,
            ricochet: 13
          }[event.type];
    const duration = this.reducedMotion ? 0.14 : event.type === 'ability' ? 0.42 : 0.28;
    this._add({ kind: 'ring', x: event.x, y: event.y, age: 0, life: duration, color, radius });
    if (this.reducedMotion) {
      return true;
    }
    if (event.type === 'ability' && event.characterId) {
      this._add({
        kind: 'signature',
        signature: event.kind,
        x: event.x,
        y: event.y,
        angle: Math.atan2(event.dy || 0, event.dx || 1),
        radius,
        color,
        age: 0,
        life: 0.65
      });
    }
    if (event.type === 'shot' && ['claw', 'shadow', 'needle'].includes(event.style)) {
      this._add({
        kind: 'signature',
        signature: event.style,
        x: event.x,
        y: event.y,
        angle: Math.atan2(event.dy || 0, event.dx || 1),
        radius: 22,
        color,
        age: 0,
        life: 0.18
      });
    }
    if (event.type === 'blast') {
      this._add({
        kind: 'signature',
        signature: event.characterId === 'mytost' ? 'wave' : 'nova',
        x: event.x,
        y: event.y,
        radius,
        color,
        age: 0,
        life: 0.42
      });
    }
    const count = {
      shot: 0,
      hit: 5,
      impact: 3,
      death: 7,
      respawn: 4,
      pickup: 5,
      ability: 9,
      wallDestroyed: 10,
      blast: 10,
      ricochet: 4
    }[event.type];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.45;
      const speed = 25 + Math.random() * 60;
      this._add({
        kind: 'particle',
        x: event.x,
        y: event.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 0.3 + Math.random() * 0.15,
        color,
        radius: event.type === 'wallDestroyed' ? 3 : 2
      });
    }
    if (event.type === 'hit' && Number.isFinite(event.damage) && event.damage > 0) {
      this._add({
        kind: 'text',
        x: event.x,
        y: event.y - 24,
        age: 0,
        life: 0.65,
        color: '#ffe2d7',
        text: `−${Math.round(Math.min(999999, event.damage))}`
      });
    }
    return true;
  }
  _add(item) {
    if (this.items.length >= this.maxItems) {
      this.items.shift();
    }
    this.items.push(item);
  }
  update(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }
    for (const item of this.items) {
      item.age += deltaTime;
      if (item.age >= item.life) {
        continue;
      }
      if (item.kind === 'particle') {
        item.x += item.vx * deltaTime;
        item.y += item.vy * deltaTime;
      } else if (item.kind === 'text') {
        item.y -= 20 * deltaTime;
      }
    }
    this.items = this.items.filter((item) => item.age < item.life);
  }
  drawSignature(canvasContext, item, progress) {
    canvasContext.save();
    try {
      canvasContext.translate(item.x, item.y);
      const radius = item.radius * (0.25 + progress * 0.75);
      canvasContext.strokeStyle = item.color;
      canvasContext.fillStyle = item.color;
      canvasContext.lineWidth = 3;
      if (item.signature === 'shatter') {
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          canvasContext.save();
          canvasContext.rotate(angle);
          canvasContext.beginPath();
          canvasContext.moveTo(radius, 0);
          canvasContext.lineTo(radius - 12, -5);
          canvasContext.lineTo(radius - 7, 7);
          canvasContext.closePath();
          canvasContext.stroke();
          canvasContext.restore();
        }
      } else if (item.signature === 'restock') {
        for (let i = 0; i < 3; i++) {
          canvasContext.save();
          canvasContext.rotate((i * Math.PI * 2) / 3);
          canvasContext.beginPath();
          canvasContext.moveTo(radius, 0);
          canvasContext.lineTo(radius - 20, -7);
          canvasContext.lineTo(radius - 20, 7);
          canvasContext.closePath();
          canvasContext.fill();
          canvasContext.restore();
        }
      } else if (item.signature === 'wave') {
        for (let i = 0; i < 7; i++) {
          const angle = (i * Math.PI * 2) / 7;
          canvasContext.beginPath();
          canvasContext.arc(
            Math.cos(angle) * radius * 0.65,
            Math.sin(angle) * radius * 0.65,
            8 + progress * 7,
            0,
            Math.PI * 2
          );
          canvasContext.stroke();
        }
      } else if (item.signature === 'heal') {
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          const x = Math.cos(angle) * radius * 0.65;
          const y = Math.sin(angle) * radius * 0.65;
          canvasContext.fillRect(x - 3, y - 9, 6, 18);
          canvasContext.fillRect(x - 9, y - 3, 18, 6);
        }
        canvasContext.beginPath();
        canvasContext.arc(0, 0, radius, 0, Math.PI * 2);
        canvasContext.stroke();
      } else if (item.signature === 'shield') {
        canvasContext.beginPath();
        for (let i = 0; i <= 6; i++) {
          const angle = (i * Math.PI) / 3 - Math.PI / 2;
          const x = Math.cos(angle) * (35 + progress * 10);
          const y = Math.sin(angle) * (48 + progress * 10);
          i ? canvasContext.lineTo(x, y) : canvasContext.moveTo(x, y);
        }
        canvasContext.stroke();
        for (let i = -1; i <= 1; i++) {
          canvasContext.beginPath();
          canvasContext.moveTo(-15, i * 14);
          canvasContext.lineTo(0, i * 14 - 8);
          canvasContext.lineTo(15, i * 14);
          canvasContext.stroke();
        }
      } else if (item.signature === 'nova') {
        canvasContext.beginPath();
        for (let i = 0; i <= 24; i++) {
          const angle = (i * Math.PI) / 12;
          const distance = radius * (i % 2 ? 0.85 : 1);
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          i ? canvasContext.lineTo(x, y) : canvasContext.moveTo(x, y);
        }
        canvasContext.stroke();
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          canvasContext.beginPath();
          canvasContext.ellipse(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            4,
            7,
            angle,
            0,
            Math.PI * 2
          );
          canvasContext.fill();
        }
      } else {
        canvasContext.rotate(item.angle || 0);
        if (item.signature === 'heavy') {
          canvasContext.beginPath();
          canvasContext.moveTo(-15, -8);
          canvasContext.lineTo(70 + progress * 70, 0);
          canvasContext.lineTo(-15, 8);
          canvasContext.stroke();
          canvasContext.beginPath();
          canvasContext.moveTo(0, -20);
          canvasContext.lineTo(20, 0);
          canvasContext.lineTo(0, 20);
          canvasContext.stroke();
        } else if (item.signature === 'fan') {
          for (let i = -2; i <= 2; i++) {
            const angle = i * 0.16;
            canvasContext.beginPath();
            canvasContext.moveTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
            canvasContext.lineTo(
              Math.cos(angle) * (80 + progress * 80),
              Math.sin(angle) * (80 + progress * 80)
            );
            canvasContext.stroke();
          }
        } else if (item.signature === 'claw') {
          for (let i = -1; i <= 1; i++) {
            canvasContext.beginPath();
            canvasContext.moveTo(6, i * 11 - 5);
            canvasContext.quadraticCurveTo(28, i * 9, 35, i * 9 + 10);
            canvasContext.stroke();
          }
        } else if (item.signature === 'shadow') {
          canvasContext.beginPath();
          canvasContext.arc(12, 0, 13 + progress * 10, -1.4, 1.4);
          canvasContext.stroke();
        } else {
          canvasContext.beginPath();
          canvasContext.moveTo(0, -5);
          canvasContext.lineTo(32, 0);
          canvasContext.lineTo(0, 5);
          canvasContext.stroke();
        }
      }
    } finally {
      canvasContext.restore();
    }
  }
  draw(canvasContext) {
    if (!canvasContext || !this.items.length) {
      return;
    }
    canvasContext.save();
    try {
      canvasContext.setLineDash([]);
      canvasContext.lineWidth = 2;
      canvasContext.textAlign = 'center';
      canvasContext.textBaseline = 'middle';
      canvasContext.font = 'bold 13px system-ui';
      for (const item of this.items) {
        const progress = Math.max(0, Math.min(1, item.age / item.life));
        canvasContext.globalAlpha = this.reducedMotion ? 0.75 : (1 - progress) * 0.85;
        canvasContext.fillStyle = item.color;
        canvasContext.strokeStyle = item.color;
        if (item.kind === 'signature') {
          this.drawSignature(canvasContext, item, progress);
        } else if (item.kind === 'text') {
          canvasContext.strokeStyle = '#172d32';
          canvasContext.lineWidth = 3;
          canvasContext.strokeText(item.text, item.x, item.y);
          canvasContext.fillText(item.text, item.x, item.y);
          canvasContext.lineWidth = 2;
        } else {
          const radius =
            item.kind === 'ring' && !this.reducedMotion
              ? item.radius * (0.35 + progress * 0.65)
              : item.radius;
          canvasContext.beginPath();
          canvasContext.arc(item.x, item.y, radius, 0, Math.PI * 2);
          if (item.kind === 'ring') {
            canvasContext.stroke();
          } else {
            canvasContext.fill();
          }
        }
      }
    } finally {
      canvasContext.restore();
    }
  }
}
