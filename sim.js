// Core simulation logic for Caveman World
// Deterministic seeded RNG to keep runs reproducible
class SeededRNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
  }
  next() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }
  range(min, max) {
    return min + (max - min) * this.next();
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  choice(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
}

function clampStat(v) {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

const TILE = {
  GRASS: 'grass',
  FOREST: 'forest',
  STONE: 'stone',
  WATER: 'water'
};

const TILE_COLORS = {
  [TILE.GRASS]: '#7fbf7f',
  [TILE.FOREST]: '#4f8b4f',
  [TILE.STONE]: '#b5b5b5',
  [TILE.WATER]: '#4aa3d8'
};

class TileMap {
  constructor(width, height, rng) {
    this.width = width;
    this.height = height;
    this.rng = rng;
    this.tiles = new Array(width * height).fill(TILE.GRASS);
    this.generate();
  }
  index(x, y) {
    return y * this.width + x;
  }
  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
  get(x, y) {
    if (!this.inBounds(x, y)) return TILE.GRASS;
    return this.tiles[this.index(x, y)];
  }
  set(x, y, type) {
    if (this.inBounds(x, y)) {
      this.tiles[this.index(x, y)] = type;
    }
  }
  generate() {
    // Start with grass, then add a wandering river, forest clusters, and stone patches
    const riverX = this.rng.int(10, Math.max(11, this.width - 10));
    let x = riverX;
    for (let y = 0; y < this.height; y++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        this.set(nx, y, TILE.WATER);
      }
      x += this.rng.int(-1, 1);
      x = Math.max(2, Math.min(this.width - 3, x));
    }

    const placePatch = (type, count, radius) => {
      for (let i = 0; i < count; i++) {
        const cx = this.rng.int(0, this.width - 1);
        const cy = this.rng.int(0, this.height - 1);
        const r = this.rng.range(radius * 0.5, radius * 1.5);
        for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(this.height, Math.ceil(cy + r)); y++) {
          for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(this.width, Math.ceil(cx + r)); x++) {
            const dx = x - cx;
            const dy = y - cy;
            if (Math.sqrt(dx * dx + dy * dy) <= r && this.get(x, y) !== TILE.WATER) {
              this.set(x, y, type);
            }
          }
        }
      }
    };

    placePatch(TILE.FOREST, Math.floor((this.width * this.height) / 400), 6);
    placePatch(TILE.STONE, Math.floor((this.width * this.height) / 500), 4);

    // Create small lakes
    placePatch(TILE.WATER, Math.floor((this.width * this.height) / 1200), 4);
  }

  randomWalkable(rng) {
    let attempts = 0;
    while (attempts < 2000) {
      const x = rng.int(0, this.width - 1);
      const y = rng.int(0, this.height - 1);
      if (this.get(x, y) !== TILE.WATER) {
        return { x, y };
      }
      attempts++;
    }
    return { x: 0, y: 0 };
  }
}

let ENTITY_ID = 1;
class Entity {
  constructor(type, x, y, opts = {}) {
    this.id = ENTITY_ID++;
    this.type = type;
    this.x = x;
    this.y = y;
    this.target = null;
    this.speed = opts.speed || 0.05;
    this.radius = 0.3;
    this.needs = {
      health: 100,
      hunger: 10,
      thirst: 10,
      energy: 100
    };
    this.inventory = { wood: 0, stone: 0, stick: 0, food: 0 };
    this.sex = opts.sex || (opts.rng && opts.rng.chance(0.5) ? 'male' : 'female');
    this.isBaby = false;
    this.age = 0;
    this.currentAction = 'idle';
  }
  distanceTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  moveToward(tx, ty, map, rng) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const nx = this.x + (dx / dist) * this.speed;
    const ny = this.y + (dy / dist) * this.speed;
    const txTile = Math.round(nx);
    const tyTile = Math.round(ny);
    if (map.get(txTile, tyTile) === TILE.WATER) {
      // Pick a small detour
      const alt = map.randomWalkable(rng);
      this.target = { x: alt.x + rng.next(), y: alt.y + rng.next() };
      return;
    }
    this.x = nx;
    this.y = ny;
  }
  decay() {
    // Small baseline decay
    this.needs.hunger = clampStat(this.needs.hunger + 0.03);
    this.needs.thirst = clampStat(this.needs.thirst + 0.06);
    this.needs.energy = clampStat(this.needs.energy - 0.02);
    if (this.needs.thirst > 90 || this.needs.hunger > 95) {
      this.needs.health = clampStat(this.needs.health - 0.5);
    } else if (this.needs.health < 100 && this.needs.hunger < 60 && this.needs.thirst < 60) {
      this.needs.health = clampStat(this.needs.health + 0.05);
    }
  }
}

class Human extends Entity {
  constructor(x, y, rng) {
    super('human', x, y, { speed: 0.08 + rng.next() * 0.02, rng });
    this.perception = 6 + Math.floor(rng.next() * 4);
    this.knowledge = {
      discoveredTypes: new Set(),
      dangerScore: {},
      foodScore: {},
      friendScore: {}
    };
    this.mateCooldown = 0;
    this.shelter = null;
  }

  perceive(world) {
    const seen = [];
    for (const e of world.entities) {
      if (e === this) continue;
      const d = this.distanceTo(e);
      if (d <= this.perception) {
        seen.push(e);
        this.knowledge.discoveredTypes.add(e.type);
      }
    }
    // Also perceive tiles for resources
    const tiles = [];
    const px = Math.round(this.x);
    const py = Math.round(this.y);
    for (let dy = -this.perception; dy <= this.perception; dy++) {
      for (let dx = -this.perception; dx <= this.perception; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (!world.map.inBounds(x, y)) continue;
        const t = world.map.get(x, y);
        tiles.push({ x, y, type: t });
        if (t === TILE.WATER) {
          this.knowledge.discoveredTypes.add('water');
        }
      }
    }
    return { seen, tiles };
  }

  chooseAction(world, perception) {
    const { hunger, thirst, energy } = this.needs;
    const rng = world.rng;
    const predators = perception.seen.filter(e => e.type === 'wolf');
    const prey = perception.seen.filter(e => e.type === 'sheep');
    const friends = perception.seen.filter(e => e.type === 'human');
    const nearWater = perception.tiles.find(t => t.type === TILE.WATER && Math.abs(t.x - Math.round(this.x)) <= 1 && Math.abs(t.y - Math.round(this.y)) <= 1);

    const utilities = [];
    const dangerScore = (this.knowledge.dangerScore['wolf'] || 0) + predators.length * 0.2;
    utilities.push({ action: 'flee', score: Math.min(1, dangerScore) });
    utilities.push({ action: 'drink', score: nearWater ? thirst / 100 : (this.knowledge.discoveredTypes.has('water') ? thirst / 120 : 0) });
    utilities.push({ action: 'eat', score: hunger / 100 });
    utilities.push({ action: 'rest', score: energy < 40 ? 0.7 : 0.1 });
    utilities.push({ action: 'gather', score: (hunger < 70 && thirst < 70) ? 0.3 : 0.15 });
    utilities.push({ action: 'explore', score: 0.2 + rng.next() * 0.1 });
    utilities.push({ action: 'social', score: friends.length > 0 ? 0.25 : 0.05 });
    const matePossible = friends.find(f => f.sex !== this.sex && !f.isBaby && (f.mateCooldown || 0) <= 0);
    utilities.push({ action: 'mate', score: matePossible && energy > 60 && hunger < 60 && thirst < 60 ? 0.4 : 0 });

    // Pick max
    let best = utilities[0];
    for (const u of utilities) {
      if (u.score > best.score + 1e-6 || (Math.abs(u.score - best.score) < 1e-6 && rng.chance(0.5))) {
        best = u;
      }
    }
    return best.action;
  }

  doAction(action, world, perception) {
    const rng = world.rng;
    const tileUnder = world.map.get(Math.round(this.x), Math.round(this.y));
    const { hunger, thirst } = this.needs;

    const findNearbyTile = (types) => {
      const px = Math.round(this.x);
      const py = Math.round(this.y);
      let best = null;
      let bestDist = Infinity;
      for (let dy = -this.perception; dy <= this.perception; dy++) {
        for (let dx = -this.perception; dx <= this.perception; dx++) {
          const x = px + dx;
          const y = py + dy;
          if (!world.map.inBounds(x, y)) continue;
          const t = world.map.get(x, y);
          if (types.includes(t)) {
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestDist) {
              bestDist = d;
              best = { x, y };
            }
          }
        }
      }
      return best;
    };

    if (action === 'flee') {
      const predator = perception.seen.find(e => e.type === 'wolf');
      if (predator) {
        const dx = this.x - predator.x;
        const dy = this.y - predator.y;
        const away = { x: this.x + dx, y: this.y + dy };
        this.target = away;
      }
    } else if (action === 'drink') {
      const water = findNearbyTile([TILE.WATER]);
      if (water && Math.abs(water.x - Math.round(this.x)) <= 1 && Math.abs(water.y - Math.round(this.y)) <= 1) {
        this.needs.thirst = clampStat(thirst - 35);
        this.knowledge.discoveredTypes.add('water');
      } else if (water) {
        this.target = { x: water.x + 0.1, y: water.y + 0.1 };
      }
    } else if (action === 'eat') {
      if (this.inventory.food > 0) {
        this.inventory.food -= 1;
        this.needs.hunger = clampStat(hunger - 35);
        this.knowledge.foodScore['food'] = (this.knowledge.foodScore['food'] || 0) + 0.2;
      } else {
        const prey = perception.seen.find(e => e.type === 'sheep');
        if (prey && this.distanceTo(prey) < 1.2) {
          prey.needs.health = 0;
          this.inventory.food += 2;
          this.knowledge.foodScore['sheep'] = (this.knowledge.foodScore['sheep'] || 0) + 0.3;
        } else if (prey) {
          this.target = { x: prey.x, y: prey.y };
        }
      }
    } else if (action === 'gather') {
      // Look for trees or stones nearby
      const nearTree = findNearbyTile([TILE.FOREST]);
      const nearStone = findNearbyTile([TILE.STONE]);
      if (nearTree && Math.abs(nearTree.x - Math.round(this.x)) <= 1 && Math.abs(nearTree.y - Math.round(this.y)) <= 1) {
        this.inventory.wood += 1;
        if (rng.chance(0.2)) this.inventory.stick += 1;
      } else if (nearTree) {
        this.target = { x: nearTree.x, y: nearTree.y };
      } else if (nearStone && Math.abs(nearStone.x - Math.round(this.x)) <= 1 && Math.abs(nearStone.y - Math.round(this.y)) <= 1) {
        this.inventory.stone += 1;
      } else if (nearStone) {
        this.target = { x: nearStone.x, y: nearStone.y };
      } else {
        const stick = world.items.find(i => i.type === 'stick' && this.distanceTo(i) < this.perception);
        if (stick) {
          if (this.distanceTo(stick) < 0.8) {
            this.inventory.stick += 1;
            stick.consumed = true;
          } else {
            this.target = { x: stick.x, y: stick.y };
          }
        }
      }
    } else if (action === 'rest') {
      this.target = null;
      const boost = this.shelter ? 0.5 : 0.3;
      this.needs.energy = clampStat(this.needs.energy + boost);
      this.needs.hunger = clampStat(this.needs.hunger + 0.01);
      this.needs.thirst = clampStat(this.needs.thirst + 0.01);
    } else if (action === 'explore') {
      if (!this.target || this.distanceTo(this.target) < 0.5) {
        const dir = rng.range(0, Math.PI * 2);
        const dist = rng.range(2, this.perception);
        const tx = clampStat(Math.round(this.x + Math.cos(dir) * dist));
        const ty = clampStat(Math.round(this.y + Math.sin(dir) * dist));
        this.target = { x: tx, y: ty };
      }
    } else if (action === 'social') {
      const friend = perception.seen.find(e => e.type === 'human');
      if (friend) {
        if (this.distanceTo(friend) > 1.2) {
          this.target = { x: friend.x, y: friend.y };
        }
        this.knowledge.friendScore[friend.id] = (this.knowledge.friendScore[friend.id] || 0) + 0.01;
      }
    } else if (action === 'mate') {
      const partner = perception.seen.find(e => e.type === 'human' && e.sex !== this.sex && !e.isBaby && (e.mateCooldown || 0) <= 0);
      if (partner) {
        if (this.distanceTo(partner) < 1.2) {
          if (this.mateCooldown <= 0 && partner.mateCooldown <= 0) {
            world.spawnBaby(this, partner);
            this.mateCooldown = 500;
            partner.mateCooldown = 500;
          }
        } else {
          this.target = { x: partner.x, y: partner.y };
        }
      }
    }

    // Shelter construction if tired and resources available
    if (!this.shelter && this.needs.energy < 40 && this.inventory.wood >= 2 && this.inventory.stick >= 2 && world.canBuildShelter(Math.round(this.x), Math.round(this.y))) {
      world.buildShelter(Math.round(this.x), Math.round(this.y));
      this.shelter = { x: Math.round(this.x), y: Math.round(this.y) };
      this.inventory.wood -= 2;
      this.inventory.stick -= 2;
    }

    this.currentAction = action;
  }

  step(world) {
    this.age++;
    if (this.mateCooldown > 0) this.mateCooldown--;
    this.decay();
    const perception = this.perceive(world);
    const action = this.chooseAction(world, perception);
    this.doAction(action, world, perception);

    if (this.target) {
      this.moveToward(this.target.x, this.target.y, world.map, world.rng);
      this.needs.energy = clampStat(this.needs.energy - 0.05);
    }
  }
}

class Animal extends Entity {
  constructor(type, x, y, rng) {
    super(type, x, y, { speed: 0.06 + rng.next() * 0.02, rng });
  }
  wander(world) {
    if (!this.target || this.distanceTo(this.target) < 0.4) {
      const dir = world.rng.range(0, Math.PI * 2);
      const dist = world.rng.range(1, 4);
      this.target = { x: this.x + Math.cos(dir) * dist, y: this.y + Math.sin(dir) * dist };
    }
    this.moveToward(this.target.x, this.target.y, world.map, world.rng);
  }
  step(world) {
    this.decay();
  }
}

class Sheep extends Animal {
  constructor(x, y, rng) {
    super('sheep', x, y, rng);
    this.currentAction = 'graze';
  }
  step(world) {
    super.step(world);
    const predators = world.entities.filter(e => e.type === 'wolf' && this.distanceTo(e) < 4);
    if (predators.length > 0) {
      const p = predators[0];
      const dx = this.x - p.x;
      const dy = this.y - p.y;
      this.target = { x: this.x + dx, y: this.y + dy };
      this.currentAction = 'flee';
    } else {
      this.currentAction = 'graze';
      this.wander(world);
    }
  }
}

class Wolf extends Animal {
  constructor(x, y, rng) {
    super('wolf', x, y, rng);
    this.currentAction = 'prowl';
  }
  step(world) {
    super.step(world);
    const prey = world.entities.find(e => (e.type === 'sheep' || e.type === 'human') && this.distanceTo(e) < 5 && e.needs.health > 0);
    if (prey) {
      this.currentAction = 'chase';
      if (this.distanceTo(prey) < 1.2) {
        prey.needs.health = clampStat(prey.needs.health - 5);
        if (prey.type === 'human') {
          if (prey.knowledge) {
            prey.knowledge.dangerScore['wolf'] = (prey.knowledge.dangerScore['wolf'] || 0) + 0.3;
          }
        }
        if (prey.needs.health <= 0) {
          this.needs.hunger = clampStat(this.needs.hunger - 20);
        }
      } else {
        this.target = { x: prey.x, y: prey.y };
        this.moveToward(this.target.x, this.target.y, world.map, world.rng);
        this.needs.energy = clampStat(this.needs.energy - 0.05);
      }
    } else {
      this.currentAction = 'prowl';
      this.wander(world);
    }
  }
}

class World {
  constructor(opts = {}) {
    this.width = opts.width || 120;
    this.height = opts.height || 80;
    this.rng = new SeededRNG(opts.seed || 1);
    this.map = new TileMap(this.width, this.height, this.rng);
    this.entities = [];
    this.items = [];
    this.shelters = [];
    this.tick = 0;
    this.populate(opts);
  }

  populate(opts) {
    const humanCount = opts.humanCount || 8;
    const sheepCount = opts.sheepCount || 10;
    const wolfCount = opts.wolfCount || 3;

    for (let i = 0; i < humanCount; i++) {
      const pos = this.map.randomWalkable(this.rng);
      const h = new Human(pos.x + this.rng.next(), pos.y + this.rng.next(), this.rng);
      h.sex = this.rng.chance(0.5) ? 'male' : 'female';
      h.needs.hunger = 20 + this.rng.range(0, 20);
      h.needs.thirst = 20 + this.rng.range(0, 20);
      this.entities.push(h);
    }

    for (let i = 0; i < sheepCount; i++) {
      const pos = this.map.randomWalkable(this.rng);
      this.entities.push(new Sheep(pos.x + this.rng.next(), pos.y + this.rng.next(), this.rng));
    }
    for (let i = 0; i < wolfCount; i++) {
      const pos = this.map.randomWalkable(this.rng);
      this.entities.push(new Wolf(pos.x + this.rng.next(), pos.y + this.rng.next(), this.rng));
    }

    // Scatter sticks near forests
    for (let i = 0; i < Math.floor((this.width * this.height) / 80); i++) {
      const pos = this.map.randomWalkable(this.rng);
      if (this.map.get(pos.x, pos.y) === TILE.FOREST && this.rng.chance(0.5)) {
        this.items.push({ type: 'stick', x: pos.x + this.rng.next(), y: pos.y + this.rng.next() });
      }
    }
  }

  canBuildShelter(x, y) {
    return !this.shelters.some(s => s.x === x && s.y === y) && this.map.get(x, y) !== TILE.WATER;
  }

  buildShelter(x, y) {
    this.shelters.push({ x, y });
  }

  spawnBaby(parentA, parentB) {
    const pos = { x: (parentA.x + parentB.x) / 2, y: (parentA.y + parentB.y) / 2 };
    const baby = new Human(pos.x, pos.y, this.rng);
    baby.isBaby = true;
    baby.speed *= 0.8;
    baby.needs.energy = 80;
    baby.needs.hunger = 10;
    baby.needs.thirst = 10;
    baby.maturity = 800;
    baby.sex = this.rng.chance(0.5) ? 'male' : 'female';
    baby.currentAction = 'born';
    this.entities.push(baby);
  }

  removeDead() {
    this.entities = this.entities.filter(e => e.needs.health > 0);
    this.items = this.items.filter(i => !i.consumed);
  }

  step() {
    this.tick++;
    for (const e of this.entities) {
      // Babies mature over time
      if (e.isBaby) {
        e.maturity -= 1;
        if (e.maturity <= 0) {
          e.isBaby = false;
        }
      }
      e.step(this);
      // Keep stats within bounds
      Object.keys(e.needs).forEach(k => {
        e.needs[k] = clampStat(e.needs[k]);
      });
    }
    this.removeDead();
  }
}

const exported = { SeededRNG, clampStat, TileMap, Entity, Human, Sheep, Wolf, World, TILE, TILE_COLORS };

if (typeof module !== 'undefined') {
  module.exports = exported;
}
if (typeof window !== 'undefined') {
  window.CavemanWorld = exported;
}
