'use strict';

// Navigation and decision timers are independent of the browser frame rate.
const botConfig = {
  replanInterval: 0.45, obstacleMargin: 3, waypointTolerance: 0.1,
  reservationPenalty: 80, waitingRadius: 52, stuckTime: 0.65
};

class Bot {
  constructor(actor, index, config = botConfig) {
    this.actor = actor;
    this.index = index;
    this.config = { ...botConfig, ...config };
    this.reset();
  }

  reset() {
    this.targetEnemy = null;
    this.targetItem = null;
    this.goal = null;
    this.path = [];
    this.navigation = null;
    this.navigationCache = [];
    this.replanRemaining = 0;
    this.stuckElapsed = 0;
    this.wasAlive = this.actor.alive;
    this.manager = null;
  }

  // Work with the character center. Wall expansion accounts for its complete
  // rectangular hitbox; the graph is shared between plans for the same map.
  prepareNavigation(map, margin) {
    this.navigationCache = this.navigationCache.filter(nav => nav.map !== map || nav.version === (map.navVersion || 0));
    const cached = this.navigationCache.find(nav => nav.map === map && nav.margin === margin);
    if (cached) { this.navigation = cached; return cached; }
    const halfWidth = this.actor.width / 2, halfHeight = this.actor.height / 2;
    const bounds = {
      left: halfWidth, right: map.width - halfWidth,
      top: halfHeight, bottom: map.height - halfHeight
    };
    const walls = map.walls.map(wall => ({
      x: wall.x - halfWidth - margin, y: wall.y - halfHeight - margin,
      width: wall.width + 2 * (halfWidth + margin),
      height: wall.height + 2 * (halfHeight + margin)
    }));
    const physicalWalls = map.walls.map(wall => ({
      x: wall.x - halfWidth + 1e-6, y: wall.y - halfHeight + 1e-6,
      width: wall.width + 2 * halfWidth - 2e-6,
      height: wall.height + 2 * halfHeight - 2e-6
    }));
    const nav = { map, version: map.navVersion || 0, margin, bounds, walls, physicalWalls, nodes: [], edges: [] };
    const epsilon = 0.01;
    for (const wall of walls) {
      for (const x of [wall.x - epsilon, wall.x + wall.width + epsilon]) {
        for (const y of [wall.y - epsilon, wall.y + wall.height + epsilon]) {
          const point = { x, y };
          if (this.freePoint(point, nav)) nav.nodes.push(point);
        }
      }
    }
    nav.edges = nav.nodes.map(() => []);
    for (let a = 0; a < nav.nodes.length; a++) {
      for (let b = a + 1; b < nav.nodes.length; b++) {
        if (!this.clearSegment(nav.nodes[a], nav.nodes[b], nav)) continue;
        const distance = this.distance(nav.nodes[a], nav.nodes[b]);
        nav.edges[a].push({ index: b, distance });
        nav.edges[b].push({ index: a, distance });
      }
    }
    this.navigation = nav;
    this.navigationCache.push(nav);
    return nav;
  }

  distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  freePoint(point, nav) {
    const bounds = nav.bounds;
    return point.x >= bounds.left && point.x <= bounds.right &&
      point.y >= bounds.top && point.y <= bounds.bottom &&
      !nav.walls.some(wall => point.x >= wall.x && point.x <= wall.x + wall.width &&
        point.y >= wall.y && point.y <= wall.y + wall.height);
  }

  clearSegment(from, to, nav) {
    // An actor already touching a wall must be able to leave it. Its initial
    // center may be inside the extra margin, while its hitbox is collision-free.
    const walls = this.freePoint(from, nav) ? nav.walls : nav.physicalWalls;
    return !walls.some(wall => segmentRectIntersection(from.x, from.y, to.x, to.y, wall) !== null);
  }

  // A donation can lie beside a wall or at the edge of the map. Its center is
  // not necessarily a valid character center: choose a reachable pickup point.
  goalCandidates(point, nav, item = null) {
    const bounds = nav.bounds;
    const clamp = candidate => ({
      x: Math.max(bounds.left, Math.min(bounds.right, candidate.x)),
      y: Math.max(bounds.top, Math.min(bounds.bottom, candidate.y))
    });
    const candidates = [clamp(point)];
    if (!item && this.freePoint(candidates[0], nav)) return candidates;
    for (const wall of nav.walls) {
      candidates.push(clamp({ x: wall.x - 0.01, y: point.y }),
        clamp({ x: wall.x + wall.width + 0.01, y: point.y }),
        clamp({ x: point.x, y: wall.y - 0.01 }),
        clamp({ x: point.x, y: wall.y + wall.height + 0.01 }));
    }
    candidates.push(...nav.nodes);
    return candidates.filter(candidate => {
      if (!this.freePoint(candidate, nav)) return false;
      if (!item) return true;
      const dx = Math.max(0, Math.abs(item.x - candidate.x) - this.actor.width / 2);
      const dy = Math.max(0, Math.abs(item.y - candidate.y) - this.actor.height / 2);
      return dx * dx + dy * dy <= item.radius * item.radius;
    }).sort((a, b) => this.distance(a, point) - this.distance(b, point));
  }

  findPath(from, goal, nav) {
    if (this.clearSegment(from, goal, nav)) return [{ ...goal }];
    const nodes = [...nav.nodes, from, goal];
    const start = nodes.length - 2, finish = nodes.length - 1;
    const edges = nav.edges.map(list => list.slice());
    edges.push([], []);
    for (const endpoint of [start, finish]) {
      for (let index = 0; index < nav.nodes.length; index++) {
        if (!this.clearSegment(nodes[endpoint], nodes[index], nav)) continue;
        const distance = this.distance(nodes[endpoint], nodes[index]);
        edges[endpoint].push({ index, distance });
        edges[index].push({ index: endpoint, distance });
      }
    }
    const distances = nodes.map(() => Infinity), previous = nodes.map(() => -1);
    const visited = new Set();
    distances[start] = 0;
    for (let iteration = 0; iteration < nodes.length; iteration++) {
      let current = -1;
      for (let index = 0; index < nodes.length; index++) {
        if (!visited.has(index) && (current === -1 || distances[index] < distances[current])) current = index;
      }
      if (current === -1 || !Number.isFinite(distances[current])) break;
      if (current === finish) {
        const path = [];
        for (let index = finish; index !== start; index = previous[index]) path.unshift({ ...nodes[index] });
        return path;
      }
      visited.add(current);
      for (const edge of edges[current]) {
        const distance = distances[current] + edge.distance;
        if (distance < distances[edge.index]) {
          distances[edge.index] = distance;
          previous[edge.index] = current;
        }
      }
    }
    return [];
  }

  planTo(point, map, item = null) {
    // A small item needs a closer approach than the usual navigation margin.
    const margin = item ? Math.min(this.config.obstacleMargin, item.radius / 2) : this.config.obstacleMargin;
    // Retry with a tighter safety margin if the normal one closes a corridor
    // that is actually wide enough for the hitbox. Collision handling remains
    // authoritative; no route is allowed through the physical obstacle.
    const margins = margin > 0.05 ? [margin, 0.05] : [margin];
    for (const clearance of margins) {
      const nav = this.prepareNavigation(map, clearance);
      for (const goal of this.goalCandidates(point, nav, item)) {
        const path = this.findPath(this.actor.center, goal, nav);
        if (!path.length) continue;
        this.goal = goal;
        this.path = path;
        return true;
      }
    }
    this.goal = null;
    this.path = [];
    return false;
  }

  chooseObjective(world) {
    const { map, manager } = world;
    this.targetItem = null;
    if (manager.modeId === 'donations') {
      const position = this.actor.center;
      const ranked = manager.mode.items.map(item => {
        const reserved = (world.bots || []).some(bot => bot !== this && bot.actor.alive &&
          bot.actor.team === this.actor.team && bot.targetItem === item);
        return { item, distance: this.distance(position, item) + (reserved ? this.config.reservationPenalty : 0) };
      }).sort((a, b) => a.distance - b.distance);
      for (const candidate of ranked) {
        if (!this.planTo(candidate.item, map, candidate.item)) continue;
        this.targetItem = candidate.item;
        return;
      }
      const angle = this.index * Math.PI / 3;
      this.planTo({
        x: map.resourcePoint.x + Math.cos(angle) * this.config.waitingRadius,
        y: map.resourcePoint.y + Math.sin(angle) * this.config.waitingRadius
      }, map);
    } else if (manager.modeId === 'teamfight') {
      const visible = this.selectEnemy(world);
      const enemy = visible || this.targetEnemy;
      if (!enemy) { this.path = []; this.goal = null; return; }
      const from = this.actor.center, target = enemy.center;
      const distance = this.distance(from, target);
      const preferred = this.actor.config.attack.range * 0.6;
      if (visible && distance <= preferred && distance >= 95) { this.path = []; this.goal = { ...from }; return; }
      if (visible && distance < 95) {
        const divisor = distance || 1;
        this.planTo({ x: from.x + (from.x - target.x) / divisor * 90,
          y: from.y + (from.y - target.y) / divisor * 90 }, map);
      } else this.planTo(target, map);
    } else {
      const zone = map.captureZone;
      const slot = ((this.index % 6) + 6) % 6;
      this.planTo({
        x: zone.x + zone.width * ((slot % 3) + 1) / 4,
        y: zone.y + zone.height * (Math.floor(slot / 3) + 1) / 3
      }, map);
    }
  }

  selectEnemy(world) {
    const from = this.actor.center;
    const opponents = world.actors.filter(actor => actor !== this.actor && actor.alive && actor.team !== this.actor.team)
      .sort((a, b) => this.distance(from, a.center) - this.distance(from, b.center));
    const attack = this.actor.config.attack;
    const visible = opponents.find(actor => this.distance(from, actor.center) <= attack.range &&
      !world.map.walls.some(wall => segmentRectIntersection(from.x, from.y,
        actor.center.x, actor.center.y, wall, attack.radius) !== null));
    this.targetEnemy = visible || opponents[0] || null;
    return visible || null;
  }

  update(dt, world, allowFire = true) {
    if (this.manager !== world.manager || this.wasAlive !== this.actor.alive) {
      this.reset();
      this.manager = world.manager;
    }
    this.wasAlive = this.actor.alive;
    if (!this.actor.alive || !Number.isFinite(dt) || !(dt > 0)) return null;
    this.replanRemaining = Math.max(0, this.replanRemaining - dt);
    if (this.navigation && this.navigation.version !== (world.map.navVersion || 0)) {
      this.navigationCache = []; this.path = []; this.navigation = null; this.replanRemaining = 0;
    }
    if (this.targetItem && !world.manager.mode.items.includes(this.targetItem)) this.replanRemaining = 0;
    if (this.replanRemaining === 0) {
      this.chooseObjective(world);
      this.replanRemaining = this.config.replanInterval;
    }
    const from = this.actor.center;
    while (this.path.length && this.distance(from, this.path[0]) <= this.config.waypointTolerance) this.path.shift();
    let direction = { x: 0, y: 0 };
    if (this.path.length) {
      const point = this.path[0], distance = this.distance(from, point);
      const length = Math.min(1, distance / (this.actor.config.speed * dt));
      direction = { x: (point.x - from.x) / distance * length, y: (point.y - from.y) / distance * length };
    }
    this.actor.update(dt, { direction: () => direction }, world.map);
    const moved = this.distance(from, this.actor.center);
    if (this.path.length && moved < this.actor.config.speed * dt * 0.1) this.stuckElapsed += dt;
    else this.stuckElapsed = 0;
    if (this.stuckElapsed >= this.config.stuckTime) {
      this.path = [];
      this.replanRemaining = 0;
      this.stuckElapsed = 0;
    }
    const enemy = this.selectEnemy(world);
    if (enemy) this.actor.aimAt(enemy.center);
    return allowFire && enemy ? this.actor.attack(enemy.center) : null;
  }
}
