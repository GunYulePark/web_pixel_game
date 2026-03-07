const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;

const ROOM = { x: 24, y: 24, w: W - 48, h: H - 48 };
const pressed = new Set();

const player = {
  x: W / 2,
  y: H / 2,
  w: 14,
  h: 14,
  speed: 110,
  dir: 'down',
  hp: 100,
  maxHp: 100,
  mana: 80,
  maxMana: 80,
  atkCd: 0,
  meleeCd: 0,
  rollCd: 0,
  inv: 0,
  anim: 0,
  level: 1,
  xp: 0,
  nextXp: 120,
  power: 1,
  coins: 0,
};

const game = {
  over: false,
  win: false,
  score: 0,
  roomX: 0,
  roomY: 0,
  seals: 0,
  message: '던전에 입장했다. 봉인석을 모아 보스방을 열어라.',
  msgTimer: 3,
  shake: 0,
  runTime: 0,
};

const bullets = [];
const enemyBullets = [];
const enemies = [];
const drops = [];

const doors = {
  up: { x: W / 2 - 18, y: ROOM.y - 6, w: 36, h: 10 },
  down: { x: W / 2 - 18, y: ROOM.y + ROOM.h - 4, w: 36, h: 10 },
  left: { x: ROOM.x - 6, y: H / 2 - 18, w: 10, h: 36 },
  right: { x: ROOM.x + ROOM.w - 4, y: H / 2 - 18, w: 10, h: 36 },
};

const shopPedestals = [
  { x: W / 2 - 90, y: H / 2 + 18, w: 24, h: 24 },
  { x: W / 2 - 12, y: H / 2 + 18, w: 24, h: 24 },
  { x: W / 2 + 66, y: H / 2 + 18, w: 24, h: 24 },
];

function makeShopStock() {
  return [
    { key: 'vital', label: 'HP+20', cost: 40, bought: false },
    { key: 'might', label: 'POW+', cost: 55, bought: false },
    { key: 'swift', label: 'SPD+', cost: 35, bought: false },
  ];
}

let shopStock = makeShopStock();

const roomTemplates = [
  { type: 'start', cleared: true },
  { type: 'fight', cleared: false },
  { type: 'elite', cleared: false },
  { type: 'fight', cleared: false },
  { type: 'shrine', cleared: true },
  { type: 'shop', cleared: true },
  { type: 'elite', cleared: false },
  { type: 'fight', cleared: false },
  { type: 'boss', cleared: false, locked: true },
];

const dungeon = roomTemplates.map((r) => ({ ...r, visited: false, spawned: false }));
currentRoom().visited = true;

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  pressed.add(k);
  if (k === ' ' || k === 'j') shoot();
  if (k === 'k') melee();
  if (k === 'q') castNova();
  if (k === 'shift') dash();
  if (k === 'e') interact();
  if ((game.over || game.win) && k === 't') restart();
});
window.addEventListener('keyup', (e) => pressed.delete(e.key.toLowerCase()));

function roomIndex(x = game.roomX, y = game.roomY) { return y * 3 + x; }
function currentRoom() { return dungeon[roomIndex()]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rect(a) { return { x: a.x, y: a.y, w: a.w, h: a.h }; }
function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function roomWalls() {
  const list = [];
  const t = 10;
  const doorW = 40;
  const doorH = 40;

  const hasUp = game.roomY > 0;
  const hasDown = game.roomY < 2;
  const hasLeft = game.roomX > 0;
  const hasRight = game.roomX < 2;

  const topDoorX = W / 2 - doorW / 2;
  const leftDoorY = H / 2 - doorH / 2;

  // top / bottom walls with door gaps
  if (hasUp) {
    list.push({ x: ROOM.x, y: ROOM.y, w: topDoorX - ROOM.x, h: t });
    list.push({ x: topDoorX + doorW, y: ROOM.y, w: ROOM.x + ROOM.w - (topDoorX + doorW), h: t });
  } else {
    list.push({ x: ROOM.x, y: ROOM.y, w: ROOM.w, h: t });
  }

  if (hasDown) {
    list.push({ x: ROOM.x, y: ROOM.y + ROOM.h - t, w: topDoorX - ROOM.x, h: t });
    list.push({ x: topDoorX + doorW, y: ROOM.y + ROOM.h - t, w: ROOM.x + ROOM.w - (topDoorX + doorW), h: t });
  } else {
    list.push({ x: ROOM.x, y: ROOM.y + ROOM.h - t, w: ROOM.w, h: t });
  }

  // left / right walls with door gaps
  if (hasLeft) {
    list.push({ x: ROOM.x, y: ROOM.y, w: t, h: leftDoorY - ROOM.y });
    list.push({ x: ROOM.x, y: leftDoorY + doorH, w: t, h: ROOM.y + ROOM.h - (leftDoorY + doorH) });
  } else {
    list.push({ x: ROOM.x, y: ROOM.y, w: t, h: ROOM.h });
  }

  if (hasRight) {
    list.push({ x: ROOM.x + ROOM.w - t, y: ROOM.y, w: t, h: leftDoorY - ROOM.y });
    list.push({ x: ROOM.x + ROOM.w - t, y: leftDoorY + doorH, w: t, h: ROOM.y + ROOM.h - (leftDoorY + doorH) });
  } else {
    list.push({ x: ROOM.x + ROOM.w - t, y: ROOM.y, w: t, h: ROOM.h });
  }

  const r = currentRoom();
  const blocked = !r.cleared && r.type !== 'start' && r.type !== 'shrine' && r.type !== 'shop';
  if (blocked) {
    // lock doorways during combat
    if (hasUp) list.push({ x: topDoorX, y: ROOM.y, w: doorW, h: t });
    if (hasDown) list.push({ x: topDoorX, y: ROOM.y + ROOM.h - t, w: doorW, h: t });
    if (hasLeft) list.push({ x: ROOM.x, y: leftDoorY, w: t, h: doorH });
    if (hasRight) list.push({ x: ROOM.x + ROOM.w - t, y: leftDoorY, w: t, h: doorH });
  }

  if (r.type === 'fight') {
    list.push({ x: W / 2 - 55, y: H / 2 - 6, w: 110, h: 12 });
    list.push({ x: W / 2 - 6, y: H / 2 - 55, w: 12, h: 110 });
  }
  if (r.type === 'elite') {
    list.push({ x: ROOM.x + 80, y: ROOM.y + 60, w: 20, h: 120 });
    list.push({ x: ROOM.x + ROOM.w - 100, y: ROOM.y + 100, w: 20, h: 120 });
  }
  if (r.type === 'boss') {
    list.push({ x: ROOM.x + 90, y: ROOM.y + ROOM.h / 2 - 8, w: ROOM.w - 180, h: 16 });
  }
  return list;
}

function canMove(nx, ny, w = player.w, h = player.h) {
  const hit = { x: nx, y: ny, w, h };
  return !roomWalls().some((wall) => intersects(hit, wall));
}

function openDoor(dir) {
  const r = currentRoom();
  if (!r.cleared && r.type !== 'start' && r.type !== 'shrine' && r.type !== 'shop') return false;

  if (dir === 'up' && game.roomY > 0) { game.roomY--; player.y = ROOM.y + ROOM.h - 26; return true; }
  if (dir === 'down' && game.roomY < 2) { game.roomY++; player.y = ROOM.y + 16; return true; }
  if (dir === 'left' && game.roomX > 0) { game.roomX--; player.x = ROOM.x + ROOM.w - 26; return true; }
  if (dir === 'right' && game.roomX < 2) { game.roomX++; player.x = ROOM.x + 16; return true; }
  return false;
}

function transitionIfNeeded() {
  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;
  const doorLaneX = Math.abs(cx - W / 2) < 24;
  const doorLaneY = Math.abs(cy - H / 2) < 24;

  // use edge-near checks (works even with movement clamp)
  if (doorLaneX && player.y <= ROOM.y + 8 && openDoor('up')) enterRoom();
  else if (doorLaneX && player.y + player.h >= ROOM.y + ROOM.h - 8 && openDoor('down')) enterRoom();
  else if (doorLaneY && player.x <= ROOM.x + 8 && openDoor('left')) enterRoom();
  else if (doorLaneY && player.x + player.w >= ROOM.x + ROOM.w - 8 && openDoor('right')) enterRoom();
}

function spawnRoomEnemies() {
  enemies.length = 0;
  enemyBullets.length = 0;
  drops.length = 0;

  const r = currentRoom();
  if (r.cleared || r.type === 'start' || r.type === 'shrine' || r.type === 'shop') return;

  if (r.type === 'fight') {
    for (let i = 0; i < 6; i++) {
      enemies.push({
        type: Math.random() < 0.5 ? 'slime' : 'skeleton',
        x: ROOM.x + 40 + Math.random() * (ROOM.w - 80),
        y: ROOM.y + 40 + Math.random() * (ROOM.h - 80),
        w: 14,
        h: 14,
        hp: 20,
        speed: 42,
        atk: 8,
        cd: 0,
      });
    }
  } else if (r.type === 'elite') {
    for (let i = 0; i < 3; i++) {
      enemies.push({
        type: 'knight',
        x: ROOM.x + 60 + i * 70,
        y: ROOM.y + 60 + (i % 2) * 80,
        w: 18,
        h: 18,
        hp: 48,
        speed: 36,
        atk: 14,
        cd: 0,
      });
    }
  } else if (r.type === 'boss') {
    enemies.push({
      type: 'boss',
      x: W / 2 - 22,
      y: H / 2 - 36,
      w: 44,
      h: 44,
      hp: 420,
      maxHp: 420,
      speed: 24,
      atk: 18,
      cd: 0,
      phase: 1,
    });
  }
}

function enterRoom() {
  const r = currentRoom();
  r.visited = true;

  if (r.type === 'boss' && r.locked) {
    if (game.seals >= 2) {
      r.locked = false;
      game.message = '보스방 봉인이 해제되었다.';
      game.msgTimer = 2.2;
    } else {
      game.message = '봉인석 2개가 필요하다.';
      game.msgTimer = 2;
      if (game.roomX === 2) game.roomX = 1;
      if (game.roomY === 2) game.roomY = 1;
      player.x = W / 2;
      player.y = H / 2;
      return;
    }
  }

  player.x = clamp(player.x, ROOM.x + 14, ROOM.x + ROOM.w - 28);
  player.y = clamp(player.y, ROOM.y + 14, ROOM.y + ROOM.h - 28);

  if (!r.spawned) {
    spawnRoomEnemies();
    r.spawned = true;
  } else {
    spawnRoomEnemies();
  }

  if (r.type === 'shrine') {
    player.hp = Math.min(player.maxHp, player.hp + 30);
    player.mana = player.maxMana;
    game.message = '성소에서 회복했다.';
    game.msgTimer = 2;
  }

  if (r.type === 'shop') {
    game.message = '상점: E로 유물을 구매할 수 있다.';
    game.msgTimer = 2;
  }
}

function restart() {
  player.x = W / 2;
  player.y = H / 2;
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  player.atkCd = player.meleeCd = player.rollCd = player.inv = 0;
  player.level = 1;
  player.xp = 0;
  player.nextXp = 120;
  player.power = 1;
  player.speed = 110;
  player.coins = 0;
  shopStock = makeShopStock();
  bullets.length = enemyBullets.length = enemies.length = drops.length = 0;
  game.over = false;
  game.win = false;
  game.score = 0;
  game.roomX = 0;
  game.roomY = 0;
  game.seals = 0;
  game.message = '다시 던전에 입장했다.';
  game.msgTimer = 2;
  game.shake = 0;
  game.runTime = 0;
  dungeon.forEach((r, i) => {
    const t = roomTemplates[i];
    r.type = t.type;
    r.cleared = !!t.cleared;
    r.locked = !!t.locked;
    r.visited = false;
    r.spawned = false;
  });
  currentRoom().visited = true;
  enterRoom();
}

function shoot() {
  if (game.over || game.win || player.atkCd > 0) return;
  player.atkCd = 0.14;
  const speed = 230;
  let vx = 0, vy = 1;
  if (player.dir === 'up') vy = -1;
  else if (player.dir === 'left') { vx = -1; vy = 0; }
  else if (player.dir === 'right') { vx = 1; vy = 0; }
  else { vx = 0; vy = 1; }

  bullets.push({
    x: player.x + player.w / 2 - 2,
    y: player.y + player.h / 2 - 2,
    w: 4, h: 4,
    vx, vy,
    speed,
    dmg: Math.round(13 * player.power),
  });
}

function melee() {
  if (game.over || game.win || player.meleeCd > 0) return;
  player.meleeCd = 0.32;
  const range = 24;
  const hit = { x: player.x, y: player.y, w: player.w, h: player.h };
  if (player.dir === 'up') hit.y -= range;
  if (player.dir === 'down') hit.y += range;
  if (player.dir === 'left') hit.x -= range;
  if (player.dir === 'right') hit.x += range;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (intersects(hit, rect(e))) {
      e.hp -= Math.round(22 * player.power);
      if (e.hp <= 0) onEnemyDown(i);
    }
  }
}

function castNova() {
  if (game.over || game.win) return;
  if (player.mana < 24) return;
  player.mana -= 24;
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    bullets.push({
      x: player.x + player.w / 2 - 2,
      y: player.y + player.h / 2 - 2,
      w: 4, h: 4,
      vx: Math.cos(a),
      vy: Math.sin(a),
      speed: 180,
      dmg: Math.round(10 * player.power),
    });
  }
}

function dash() {
  if (player.rollCd > 0 || game.over || game.win) return;
  player.rollCd = 0.9;
  player.inv = 0.2;
  let dx = 0, dy = 0;
  if (player.dir === 'up') dy = -1;
  if (player.dir === 'down') dy = 1;
  if (player.dir === 'left') dx = -1;
  if (player.dir === 'right') dx = 1;
  const nx = player.x + dx * 34;
  const ny = player.y + dy * 34;
  if (canMove(nx, ny)) {
    player.x = nx;
    player.y = ny;
  }
}

function interact() {
  if (game.over || game.win) return;
  if (currentRoom().type !== 'shop') return;

  for (let i = 0; i < shopPedestals.length; i++) {
    const p = shopPedestals[i];
    const near = Math.hypot((player.x + player.w / 2) - (p.x + p.w / 2), (player.y + player.h / 2) - (p.y + p.h / 2));
    if (near > 32) continue;

    const item = shopStock[i];
    if (!item || item.bought) return;
    if (player.coins < item.cost) {
      game.message = '코인이 부족하다.';
      game.msgTimer = 1.3;
      return;
    }

    player.coins -= item.cost;
    item.bought = true;

    if (item.key === 'vital') {
      player.maxHp += 20;
      player.hp = Math.min(player.maxHp, player.hp + 20);
    } else if (item.key === 'might') {
      player.power += 0.18;
    } else if (item.key === 'swift') {
      player.speed += 12;
    }

    game.message = `구매 완료: ${item.label}`;
    game.msgTimer = 1.6;
    return;
  }
}

function addXp(amount) {
  player.xp += amount;
  while (player.xp >= player.nextXp) {
    player.xp -= player.nextXp;
    player.level += 1;
    player.nextXp = Math.floor(player.nextXp * 1.28);
    player.maxHp += 8;
    player.hp = Math.min(player.maxHp, player.hp + 12);
    player.maxMana += 4;
    player.mana = player.maxMana;
    player.power += 0.12;
    player.speed += 2;
    game.message = `레벨 업! Lv.${player.level}`;
    game.msgTimer = 1.8;
  }
}

function hitPlayer(dmg, inv = 0.3) {
  if (player.inv > 0) return;
  player.hp -= dmg;
  player.inv = inv;
  game.shake = Math.max(game.shake, Math.min(0.28, 0.08 + dmg * 0.006));
  if (player.hp <= 0) {
    player.hp = 0;
    game.over = true;
  }
}

function onEnemyDown(index) {
  const e = enemies[index];
  if (!e) return;

  if (e.type === 'boss') {
    game.score += 1200;
    addXp(400);
    game.win = true;
    currentRoom().cleared = true;
    game.message = '심연의 군주를 쓰러뜨렸다!';
    game.msgTimer = 5;
    game.shake = 0.35;
    enemies.splice(index, 1);
    return;
  }

  const xpGain = e.type === 'knight' ? 45 : 20;
  addXp(xpGain);
  game.score += e.type === 'knight' ? 80 : 30;
  if (Math.random() < 0.75) drops.push({ x: e.x + 2, y: e.y + 2, type: 'coin' });
  if (Math.random() < 0.4) drops.push({ x: e.x, y: e.y, type: 'potion' });
  if (e.type === 'knight' && Math.random() < 0.6) drops.push({ x: e.x + 8, y: e.y + 4, type: 'seal' });
  if (Math.random() < 0.15) drops.push({ x: e.x + 4, y: e.y + 6, type: 'relic' });
  enemies.splice(index, 1);

  if (enemies.length === 0) {
    const r = currentRoom();
    r.cleared = true;
    if (r.type === 'elite') {
      game.seals += 1;
      game.message = '봉인석을 획득했다.';
    } else {
      game.message = '방을 정화했다. 문이 열렸다.';
    }
    game.msgTimer = 2.3;
  }
}

function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;
  if (pressed.has('a') || pressed.has('arrowleft')) dx--;
  if (pressed.has('d') || pressed.has('arrowright')) dx++;
  if (pressed.has('w') || pressed.has('arrowup')) dy--;
  if (pressed.has('s') || pressed.has('arrowdown')) dy++;

  if (dx || dy) {
    const n = Math.hypot(dx, dy);
    dx /= n; dy /= n;
    player.anim += dt * 9;
    if (Math.abs(dx) > Math.abs(dy)) player.dir = dx > 0 ? 'right' : 'left';
    else player.dir = dy > 0 ? 'down' : 'up';
  }

  const nx = player.x + dx * player.speed * dt;
  const ny = player.y + dy * player.speed * dt;
  if (canMove(nx, player.y)) player.x = nx;
  if (canMove(player.x, ny)) player.y = ny;

  player.x = clamp(player.x, ROOM.x + 6, ROOM.x + ROOM.w - player.w - 6);
  player.y = clamp(player.y, ROOM.y + 6, ROOM.y + ROOM.h - player.h - 6);

  player.atkCd = Math.max(0, player.atkCd - dt);
  player.meleeCd = Math.max(0, player.meleeCd - dt);
  player.rollCd = Math.max(0, player.rollCd - dt);
  player.inv = Math.max(0, player.inv - dt);
  player.mana = clamp(player.mana + 11 * dt, 0, player.maxMana);

  transitionIfNeeded();
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * b.speed * dt;
    b.y += b.vy * b.speed * dt;

    if (b.x < ROOM.x || b.y < ROOM.y || b.x > ROOM.x + ROOM.w || b.y > ROOM.y + ROOM.h) {
      bullets.splice(i, 1);
      continue;
    }

    if (roomWalls().some((w) => intersects(rect(b), w))) {
      bullets.splice(i, 1);
      continue;
    }

    for (let j = enemies.length - 1; j >= 0; j--) {
      if (intersects(rect(b), rect(enemies[j]))) {
        enemies[j].hp -= b.dmg;
        bullets.splice(i, 1);
        if (enemies[j].hp <= 0) onEnemyDown(j);
        break;
      }
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * b.speed * dt;
    b.y += b.vy * b.speed * dt;

    if (b.x < ROOM.x || b.y < ROOM.y || b.x > ROOM.x + ROOM.w || b.y > ROOM.y + ROOM.h) {
      enemyBullets.splice(i, 1);
      continue;
    }

    if (intersects(rect(b), rect(player))) {
      hitPlayer(b.dmg, 0.3);
      enemyBullets.splice(i, 1);
    }
  }
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const dx = (player.x - e.x);
    const dy = (player.y - e.y);
    const len = Math.hypot(dx, dy) || 1;

    const speedMul = e.type === 'slime' ? 0.9 : e.type === 'skeleton' ? 1.1 : 1;
    const nx = e.x + (dx / len) * e.speed * speedMul * dt;
    const ny = e.y + (dy / len) * e.speed * speedMul * dt;
    if (canMove(nx, e.y, e.w, e.h)) e.x = nx;
    if (canMove(e.x, ny, e.w, e.h)) e.y = ny;

    e.cd = Math.max(0, e.cd - dt);

    if (e.type === 'skeleton' && e.cd <= 0 && len < 220) {
      e.cd = 1.4;
      enemyBullets.push({
        x: e.x + e.w / 2,
        y: e.y + e.h / 2,
        w: 4, h: 4,
        vx: dx / len,
        vy: dy / len,
        speed: 120,
        dmg: 7,
      });
    }

    if (e.type === 'boss') {
      if (e.hp < e.maxHp * 0.55) e.phase = 2;
      if (e.cd <= 0) {
        e.cd = e.phase === 1 ? 1.6 : 1.1;
        const burst = e.phase === 1 ? 8 : 12;
        for (let k = 0; k < burst; k++) {
          const a = (Math.PI * 2 * k) / burst + performance.now() * 0.001;
          enemyBullets.push({
            x: e.x + e.w / 2,
            y: e.y + e.h / 2,
            w: 5, h: 5,
            vx: Math.cos(a),
            vy: Math.sin(a),
            speed: e.phase === 1 ? 95 : 130,
            dmg: e.phase === 1 ? 8 : 12,
          });
        }

        if (e.phase === 2 && enemies.length < 5) {
          enemies.push({
            type: 'skeleton',
            x: e.x + (Math.random() * 60 - 30),
            y: e.y + e.h + 8,
            w: 14,
            h: 14,
            hp: 14,
            speed: 50,
            atk: 7,
            cd: 0.3,
          });
        }
      }
    }

    if (intersects(rect(e), rect(player))) {
      hitPlayer(e.atk, 0.35);
    }
  }
}

function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    const dx = player.x - d.x;
    const dy = player.y - d.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < 80) {
      d.x += (dx / dist) * 120 * dt;
      d.y += (dy / dist) * 120 * dt;
    }
    if (dist < 14) {
      if (d.type === 'coin') player.coins += d.value || 6;
      if (d.type === 'potion') player.hp = Math.min(player.maxHp, player.hp + 20);
      if (d.type === 'seal') game.seals += 1;
      if (d.type === 'relic') {
        const roll = Math.random();
        if (roll < 0.34) player.power += 0.08;
        else if (roll < 0.67) player.speed += 3;
        else {
          player.maxHp += 6;
          player.hp = Math.min(player.maxHp, player.hp + 6);
        }
        game.message = '유물을 흡수했다. 힘이 강해졌다.';
        game.msgTimer = 1.5;
      }
      drops.splice(i, 1);
    }
  }
}

function update(dt) {
  if (!game.over && !game.win) {
    game.runTime += dt;
    updatePlayer(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updateDrops(dt);
  }

  game.msgTimer = Math.max(0, game.msgTimer - dt);
  game.shake = Math.max(0, game.shake - dt * 1.8);
}

function drawFloor() {
  const g = ctx.createLinearGradient(0, ROOM.y, 0, ROOM.y + ROOM.h);
  g.addColorStop(0, '#151429');
  g.addColorStop(1, '#0e1020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // pixel tiles
  for (let y = ROOM.y; y < ROOM.y + ROOM.h; y += 8) {
    for (let x = ROOM.x; x < ROOM.x + ROOM.w; x += 8) {
      const v = (x * 13 + y * 17) % 23;
      ctx.fillStyle = v < 6 ? '#1b1b35' : v < 12 ? '#17162c' : '#131325';
      ctx.fillRect(x, y, 8, 8);
    }
  }
}

function drawWallsAndDoors() {
  roomWalls().forEach((w) => {
    ctx.fillStyle = '#4f4678';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#6f63a8';
    ctx.fillRect(w.x, w.y, w.w, 2);
  });

  const r = currentRoom();
  const blocked = !r.cleared && r.type !== 'start' && r.type !== 'shrine' && r.type !== 'shop';
  Object.values(doors).forEach((d) => {
    ctx.fillStyle = blocked ? '#6e2f4f' : '#2f7a66';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = blocked ? '#ca5f87' : '#8ee7cd';
    ctx.fillRect(d.x + 2, d.y + 2, d.w - 4, 2);
  });

  if (r.type === 'shop') {
    ctx.fillStyle = '#2a3e5f';
    ctx.fillRect(W / 2 - 44, H / 2 - 28, 88, 14);
    ctx.fillStyle = '#91c8ff';
    ctx.fillText('MERCHANT', W / 2 - 24, H / 2 - 18);

    shopPedestals.forEach((p, i) => {
      const item = shopStock[i];
      ctx.fillStyle = item?.bought ? '#3e4050' : '#5f4e2a';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = item?.bought ? '#a2a5b8' : '#f3d47a';
      ctx.fillRect(p.x + 4, p.y + 4, p.w - 8, 8);
      ctx.fillStyle = '#101020';
      ctx.fillText(item?.bought ? 'SOLD' : item?.label, p.x - 2, p.y + p.h + 10);
      if (!item?.bought) ctx.fillText(`${item.cost}G`, p.x + 4, p.y + p.h + 20);
    });
  }
}

function drawHero() {
  const x = Math.round(player.x), y = Math.round(player.y);
  const step = Math.floor(player.anim) % 2;

  if (player.inv > 0 && Math.floor(performance.now() / 60) % 2 === 0) return;

  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillRect(x + 3, y + 13, 8, 2);

  // helmet + face + cape (pixel art)
  ctx.fillStyle = '#86b4ff'; ctx.fillRect(x + 2, y + 1, 10, 4);
  ctx.fillStyle = '#d9ecff'; ctx.fillRect(x + 3, y + 2, 8, 1);
  ctx.fillStyle = '#ffd8b2'; ctx.fillRect(x + 4, y + 5, 6, 3);
  ctx.fillStyle = '#2a2a44'; ctx.fillRect(x + 4, y + 8, 6, 4);
  ctx.fillStyle = '#b44d63'; ctx.fillRect(x + 2, y + 8, 2, 5);
  ctx.fillStyle = '#5f7ab8'; ctx.fillRect(x + 10, y + 8, 2, 4);

  ctx.fillStyle = '#d2e4ff';
  ctx.fillRect(x + (step ? 4 : 5), y + 12, 2, 2);
  ctx.fillRect(x + (step ? 8 : 7), y + 12, 2, 2);

  if (player.meleeCd > 0.2) {
    ctx.fillStyle = '#ffe18e';
    const r = 18;
    if (player.dir === 'left') ctx.fillRect(x - r, y + 5, r, 3);
    if (player.dir === 'right') ctx.fillRect(x + player.w, y + 5, r, 3);
    if (player.dir === 'up') ctx.fillRect(x + 5, y - r, 3, r);
    if (player.dir === 'down') ctx.fillRect(x + 5, y + player.h, 3, r);
  }
}

function drawEnemy(e) {
  const x = Math.round(e.x), y = Math.round(e.y);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(x + 2, y + e.h - 1, e.w - 4, 2);

  if (e.type === 'slime') {
    ctx.fillStyle = '#6bf07f'; ctx.fillRect(x + 2, y + 4, e.w - 4, e.h - 6);
    ctx.fillStyle = '#b8ffd0'; ctx.fillRect(x + 4, y + 5, e.w - 8, 2);
  } else if (e.type === 'skeleton') {
    ctx.fillStyle = '#e7e7ee'; ctx.fillRect(x + 3, y + 2, e.w - 6, e.h - 4);
    ctx.fillStyle = '#25233e'; ctx.fillRect(x + 5, y + 6, 2, 2); ctx.fillRect(x + e.w - 7, y + 6, 2, 2);
  } else if (e.type === 'knight') {
    ctx.fillStyle = '#cc6b83'; ctx.fillRect(x + 2, y + 2, e.w - 4, e.h - 4);
    ctx.fillStyle = '#ffd9e3'; ctx.fillRect(x + 4, y + 4, e.w - 8, 3);
  } else if (e.type === 'boss') {
    ctx.fillStyle = '#6c2a6e'; ctx.fillRect(x, y, e.w, e.h);
    ctx.fillStyle = '#b24cc9'; ctx.fillRect(x + 4, y + 4, e.w - 8, 8);
    ctx.fillStyle = '#f8d86e'; ctx.fillRect(x + 8, y + 18, e.w - 16, 10);
    ctx.fillStyle = '#200d28'; ctx.fillRect(x + 12, y + 22, 5, 3); ctx.fillRect(x + e.w - 17, y + 22, 5, 3);
  }
}

function drawProjectiles() {
  ctx.fillStyle = '#8ce4ff';
  bullets.forEach((b) => ctx.fillRect(Math.round(b.x), Math.round(b.y), b.w, b.h));
  ctx.fillStyle = '#ff8aa8';
  enemyBullets.forEach((b) => ctx.fillRect(Math.round(b.x), Math.round(b.y), b.w, b.h));
}

function drawDrops() {
  drops.forEach((d) => {
    const x = Math.round(d.x), y = Math.round(d.y);
    if (d.type === 'coin') {
      ctx.fillStyle = '#f4cf58'; ctx.fillRect(x + 2, y + 2, 6, 6);
      ctx.fillStyle = '#8f6a0f'; ctx.fillRect(x + 4, y + 4, 2, 2);
    } else if (d.type === 'potion') {
      ctx.fillStyle = '#ff6fa2'; ctx.fillRect(x + 2, y + 2, 6, 6);
      ctx.fillStyle = '#ffd6e6'; ctx.fillRect(x + 4, y + 1, 2, 2);
    } else if (d.type === 'relic') {
      ctx.fillStyle = '#73e5ff'; ctx.fillRect(x + 1, y + 1, 8, 8);
      ctx.fillStyle = '#123a5f'; ctx.fillRect(x + 4, y + 4, 2, 2);
    } else {
      ctx.fillStyle = '#f9df72'; ctx.fillRect(x + 1, y + 1, 8, 8);
      ctx.fillStyle = '#604d12'; ctx.fillRect(x + 4, y + 4, 2, 2);
    }
  });
}

function drawMinimap() {
  const mx = W - 94;
  const my = 10;
  const s = 84;
  ctx.fillStyle = 'rgba(8,8,18,.8)';
  ctx.fillRect(mx, my, s, s);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const r = dungeon[roomIndex(x, y)];
      const rx = mx + 6 + x * 24;
      const ry = my + 6 + y * 24;
      ctx.fillStyle = r.visited ? (r.cleared ? '#6dd3a3' : '#7f8ab8') : '#2a2b40';
      if (r.type === 'boss') ctx.fillStyle = r.locked ? '#5b2a42' : '#a9476b';
      ctx.fillRect(rx, ry, 20, 20);
      if (r.type === 'shrine') { ctx.fillStyle = '#7ce7ff'; ctx.fillRect(rx + 7, ry + 7, 6, 6); }
    }
  }
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(mx + 6 + game.roomX * 24, my + 6 + game.roomY * 24, 20, 20);
}

function drawHUD() {
  ctx.fillStyle = '#eaf0ff';
  ctx.font = '10px monospace';
  ctx.fillText(`HP ${player.hp}/${player.maxHp}`, 10, 12);
  ctx.fillText(`MANA ${Math.floor(player.mana)}/${player.maxMana}`, 10, 24);
  ctx.fillText(`SEAL ${game.seals}/2`, 10, 36);
  ctx.fillText(`LV ${player.level}  XP ${Math.floor(player.xp)}/${player.nextXp}`, 10, 48);
  ctx.fillText(`SCORE ${game.score}`, 10, 60);
  ctx.fillText(`TIME ${game.runTime.toFixed(1)}s`, 10, 72);
  ctx.fillText(`ROOM ${game.roomX + 1}-${game.roomY + 1} (${currentRoom().type})`, 10, 84);
  ctx.fillText(`GOLD ${player.coins}`, 10, 96);
  ctx.fillText('공격 J/Space · 근접 K · 노바 Q · 대시 Shift · 상호작용 E', 10, H - 10);

  // bars
  ctx.fillStyle = '#3a2431'; ctx.fillRect(102, 5, 130, 8);
  ctx.fillStyle = '#ff6d87'; ctx.fillRect(103, 6, 128 * (player.hp / player.maxHp), 6);
  ctx.fillStyle = '#22354b'; ctx.fillRect(102, 17, 130, 7);
  ctx.fillStyle = '#70c8ff'; ctx.fillRect(103, 18, 128 * (player.mana / player.maxMana), 5);
  ctx.fillStyle = '#3a3550'; ctx.fillRect(102, 27, 130, 6);
  ctx.fillStyle = '#9e7cff'; ctx.fillRect(103, 28, 128 * (player.xp / player.nextXp), 4);

  const boss = enemies.find((e) => e.type === 'boss');
  if (boss) {
    ctx.fillStyle = '#2b102e';
    ctx.fillRect(W / 2 - 120, 6, 240, 12);
    ctx.fillStyle = '#d85aff';
    ctx.fillRect(W / 2 - 119, 7, 238 * (boss.hp / boss.maxHp), 10);
    ctx.fillStyle = '#fff';
    ctx.fillText('ABYSS LORD', W / 2 - 28, 15);
  }

  if (game.msgTimer > 0) {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(W / 2 - 170, H - 34, 340, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(game.message, W / 2 - 160, H - 20);
  }

  if (currentRoom().type === 'shop') {
    for (let i = 0; i < shopPedestals.length; i++) {
      const p = shopPedestals[i];
      const near = Math.hypot((player.x + player.w / 2) - (p.x + p.w / 2), (player.y + player.h / 2) - (p.y + p.h / 2));
      if (near < 32 && !shopStock[i]?.bought) {
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(W / 2 - 90, H - 56, 180, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(`E: ${shopStock[i].label} 구매 (${shopStock[i].cost}G)`, W / 2 - 82, H - 44);
      }
    }
  }

  drawMinimap();

  if (game.over || game.win) {
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '22px monospace';
    ctx.fillText(game.win ? 'VICTORY' : 'GAME OVER', W / 2 - 74, H / 2 - 10);
    ctx.font = '12px monospace';
    ctx.fillText('T 키로 재시작', W / 2 - 46, H / 2 + 18);
  }
}

function draw() {
  ctx.save();
  if (game.shake > 0) {
    const s = game.shake * 5;
    const ox = (Math.random() * 2 - 1) * s;
    const oy = (Math.random() * 2 - 1) * s;
    ctx.translate(ox, oy);
  }

  drawFloor();
  drawWallsAndDoors();
  drawDrops();
  drawProjectiles();
  enemies.forEach(drawEnemy);
  drawHero();
  drawHUD();
  ctx.restore();
}

enterRoom();

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
