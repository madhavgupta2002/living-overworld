import {
  WIDTH, HEIGHT, createWorld, validateWorld,
  nearestWalkable, canStand, sizeOf
} from "./world.js";

const $ = id => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;

const TILE = 16;
const SAVE_KEY = "living-overworld-v1";
const keys = new Set();
const sprites = new Map();

let world = createWorld();
let moonstones = 0;
let busy = false;
let moving = false;
let direction = "down";
let animation = 0;
let previousTime = performance.now();
let toastUntil = 0;
let flashUntil = 0;
let saveClock = 0;
let encounterCooldown = 0;
let travel = 0;
let companion = { ...world.player };

try {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
  if (saved) {
    world = validateWorld(saved.world);
    world.player = nearestWalkable(world, world.player.x, world.player.y);
    moonstones = Number.isInteger(saved.moonstones)
      ? Math.max(0, Math.min(999999, saved.moonstones))
      : 0;
    companion = { ...world.player };
  }
} catch {
  // Invalid/old saves do not prevent startup.
}

const palettes = {
  meadow: {
    grass: "#77b95d", speck: "#65a84f", flower: "#f3bfdc",
    path: "#d9be85", sand: "#ead69b", stone: "#a3aaa1",
    water: "#4f9fc4", wave: "#8ed3dd", tree: "#3b854c", deep: "#28673e"
  },
  autumn: {
    grass: "#baa15a", speck: "#a78d4a", flower: "#f3d398",
    path: "#d8b278", sand: "#e2c588", stone: "#aaa091",
    water: "#668eae", wave: "#abc4d6", tree: "#ce783f", deep: "#965538"
  },
  snow: {
    grass: "#dce9e7", speck: "#c3d7d8", flower: "#a5b9df",
    path: "#bdcace", sand: "#e5e0cd", stone: "#a6b7bf",
    water: "#659eb6", wave: "#b7e0e7", tree: "#a6c4bb", deep: "#648b83"
  },
  night: {
    grass: "#3b655c", speck: "#31564f", flower: "#c29adc",
    path: "#7e806c", sand: "#aaa57e", stone: "#667786",
    water: "#37577f", wave: "#779ec1", tree: "#365564", deep: "#253b50"
  }
};

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ world, moonstones }));
  } catch {
    // Private browsing/storage quotas should not stop the game.
  }
}

function updateHUD() {
  $("world-name").textContent = world.name;
  $("stats").textContent = `${moonstones} moonstone${moonstones === 1 ? "" : "s"}`;
}

function log(message, type = "assistant", detail = "") {
  const element = document.createElement("div");
  element.className = `message ${type}`;
  element.textContent = message;
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    element.append(small);
  }
  $("log").append(element);
  while ($("log").children.length > 40) $("log").firstElementChild.remove();
  $("log").scrollTop = $("log").scrollHeight;
}

function toast(message, duration = 5500) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastUntil = performance.now() + duration;
}

function makeSprite(key, width, height, draw) {
  if (sprites.has(key)) return sprites.get(key);
  const image = document.createElement("canvas");
  image.width = width;
  image.height = height;
  const c = image.getContext("2d");
  const rect = (color, x, y, w, h) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  draw(c, rect);
  sprites.set(key, image);
  return image;
}

function scenery(kind, palette) {
  return makeSprite(`${world.theme}:${kind}`, kind === "house" ? 32 : 16,
    kind === "house" ? 40 : 24, (c, r) => {
      const shadow = "#172c2948";
      r(shadow, 2, 20, 12, 3);

      if (kind === "tree") {
        r("#75563c", 6, 13, 4, 9);
        r(palette.deep, 2, 7, 12, 11);
        r(palette.tree, 0, 6, 16, 8);
        r(palette.tree, 3, 2, 10, 13);
        r(palette.tree, 5, 0, 6, 5);
        r(world.theme === "snow" ? "#f3faf4" : "#ffffff24", 4, 3, 7, 3);
        r(palette.deep, 1, 12, 4, 3);
        r(palette.deep, 10, 13, 4, 3);
      }

      if (kind === "rock") {
        r("#647277", 2, 15, 12, 7);
        r("#98a6a4", 3, 12, 9, 8);
        r("#bbc5b6", 5, 11, 5, 4);
        r("#7a898c", 10, 15, 4, 5);
      }

      if (kind === "house") {
        c.clearRect(0, 0, 32, 40);
        r(shadow, 0, 35, 32, 5);
        r("#715a4b", 3, 15, 26, 23);
        r("#eed6aa", 4, 15, 24, 20);
        r("#bf9470", 4, 29, 24, 6);
        r("#614a49", 0, 13, 32, 5);

        for (let i = 0; i < 7; i++) {
          r("#8e5060", 2 + i, 11 - i, 28 - i * 2, 3);
        }

        r("#bc6c70", 7, 6, 18, 3);
        r("#e79986", 8, 6, 15, 1);
        r("#806858", 24, 1, 4, 10);
        r("#5b504c", 23, 1, 6, 2);

        r("#705445", 13, 24, 7, 13);
        r("#bf9260", 14, 25, 5, 11);
        r("#ffe9a2", 17, 30, 1, 1);

        for (const x of [6, 22]) {
          r("#806654", x, 21, 5, 7);
          r(world.theme === "night" ? "#ffe49a" : "#88c1ce", x + 1, 22, 3, 4);
          r("#f9e8c3", x + 2, 22, 1, 4);
        }
        r("#e4cdab", 12, 37, 9, 2);
      }

      if (kind === "fence") {
        r("#795f43", 1, 10, 3, 13);
        r("#795f43", 12, 10, 3, 13);
        r("#c3a176", 1, 13, 14, 3);
        r("#c3a176", 1, 18, 14, 3);
        r("#e5c695", 1, 10, 3, 2);
        r("#e5c695", 12, 10, 3, 2);
      }

      if (kind === "lantern") {
        r("#545767", 7, 9, 2, 14);
        r("#626575", 5, 22, 6, 2);
        r("#665741", 4, 5, 8, 8);
        r("#ffd880", 5, 6, 6, 6);
        r("#fff3b8", 6, 7, 3, 3);
        r("#565365", 3, 4, 10, 2);
        r("#565365", 5, 2, 6, 2);
      }

      if (kind === "chest") {
        r("#674530", 2, 13, 12, 10);
        r("#b67d41", 2, 12, 12, 7);
        r("#e1b45d", 3, 12, 10, 2);
        r("#e1b45d", 3, 19, 10, 2);
        r("#ffe18a", 7, 16, 3, 5);
        r("#755236", 8, 18, 1, 2);
      }

      if (kind === "sign") {
        r("#806346", 7, 12, 3, 11);
        r("#74533b", 1, 7, 14, 11);
        r("#e0bd83", 2, 8, 12, 8);
        r("#9b7750", 4, 10, 8, 1);
        r("#9b7750", 4, 13, 5, 1);
      }
    });
}

function person(color, style, facing, frame) {
  return makeSprite(`actor:${color}:${style}:${facing}:${frame}`, 16, 24, (c, r) => {
    r("#183b3848", 3, 21, 10, 2);

    if (style === "creature") {
      r("#394e58", 3, 13, 10, 8);
      r(color, 2, 12, 12, 7);
      r(color, 4, 8, 8, 12);
      r(color, 2, 5, 3, 8);
      r(color, 11, 5, 3, 8);
      r("#ffffff50", 4, 11, 4, 2);
      r("#ffe2d0", 3, 7, 1, 4);
      r("#ffe2d0", 12, 7, 1, 4);
      r("#253343", 5, 14, 2, 2);
      r("#253343", 10, 14, 2, 2);
      r("#f7d7d4", 7, 17, 2, 1);
      r(color, 3, 20 + frame, 4, 2);
      r(color, 10, 21 - frame, 3, 2);
      return;
    }

    r("#35445d", 4, 18, 3, 4 - frame);
    r("#35445d", 9, 18, 3, 3 + frame);
    r("#252c42", 3, 21 - frame, 4, 2);
    r("#252c42", 9, 20 + frame, 4, 2);

    r(color, 4, 11, 8, 8);
    r(color, 2, 12 + frame, 3, 6);
    r(color, 11, 13 - frame, 3, 6);
    r("#f1c69b", 2, 17 + frame, 2, 2);
    r("#f1c69b", 12, 18 - frame, 2, 2);

    r("#68473b", 4, 3, 8, 8);
    r("#f1c69b", 4, 6, 8, 6);

    if (facing === "up") {
      r("#68473b", 4, 4, 8, 8);
      r("#8c6145", 5, 4, 5, 2);
    } else {
      r("#68473b", 3, 3, 10, 4);
      r("#68473b", 3, 6, 2, 3);
      const eye = facing === "left" ? 5 : facing === "right" ? 10 : 6;
      r("#2c3541", eye, 8, 1, 2);
      if (facing === "down") r("#2c3541", 10, 8, 1, 2);
      r("#cf956e", 7, 11, 2, 1);
    }

    r("#f0ce7c", 4, 12, 8, 1);
    r("#ffffff30", 5, 14, 2, 3);
  });
}

function noise(x, y, seed = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 73.7) * 43758.5453;
  return n - Math.floor(n);
}

function tileSprite(code, x, y, time, palette) {
  const variant = (x * 3 + y * 7) % 4;
  const waveFrame = Math.floor(time * 2) % 2;
  const key = `${world.theme}:tile:${code}:${variant}:${code === "w" ? waveFrame : 0}`;

  return makeSprite(key, 16, 16, (c, r) => {
    const base = {
      g: palette.grass, f: palette.grass, t: palette.grass,
      p: palette.path, s: palette.sand, c: palette.stone, w: palette.water
    }[code];

    r(base, 0, 0, 16, 16);

    for (let i = 0; i < 6; i++) {
      const px = Math.floor(noise(i, variant, 1) * 15);
      const py = Math.floor(noise(i, variant, 2) * 15);
      r(
        "gft".includes(code) ? palette.speck : "#ffffff20",
        px, py, 2, 1
      );
    }

    if (code === "g" || code === "f") {
      r(palette.speck, 3 + variant, 9, 1, 3);
      r(palette.speck, 2 + variant, 8, 1, 2);
    }

    if (code === "f") {
      for (const [xx, yy] of [[3, 4], [11, 10], [5, 13]]) {
        r(palette.flower, xx - 1, yy, 3, 1);
        r(palette.flower, xx, yy - 1, 1, 3);
        r("#ffe5a0", xx, yy, 1, 1);
      }
    }

    if (code === "t") {
      for (let i = 0; i < 4; i++) {
        const xx = 2 + (i % 2) * 8;
        const yy = 3 + Math.floor(i / 2) * 7;
        r(palette.deep, xx, yy + 3, 5, 2);
        r(palette.tree, xx, yy, 1, 4);
        r(palette.tree, xx + 2, yy - 1, 1, 5);
        r(palette.tree, xx + 4, yy, 1, 4);
      }
    }

    if (code === "w") {
      const shift = waveFrame * 2;
      r(palette.wave, (2 + variant + shift) % 8, 4, 5, 1);
      r(palette.wave, 7 - shift, 11, 6, 1);
      r("#ffffff30", 3 + shift, 5, 2, 1);
    }

    if (code === "c") {
      r("#00000020", 0, 0, 16, 1);
      r("#00000020", 0, 8, 16, 1);
      r("#00000020", 7, 0, 1, 8);
      r("#00000020", 3, 8, 1, 8);
      r("#ffffff25", 0, 1, 16, 1);
    }
  });
}

function nearby() {
  const candidates = [];

  for (const npc of world.npcs) {
    candidates.push({
      type: "npc",
      item: npc,
      x: npc.x + 0.5,
      y: npc.y + 0.5
    });
  }

  for (const object of world.objects) {
    if (!["sign", "chest", "house", "lantern"].includes(object.kind)) continue;
    const [w, h] = sizeOf(object);
    const x = Math.max(object.x, Math.min(world.player.x, object.x + w));
    const y = Math.max(object.y, Math.min(world.player.y, object.y + h));
    candidates.push({ type: object.kind, item: object, x, y });
  }

  for (const candidate of candidates) {
    candidate.distance = Math.hypot(
      candidate.x - world.player.x,
      candidate.y - world.player.y
    );
  }

  return candidates
    .filter(candidate => candidate.distance < 1.65)
    .sort((a, b) => a.distance - b.distance)[0];
}

function interact() {
  const target = nearby();

  if (!target) {
    toast("Explore, find moonstones, and tell the world what it should become.", 3000);
    return;
  }

  if (target.type === "npc") {
    toast(`${target.item.name}: ${target.item.text}`, 6500);
  } else if (target.type === "chest") {
    // Avoid removing entities from a snapshot currently being edited.
    if (busy) {
      toast("The world is changing—open this chest once the edit lands.", 2500);
      return;
    }
    moonstones++;
    world.objects = world.objects.filter(o => o.id !== target.item.id);
    toast(target.item.text || "You found a moonstone!");
    updateHUD();
    save();
  } else {
    const fallback = {
      house: "A cozy little home. Ask the world to build a neighborhood!",
      sign: "Your imagination belongs here.",
      lantern: "A warm little light against the wide world."
    };
    toast(target.item.text || fallback[target.type]);
  }
}

function update(dt, now) {
  const typing = ["TEXTAREA", "INPUT"].includes(document.activeElement?.tagName);
  let dx = 0;
  let dy = 0;

  if (!typing) {
    dx = Number(keys.has("ArrowRight") || keys.has("d")) -
      Number(keys.has("ArrowLeft") || keys.has("a"));
    dy = Number(keys.has("ArrowDown") || keys.has("s")) -
      Number(keys.has("ArrowUp") || keys.has("w"));
  }

  moving = Boolean(dx || dy);

  if (moving) {
    if (Math.abs(dx) > Math.abs(dy)) direction = dx < 0 ? "left" : "right";
    else direction = dy < 0 ? "up" : "down";

    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;

    const step = dt * world.speed;
    const old = { ...world.player };

    if (canStand(world, world.player.x + dx * step, world.player.y)) {
      world.player.x += dx * step;
    }
    if (canStand(world, world.player.x, world.player.y + dy * step)) {
      world.player.y += dy * step;
    }

    const distance = Math.hypot(
      world.player.x - old.x,
      world.player.y - old.y
    );

    moving = distance > 0.0001;
    travel += distance;

    const tx = Math.floor(world.player.x);
    const ty = Math.floor(world.player.y);

    // Small creature encounters in tall grass; no battle system.
    if (
      world.tiles[ty]?.[tx] === "t" &&
      travel > 3 &&
      now > encounterCooldown
    ) {
      travel = 0;
      encounterCooldown = now + 12_000;
      const encounters = [
        "A tiny leaf-creature rustles nearby, then hops away.",
        "Something fluffy peeks through the grass. It seems friendly!",
        "You hear a cheerful chirp from a very small, very round creature.",
        "A sleepy mossling waves one leaf at you."
      ];
      toast(encounters[Math.floor(Math.random() * encounters.length)], 3500);
    }
  }

  animation += dt * (moving ? 9 : 2);

  // Cosmetic companion follows behind the player.
  const separation = Math.hypot(
    world.player.x - companion.x,
    world.player.y - companion.y
  );

  if (separation > 8) {
    companion = { ...world.player };
  } else if (separation > 0.85) {
    const amount = Math.min(1, dt * 4);
    companion.x += (world.player.x - companion.x) * amount;
    companion.y += (world.player.y - companion.y) * amount;
  }

  if (now > toastUntil) $("toast").hidden = true;

  saveClock += dt;
  if (saveClock > 3) {
    saveClock = 0;
    save();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cameraPosition() {
  return {
    x: Math.floor(clamp(
      world.player.x * TILE - canvas.width / 2,
      0,
      WIDTH * TILE - canvas.width
    )),
    y: Math.floor(clamp(
      world.player.y * TILE - canvas.height / 2,
      0,
      HEIGHT * TILE - canvas.height
    ))
  };
}

function drawWeather(time, camera) {
  if (world.weather === "clear") return;

  const snow = world.weather === "snow";
  const count = snow ? 65 : 95;
  const width = canvas.width;
  const height = canvas.height;

  ctx.save();

  if (!snow) {
    ctx.fillStyle = "#20364d";
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#bfdfed";
    ctx.lineWidth = 1;
    ctx.beginPath();
  } else {
    ctx.fillStyle = "#f4fcff";
    ctx.globalAlpha = 0.8;
  }

  for (let i = 0; i < count; i++) {
    const seedX = noise(i, 12, 4) * (width + 80);
    const seedY = noise(i, 27, 9) * (height + 80);
    const speed = snow ? 14 + noise(i, 9) * 18 : 190 + noise(i, 4) * 100;

    let x;
    let y;

    if (snow) {
      x = (
        seedX +
        Math.sin(time * 0.8 + i) * 12 +
        time * 8 -
        camera.x * 0.12
      ) % (width + 30);

      y = (seedY + time * speed - camera.y * 0.1) % (height + 30);

      if (x < 0) x += width + 30;
      if (y < 0) y += height + 30;

      const size = i % 5 === 0 ? 2 : 1;
      ctx.fillRect(Math.floor(x - 15), Math.floor(y - 15), size, size);
    } else {
      x = (seedX - time * 90 - camera.x * 0.15) % (width + 40);
      y = (seedY + time * speed - camera.y * 0.12) % (height + 40);

      if (x < 0) x += width + 40;
      if (y < 0) y += height + 40;

      ctx.moveTo(Math.floor(x - 20), Math.floor(y - 20));
      ctx.lineTo(Math.floor(x - 23), Math.floor(y - 12));
    }
  }

  if (!snow) ctx.stroke();
  ctx.restore();
}

function drawLighting(camera, time) {
  if (world.theme !== "night") return;

  ctx.save();
  ctx.fillStyle = "#111b40";
  ctx.globalAlpha = 0.16;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

  for (const object of world.objects) {
    if (object.kind !== "lantern") continue;

    const x = object.x * TILE + 8 - camera.x;
    const y = object.y * TILE - 1 - camera.y;
    const radius = 28 + Math.sin(time * 3 + object.x) * 2;

    if (
      x < -radius || y < -radius ||
      x > canvas.width + radius || y > canvas.height + radius
    ) continue;

    const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius);
    gradient.addColorStop(0, "#ffe29b65");
    gradient.addColorStop(0.35, "#ffc97824");
    gradient.addColorStop(1, "#ffc97800");

    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Fireflies over the flowers.
  ctx.fillStyle = "#fff0a3";
  for (let i = 0; i < 18; i++) {
    const wx = noise(i, 4, 8) * WIDTH;
    const wy = noise(i, 8, 4) * HEIGHT;

    if (!["f", "t", "g"].includes(world.tiles[Math.floor(wy)]?.[Math.floor(wx)])) {
      continue;
    }

    const x = wx * TILE - camera.x + Math.sin(time + i) * 5;
    const y = wy * TILE - camera.y + Math.cos(time * 0.7 + i) * 4;
    ctx.globalAlpha = 0.3 + (Math.sin(time * 2 + i) + 1) * 0.3;
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }

  ctx.restore();
}

function drawInteractionHint(camera, now) {
  const target = nearby();
  if (!target) return;

  const item = target.item;
  const [w] = target.type === "npc" ? [1] : sizeOf(item);
  const x = Math.floor((item.x + w / 2) * TILE - camera.x);
  const y = Math.floor(
    item.y * TILE - camera.y - 13 + Math.sin(now / 250) * 1.5
  );

  ctx.save();
  ctx.fillStyle = "#142230e8";
  ctx.fillRect(x - 6, y - 8, 13, 12);
  ctx.strokeStyle = "#d7e9cf";
  ctx.strokeRect(x - 6.5, y - 8.5, 13, 12);
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#eff8de";
  ctx.fillText("E", x + 0.5, y - 7);
  ctx.restore();
}

function drawMinimap(camera) {
  const scale = 1.5;
  const width = WIDTH * scale;
  const height = HEIGHT * scale;
  const left = canvas.width - width - 9;
  const top = 9;

  ctx.save();
  ctx.fillStyle = "#14212be0";
  ctx.fillRect(left - 3, top - 3, width + 6, height + 6);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const code = world.tiles[y][x];
      ctx.fillStyle = {
        g: "#64905c",
        f: "#93b76c",
        t: "#3f7049",
        p: "#d2b87f",
        s: "#e4d294",
        c: "#adb5b6",
        w: "#5a9db9"
      }[code];

      ctx.fillRect(
        left + x * scale,
        top + y * scale,
        scale,
        scale
      );
    }
  }

  for (const object of world.objects) {
    const [w, h] = sizeOf(object);
    ctx.fillStyle = object.kind === "house" ? "#bc7f79" : "#315c44";
    ctx.fillRect(
      left + object.x * scale,
      top + object.y * scale,
      w * scale,
      h * scale
    );
  }

  ctx.strokeStyle = "#ffffff65";
  ctx.lineWidth = 0.7;
  ctx.strokeRect(
    left + camera.x / TILE * scale,
    top + camera.y / TILE * scale,
    canvas.width / TILE * scale,
    canvas.height / TILE * scale
  );

  ctx.fillStyle = "#fff5bc";
  ctx.fillRect(
    left + world.player.x * scale - 1,
    top + world.player.y * scale - 1,
    3,
    3
  );

  ctx.restore();
}

function render(now) {
  const time = now / 1000;
  const palette = palettes[world.theme];
  const camera = cameraPosition();

  ctx.fillStyle = palette.grass;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const startX = Math.floor(camera.x / TILE);
  const startY = Math.floor(camera.y / TILE);
  const endX = Math.min(WIDTH, Math.ceil((camera.x + canvas.width) / TILE));
  const endY = Math.min(HEIGHT, Math.ceil((camera.y + canvas.height) / TILE));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const code = world.tiles[y][x];
      const sx = x * TILE - camera.x;
      const sy = y * TILE - camera.y;

      ctx.drawImage(tileSprite(code, x, y, time, palette), sx, sy);

      // Simple shoreline highlights.
      if (code === "w") {
        ctx.fillStyle = palette.wave;

        if (world.tiles[y - 1]?.[x] !== "w") {
          ctx.fillRect(sx, sy, TILE, 1);
        }
        if (world.tiles[y + 1]?.[x] !== "w") {
          ctx.fillRect(sx, sy + 15, TILE, 1);
        }
        if (world.tiles[y]?.[x - 1] !== "w") {
          ctx.fillRect(sx, sy, 1, TILE);
        }
        if (world.tiles[y]?.[x + 1] !== "w") {
          ctx.fillRect(sx + 15, sy, 1, TILE);
        }
      }
    }
  }

  // Sort by feet position so characters pass behind foreground scenery.
  const drawables = [];

  for (const object of world.objects) {
    const [, h] = sizeOf(object);
    drawables.push({
      depth: object.y + h - 0.12,
      draw() {
        const image = scenery(object.kind, palette);
        const x = object.x * TILE - camera.x;
        const y = (object.y + h) * TILE - image.height - camera.y;

        if (
          x + image.width < 0 || y + image.height < 0 ||
          x > canvas.width || y > canvas.height
        ) return;

        ctx.drawImage(image, Math.floor(x), Math.floor(y));
      }
    });
  }

  for (const npc of world.npcs) {
    drawables.push({
      depth: npc.y + 0.75,
      draw() {
        const frame = npc.style === "creature"
          ? Math.floor(time * 2 + npc.x) % 2
          : 0;

        const image = person(npc.color, npc.style, "down", frame);
        ctx.drawImage(
          image,
          Math.floor(npc.x * TILE - camera.x),
          Math.floor((npc.y + 0.75) * TILE - 22 - camera.y)
        );
      }
    });
  }

  drawables.push({
    depth: companion.y + 0.15,
    draw() {
      const image = person(
        "#f0bd73",
        "creature",
        "down",
        moving ? Math.floor(animation) % 2 : 0
      );

      ctx.drawImage(
        image,
        Math.floor(companion.x * TILE - 8 - camera.x),
        Math.floor((companion.y + 0.15) * TILE - 22 - camera.y)
      );
    }
  });

  drawables.push({
    depth: world.player.y + 0.2,
    draw() {
      const image = person(
        "#5d9bbc",
        "person",
        direction,
        moving ? Math.floor(animation) % 2 : 0
      );

      ctx.drawImage(
        image,
        Math.floor(world.player.x * TILE - 8 - camera.x),
        Math.floor((world.player.y + 0.2) * TILE - 22 - camera.y)
      );
    }
  });

  drawables.sort((a, b) => a.depth - b.depth);
  for (const drawable of drawables) drawable.draw();

  drawLighting(camera, time);
  drawWeather(time, camera);

  // Short visual flourish when a world edit arrives.
  if (now < flashUntil) {
    const progress = 1 - (flashUntil - now) / 900;

    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.2;
    ctx.fillStyle = "#d6ffe1";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = "#fff4b9";

    for (let i = 0; i < 25; i++) {
      const x = noise(i, 21) * canvas.width;
      const y = noise(i, 42) * canvas.height - progress * 18;

      ctx.fillRect(Math.floor(x), Math.floor(y), 3, 1);
      ctx.fillRect(Math.floor(x + 1), Math.floor(y - 1), 1, 3);
    }

    ctx.restore();
  }

  drawInteractionHint(camera, now);
  drawMinimap(camera);
}

function loop(now) {
  // Clamp large deltas after a background tab resumes.
  const dt = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  update(dt, now);
  render(now);
  requestAnimationFrame(loop);
}

// ---------- Keyboard and touch input ----------

const movementKeys = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "w", "a", "s", "d"
]);

function normalizeKey(key) {
  return key.length === 1 ? key.toLowerCase() : key;
}

window.addEventListener("keydown", event => {
  const typing = ["TEXTAREA", "INPUT"].includes(document.activeElement?.tagName);

  if (typing) {
    if (event.key === "Escape") {
      event.preventDefault();
      canvas.focus();
    }
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const key = normalizeKey(event.key);

  if (movementKeys.has(key)) {
    event.preventDefault();
    keys.add(key);
  }

  const buttonFocused = document.activeElement?.tagName === "BUTTON";

  if ((key === "e" || key === " ") && !buttonFocused) {
    event.preventDefault();
    if (!event.repeat) interact();
  }
});

window.addEventListener("keyup", event => {
  keys.delete(normalizeKey(event.key));
});

window.addEventListener("blur", () => keys.clear());

document.addEventListener("visibilitychange", () => {
  keys.clear();
  if (document.hidden) save();
});

window.addEventListener("pagehide", save);

canvas.addEventListener("pointerdown", () => canvas.focus());

$("prompt").addEventListener("focus", () => keys.clear());

for (const button of document.querySelectorAll("[data-key]")) {
  const key = button.dataset.key;

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    canvas.focus();
    keys.add(key);
    button.setPointerCapture(event.pointerId);
  });

  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(eventName, () => keys.delete(key));
  }

  button.addEventListener("contextmenu", event => event.preventDefault());
}

$("interact").addEventListener("click", () => {
  canvas.focus();
  interact();
});

// ---------- Live AI edits ----------

function setBusy(value) {
  busy = value;
  $("working").hidden = !value;
  $("submit").disabled = value;
  $("submit").textContent = value ? "✧ Imagining…" : "✦ Make it real";
  $("reset").disabled = value;

  for (const button of document.querySelectorAll("[data-prompt]")) {
    button.disabled = value;
  }
}

async function requestEdit(prompt) {
  if (busy) return;

  prompt = prompt.trim();
  if (!prompt) return;

  if (prompt.length > 1500) {
    toast("Please keep your request under 1,500 characters.");
    return;
  }

  // Keep a snapshot for the model. Walking continues in the live world.
  const snapshot = structuredClone(world);
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 42_000);

  setBusy(true);
  log(prompt, "user");
  $("prompt").value = "";
  canvas.focus();

  try {
    const response = await fetch("/api/edit", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        world: snapshot
      })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an unreadable response.");
    }

    if (!response.ok) {
      throw new Error(data.error || `Request failed: HTTP ${response.status}`);
    }

    // Validate again in the browser before installing a new world.
    const next = validateWorld(data.world);
    const livePosition = { ...world.player };

    // Preserve any walking done during inference unless teleport was requested.
    const desiredPosition = data.teleport ? next.player : livePosition;
    next.player = nearestWalkable(
      next,
      desiredPosition.x,
      desiredPosition.y
    );

    const displaced = Math.hypot(
      next.player.x - livePosition.x,
      next.player.y - livePosition.y
    ) > 2;

    world = next;

    if (displaced || data.teleport) {
      companion = { ...world.player };
    }

    // Drop previous theme/sprite caches; assets regenerate on demand.
    sprites.clear();
    flashUntil = performance.now() + 900;

    updateHUD();
    save();

    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const operations = Number.isInteger(data.operationCount)
      ? data.operationCount
      : 0;

    const details = [
      `${operations} edit${operations === 1 ? "" : "s"}`,
      `${seconds}s`
    ];

    if (Number.isFinite(data.usage?.totalTokens)) {
      details.push(`${data.usage.totalTokens} tokens`);
    }

    const summary = typeof data.summary === "string"
      ? data.summary
      : "The world changed.";

    log(summary, "assistant", details.join(" · "));
    toast(summary, 6000);
  } catch (error) {
    const message = error.name === "AbortError"
      ? "The request timed out. Your world is unchanged; try a smaller edit."
      : error.message || "The edit failed. Your world is unchanged.";

    log(message, "error");
    toast(message, 6500);

    // Restore failed requests for convenient retry, without overwriting
    // a new prompt the player may already be composing.
    if (!$("prompt").value.trim()) $("prompt").value = prompt;
  } finally {
    clearTimeout(timer);
    setBusy(false);
  }
}

$("edit-form").addEventListener("submit", event => {
  event.preventDefault();
  requestEdit($("prompt").value);
});

$("prompt").addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!busy) $("edit-form").requestSubmit();
  }
});

for (const button of document.querySelectorAll("[data-prompt]")) {
  button.addEventListener("click", () => {
    requestEdit(button.dataset.prompt);
  });
}

$("reset").addEventListener("click", () => {
  if (busy) return;

  if (!window.confirm("Start a new world? This replaces your saved world.")) {
    return;
  }

  world = createWorld();
  moonstones = 0;
  companion = { ...world.player };
  keys.clear();
  sprites.clear();
  travel = 0;
  encounterCooldown = 0;
  flashUntil = performance.now() + 900;

  $("log").replaceChildren();
  log("A fresh village is ready. What should we build?");
  updateHUD();
  save();
  canvas.focus();
  toast("Welcome back to Moonberry Village!");
});

// ---------- Start ----------

updateHUD();

log(
  "Welcome! Walk around, talk to the villagers, and collect moonstones. " +
  "Describe a change below to reshape the world."
);

toast(
  "WASD / arrows to walk · E to interact · Your golden companion follows along.",
  6500
);

requestAnimationFrame(loop);
