export const WIDTH = 48;
export const HEIGHT = 36;

export const TILE_CODES = Object.freeze({
  grass: "g",
  flowers: "f",
  path: "p",
  water: "w",
  sand: "s",
  stone: "c",
  tallgrass: "t"
});

export const THEMES = ["meadow", "autumn", "snow", "night"];
export const WEATHERS = ["clear", "rain", "snow"];
export const KINDS = ["tree", "rock", "house", "fence", "lantern", "chest", "sign"];

const codes = new Set(Object.values(TILE_CODES));

function assert(ok, message = "Invalid world data.") {
  if (!ok) throw new Error(message);
}

function integer(n, min, max) {
  assert(Number.isInteger(n) && n >= min && n <= max);
  return n;
}

function number(n, min, max) {
  assert(Number.isFinite(n) && n >= min && n <= max);
  return n;
}

function text(s, max, fallback = "") {
  if (s === undefined) return fallback;
  assert(typeof s === "string" && s.length <= max);
  return s;
}

function choice(value, list) {
  assert(list.includes(value));
  return value;
}

export function sizeOf(object) {
  return object.kind === "house" ? [2, 2] : [1, 1];
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y;
}

function objectRect(object) {
  const [w, h] = sizeOf(object);
  return { x: object.x, y: object.y, w, h };
}

function npcRect(npc) {
  return { x: npc.x, y: npc.y, w: 1, h: 1 };
}

function rectangle(op) {
  const x = integer(op.x, 0, WIDTH - 1);
  const y = integer(op.y, 0, HEIGHT - 1);
  const w = integer(op.w ?? 1, 1, WIDTH);
  const h = integer(op.h ?? 1, 1, HEIGHT);
  assert(x + w <= WIDTH && y + h <= HEIGHT);
  return { x, y, w, h };
}

export function validateWorld(input) {
  assert(input && typeof input === "object");
  assert(input.version === 1);
  assert(Array.isArray(input.tiles) && input.tiles.length === HEIGHT);

  const tiles = input.tiles.map(row => {
    assert(typeof row === "string" && row.length === WIDTH);
    assert([...row].every(c => codes.has(c)));
    return row;
  });

  assert(Array.isArray(input.objects) && input.objects.length <= 220);
  assert(Array.isArray(input.npcs) && input.npcs.length <= 32);

  const objects = input.objects.map(o => {
    assert(o && typeof o === "object");
    const result = {
      id: text(o.id, 80),
      kind: choice(o.kind, KINDS),
      x: integer(o.x, 0, WIDTH - 1),
      y: integer(o.y, 0, HEIGHT - 1),
      text: text(o.text, 300)
    };
    const [w, h] = sizeOf(result);
    assert(result.x + w <= WIDTH && result.y + h <= HEIGHT);
    return result;
  });

  const npcs = input.npcs.map(n => {
    assert(n && typeof n === "object");
    assert(typeof n.color === "string" && /^#[0-9a-f]{6}$/i.test(n.color));
    return {
      id: text(n.id, 80),
      name: text(n.name, 40, "Traveler"),
      text: text(n.text, 300, "Lovely weather!"),
      color: n.color,
      style: choice(n.style ?? "person", ["person", "creature"]),
      x: integer(n.x, 0, WIDTH - 1),
      y: integer(n.y, 0, HEIGHT - 1)
    };
  });

  const ids = [...objects, ...npcs].map(o => o.id);
  assert(ids.every(Boolean) && new Set(ids).size === ids.length);

  assert(input.player && typeof input.player === "object");

  return {
    version: 1,
    name: text(input.name, 60, "Moonberry Village"),
    theme: choice(input.theme, THEMES),
    weather: choice(input.weather, WEATHERS),
    speed: number(input.speed, 2, 7),
    tiles,
    objects,
    npcs,
    player: {
      x: number(input.player.x, 0.25, WIDTH - 0.25),
      y: number(input.player.y, 0.25, HEIGHT - 0.25)
    }
  };
}

export function isWalkable(world, x, y, ignoreNpc = null) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);

  if (tx < 0 || ty < 0 || tx >= WIDTH || ty >= HEIGHT) return false;
  if (world.tiles[ty][tx] === "w") return false;

  for (const object of world.objects) {
    if (object.kind === "lantern") continue;
    const [w, h] = sizeOf(object);
    if (
      tx >= object.x && tx < object.x + w &&
      ty >= object.y && ty < object.y + h
    ) return false;
  }

  return !world.npcs.some(n =>
    n.id !== ignoreNpc && n.x === tx && n.y === ty
  );
}

export function canStand(world, x, y, ignoreNpc = null) {
  const r = 0.21;
  return [
    [x - r, y - r], [x + r, y - r],
    [x - r, y + r], [x + r, y + r]
  ].every(([a, b]) => isWalkable(world, a, b, ignoreNpc));
}

export function nearestWalkable(world, x, y, ignoreNpc = null) {
  if (canStand(world, x, y, ignoreNpc)) return { x, y };

  let best = null;
  let distance = Infinity;

  for (let yy = 0; yy < HEIGHT; yy++) {
    for (let xx = 0; xx < WIDTH; xx++) {
      const px = xx + 0.5;
      const py = yy + 0.5;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < distance && canStand(world, px, py, ignoreNpc)) {
        distance = d;
        best = { x: px, y: py };
      }
    }
  }

  assert(best, "Keep at least one walkable tile.");
  return best;
}

function paint(world, rect, code) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    const row = world.tiles[y];
    world.tiles[y] =
      row.slice(0, rect.x) +
      code.repeat(rect.w) +
      row.slice(rect.x + rect.w);
  }
}

export function createWorld() {
  const world = {
    version: 1,
    name: "Moonberry Village",
    theme: "meadow",
    weather: "clear",
    speed: 3.8,
    tiles: Array.from({ length: HEIGHT }, () => "g".repeat(WIDTH)),
    objects: [],
    npcs: [],
    player: { x: 24.5, y: 18.5 }
  };

  let id = 0;
  const add = (kind, x, y, dialogue = "") =>
    world.objects.push({ id: `seed-${++id}`, kind, x, y, text: dialogue });

  paint(world, { x: 0, y: 17, w: WIDTH, h: 3 }, "p");
  paint(world, { x: 23, y: 3, w: 3, h: 31 }, "p");
  paint(world, { x: 8, y: 11, w: 13, h: 6 }, "p");
  paint(world, { x: 31, y: 6, w: 11, h: 8 }, "s");
  paint(world, { x: 32, y: 7, w: 9, h: 6 }, "w");
  paint(world, { x: 8, y: 24, w: 10, h: 6 }, "t");
  paint(world, { x: 29, y: 23, w: 10, h: 6 }, "f");
  paint(world, { x: 23, y: 16, w: 3, h: 5 }, "c");

  for (let x = 0; x < WIDTH; x += 2) {
    add("tree", x, 0);
    add("tree", x, HEIGHT - 1);
  }
  for (let y = 2; y < HEIGHT - 1; y += 2) {
    add("tree", 0, y);
    add("tree", WIDTH - 1, y);
  }

  for (const [x, y] of [
    [4, 5], [6, 7], [8, 4], [19, 5], [20, 8], [29, 4],
    [43, 7], [44, 13], [5, 25], [6, 29], [20, 29], [30, 31],
    [39, 30], [43, 26], [34, 15], [36, 15]
  ]) add("tree", x, y);

  add("house", 10, 11);
  add("house", 15, 11);
  add("house", 19, 13);
  add("house", 29, 20);

  add("sign", 22, 17, "Moonberry Village — a place that listens to your imagination.");
  add("sign", 9, 23, "Whispering grass. Please be kind to the little creatures.");
  add("lantern", 22, 15);
  add("lantern", 26, 20);
  add("lantern", 13, 14);
  add("rock", 29, 9);
  add("rock", 41, 15);

  add("chest", 6, 12, "A moonstone! Someone left a little luck here.");
  add("chest", 38, 26, "A moonstone hidden among the flowers.");
  add("chest", 19, 31, "A moonstone at the edge of the woods.");

  world.npcs = [
    {
      id: "mira", name: "Mira", x: 14, y: 15, color: "#dc7195",
      style: "person",
      text: "Type an idea in the panel. The whole village can change while you explore!"
    },
    {
      id: "pip", name: "Pip", x: 27, y: 18, color: "#82d985",
      style: "creature",
      text: "Pip! I would love a flower garden and a little pond."
    },
    {
      id: "rowan", name: "Rowan", x: 31, y: 14, color: "#8d9eed",
      style: "person",
      text: "You can ask for bridges: paint a path right across the water."
    }
  ];

  return validateWorld(world);
}

export function applyPatch(original, patch) {
  assert(patch && typeof patch === "object");
  assert(Array.isArray(patch.ops) && patch.ops.length <= 60);
  const summary = text(patch.summary, 500, "The world changed.");
  const world = validateWorld(original);
  let teleport = false;

  const newID = () => {
    const existing = new Set([...world.objects, ...world.npcs].map(o => o.id));
    let id;
    do {
      id = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    } while (existing.has(id));
    return id;
  };

  for (const op of patch.ops) {
    assert(op && typeof op === "object");

    switch (op.op) {
      case "paint": {
        const rect = rectangle(op);
        const tile = choice(op.tile, Object.keys(TILE_CODES));
        paint(world, rect, TILE_CODES[tile]);
        break;
      }
      case "remove": {
        const rect = rectangle(op);
        world.objects = world.objects.filter(o => !overlaps(rect, objectRect(o)));
        world.npcs = world.npcs.filter(n => !overlaps(rect, npcRect(n)));
        break;
      }
      case "place": {
        const kind = choice(op.kind, KINDS);
        const object = {
          id: newID(), kind,
          x: integer(op.x, 0, WIDTH - 1),
          y: integer(op.y, 0, HEIGHT - 1),
          text: text(op.text, 300)
        };
        const rect = objectRect(object);
        rectangle(rect);
        world.objects = world.objects.filter(o => !overlaps(rect, objectRect(o)));
        world.npcs = world.npcs.filter(n => !overlaps(rect, npcRect(n)));
        world.objects.push(object);
        break;
      }
      case "npc": {
        const existing = world.npcs.find(n => n.id === op.id);
        const npc = {
          id: existing?.id || newID(),
          x: integer(op.x, 0, WIDTH - 1),
          y: integer(op.y, 0, HEIGHT - 1),
          name: text(op.name, 40, existing?.name || "Traveler"),
          text: text(op.text, 300, existing?.text || "Hello!"),
          color: op.color ?? existing?.color ?? "#85ca91",
          style: op.style ?? existing?.style ?? "creature"
        };
        if (existing) Object.assign(existing, npc);
        else world.npcs.push(npc);
        break;
      }
      case "theme":
        world.theme = choice(op.value, THEMES);
        break;
      case "weather":
        world.weather = choice(op.value, WEATHERS);
        break;
      case "speed":
        world.speed = number(op.value, 2, 7);
        break;
      case "teleport":
        world.player = {
          x: integer(op.x, 0, WIDTH - 1) + 0.5,
          y: integer(op.y, 0, HEIGHT - 1) + 0.5
        };
        teleport = true;
        break;
      case "name":
        world.name = text(op.value, 60);
        break;
      default:
        throw new Error("Unsupported operation.");
    }
  }

  // Validate before using model-produced entities.
  const checked = validateWorld(world);

  // Relocate NPCs if newly painted water/objects trapped them.
  for (const npc of checked.npcs) {
    const point = nearestWalkable(checked, npc.x + 0.5, npc.y + 0.5, npc.id);
    npc.x = Math.floor(point.x);
    npc.y = Math.floor(point.y);
  }

  checked.player = nearestWalkable(
    checked,
    checked.player.x,
    checked.player.y
  );

  return {
    world: checked,
    summary,
    teleport,
    operationCount: patch.ops.length
  };
}
