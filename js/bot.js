'use strict';

// Navigation and decision timers are independent of the browser frame rate.
const botConfig = {
  replanInterval: 0.45, obstacleMargin: 3, waypointTolerance: 0.1,
  reservationPenalty: 120, waitingRadius: 100, stuckTime: 0.65,
  observationInterval: 0.1, recoverHealth: 0.45, returnHealth: 0.85, separationRadius: 58, dodgeHorizon: 0.55
};

const botNavigationGraphs = new WeakMap();

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
    this.state = 'objective'; this.combatEnabled = true; this.recovering = false;
    this.elapsed = 0; this.observationElapsed = 0; this.observations = new Map();
    this.underFire = 0; this.lastHealth = this.actor.health;
    this.targetPowerup = null; this.dodgeRemaining = 0; this.dodgeCooldown = 0; this.dodgeVector = null;
  }

  // Work with the character center. Wall expansion accounts for its complete
  // rectangular hitbox; the graph is shared between plans for the same map.
  prepareNavigation(map, margin) {
    this.navigationCache = this.navigationCache.filter(nav => nav.map !== map || nav.version === (map.navVersion || 0));
    const cached = this.navigationCache.find(nav => nav.map === map && nav.margin === margin);
    if (cached) { this.navigation = cached; return cached; }
    let shared = botNavigationGraphs.get(map);
    if (!shared || shared.version !== (map.navVersion || 0)) {
      shared = { version: map.navVersion || 0, entries: [] }; botNavigationGraphs.set(map, shared);
    }
    const existing = shared.entries.find(nav => nav.margin === margin && nav.actorWidth === this.actor.width && nav.actorHeight === this.actor.height);
    if (existing) { this.navigation = existing; this.navigationCache.push(existing); return existing; }
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
    const nav = { map, version: map.navVersion || 0, margin, actorWidth: this.actor.width, actorHeight: this.actor.height, bounds, walls, physicalWalls, nodes: [], edges: [] };
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
    shared.entries.push(nav);
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

  // A* on the shared visibility graph; straight-line distance is the heuristic.
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
        if (!visited.has(index) && (current === -1 || distances[index] + this.distance(nodes[index], goal) < distances[current] + this.distance(nodes[current], goal))) current = index;
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

  lineOfFire(from, to, map, radius = this.actor.config.attack.radius) {
    return !map.walls.some(wall => segmentRectIntersection(from.x, from.y, to.x, to.y, wall, radius) !== null);
  }

  observe(dt, world) {
    this.elapsed += dt; this.observationElapsed += dt;
    this.underFire = Math.max(0, this.underFire - dt);
    if (this.actor.health < this.lastHealth || this.actor.hitFlash > 0) this.underFire = 2.4;
    this.lastHealth = this.actor.health;
    if (this.observationElapsed < this.config.observationInterval) return;
    this.observationElapsed = 0;
    for (const actor of world.actors) {
      if (!actor.alive || actor.team === this.actor.team) { this.observations.delete(actor); continue; }
      const point = actor.center, previous = this.observations.get(actor);
      let velocity = { x: 0, y: 0 };
      if (previous) {
        const delta = this.elapsed - previous.time;
        const x = (point.x - previous.x) / delta, y = (point.y - previous.y) / delta;
        // Respawn/teleport is not movement and must never produce a giant lead.
        if (Math.hypot(x, y) <= actor.config.speed * 1.1) velocity = { x, y };
      }
      this.observations.set(actor, { ...point, time: this.elapsed, velocity });
    }
  }

  aimTarget(enemy, map) {
    const position = enemy.center, from = this.actor.center;
    const velocity = this.observations.get(enemy)?.velocity || { x: 0, y: 0 };
    const speed = this.actor.config.attack.speed;
    const dx = position.x - from.x, dy = position.y - from.y;
    const a = velocity.x ** 2 + velocity.y ** 2 - speed ** 2;
    const b = 2 * (dx * velocity.x + dy * velocity.y), c = dx * dx + dy * dy;
    const discriminant = b * b - 4 * a * c;
    let time = 0;
    if (discriminant >= 0 && Math.abs(a) > 1e-8) {
      const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].filter(value => value > 0);
      if (roots.length) time = Math.min(...roots);
    }
    time = Math.min(time, this.actor.config.attack.range / speed, 0.7);
    const prediction = { x: position.x + velocity.x * time, y: position.y + velocity.y * time };
    return this.lineOfFire(from, prediction, map) ? prediction : position;
  }

  tacticalObjective(world, enemy) {
    const from = this.actor.center, health = this.actor.health / this.actor.maxHealth;
    const threat = enemy || this.targetEnemy;
    if (this.recovering) {
      const heals = (world.powerups || []).filter(item => item.kind === 'heal' && this.distance(from, item) < 650)
        .sort((a, b) => this.distance(from, a) - this.distance(from, b));
      for (const item of heals) if (this.planTo(item, world.map, item)) { this.state = 'heal'; this.targetPowerup = item; return true; }
      const threats = world.actors.filter(actor => actor.alive && actor.team !== this.actor.team && this.distance(from, actor.center) < 900);
      const exposed = point => threats.filter(actor => this.distance(point, actor.center) < actor.config.attack.range + 90 && this.lineOfFire(actor.center, point, world.map));
      this.state = 'recover';
      if (!exposed(from).length) { this.path = []; this.goal = { ...from }; return true; }
      const nav = this.prepareNavigation(world.map, this.config.obstacleMargin);
      const candidates = [...nav.nodes, { x: this.actor.spawn.x + this.actor.width / 2, y: this.actor.spawn.y + this.actor.height / 2 }]
        .filter(point => this.distance(from, point) > 45 && this.distance(from, point) < 700)
        .map(point => ({ point, score: exposed(point).length * 1000 + this.distance(from, point) * 0.4
          - Math.min(700, ...threats.map(actor => this.distance(point, actor.center))) * 0.4 }))
        .sort((a, b) => a.score - b.score);
      for (const { point } of candidates.slice(0, 8)) if (this.planTo(point, world.map)) return true;
      if (threat) {
        const distance = this.distance(from, threat.center) || 1;
        if (this.planTo({ x: from.x + (from.x - threat.center.x) / distance * 300, y: from.y + (from.y - threat.center.y) / distance * 300 }, world.map)) return true;
      }
      this.path = []; this.goal = { ...from }; return true;
    }
    // A real health pickup is useful even without an opponent immediately ahead.
    if (health < 0.72) {
      const heals = (world.powerups || []).filter(item => item.kind === 'heal' && this.distance(from, item) < 650)
        .sort((a, b) => this.distance(from, a) - this.distance(from, b));
      for (const item of heals) if (this.planTo(item, world.map, item)) { this.state = 'heal'; this.targetPowerup = item; return true; }
    }
    if (!enemy) return false;
    const carried = world.manager.mode.carried?.get(this.actor) || 0;
    if (carried >= 4 && (health < 0.65 || world.manager.mode.scores[this.actor.team] >= 12)) {
      const point = world.map.resourcePoint, side = this.actor.team === 0 ? -1 : 1;
      if (this.planTo({ x: point.x + side * 310, y: point.y + ((this.index % 3) - 1) * 115 }, world.map)) { this.state = 'protect'; return true; }
    }
    if (world.manager.modeId === 'donations') {
      const nearItem = world.manager.mode.items.some(item => this.distance(from, item) < 150);
      if (nearItem && this.distance(from, enemy.center) > 150) return false;
    }
    const zone = world.map.captureZone;
    const inside = world.manager.modeId === 'cottage' && world.manager.mode.inZone(this.actor);
    if (world.manager.modeId === 'cottage' && !inside && this.distance(from, { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }) > 330) return false;
    const distance = this.distance(from, enemy.center) || 1;
    const ux = (enemy.center.x - from.x) / distance, uy = (enemy.center.y - from.y) / distance;
    const preferred = this.actor.config.attack.range * (this.actor.config.attack.kind === 'scatter' ? 0.46 : this.actor.config.super.kind === 'nova' ? 0.52 : 0.7);
    const radial = Math.max(-150, Math.min(130, distance - preferred));
    const sign = (Math.floor(this.elapsed / 1.8) + this.index) % 2 ? 1 : -1;
    const goal = { x: from.x + ux * radial - uy * sign * 100, y: from.y + uy * radial + ux * sign * 100 };
    if (inside) {
      goal.x = Math.max(zone.x + this.actor.width / 2 + 5, Math.min(zone.x + zone.width - this.actor.width / 2 - 5, goal.x));
      goal.y = Math.max(zone.y + this.actor.height / 2 + 5, Math.min(zone.y + zone.height - this.actor.height / 2 - 5, goal.y));
    }
    if (this.planTo(goal, world.map)) { this.state = 'engage'; return true; }
    return false;
  }

  chooseObjective(world) {
    const { map, manager } = world;
    this.targetItem = null; this.targetPowerup = null; this.state = 'objective';
    const enemy = this.selectEnemy(world);
    if ((this.combatEnabled || this.recovering) && this.tacticalObjective(world, enemy)) return;
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
    const from = this.actor.center, attack = this.actor.config.attack;
    const previous = this.targetEnemy;
    const opponents = world.actors.filter(actor => actor !== this.actor && actor.alive && actor.team !== this.actor.team);
    const score = actor => this.distance(from, actor.center) + actor.health / actor.maxHealth * 90
      - (actor === previous ? 35 : 0) - (world.manager.mode.carried?.get(actor) || 0) * 20;
    const visible = opponents.filter(actor => this.distance(from, actor.center) <= attack.range && this.lineOfFire(from, actor.center, world.map))
      .sort((a, b) => score(a) - score(b));
    this.targetEnemy = visible[0] || opponents.sort((a, b) => this.distance(from, a.center) - this.distance(from, b.center))[0] || null;
    return visible[0] || null;
  }

  steer(direction, world, dt) {
    const from = this.actor.center;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.dodgeRemaining = Math.max(0, this.dodgeRemaining - dt);
    if (this.combatEnabled && this.dodgeCooldown === 0) {
      for (const shot of (world.projectiles || []).slice(0, 32)) {
        if (!shot.active || shot.owner.team === this.actor.team || shot.traveled / shot.speed < 0.12) continue;
        if (!this.lineOfFire({ x: shot.x, y: shot.y }, from, world.map, shot.radius)) continue;
        const vx = shot.direction.x * shot.speed, vy = shot.direction.y * shot.speed;
        const time = ((from.x - shot.x) * vx + (from.y - shot.y) * vy) / (shot.speed ** 2);
        if (time < 0 || time > this.config.dodgeHorizon || time > (shot.range - shot.traveled) / shot.speed) continue;
        const gap = Math.hypot(shot.x + vx * time - from.x, shot.y + vy * time - from.y);
        if (gap > Math.max(this.actor.width, this.actor.height) / 2 + shot.radius + 10) continue;
        const side = (from.x - shot.x) * -shot.direction.y + (from.y - shot.y) * shot.direction.x;
        for (const sign of [side >= 0 ? 1 : -1, side >= 0 ? -1 : 1]) {
          const vector = { x: -shot.direction.y * sign, y: shot.direction.x * sign };
          const nav = this.prepareNavigation(world.map, this.config.obstacleMargin);
          const point = { x: from.x + vector.x * 65, y: from.y + vector.y * 65 };
          if (!this.freePoint(point, nav) || !this.clearSegment(from, point, nav)) continue;
          this.dodgeVector = vector; this.dodgeRemaining = 0.24; this.dodgeCooldown = 0.65; break;
        }
        if (this.dodgeRemaining > 0) break;
      }
    }
    let x = direction.x, y = direction.y;
    if (this.dodgeRemaining > 0) { x = this.dodgeVector.x; y = this.dodgeVector.y; }
    else if (this.path.length) {
      for (const ally of world.actors) {
        if (ally === this.actor || !ally.alive || ally.team !== this.actor.team) continue;
        const dx = from.x - ally.center.x, dy = from.y - ally.center.y, distance = Math.hypot(dx, dy);
        if (distance > 0.01 && distance < this.config.separationRadius) {
          const weight = (1 - distance / this.config.separationRadius) * 0.65;
          x += dx / distance * weight; y += dy / distance * weight;
        }
      }
    }
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    // Never turn a safe route into steering through a corner or a narrow gate.
    if (this.navigation && (x !== direction.x || y !== direction.y)) {
      const ahead = { x: from.x + x * this.actor.config.speed * Math.max(dt, 0.12), y: from.y + y * this.actor.config.speed * Math.max(dt, 0.12) };
      if (!this.freePoint(ahead, this.navigation) || !this.clearSegment(from, ahead, this.navigation)) return direction;
    }
    return { x, y };
  }

  update(dt, world, allowFire = true) {
    if (this.manager !== world.manager || this.wasAlive !== this.actor.alive) {
      this.reset();
      this.manager = world.manager;
    }
    this.wasAlive = this.actor.alive;
    if (!this.actor.alive || !Number.isFinite(dt) || !(dt > 0)) return null;
    this.combatEnabled = allowFire; this.observe(dt, world);
    const recovering = this.recovering ? this.actor.health < this.actor.maxHealth * this.config.returnHealth
      : this.actor.health < this.actor.maxHealth * this.config.recoverHealth;
    if (recovering !== this.recovering) { this.recovering = recovering; this.replanRemaining = 0; }
    this.replanRemaining = Math.max(0, this.replanRemaining - dt);
    if (this.navigation && this.navigation.version !== (world.map.navVersion || 0)) {
      this.navigationCache = []; this.path = []; this.navigation = null; this.replanRemaining = 0;
    }
    if (this.targetItem && !(world.manager.mode.items || []).includes(this.targetItem)) this.replanRemaining = 0;
    if (this.targetPowerup && !(world.powerups || []).includes(this.targetPowerup)) this.replanRemaining = 0;
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
    const steering = this.steer(direction, world, dt);
    this.actor.update(dt, { direction: () => steering }, world.map);
    const moved = this.distance(from, this.actor.center);
    if (this.path.length && moved < this.actor.config.speed * dt * 0.1) this.stuckElapsed += dt;
    else this.stuckElapsed = 0;
    if (this.stuckElapsed >= this.config.stuckTime) {
      this.path = [];
      this.replanRemaining = 0;
      this.stuckElapsed = 0;
    }
    const enemy = this.selectEnemy(world);
    const aim = enemy ? this.aimTarget(enemy, world.map) : null;
    if (aim) this.actor.aimAt(aim);
    return allowFire && !this.recovering && aim ? this.actor.attack(aim) : null;
  }
}
