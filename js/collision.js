'use strict';
function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
// Small bounded steps prevent tunnelling; separate axes allow sliding.
function moveWithCollisions(body, dx, dy, map) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
  for (let i = 0; i < steps; i++) {
    body.x = Math.max(0, Math.min(map.width - body.width, body.x + dx / steps));
    for (const wall of map.walls) if (overlaps(body, wall)) {
      if (dx > 0) body.x = wall.x - body.width;
      if (dx < 0) body.x = wall.x + wall.width;
    }
    body.y = Math.max(0, Math.min(map.height - body.height, body.y + dy / steps));
    for (const wall of map.walls) if (overlaps(body, wall)) {
      if (dy > 0) body.y = wall.y - body.height;
      if (dy < 0) body.y = wall.y + wall.height;
    }
  }
}
