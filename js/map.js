'use strict';

const mapCatalog = [
  {
    id: 'arena',
    name: 'Песчаный двор',
    width: 1440,
    height: 960,
    description: 'Рыночные ряды, открытая площадь и два обхода по краям.'
  },
  {
    id: 'courtyard',
    name: 'Двор коттеджа',
    width: 1600,
    height: 1120,
    description: 'Садовые дворики, извилистые проходы и четыре входа в центр.'
  },
  {
    id: 'crossroads',
    name: 'Перекрёсток',
    width: 1728,
    height: 1080,
    description: 'Короткие улицы, тесные переулки и несколько путей для обхода.'
  }
];
function mapWall(x, y, width, height, destructible = false) {
  return { x, y, width, height, ...(destructible ? { destructible: true } : {}) };
}
const mapLayouts = {
  arena: [
    mapWall(420, 173.367, 64, 258.1),
    mapWall(695.333, 199.333, 258.667, 50.1, true),
    mapWall(1087.333, 190.9, 263.333, 58.55),
    mapWall(1484, 242.783, 58.667, 252.217),
    mapWall(280.617, 878.15, 260.183, 60.617),
    mapWall(1393.35, 906.667, 237.033, 40),
    mapWall(450, 591.467, 200, 40, true),
    mapWall(1245.367, 655, 192.967, 48.217, true),
    mapWall(674.117, 791.467, 40, 155.2),
    mapWall(1210.25, 880, 49.783, 220),
    mapWall(847.45, 905.633, 229.45, 41.033, true),
    mapWall(880, 409.433, 230, 40, true),
    mapWall(220, 1098.767, 160, 47.9),
    mapWall(1550, 1106.667, 140, 40),
    mapWall(720, 1106.667, 160, 40),
    mapWall(1571.667, 664.067, 56.967, 82.6)
  ],
  courtyard: [
    mapWall(349.125, 240, 329.998, 64),
    mapWall(349.125, 304, 63.245, 230),
    mapWall(830.008, 240, 219.993, 64, true),
    mapWall(1390.007, 233.696, 420, 62.196),
    mapWall(1745.993, 295.875, 63.998, 213.554),
    mapWall(552.388, 650, 63.473, 300),
    mapWall(1619.993, 680.875, 63.998, 245.357),
    mapWall(779.993, 520, 239.995, 64),
    mapWall(1260, 510, 200.008, 64),
    mapWall(782.898, 1030, 59.115, 230),
    mapWall(1359.995, 1040, 63.998, 250),
    mapWall(981.995, 1120, 235.113, 56, true),
    mapWall(329.998, 1230, 309.995, 64),
    mapWall(329.998, 1060, 63.998, 170),
    mapWall(1630.003, 1210, 300.003, 64),
    mapWall(1866.007, 1050, 63.998, 160),
    mapWall(200.008, 710, 180.005, 56, true),
    mapWall(1869.997, 740, 169.995, 56, true)
  ],
  crossroads: [
    mapWall(419.995, 222.259, 250.007, 187.778),
    mapWall(890.007, 189.204, 240, 156.907),
    mapWall(1472.536, 240, 254.983, 180),
    mapWall(1939.995, 210, 220.005, 210),
    mapWall(449.998, 1140, 279.991, 190),
    mapWall(926.89, 1190, 189.114, 220),
    mapWall(1480.009, 1233.889, 259.995, 155.796),
    mapWall(1960.009, 1181.778, 220.005, 220.722),
    mapWall(755.533, 587.815, 175.26, 177.167),
    mapWall(1651.348, 840.648, 194.664, 163.352),
    mapWall(390.326, 680, 217.23, 56, true),
    mapWall(1993.988, 800, 214.677, 56, true),
    mapWall(1078.77, 523.889, 53.42, 96.907, true),
    mapWall(1420.005, 950.315, 64, 105.796, true),
    mapWall(1280.166, 240, 44.393, 160),
    mapWall(1263.982, 1250, 55.121, 170),
    mapWall(1009.998, 942.759, 129.998, 55.389),
    mapWall(1459.995, 614.222, 129.998, 48.63)
  ]
};
const mapRoads = {
  arena: [
    [
      [100, 640],
      [650, 710],
      [960, 640],
      [1400, 760],
      [1820, 640]
    ],
    [
      [240, 90],
      [560, 130],
      [1180, 120],
      [1700, 160]
    ],
    [
      [260, 1200],
      [920, 1110],
      [1500, 1200]
    ]
  ],
  courtyard: [
    [
      [100, 800],
      [700, 800],
      [1120, 800],
      [1560, 800],
      [2140, 800]
    ],
    [
      [1120, 100],
      [1200, 360],
      [1120, 800],
      [1200, 1000],
      [1120, 1500]
    ],
    [
      [180, 550],
      [480, 560],
      [700, 400],
      [1210, 640]
    ],
    [
      [1450, 950],
      [1600, 1100],
      [1950, 1450]
    ]
  ],
  crossroads: [
    [
      [60, 800],
      [600, 820],
      [1280, 800],
      [1920, 700],
      [2500, 800]
    ],
    [
      [1280, 70],
      [1280, 650],
      [1280, 1150],
      [1280, 1530]
    ],
    [
      [200, 500],
      [2100, 500]
    ],
    [
      [200, 1090],
      [2350, 1090]
    ]
  ]
};
function drawMap(canvasContext, camera = null) {
  if (typeof mapArt !== 'undefined' && mapArt.draw(canvasContext, this, camera)) {
    return;
  }
  canvasContext.fillStyle = { arena: '#d8b579', courtyard: '#99a57c', crossroads: '#a89a98' }[
    this.id
  ];
  canvasContext.fillRect(0, 0, this.width, this.height);
  canvasContext.strokeStyle = '#554451';
  canvasContext.lineWidth = 5;
  canvasContext.strokeRect(2.5, 2.5, this.width - 5, this.height - 5);
  this.teamSpawns.forEach((spawns, team) => {
    canvasContext.strokeStyle = team === 0 ? '#458bac' : '#b9575b';
    canvasContext.setLineDash([5, 5]);
    for (const spawn of spawns) {
      canvasContext.strokeRect(spawn.x, spawn.y, 48, 64);
    }
    canvasContext.setLineDash([]);
  });
  for (const wall of this.walls) {
    canvasContext.fillStyle = wall.destructible ? '#a17950' : '#796878';
    canvasContext.fillRect(wall.x, wall.y, wall.width, wall.height);
    canvasContext.fillStyle = wall.destructible ? '#c69a6b' : '#b9a18e';
    canvasContext.fillRect(wall.x + 2, wall.y + 2, wall.width - 4, 4);
    canvasContext.strokeStyle = '#554451';
    canvasContext.lineWidth = 2;
    canvasContext.strokeRect(wall.x + 1, wall.y + 1, wall.width - 2, wall.height - 2);
    if (wall.destructible) {
      canvasContext.strokeStyle = '#674d38';
      canvasContext.beginPath();
      canvasContext.moveTo(wall.x + wall.width * 0.4, wall.y + 5);
      canvasContext.lineTo(wall.x + wall.width * 0.55, wall.y + wall.height * 0.5);
      canvasContext.lineTo(wall.x + wall.width * 0.35, wall.y + wall.height - 4);
      canvasContext.stroke();
      if (wall.health < wall.maxHealth) {
        canvasContext.fillStyle = '#17242e';
        canvasContext.fillRect(wall.x, wall.y - 7, wall.width, 4);
        canvasContext.fillStyle = '#efc583';
        canvasContext.fillRect(wall.x, wall.y - 7, (wall.width * wall.health) / wall.maxHealth, 4);
      }
    }
  }
}
const mapDesignSizes = { arena: [1920, 1280], courtyard: [2240, 1600], crossroads: [2560, 1600] };
const teamfightMapSizes = { arena: [1152, 768], courtyard: [1280, 896], crossroads: [1384, 864] };
function createMap(id = 'arena', modeId = 'donations') {
  const knownId = Object.prototype.hasOwnProperty.call(mapLayouts, id) ? id : 'arena';
  const definition = mapCatalog.find((map) => map.id === knownId);
  const [width, height] =
    modeId === 'teamfight' ? teamfightMapSizes[knownId] : [definition.width, definition.height];
  const [designWidth, designHeight] = mapDesignSizes[knownId];
  const scaleX = width / designWidth;
  const scaleY = height / designHeight;
  const center = { x: width / 2, y: height / 2 };
  const spawnX = modeId === 'teamfight' ? 56 : 72;
  const spawns = [center.y - 32, 80, height - 144];
  return {
    id: knownId,
    width,
    height,
    spawn: { x: spawnX, y: center.y - 32 },
    navVersion: 0,
    teamSpawns: [
      spawns.map((y) => ({ x: spawnX, y })),
      spawns.map((y) => ({ x: width - spawnX - 48, y }))
    ],
    resourcePoint: center,
    captureZone: {
      x: center.x - 140 * scaleX,
      y: center.y - 110 * scaleY,
      width: 280 * scaleX,
      height: 220 * scaleY
    },
    roads: mapRoads[knownId].map((path) =>
      path.map(([x, y]) => ({ x: x * scaleX, y: y * scaleY }))
    ),
    walls: mapLayouts[knownId].map((wall, index) => ({
      ...wall,
      x: wall.x * scaleX,
      y: wall.y * scaleY,
      width: wall.width * scaleX,
      height: wall.height * scaleY,
      id: `wall-${index}`,
      ...(wall.destructible ? { health: 600, maxHealth: 600 } : {})
    })),
    draw: drawMap
  };
}
function freezeMapTemplate(value) {
  for (const entry of Object.values(value)) {
    if (entry && typeof entry === 'object') {
      freezeMapTemplate(entry);
    }
  }
  return Object.freeze(value);
}
const arena = freezeMapTemplate(createMap('arena'));
