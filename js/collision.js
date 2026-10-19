'use strict';

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function moveWithCollisions(body, dx, dy, map) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
  for (let i = 0; i < steps; i++) {
    body.x = Math.max(0, Math.min(map.width - body.width, body.x + dx / steps));
    for (const wall of map.walls) {
      if (overlaps(body, wall)) {
        if (dx > 0) {
          body.x = wall.x - body.width;
        }
        if (dx < 0) {
          body.x = wall.x + wall.width;
        }
      }
    }
    body.y = Math.max(0, Math.min(map.height - body.height, body.y + dy / steps));
    for (const wall of map.walls) {
      if (overlaps(body, wall)) {
        if (dy > 0) {
          body.y = wall.y - body.height;
        }
        if (dy < 0) {
          body.y = wall.y + wall.height;
        }
      }
    }
  }
}
function segmentRectIntersection(x, y, endX, endY, rectangle, padding = 0) {
  let entry = 0;
  let exit = 1;
  const axes = [
    [x, endX - x, rectangle.x - padding, rectangle.x + rectangle.width + padding],
    [y, endY - y, rectangle.y - padding, rectangle.y + rectangle.height + padding]
  ];
  for (const [start, delta, minimum, maximum] of axes) {
    if (Math.abs(delta) < 1e-12) {
      if (start < minimum || start > maximum) {
        return null;
      }
      continue;
    }
    const first = (minimum - start) / delta;
    const second = (maximum - start) / delta;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) {
      return null;
    }
  }
  return entry;
}
function segmentMapExit(x, y, endX, endY, map, padding = 0) {
  const right = map.width - padding;
  const bottom = map.height - padding;
  if (x < padding || y < padding || x > right || y > bottom) {
    return 0;
  }
  let hit = null;
  const add = (fraction) => {
    hit = hit === null ? fraction : Math.min(hit, fraction);
  };
  if (endX > x && endX >= right) {
    add((right - x) / (endX - x));
  }
  if (endX < x && endX <= padding) {
    add((padding - x) / (endX - x));
  }
  if (endY > y && endY >= bottom) {
    add((bottom - y) / (endY - y));
  }
  if (endY < y && endY <= padding) {
    add((padding - y) / (endY - y));
  }
  return hit;
}
