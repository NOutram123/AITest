const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const COLORS = {
  background: "#04070d",
  stars: "#17304f",
  hud: "#eaf8ff",
  player: "#7dff72",
  playerShot: "#f4fff1",
  alienTop: "#f2f6f7",
  alienMid: "#f2f6f7",
  alienLow: "#f2f6f7",
  alienShot: "#ff8fab",
  shield: "#8ce99a",
  ufo: "#ffe2e2",
  redOverlay: "rgba(255, 82, 82, 0.16)",
  greenOverlay: "rgba(125, 255, 114, 0.12)",
  overlay: "rgba(0, 0, 0, 0.6)",
};

const SCALE = 4;

const SPRITES = {
  squid: [
    [
      "..XX..",
      ".XXXX.",
      "XXXXXX",
      "XX..XX",
      "XXXXXX",
      ".X..X.",
      "X.XX.X",
      "X....X",
    ],
    [
      "..XX..",
      ".XXXX.",
      "XXXXXX",
      "XX..XX",
      "XXXXXX",
      "..XX..",
      ".X..X.",
      "X.XX.X",
    ],
  ],
  crab: [
    [
      ".XX..XX.",
      "..XXXX..",
      ".XXXXXX.",
      "XX.XX.XX",
      "XXXXXXXX",
      "..X..X..",
      ".X.XX.X.",
      "X......X",
    ],
    [
      ".XX..XX.",
      "..XXXX..",
      ".XXXXXX.",
      "XX.XX.XX",
      "XXXXXXXX",
      ".X.XX.X.",
      "..X..X..",
      ".X....X.",
    ],
  ],
  octopus: [
    [
      "..XXXX..",
      ".XXXXXX.",
      "XXXXXXXX",
      "XX.XX.XX",
      "XXXXXXXX",
      "..X..X..",
      ".X.XX.X.",
      "X.X..X.X",
    ],
    [
      "..XXXX..",
      ".XXXXXX.",
      "XXXXXXXX",
      "XX.XX.XX",
      "XXXXXXXX",
      ".XX..XX.",
      "X..XX..X",
      "..X..X..",
    ],
  ],
  player: [
    "..XX..",
    ".XXXX.",
    "XXXXXX",
    "XXXXXX",
    "XX..XX",
    "X....X",
  ],
  ufoBody: [
    "...XXXXXX...",
    "..XXXXXXXX..",
    ".XXXXXXXXXX.",
    "XXXXXXXXXXXX",
    "XX.XXXXXX.XX",
    "...XX..XX...",
  ],
};

const keys = {
  left: false,
  right: false,
  fire: false,
};

const audio = {
  context: null,
  enabled: false,
};

const stars = Array.from({ length: 60 }, () => ({
  x: Math.random() * WIDTH,
  y: Math.random() * HEIGHT,
  radius: Math.random() * 2 + 1,
  speed: Math.random() * 6 + 4,
}));

const state = {
  phase: "title",
  score: 0,
  highScore: 0,
  lives: 3,
  wave: 1,
  player: null,
  playerShot: null,
  alienShots: [],
  aliens: [],
  shields: [],
  ufo: null,
  alienDirection: 1,
  alienMoveTimer: 0,
  alienMoveInterval: 0.8,
  activeAlienMoveInterval: 0.8,
  alienFireTimer: 0,
  alienFireInterval: 1.15,
  alienAnimationFrame: 0,
  stepSoundIndex: 0,
  respawnTimer: 0,
  pendingGameOver: false,
  effects: [],
  message: "",
};

function createAudioContext() {
  if (!audio.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audio.context = new AudioContextClass();
    }
  }
  if (audio.context && audio.context.state === "suspended") {
    audio.context.resume();
  }
  audio.enabled = Boolean(audio.context);
}

function beep(frequency, duration, type = "square", volume = 0.03, slideTo = null) {
  if (!audio.enabled || !audio.context) {
    return;
  }

  const now = audio.context.currentTime;
  const oscillator = audio.context.createOscillator();
  const gain = audio.context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo !== null) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(audio.context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function noiseBurst(duration = 0.2, volume = 0.05, highpass = 240) {
  if (!audio.enabled || !audio.context) {
    return;
  }

  const sampleRate = audio.context.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = audio.context.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
  }

  const source = audio.context.createBufferSource();
  const filter = audio.context.createBiquadFilter();
  const gain = audio.context.createGain();
  const now = audio.context.currentTime;

  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.setValueAtTime(highpass, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.context.destination);
  source.start(now);
  source.stop(now + duration);
}

function playFleetStepSound() {
  const tones = [190, 170, 150, 132];
  const tone = tones[state.stepSoundIndex % tones.length];
  state.stepSoundIndex = (state.stepSoundIndex + 1) % tones.length;
  beep(tone, 0.08, "square", 0.022, tone * 0.94);
}

function playShotSound() {
  beep(980, 0.04, "square", 0.04, 780);
  beep(740, 0.07, "triangle", 0.025, 520);
  noiseBurst(0.045, 0.018, 900);
}

function playExplosionSound(kind) {
  if (kind === "player") {
    beep(260, 0.14, "sawtooth", 0.09, 120);
    beep(180, 0.28, "triangle", 0.07, 80);
    noiseBurst(0.32, 0.11, 140);
    return;
  }

  if (kind === "ufo") {
    beep(960, 0.08, "square", 0.05, 540);
    beep(640, 0.18, "sawtooth", 0.055, 260);
    noiseBurst(0.2, 0.07, 280);
    return;
  }

  beep(460, 0.06, "square", 0.04, 280);
  beep(240, 0.12, "triangle", 0.03, 150);
  noiseBurst(0.14, 0.04, 360);
}

function drawPixelSprite(sprite, x, y, color, scale = SCALE) {
  ctx.fillStyle = color;
  for (let row = 0; row < sprite.length; row += 1) {
    for (let col = 0; col < sprite[row].length; col += 1) {
      if (sprite[row][col] === "X") {
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  }
}

function spriteSize(sprite, scale = SCALE) {
  return {
    width: sprite[0].length * scale,
    height: sprite.length * scale,
  };
}

function spawnExplosion(x, y, color, size, count = 18) {
  state.effects.push({
    kind: "explosion",
    x,
    y,
    color,
    size,
    life: 0.55,
    duration: 0.55,
    particles: Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = size * (1.2 + Math.random() * 2.5);
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * (size / 6),
      };
    }),
  });
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createPlayer() {
  const size = spriteSize(SPRITES.player);
  return {
    x: WIDTH / 2 - size.width / 2,
    y: HEIGHT - 104,
    width: size.width,
    height: size.height,
    speed: 420,
    cooldown: 0,
  };
}

function getFormationStartY(wave, shieldTop) {
  const alienHeight = spriteSize(SPRITES.octopus[0]).height;
  const gapY = 14;
  const formationHeight = alienHeight * 5 + gapY * 4;
  const firstWaveY = 120;
  const desiredY = firstWaveY + (wave - 1) * 10;
  const maxY = shieldTop - formationHeight - 8;
  return Math.min(desiredY, maxY);
}

function createAliens(wave) {
  const aliens = [];
  const cols = 11;
  const gapX = 12;
  const gapY = 14;
  const sample = spriteSize(SPRITES.octopus[0]);
  const formationWidth = cols * sample.width + (cols - 1) * gapX;
  const startX = Math.round((WIDTH - formationWidth) / 2);
  const shieldTop = HEIGHT - 220;
  const startY = getFormationStartY(wave, shieldTop);

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const kind = row === 0 ? "squid" : row < 3 ? "crab" : "octopus";
      const points = row === 0 ? 30 : row < 3 ? 20 : 10;
      aliens.push({
        x: startX + col * (sample.width + gapX),
        y: startY + row * (sample.height + gapY),
        width: sample.width,
        height: sample.height,
        row,
        col,
        kind,
        alive: true,
        points,
      });
    }
  }

  return aliens;
}

function createShield(x, y) {
  const cols = 12;
  const rows = 8;
  const cellSize = 6;
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const isCornerCut =
        (row < 2 && (col < 2 || col > cols - 3)) ||
        (row > 4 && col > 4 && col < 7);

      if (!isCornerCut) {
        cells.push({
          x: col * cellSize,
          y: row * cellSize,
          width: cellSize,
          height: cellSize,
          hp: 3,
        });
      }
    }
  }

  return {
    x,
    y,
    width: cols * cellSize,
    height: rows * cellSize,
    cells,
  };
}

function createShields() {
  const y = HEIGHT - 220;
  return [
    createShield(108, y),
    createShield(286, y),
    createShield(464, y),
    createShield(642, y),
  ];
}

function resetWave({ keepScore = true } = {}) {
  state.score = keepScore ? state.score : 0;
  state.lives = keepScore ? state.lives : 3;
  state.player = createPlayer();
  state.playerShot = null;
  state.alienShots = [];
  state.shields = createShields();
  state.aliens = createAliens(state.wave);
  state.ufo = null;
  state.alienDirection = 1;
  state.alienMoveTimer = 0;
  state.alienFireTimer = 0;
  state.alienMoveInterval = Math.max(0.18, 0.82 - state.wave * 0.045);
  state.activeAlienMoveInterval = state.alienMoveInterval;
  state.alienFireInterval = Math.max(0.35, 1.15 - state.wave * 0.06);
  state.alienAnimationFrame = 0;
  state.stepSoundIndex = 0;
  state.respawnTimer = 0;
  state.pendingGameOver = false;
  state.effects = [];
  state.message = "";
}

function startGame() {
  createAudioContext();
  state.phase = "playing";
  state.score = 0;
  state.lives = 3;
  state.wave = 1;
  resetWave({ keepScore: true });
}

function nextWave() {
  state.wave += 1;
  resetWave({ keepScore: true });
  beep(660, 0.14, "triangle", 0.05, 1020);
}

function gameOver() {
  state.phase = "gameover";
  state.highScore = Math.max(state.highScore, state.score);
  state.message = "Earth fell. Press Enter to try again.";
  beep(150, 0.35, "sawtooth", 0.05, 80);
}

function damageShieldAt(x, y) {
  for (const shield of state.shields) {
    for (const cell of shield.cells) {
      if (cell.hp <= 0) {
        continue;
      }

      const hitbox = {
        x: shield.x + cell.x,
        y: shield.y + cell.y,
        width: cell.width,
        height: cell.height,
      };

      if (
        x >= hitbox.x &&
        x <= hitbox.x + hitbox.width &&
        y >= hitbox.y &&
        y <= hitbox.y + hitbox.height
      ) {
        cell.hp -= 1;
        return true;
      }
    }
  }

  return false;
}

function handleAlienDestroyed(alien) {
  alien.alive = false;
  state.score += alien.points;
  spawnExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, "#ffffff", 20, 22);
  playExplosionSound("alien");
  state.activeAlienMoveInterval = Math.max(0.045, state.activeAlienMoveInterval - 0.014);
}

function handleUfoDestroyed() {
  if (!state.ufo) {
    return;
  }

  state.score += state.ufo.points;
  spawnExplosion(
    state.ufo.x + state.ufo.width / 2,
    state.ufo.y + state.ufo.height / 2,
    "#ffd9d9",
    28,
    28
  );
  playExplosionSound("ufo");
  state.ufo = null;
}

function handlePlayerHit() {
  if (!state.player || state.phase !== "playing") {
    return;
  }

  spawnExplosion(
    state.player.x + state.player.width / 2,
    state.player.y + state.player.height / 2,
    "#d8ffd1",
    34,
    30
  );
  playExplosionSound("player");

  state.lives -= 1;
  state.player = null;
  state.playerShot = null;
  state.alienShots = [];

  if (state.lives <= 0) {
    state.pendingGameOver = true;
    state.respawnTimer = 1.35;
  } else {
    state.respawnTimer = 1.1;
  }
}

function spawnAlienShot() {
  const columns = new Map();

  for (const alien of state.aliens) {
    if (!alien.alive) {
      continue;
    }

    const previous = columns.get(alien.col);
    if (!previous || alien.y > previous.y) {
      columns.set(alien.col, alien);
    }
  }

  const shooters = [...columns.values()];
  if (shooters.length === 0) {
    return;
  }

  const shooter = shooters[Math.floor(Math.random() * shooters.length)];
  state.alienShots.push({
    x: shooter.x + shooter.width / 2 - 3,
    y: shooter.y + shooter.height,
    width: 6,
    height: 18,
    speed: 280 + state.wave * 18,
  });
}

function updateStars(delta) {
  for (const star of stars) {
    star.y += star.speed * delta;
    if (star.y > HEIGHT) {
      star.y = -4;
      star.x = Math.random() * WIDTH;
    }
  }
}

function updatePlayer(delta) {
  const player = state.player;
  if (!player) {
    return;
  }

  player.cooldown = Math.max(0, player.cooldown - delta);

  if (keys.left) {
    player.x -= player.speed * delta;
  }

  if (keys.right) {
    player.x += player.speed * delta;
  }

  player.x = clamp(player.x, 26, WIDTH - player.width - 26);

  if (keys.fire && !state.playerShot && player.cooldown <= 0) {
    state.playerShot = {
      x: player.x + player.width / 2 - 2,
      y: player.y - 20,
      width: 4,
      height: 20,
      speed: 620,
    };
    player.cooldown = 0.4;
    playShotSound();
  }
}

function updatePlayerShot(delta) {
  const shot = state.playerShot;
  if (!shot) {
    return;
  }

  shot.y -= shot.speed * delta;
  if (shot.y + shot.height < 0) {
    state.playerShot = null;
    return;
  }

  if (damageShieldAt(shot.x + shot.width / 2, shot.y)) {
    state.playerShot = null;
    return;
  }

  if (state.ufo && rectsOverlap(shot, state.ufo)) {
    state.playerShot = null;
    handleUfoDestroyed();
    return;
  }

  for (const alien of state.aliens) {
    if (!alien.alive) {
      continue;
    }

    if (rectsOverlap(shot, alien)) {
      state.playerShot = null;
      handleAlienDestroyed(alien);
      break;
    }
  }
}

function advanceAlienAnimation() {
  state.alienAnimationFrame = state.alienAnimationFrame === 0 ? 1 : 0;
}

function updateAlienFormation(delta) {
  const aliveAliens = state.aliens.filter((alien) => alien.alive);

  if (aliveAliens.length === 0) {
    nextWave();
    return;
  }

  state.alienMoveTimer += delta;
  state.alienFireTimer += delta;

  const moveInterval = state.activeAlienMoveInterval;

  while (state.alienMoveTimer >= moveInterval) {
    state.alienMoveTimer -= moveInterval;

    const leftMost = Math.min(...aliveAliens.map((alien) => alien.x));
    const rightMost = Math.max(...aliveAliens.map((alien) => alien.x + alien.width));
    const stepX = 12;
    const dropY = 18;
    const hitLeft = leftMost + state.alienDirection * stepX <= 28;
    const hitRight = rightMost + state.alienDirection * stepX >= WIDTH - 28;

    if (hitLeft || hitRight) {
      state.alienDirection *= -1;
      for (const alien of aliveAliens) {
        alien.y += dropY;
      }
    } else {
      for (const alien of aliveAliens) {
        alien.x += stepX * state.alienDirection;
      }
    }

    advanceAlienAnimation();
    playFleetStepSound();
  }

  const fireInterval = Math.max(0.22, state.alienFireInterval / (0.8 + state.wave * 0.08));
  if (state.alienFireTimer >= fireInterval) {
    state.alienFireTimer = 0;
    spawnAlienShot();
  }

  const lowestY = Math.max(...aliveAliens.map((alien) => alien.y + alien.height));
  if (state.player && lowestY >= state.player.y) {
    gameOver();
  }
}

function updateAlienShots(delta) {
  const nextShots = [];

  for (const shot of state.alienShots) {
    shot.y += shot.speed * delta;

    if (shot.y > HEIGHT) {
      continue;
    }

    if (damageShieldAt(shot.x + shot.width / 2, shot.y + shot.height / 2)) {
      continue;
    }

    if (state.player && rectsOverlap(shot, state.player)) {
      handlePlayerHit();
      continue;
    }

    nextShots.push(shot);
  }

  state.alienShots = nextShots;
}

function updateRespawn(delta) {
  if (state.phase !== "playing" || state.player || state.respawnTimer <= 0) {
    return;
  }

  state.respawnTimer = Math.max(0, state.respawnTimer - delta);
  if (state.respawnTimer > 0) {
    return;
  }

  if (state.pendingGameOver) {
    state.pendingGameOver = false;
    gameOver();
    return;
  }

  state.player = createPlayer();
}

function updateEffects(delta) {
  state.effects = state.effects
    .map((effect) => {
      const drag = 0.9;
      for (const particle of effect.particles) {
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vx *= drag;
        particle.vy *= drag;
      }

      effect.life -= delta;
      return effect;
    })
    .filter((effect) => effect.life > 0);
}

function updateUfo(delta) {
  if (!state.ufo) {
    if (Math.random() < delta * 0.06) {
      const direction = Math.random() > 0.5 ? 1 : -1;
      const size = spriteSize(SPRITES.ufoBody);
      state.ufo = {
        x: direction === 1 ? -size.width - 30 : WIDTH + 30,
        y: 58,
        width: size.width,
        height: size.height,
        speed: 150 * direction,
        points: 100,
        lightFrame: 0,
      };
      beep(540, 0.1, "triangle", 0.025, 620);
    }
    return;
  }

  state.ufo.x += state.ufo.speed * delta;
  state.ufo.lightFrame = (state.ufo.lightFrame + delta * 10) % 4;

  if (state.ufo.x > WIDTH + 120 || state.ufo.x + state.ufo.width < -120) {
    state.ufo = null;
  }
}

function update(delta) {
  updateStars(delta);
  updateEffects(delta);

  if (state.phase !== "playing") {
    return;
  }

  updatePlayer(delta);
  updatePlayerShot(delta);
  updateAlienFormation(delta);
  updateAlienShots(delta);
  updateUfo(delta);
  updateRespawn(delta);
}

function drawPlayfieldBands() {
  ctx.fillStyle = COLORS.redOverlay;
  ctx.fillRect(0, 46, WIDTH, 78);

  ctx.fillStyle = COLORS.greenOverlay;
  ctx.fillRect(0, HEIGHT - 260, WIDTH, 220);
}

function drawStars() {
  for (const star of stars) {
    ctx.fillStyle = star.radius > 2 ? "#d8e8ff" : COLORS.stars;
    ctx.fillRect(star.x, star.y, star.radius, star.radius);
  }
}

function drawHud() {
  ctx.fillStyle = COLORS.hud;
  ctx.font = "bold 24px Trebuchet MS";
  ctx.fillText(`SCORE ${String(state.score).padStart(4, "0")}`, 28, 38);
  ctx.fillText(`HI ${String(state.highScore).padStart(4, "0")}`, WIDTH / 2 - 60, 38);
  ctx.fillText(`LIVES ${state.lives}`, WIDTH - 150, 38);

  ctx.font = "18px Trebuchet MS";
  ctx.fillStyle = "#b8d0df";
  ctx.fillText(`WAVE ${state.wave}`, 28, 66);
}

function drawPlayer(player) {
  drawPixelSprite(SPRITES.player, player.x, player.y, COLORS.player);
}

function alienColorForRow(row) {
  return row === 0 ? COLORS.alienTop : row < 3 ? COLORS.alienMid : COLORS.alienLow;
}

function drawAlien(alien) {
  const frame = state.alienAnimationFrame;
  drawPixelSprite(SPRITES[alien.kind][frame], alien.x, alien.y, alienColorForRow(alien.row));
}

function drawShield(shield) {
  for (const cell of shield.cells) {
    if (cell.hp <= 0) {
      continue;
    }

    ctx.fillStyle = cell.hp === 3 ? COLORS.shield : cell.hp === 2 ? "#53cf70" : "#2e8b57";
    ctx.fillRect(shield.x + cell.x, shield.y + cell.y, cell.width, cell.height);
  }
}

function drawUfo(ufo) {
  const lightPositions = [
    { x: 3 * SCALE, y: 0, color: "#fffdc4" },
    { x: 5 * SCALE, y: 0, color: "#ffd36a" },
    { x: 7 * SCALE, y: 0, color: "#fffdc4" },
    { x: 9 * SCALE, y: 0, color: "#ffd36a" },
  ];

  drawPixelSprite(SPRITES.ufoBody, ufo.x, ufo.y, COLORS.ufo);

  const active = Math.floor(ufo.lightFrame) % lightPositions.length;
  for (let i = 0; i < lightPositions.length; i += 1) {
    const light = lightPositions[i];
    ctx.fillStyle = i === active ? light.color : "rgba(255, 211, 106, 0.25)";
    ctx.fillRect(ufo.x + light.x, ufo.y + light.y, SCALE, SCALE);
  }
}

function drawShots() {
  if (state.playerShot) {
    ctx.fillStyle = COLORS.playerShot;
    ctx.fillRect(
      state.playerShot.x,
      state.playerShot.y,
      state.playerShot.width,
      state.playerShot.height
    );
  }

  ctx.fillStyle = COLORS.alienShot;
  for (const shot of state.alienShots) {
    ctx.fillRect(shot.x, shot.y, shot.width, shot.height);
  }
}

function drawEffects() {
  for (const effect of state.effects) {
    const alpha = Math.max(0, effect.life / effect.duration);

    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = "#fff6d9";
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.size * (1 - alpha * 0.25), 0, Math.PI * 2);
    ctx.fill();

    for (const particle of effect.particles) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(0.6, particle.radius * alpha), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
}

function drawOverlay() {
  if (state.phase === "playing" && (state.player || state.respawnTimer <= 0)) {
    return;
  }

  ctx.fillStyle = COLORS.overlay;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.hud;
  ctx.font = "bold 64px Trebuchet MS";
  ctx.fillText("STAR SIEGE", WIDTH / 2, 280);

  ctx.font = "24px Trebuchet MS";
  ctx.fillStyle = "#d3eaf8";

  if (state.phase === "title") {
    ctx.fillText("Closer to the 1978 arcade feel: 11-column invader rack and step animation", WIDTH / 2, 338);
    ctx.fillText("Move with A and D. Fire with Space.", WIDTH / 2, 388);
    ctx.fillText("Press Enter to begin.", WIDTH / 2, 438);
  } else if (state.phase === "gameover") {
    ctx.fillText(`Final score: ${state.score}`, WIDTH / 2, 350);
    ctx.fillText(state.message, WIDTH / 2, 402);
  } else if (!state.player && state.respawnTimer > 0) {
    ctx.fillText("Base destroyed", WIDTH / 2, 350);
    ctx.fillText(
      state.pendingGameOver ? "The invasion is over." : "Deploying the next base...",
      WIDTH / 2,
      402
    );
  }

  ctx.textAlign = "left";
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawStars();
  drawPlayfieldBands();
  drawHud();

  if (state.ufo) {
    drawUfo(state.ufo);
  }

  for (const alien of state.aliens) {
    if (alien.alive) {
      drawAlien(alien);
    }
  }

  for (const shield of state.shields) {
    drawShield(shield);
  }

  if (state.player) {
    drawPlayer(state.player);
  }

  drawShots();
  drawEffects();

  ctx.strokeStyle = "#2e4d71";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18, HEIGHT - 56);
  ctx.lineTo(WIDTH - 18, HEIGHT - 56);
  ctx.stroke();

  drawOverlay();
}

let lastTimestamp = 0;

function gameLoop(timestamp) {
  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }

  const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.033);
  lastTimestamp = timestamp;

  update(delta);
  render();
  window.requestAnimationFrame(gameLoop);
}

function handleKeyChange(event, isDown) {
  const code = event.code;
  const key = event.key.toLowerCase();

  if (code === "KeyA" || key === "a") {
    keys.left = isDown;
    event.preventDefault();
  }

  if (code === "KeyD" || key === "d") {
    keys.right = isDown;
    event.preventDefault();
  }

  if (code === "Space" || key === " ") {
    keys.fire = isDown;
    event.preventDefault();
  }

  if (isDown && (code === "Enter" || key === "enter")) {
    if (state.phase === "title" || state.phase === "gameover") {
      startGame();
      event.preventDefault();
    }
  }
}

window.addEventListener("keydown", (event) => handleKeyChange(event, true));
window.addEventListener("keyup", (event) => handleKeyChange(event, false));

resetWave({ keepScore: false });
render();
window.requestAnimationFrame(gameLoop);
