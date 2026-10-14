'use strict';

// Rendering only. Neither textures nor decorative paths affect collisions or bots.
class MapArt {
  constructor() {
    this.image = null;
    this.grounds = new Map();
    this.wallPatterns = new Map();
    this.wood = null;
    this.themes = {
      arena: { tile: 0, ground: '#d8b579', side: '#925039', edge: '#56372e', path: '#f3d6a0' },
      courtyard: { tile: 1, ground: '#99a57c', side: '#465e4c', edge: '#304d40', path: '#d5c9a0' },
      crossroads: { tile: 2, ground: '#a89a98', side: '#5e485c', edge: '#453446', path: '#c6b5a7' }
    };
  }

  async load(loader) {
    this.image = await loader.load('assets/maps/materials.png');
    this.grounds.clear(); this.wallPatterns.clear();
  }

  tile(column, row, size) {
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const width = this.image.naturalWidth / 3, height = this.image.naturalHeight / 2;
    // Inset avoids neighboring materials bleeding into downsampled edges.
    ctx.drawImage(this.image, column * width + 2, row * height + 2, width - 4, height - 4, 0, 0, size, size);
    return canvas;
  }

  ground(map) {
    if (this.grounds.has(map.id)) return this.grounds.get(map.id);
    const theme = this.themes[map.id];
    const canvas = document.createElement('canvas'); canvas.width = map.width; canvas.height = map.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = theme.ground; ctx.fillRect(0, 0, map.width, map.height);
    ctx.globalAlpha = map.id === 'courtyard' ? 0.48 : map.id === 'crossroads' ? 0.40 : 0.62;
    ctx.fillStyle = ctx.createPattern(this.tile(theme.tile, 0, map.id === 'crossroads' ? 190 : 270), 'repeat'); ctx.fillRect(0, 0, map.width, map.height);
    ctx.globalAlpha = 0.22; ctx.strokeStyle = theme.path; ctx.lineWidth = map.id === 'courtyard' ? 75 : 110; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 330); ctx.bezierCurveTo(240, 380, 620, 280, map.width, 330); ctx.stroke();
    if (map.id === 'crossroads') { ctx.beginPath(); ctx.moveTo(480, 0); ctx.lineTo(480, map.height); ctx.stroke(); }
    if (map.id === 'courtyard') {
      ctx.globalAlpha = 0.18; ctx.strokeStyle = '#f8e4bc'; ctx.lineWidth = 2;
      for (let x = 35; x < map.width; x += 56) {
        const y = 324 + Math.sin(x / 150) * 20;
        ctx.strokeRect(x, y - 15, 35, 30);
      }
    }
    ctx.globalAlpha = 0.28; ctx.strokeStyle = theme.edge; ctx.lineWidth = 7;
    ctx.strokeRect(3.5, 3.5, map.width - 7, map.height - 7);
    ctx.globalAlpha = 1;
    this.grounds.set(map.id, canvas); return canvas;
  }

  woodPattern(ctx) {
    if (this.wood) return this.wood;
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 96;
    const pen = canvas.getContext('2d'); pen.fillStyle = '#bc8750'; pen.fillRect(0, 0, 128, 96);
    pen.strokeStyle = '#65452f'; pen.lineWidth = 3;
    for (let y = 0; y < 96; y += 24) {
      pen.fillStyle = y % 48 ? '#b57c48' : '#c49157'; pen.fillRect(0, y, 128, 23);
      pen.beginPath(); pen.moveTo(0, y + 23); pen.lineTo(128, y + 23); pen.stroke();
      pen.strokeStyle = '#e2b67c'; pen.lineWidth = 1;
      pen.beginPath(); pen.moveTo(5, y + 4); pen.bezierCurveTo(35, y + 1, 80, y + 8, 120, y + 4); pen.stroke();
      pen.strokeStyle = '#65452f'; pen.lineWidth = 2;
      for (const x of [7, 119]) { pen.fillStyle = '#513b31'; pen.beginPath(); pen.arc(x, y + 12, 2, 0, Math.PI * 2); pen.fill(); }
    }
    this.wood = ctx.createPattern(canvas, 'repeat'); return this.wood;
  }

  draw(ctx, map) {
    if (!this.image) return false;
    const theme = this.themes[map.id];
    ctx.save(); ctx.drawImage(this.ground(map), 0, 0);
    map.teamSpawns.forEach((spawns, team) => {
      for (const spawn of spawns) {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = team === 0 ? '#326c8b' : '#a64d50'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(spawn.x + 24, spawn.y + 48, 29, 12, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    if (!this.wallPatterns.has(map.id)) this.wallPatterns.set(map.id, ctx.createPattern(this.tile(theme.tile, 1, 135), 'repeat'));
    for (const wall of map.walls) {
      ctx.fillStyle = 'rgba(48,33,46,.25)'; ctx.fillRect(wall.x + 6, wall.y + 10, wall.width, wall.height);
      ctx.fillStyle = wall.destructible ? '#745035' : theme.side; ctx.fillRect(wall.x, wall.y + 7, wall.width, wall.height);
      ctx.fillStyle = wall.destructible ? this.woodPattern(ctx) : this.wallPatterns.get(map.id); ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      ctx.strokeStyle = wall.destructible ? '#523d30' : theme.edge; ctx.lineWidth = 3;
      ctx.strokeRect(wall.x + 1.5, wall.y + 1.5, wall.width - 3, wall.height - 3);
      ctx.strokeStyle = 'rgba(255,238,190,.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(wall.x + 4, wall.y + 4); ctx.lineTo(wall.x + wall.width - 4, wall.y + 4); ctx.stroke();
      if (wall.destructible) {
        ctx.strokeStyle = '#f4d298'; ctx.lineWidth = 2;
        const center = wall.x + wall.width / 2;
        ctx.beginPath(); ctx.moveTo(center - 6, wall.y + 8); ctx.lineTo(center + 3, wall.y + wall.height / 2); ctx.lineTo(center - 4, wall.y + wall.height - 7); ctx.stroke();
        if (wall.health < wall.maxHealth) {
          ctx.fillStyle = '#30212e'; ctx.fillRect(wall.x, wall.y - 9, wall.width, 5);
          ctx.fillStyle = '#f8c64c'; ctx.fillRect(wall.x + 1, wall.y - 8, (wall.width - 2) * wall.health / wall.maxHealth, 3);
        }
      }
    }
    ctx.restore(); return true;
  }
}
const mapArt = new MapArt();
