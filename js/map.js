'use strict';

const mapCatalog = [
  { id: 'arena', name: 'Песчаный двор', width: 1920, height: 1280, description: 'Рыночные ряды, открытая площадь и два обхода по краям.' },
  { id: 'courtyard', name: 'Двор коттеджа', width: 2240, height: 1600, description: 'Садовые дворики, извилистые проходы и четыре входа в центр.' },
  { id: 'crossroads', name: 'Перекрёсток', width: 2560, height: 1600, description: 'Длинные улицы, тесные переулки и несколько путей для обхода.' }
];

function mapWall(x, y, width, height, destructible = false) {
  return { x, y, width, height, ...(destructible ? { destructible: true } : {}) };
}

const mapLayouts = {
  arena: [
    mapWall(420, 250, 64, 280), mapWall(700, 220, 260, 56, true),
    mapWall(1100, 210, 270, 64), mapWall(1460, 270, 64, 260),
    mapWall(350, 890, 280, 64), mapWall(1380, 950, 240, 64),
    mapWall(450, 580, 200, 56, true), mapWall(1270, 620, 200, 56, true),
    mapWall(660, 850, 64, 220), mapWall(1170, 880, 64, 220),
    mapWall(800, 930, 260, 48, true), mapWall(880, 360, 230, 48, true),
    mapWall(220, 1100, 160, 56), mapWall(1550, 1110, 140, 56),
    mapWall(720, 1150, 160, 48), mapWall(1540, 760, 64, 110),
    mapWall(900, 100, 100, 70), mapWall(210, 200, 120, 56)
  ],
  courtyard: [
    mapWall(350, 240, 330, 64), mapWall(350, 304, 64, 230),
    mapWall(830, 240, 220, 64, true), mapWall(1390, 240, 420, 64),
    mapWall(1746, 304, 64, 220), mapWall(550, 650, 64, 300),
    mapWall(1620, 660, 64, 250), mapWall(780, 520, 240, 64),
    mapWall(1260, 510, 200, 64), mapWall(800, 1030, 64, 230),
    mapWall(1360, 1040, 64, 250), mapWall(960, 1120, 240, 56, true),
    mapWall(330, 1230, 310, 64), mapWall(330, 1060, 64, 170),
    mapWall(1630, 1210, 300, 64), mapWall(1866, 1050, 64, 160),
    mapWall(200, 710, 180, 56, true), mapWall(1870, 740, 170, 56, true),
    mapWall(1040, 420, 64, 110, true), mapWall(1170, 1320, 220, 64),
    mapWall(710, 1400, 220, 48), mapWall(1510, 100, 180, 56)
  ],
  crossroads: [
    mapWall(420, 230, 250, 190), mapWall(890, 200, 240, 160),
    mapWall(1450, 240, 260, 180), mapWall(1940, 210, 220, 210),
    mapWall(450, 1140, 280, 190), mapWall(930, 1190, 190, 220),
    mapWall(1480, 1170, 260, 170), mapWall(1960, 1140, 220, 230),
    mapWall(750, 580, 180, 180), mapWall(1670, 840, 200, 180),
    mapWall(400, 680, 220, 56, true), mapWall(1970, 800, 220, 56, true),
    mapWall(1100, 510, 64, 100, true), mapWall(1420, 1000, 64, 120, true),
    mapWall(1260, 240, 56, 160), mapWall(1260, 1250, 56, 170),
    mapWall(1010, 940, 130, 56), mapWall(1460, 640, 130, 56),
    mapWall(200, 980, 150, 64), mapWall(2200, 520, 150, 64),
    mapWall(680, 970, 150, 48, true), mapWall(1790, 560, 160, 48, true)
  ]
};

const mapRoads = {
  arena: [[[100, 640], [650, 710], [960, 640], [1400, 760], [1820, 640]], [[240, 90], [560, 130], [1180, 120], [1700, 160]], [[260, 1200], [920, 1110], [1500, 1200]]],
  courtyard: [[[100, 800], [700, 800], [1120, 800], [1560, 800], [2140, 800]], [[1120, 100], [1200, 360], [1120, 800], [1200, 1000], [1120, 1500]], [[180, 550], [480, 560], [700, 400], [1210, 640]], [[1450, 950], [1600, 1100], [1950, 1450]]],
  crossroads: [[[60, 800], [600, 820], [1280, 800], [1920, 700], [2500, 800]], [[1280, 70], [1280, 650], [1280, 1150], [1280, 1530]], [[200, 500], [2100, 500]], [[200, 1090], [2350, 1090]]]
};

function drawMap(ctx, camera = null) {
  if (typeof mapArt !== 'undefined' && mapArt.draw(ctx, this, camera)) return;
  ctx.fillStyle = { arena: '#d8b579', courtyard: '#99a57c', crossroads: '#a89a98' }[this.id];
  ctx.fillRect(0, 0, this.width, this.height);
  ctx.strokeStyle = '#554451'; ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, this.width - 5, this.height - 5);
  this.teamSpawns.forEach((spawns, team) => {
    ctx.strokeStyle = team === 0 ? '#458bac' : '#b9575b'; ctx.setLineDash([5, 5]);
    for (const spawn of spawns) ctx.strokeRect(spawn.x, spawn.y, 48, 64);
    ctx.setLineDash([]);
  });
  for (const wall of this.walls) {
    ctx.fillStyle = '#0f202c'; ctx.fillRect(wall.x + 5, wall.y + 6, wall.width, wall.height);
    ctx.fillStyle = wall.destructible ? '#a17950' : '#796878'; ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    ctx.fillStyle = wall.destructible ? '#c69a6b' : '#b9a18e'; ctx.fillRect(wall.x, wall.y, wall.width, 5);
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
  const definition = mapCatalog.find(map => map.id === knownId);
  const { width, height } = definition;
  const center = { x: width / 2, y: height / 2 };
  const spawns = [center.y - 32, 120, height - 184];
  return {
    id: knownId, width, height, spawn: { x: 120, y: center.y - 32 }, navVersion: 0,
    teamSpawns: [spawns.map(y => ({ x: 120, y })), spawns.map(y => ({ x: width - 168, y }))],
    resourcePoint: center,
    captureZone: { x: center.x - 140, y: center.y - 110, width: 280, height: 220 },
    roads: mapRoads[knownId].map(path => path.map(([x, y]) => ({ x, y }))),
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
