'use strict';

const mapCatalog = [
  { id: 'arena', name: 'Тестовая арена', description: 'Открытый центр и боковые проходы.' },
  { id: 'courtyard', name: 'Двор коттеджа', description: 'Симметричные перегородки вокруг центра.' },
  { id: 'crossroads', name: 'Перекрёсток', description: 'Четыре бастиона и широкие коридоры.' }
];

const mapLayouts = {
  arena: [
    { x: 270, y: 140, width: 48, height: 230 },
    { x: 450, y: 120, width: 230, height: 40, destructible: true },
    { x: 460, y: 440, width: 220, height: 48, destructible: true },
    { x: 760, y: 270, width: 50, height: 200 },
    { x: 130, y: 490, width: 150, height: 40 }
  ],
  courtyard: [
    { x: 230, y: 110, width: 200, height: 44 },
    { x: 530, y: 486, width: 200, height: 44 },
    { x: 220, y: 280, width: 44, height: 140, destructible: true },
    { x: 696, y: 220, width: 44, height: 140, destructible: true },
    { x: 530, y: 110, width: 200, height: 44 },
    { x: 230, y: 486, width: 200, height: 44 }
  ],
  crossroads: [
    { x: 260, y: 120, width: 120, height: 100 },
    { x: 580, y: 120, width: 120, height: 100 },
    { x: 260, y: 420, width: 120, height: 100 },
    { x: 580, y: 420, width: 120, height: 100 },
    { x: 450, y: 145, width: 60, height: 36, destructible: true },
    { x: 450, y: 459, width: 60, height: 36, destructible: true }
  ]
};

function drawMap(ctx) {
  ctx.fillStyle = '#1c2d39'; ctx.fillRect(0, 0, this.width, this.height);
  ctx.strokeStyle = '#263b49'; ctx.lineWidth = 1;
  for (let x = 0; x <= this.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke(); }
  for (let y = 0; y <= this.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke(); }
  this.teamSpawns.forEach((spawns, team) => {
    ctx.strokeStyle = team === 0 ? '#73e3c0' : '#ff8c86'; ctx.setLineDash([5, 5]);
    for (const spawn of spawns) ctx.strokeRect(spawn.x, spawn.y, 48, 64);
    ctx.setLineDash([]);
  });
  for (const wall of this.walls) {
    ctx.fillStyle = '#0f202c'; ctx.fillRect(wall.x + 5, wall.y + 6, wall.width, wall.height);
    ctx.fillStyle = wall.destructible ? '#a17950' : '#506b80'; ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    ctx.fillStyle = wall.destructible ? '#c69a6b' : '#6b879a'; ctx.fillRect(wall.x, wall.y, wall.width, 5);
    if (wall.destructible) {
      ctx.strokeStyle = '#674d38'; ctx.beginPath();
      ctx.moveTo(wall.x + wall.width * 0.4, wall.y + 5); ctx.lineTo(wall.x + wall.width * 0.55, wall.y + wall.height * 0.5);
      ctx.lineTo(wall.x + wall.width * 0.35, wall.y + wall.height - 4); ctx.stroke();
      if (wall.health < wall.maxHealth) {
        ctx.fillStyle = '#17242e'; ctx.fillRect(wall.x, wall.y - 7, wall.width, 4);
        ctx.fillStyle = '#efc583'; ctx.fillRect(wall.x, wall.y - 7, wall.width * wall.health / wall.maxHealth, 4);
      }
    }
  }
}

function createMap(id = 'arena') {
  const knownId = Object.prototype.hasOwnProperty.call(mapLayouts, id) ? id : 'arena';
  return {
    id: knownId, width: 960, height: 640, spawn: { x: 120, y: 300 }, navVersion: 0,
    teamSpawns: [
      [{ x: 120, y: 300 }, { x: 70, y: 80 }, { x: 70, y: 550 }],
      [{ x: 840, y: 288 }, { x: 840, y: 80 }, { x: 840, y: 540 }]
    ],
    resourcePoint: { x: 480, y: 320 },
    captureZone: { x: 400, y: 230, width: 230, height: 180 },
    walls: mapLayouts[knownId].map((wall, index) => ({ ...wall, id: `wall-${index}`,
      ...(wall.destructible ? { health: 600, maxHealth: 600 } : {}) })),
    draw: drawMap
  };
}

function freezeMapTemplate(value) {
  for (const entry of Object.values(value)) if (entry && typeof entry === 'object') freezeMapTemplate(entry);
  return Object.freeze(value);
}

// Use createMap for live matches. This immutable fixture cannot lose its walls.
const arena = freezeMapTemplate(createMap('arena'));
