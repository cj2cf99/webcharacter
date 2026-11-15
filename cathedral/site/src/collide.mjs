// 碰撞与门的纯逻辑（不依赖 three.js，Node 测试可直接导入）。
// 坐标一律用 Blender 平面坐标：x 向南、y 向东（西立面 y=0，向室内为 +y）。

export const RADIUS = 0.3;            // 玩家半径（米）
export const DOOR_OPEN_DEG = 95;      // 门开到的角度
export const DOOR_TIME = 1.5;         // 开关用时（秒）

/** grid: Uint8Array（1=阻挡），meta: collision.json */
export function createWorld(grid, meta) {
  const { x0, y0, cell, w, h } = meta;
  const cellBlocked = (ix, iy) => ix < 0 || iy < 0 || ix >= w || iy >= h || grid[iy * w + ix] === 1;
  return { grid, meta, cellBlocked, x0, y0, cell, w, h };
}

/** 门：两扇门板，各自绕铰链转动。angle 0 = 关，1 = 全开。 */
export function createDoor(meta) {
  return { t: 0, target: 0, hingeL: meta.door.hinge_l, hingeR: meta.door.hinge_r, leaf: meta.door.leaf };
}

export function doorAngleRad(door) {
  const e = door.t * door.t * (3 - 2 * door.t);           // 缓入缓出
  return e * DOOR_OPEN_DEG * Math.PI / 180;
}

export function stepDoor(door, dt) {
  const d = Math.sign(door.target - door.t);
  door.t = Math.min(1, Math.max(0, door.t + d * dt / DOOR_TIME));
}

/** 当前门板线段（Blender 平面坐标） */
export function doorSegments(door) {
  const a = doorAngleRad(door);
  const [lx, ly] = door.hingeL, [rx, ry] = door.hingeR, L = door.leaf;
  return [
    [lx, ly, lx + Math.cos(a) * L, ly + Math.sin(a) * L],      // 左扇：从 +x 方向逆时针转向 +y
    [rx, ry, rx - Math.cos(a) * L, ry + Math.sin(a) * L],      // 右扇：从 -x 方向顺时针转向 +y
  ];
}

function segDist(px, py, [ax, ay, bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export function blocked(world, door, x, y, r = RADIUS) {
  const { x0, y0, cell } = world;
  const ix0 = Math.floor((x - r - x0) / cell), ix1 = Math.floor((x + r - x0) / cell);
  const iy0 = Math.floor((y - r - y0) / cell), iy1 = Math.floor((y + r - y0) / cell);
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      if (!world.cellBlocked(ix, iy)) continue;
      // 圆与格子（方块）是否相交
      const cx = Math.max(x0 + ix * cell, Math.min(x, x0 + (ix + 1) * cell));
      const cy = Math.max(y0 + iy * cell, Math.min(y, y0 + (iy + 1) * cell));
      if (Math.hypot(x - cx, y - cy) < r) return true;
    }
  }
  for (const s of doorSegments(door)) if (segDist(x, y, s) < r + 0.08) return true;
  return false;
}

/** 移动并沿墙滑动；返回新位置。大步拆成不超过 0.1 m 的小步。 */
export function move(world, door, pos, dx, dy) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.1));
  let [x, y] = pos;
  for (let i = 0; i < n; i++) {
    const sx = dx / n, sy = dy / n;
    if (!blocked(world, door, x + sx, y + sy)) { x += sx; y += sy; }
    else if (!blocked(world, door, x + sx, y)) x += sx;
    else if (!blocked(world, door, x, y + sy)) y += sy;
  }
  return [x, y];
}

/** 是否在门前（3 m 内且大致面向门） */
export function nearDoor(pos, forward) {
  const dx = 0 - pos[0], dy = 3.6 - pos[1];
  const d = Math.hypot(dx, dy);
  return d < 3.2 && (dx * forward[0] + dy * forward[1]) / (d || 1) > 0.3;
}

/** 是否在教堂室内（用于曝光适应） */
export function isInside(pos) {
  return pos[1] > 3.7 && pos[1] < 127 && Math.abs(pos[0]) < 24.7;
}
