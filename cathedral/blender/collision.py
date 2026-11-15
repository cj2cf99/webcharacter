# 碰撞网格：取 z ∈ [0.15, 2.0] 之间的所有几何（不含地面、玻璃、可开的中门），按 0.25 m 格子标记为阻挡。
# 输出 site/assets/collision.bin（每格 1 字节，0 可走 1 阻挡，行优先，行 = Blender y）与 collision.json（元数据）。
# 中门的两扇门板在网页端作为动态线段处理。
import bpy, json, math, os
import numpy as np

SITE = r"G:/selftool/Cathedral/site/assets"
CELL = 0.25
X0, X1, Y0, Y1 = -68.0, 68.0, -68.0, 148.0      # 地面范围内留 2 m 边（地面 x ±70、y −70…150）
Z0, Z1 = 0.15, 2.0
W, H = int((X1 - X0) / CELL), int((Y1 - Y0) / CELL)
SKIP = ('Ground', 'Glass', 'Door_', 'B_ground', 'B_glass', 'B_door', 'PlanOverlay', 'tmp')

def build():
    grid = np.zeros((H, W), np.uint8)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        if o.type != 'MESH' or any(k in o.name for k in SKIP):
            continue
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        M = o.matrix_world
        co = np.array([tuple(M @ v.co) for v in me.vertices], np.float64)
        tri = np.array([t.vertices[:] for t in me.loop_triangles], np.int64)
        o.evaluated_get(dg).to_mesh_clear()
        if len(tri) == 0:
            continue
        P = co[tri]                                   # (n, 3, 3)
        zmin, zmax = P[:, :, 2].min(1), P[:, :, 2].max(1)
        keep = (zmax >= Z0) & (zmin <= Z1)
        for a, b, c in P[keep]:
            # 三角形上按 0.1 m 间距均匀取样
            n = max(2, int(max(np.linalg.norm(b - a), np.linalg.norm(c - a), np.linalg.norm(c - b)) / 0.1) + 1)
            u, v = np.meshgrid(np.linspace(0, 1, n), np.linspace(0, 1, n))
            m = (u + v) <= 1.0
            u, v = u[m], v[m]
            pts = a + np.outer(u, b - a) + np.outer(v, c - a)
            pts = pts[(pts[:, 2] >= Z0) & (pts[:, 2] <= Z1)]
            ix = ((pts[:, 0] - X0) / CELL).astype(int); iy = ((pts[:, 1] - Y0) / CELL).astype(int)
            ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
            grid[iy[ok], ix[ok]] = 1
    return grid

def flood_check(grid, start, goal):
    """从起点能否走到目标（4 邻接），用于验证：门关着时不该能进中殿。"""
    from collections import deque
    sx, sy = int((start[0] - X0) / CELL), int((start[1] - Y0) / CELL)
    gx, gy = int((goal[0] - X0) / CELL), int((goal[1] - Y0) / CELL)
    seen = np.zeros_like(grid, bool); q = deque([(sx, sy)]); seen[sy, sx] = True
    while q:
        x, y = q.popleft()
        if (x, y) == (gx, gy):
            return True
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny, nx] and not grid[ny, nx]:
                seen[ny, nx] = True; q.append((nx, ny))
    return False

def run_collision():
    grid = build()
    grid.tofile(os.path.join(SITE, 'collision.bin'))
    meta = {'x0': X0, 'y0': Y0, 'cell': CELL, 'w': W, 'h': H,
            'door': {'hinge_l': [-2.8, 3.6], 'hinge_r': [2.8, 3.6], 'leaf': 2.45},
            'spawn': [0.0, -60.0], 'note': 'Blender 坐标（x 向南、y 向东）。three.js：x = x，z = -y'}
    json.dump(meta, open(os.path.join(SITE, 'collision.json'), 'w'), ensure_ascii=False)
    # 自检：中门洞封住（模拟门关着）后，从广场应走不到中殿；打开应能走到
    closed = grid.copy()
    i0, i1 = int((-2.8 - X0) / CELL), int((2.8 - X0) / CELL) + 1
    j = int((3.55 - Y0) / CELL)
    closed[j - 1:j + 2, i0:i1] = 1
    print('blocked cells', int(grid.sum()), 'of', grid.size)
    print('reach nave (door closed):', flood_check(closed, (0, -60), (0, 40)))
    print('reach nave (door open):', flood_check(grid, (0, -60), (0, 40)))
    print('reach choir (door open):', flood_check(grid, (0, -60), (0, 95)))
