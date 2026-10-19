'use strict';
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
    this.grounds.clear();
    this.wallPatterns.clear();
  }
  tile(column, row, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const canvasContext = canvas.getContext('2d');
    const width = this.image.naturalWidth / 3;
    const height = this.image.naturalHeight / 2;
    canvasContext.drawImage(
      this.image,
      column * width + 2,
      row * height + 2,
      width - 4,
      height - 4,
      0,
      0,
      size,
      size
    );
    return canvas;
  }
  ground(map) {
    const key = `${map.id}:${map.width}x${map.height}`;
    if (this.grounds.has(key)) {
      return this.grounds.get(key);
    }
    const theme = this.themes[map.id];
    const canvas = document.createElement('canvas');
    canvas.width = map.width;
    canvas.height = map.height;
    const canvasContext = canvas.getContext('2d');
    canvasContext.fillStyle = theme.ground;
    canvasContext.fillRect(0, 0, map.width, map.height);
    canvasContext.globalAlpha = 0.12;
    canvasContext.strokeStyle = theme.edge;
    canvasContext.lineWidth = 3;
    if (map.id === 'crossroads') {
      for (let y = 0, row = 0; y < map.height; y += 120, row++) {
        canvasContext.beginPath();
        canvasContext.moveTo(0, y);
        canvasContext.lineTo(map.width, y);
        canvasContext.stroke();
        for (let x = row % 2 ? 120 : 0; x < map.width; x += 240) {
          canvasContext.beginPath();
          canvasContext.moveTo(x, y);
          canvasContext.lineTo(x, y + 120);
          canvasContext.stroke();
        }
      }
    } else {
      for (let y = 90, row = 0; y < map.height; y += 180, row++) {
        for (let x = 80 + (row % 2) * 100; x < map.width; x += 220) {
          canvasContext.beginPath();
          if (map.id === 'courtyard') {
            canvasContext.moveTo(x - 7, y - 8);
            canvasContext.lineTo(x, y);
            canvasContext.lineTo(x + 7, y - 8);
          } else {
            canvasContext.moveTo(x, y);
            canvasContext.lineTo(x + 8, y - 4);
            canvasContext.moveTo(x + 9, y + 5);
            canvasContext.lineTo(x + 17, y + 1);
          }
          canvasContext.stroke();
        }
      }
    }
    canvasContext.globalAlpha = map.id === 'crossroads' ? 0.35 : 0.24;
    canvasContext.strokeStyle = theme.path;
    canvasContext.lineWidth = map.id === 'courtyard' ? 110 : 145;
    canvasContext.lineCap = 'round';
    canvasContext.lineJoin = 'round';
    for (const road of map.roads || []) {
      canvasContext.beginPath();
      road.forEach((point, index) =>
        index ? canvasContext.lineTo(point.x, point.y) : canvasContext.moveTo(point.x, point.y)
      );
      canvasContext.stroke();
    }
    canvasContext.globalAlpha = 0.28;
    canvasContext.strokeStyle = theme.edge;
    canvasContext.lineWidth = 7;
    canvasContext.strokeRect(3.5, 3.5, map.width - 7, map.height - 7);
    canvasContext.globalAlpha = 1;
    this.grounds.set(key, canvas);
    return canvas;
  }
  woodPattern(canvasContext) {
    if (this.wood) {
      return this.wood;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 96;
    const pen = canvas.getContext('2d');
    pen.fillStyle = '#bc8750';
    pen.fillRect(0, 0, 128, 96);
    for (let y = 0; y < 96; y += 32) {
      pen.fillStyle = y === 32 ? '#c49157' : '#bc8750';
      pen.fillRect(0, y, 128, 32);
      pen.strokeStyle = '#65452f';
      pen.lineWidth = 3;
      pen.beginPath();
      pen.moveTo(0, y);
      pen.lineTo(128, y);
      pen.stroke();
    }
    this.wood = canvasContext.createPattern(canvas, 'repeat');
    return this.wood;
  }
  draw(canvasContext, map, camera = null) {
    if (!this.image) {
      return false;
    }
    const theme = this.themes[map.id];
    canvasContext.save();
    const ground = this.ground(map);
    if (camera) {
      canvasContext.drawImage(
        ground,
        camera.x,
        camera.y,
        camera.width,
        camera.height,
        camera.x,
        camera.y,
        camera.width,
        camera.height
      );
    } else {
      canvasContext.drawImage(ground, 0, 0);
    }
    map.teamSpawns.forEach((spawns, team) => {
      for (const spawn of spawns) {
        canvasContext.globalAlpha = 0.35;
        canvasContext.strokeStyle = team === 0 ? '#326c8b' : '#a64d50';
        canvasContext.lineWidth = 3;
        canvasContext.beginPath();
        canvasContext.ellipse(spawn.x + 24, spawn.y + 48, 29, 12, 0, 0, Math.PI * 2);
        canvasContext.stroke();
        canvasContext.globalAlpha = 1;
      }
    });
    if (!this.wallPatterns.has(map.id)) {
      this.wallPatterns.set(
        map.id,
        canvasContext.createPattern(this.tile(theme.tile, 1, 135), 'repeat')
      );
    }
    for (const wall of map.walls) {
      if (camera && !camera.visible(wall, 20)) {
        continue;
      }
      canvasContext.fillStyle = wall.destructible ? '#745035' : theme.side;
      canvasContext.fillRect(wall.x, wall.y, wall.width, wall.height);
      canvasContext.fillStyle = wall.destructible
        ? this.woodPattern(canvasContext)
        : this.wallPatterns.get(map.id);
      canvasContext.fillRect(wall.x + 3, wall.y + 3, wall.width - 6, wall.height - 9);
      canvasContext.strokeStyle = wall.destructible ? '#523d30' : theme.edge;
      canvasContext.lineWidth = 3;
      canvasContext.strokeRect(wall.x + 1.5, wall.y + 1.5, wall.width - 3, wall.height - 3);
      canvasContext.strokeStyle = 'rgba(255,238,190,.5)';
      canvasContext.lineWidth = 2;
      canvasContext.beginPath();
      canvasContext.moveTo(wall.x + 4, wall.y + 4);
      canvasContext.lineTo(wall.x + wall.width - 4, wall.y + 4);
      canvasContext.stroke();
      if (wall.destructible) {
        if (wall.health < wall.maxHealth) {
          canvasContext.fillStyle = '#30212e';
          canvasContext.fillRect(wall.x, wall.y - 9, wall.width, 5);
          canvasContext.fillStyle = '#f8c64c';
          canvasContext.fillRect(
            wall.x + 1,
            wall.y - 8,
            ((wall.width - 2) * wall.health) / wall.maxHealth,
            3
          );
        }
      }
    }
    canvasContext.restore();
    return true;
  }
}
const mapArt = new MapArt();
