// 碰撞与门的逻辑测试：node tools/test-collision.mjs
import { readFileSync } from 'node:fs';
import { createWorld, createDoor, stepDoor, move, blocked, nearDoor } from '../site/src/collide.mjs';

const A = new URL('../site/assets/', import.meta.url);
const meta = JSON.parse(readFileSync(new URL('collision.json', A)));
const world = createWorld(new Uint8Array(readFileSync(new URL('collision.bin', A))), meta);
let fails = 0;
const check = (name, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) fails++; };

// 沿直线向东走，返回最终位置
function walk(door, from, to, step = 0.05) {
  let p = [...from];
  for (let i = 0; i < 4000; i++) {
    const dx = to[0] - p[0], dy = to[1] - p[1], d = Math.hypot(dx, dy);
    if (d < 0.1) break;
    p = move(world, door, p, dx / d * step, dy / d * step);
  }
  return p;
}

const door = createDoor(meta);
check('出生点可站立', !blocked(world, door, ...meta.spawn));
let p = walk(door, [0.6, -20], [0.6, 30]);
check(`门关着：停在门外（y=${p[1].toFixed(2)}）`, p[1] < 3.3);
check('门前能触发开门提示', nearDoor([0.6, 1.2], [0, 1]));
door.target = 1; for (let i = 0; i < 100; i++) stepDoor(door, 0.05);
p = walk(door, [1.2, -20], [1.2, 30]);
check(`门开着：走进中殿（y=${p[1].toFixed(2)}）`, p[1] > 29);
p = walk(door, [0, 30], [0, 95]);
check(`中殿走到唱诗区（y=${p[1].toFixed(2)}）`, p[1] > 94);
p = walk(door, [0, 30], [-30, 30]);
check(`向北撞到侧墙不穿出（x=${p[0].toFixed(2)}）`, p[0] > -23.4);
p = walk(door, [0, 42.2], [6.9, 42.2]);
check(`对准柱心撞主连拱柱：停在柱外（x=${p[0].toFixed(2)}）`, p[0] < 6.9 - 0.7);
p = walk(door, [0, 39.5], [10, 39.5]);
check(`两柱之间可走进侧廊（x=${p[0].toFixed(2)}）`, p[0] > 9.9);
p = walk(door, [0, -60], [-80, -60]);
check(`走不出场地（x=${p[0].toFixed(2)}）`, p[0] > -68);
// 高速：每帧 0.8 m（跑步 16 m/s × 0.05 s）也不能穿墙或穿柱
{
  let q = [0, 42.2];
  for (let i = 0; i < 40; i++) q = move(world, door, q, 0.8, 0);
  check(`高速撞柱不穿（x=${q[0].toFixed(2)}）`, q[0] < 6.9 - 0.7);
  q = [0, 30];
  for (let i = 0; i < 80; i++) q = move(world, door, q, -0.8, 0);
  check(`高速撞侧墙不穿（x=${q[0].toFixed(2)}）`, q[0] > -23.4);
}
door.target = 0; for (let i = 0; i < 100; i++) stepDoor(door, 0.05);
p = walk(door, [1.2, 10], [1.2, -10]);
check(`门再关上：从里面出不去（y=${p[1].toFixed(2)}）`, p[1] > 3.7);
process.exit(fails ? 1 : 0);
