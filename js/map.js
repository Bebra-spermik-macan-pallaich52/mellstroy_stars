'use strict';
const arena = {
  width: 960, height: 640, spawn: { x: 120, y: 300 },
  walls: [
    { x: 270, y: 140, width: 48, height: 230 },
    { x: 450, y: 120, width: 230, height: 40 },
    { x: 460, y: 440, width: 220, height: 48 },
    { x: 760, y: 270, width: 50, height: 200 },
    { x: 130, y: 490, width: 150, height: 40 }
  ],
  draw(ctx) {
    ctx.fillStyle = '#1c2d39'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = '#263b49'; ctx.lineWidth = 1;
    for (let x = 0; x <= this.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke(); }
    for (let y = 0; y <= this.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke(); }
    ctx.strokeStyle = '#73e3c0'; ctx.setLineDash([5, 5]); ctx.strokeRect(this.spawn.x - 8, this.spawn.y - 8, 48, 48); ctx.setLineDash([]);
    for (const wall of this.walls) {
      ctx.fillStyle = '#0f202c'; ctx.fillRect(wall.x + 5, wall.y + 6, wall.width, wall.height);
      ctx.fillStyle = '#506b80'; ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      ctx.fillStyle = '#6b879a'; ctx.fillRect(wall.x, wall.y, wall.width, 5);
    }
  }
};
