# 第二轮外观细节（2026-11-16，对照用户给的实景照片）：飞扶壁（双跨飞券 + 中间墩 + 尖顶）、后殿放射飞券、
# 塔楼与立面扶壁的小尖塔、耳堂转角塔、钟楼侧面百叶、滴水兽。
# 由 massing.py 在 facade.py 之后 exec，共享其全局（Builder、dims 常量、BUTTRESS_Y、she 等）。
# 尺寸说明：飞券两跨的高度取自原 massing 的推算值（Fletcher 剖面）；尖塔高度、转角塔位置目视照片推算，未找到测绘来源（待核实）。
import bpy, bmesh, math
from mathutils import Vector

d2 = Builder('W_Detail2', EXT, stone)

def _faces(b, loops, close=True):
    """loops: 若干组（每组 4 个 3D 点，顺序一致）→ 闭合实体（两端封口），统一法线朝外。"""
    n0 = len(b.bm.faces)
    vs = [[b.bm.verts.new(p) for p in lp] for lp in loops]
    k = len(vs[0])
    for a, c in zip(vs, vs[1:]):
        for i in range(k):
            j = (i + 1) % k
            b.bm.faces.new((a[i], a[j], c[j], c[i]))
    if close:
        b.bm.faces.new(vs[0][::-1]); b.bm.faces.new(vs[-1])
    b.bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(b.bm, faces=list(b.bm.faces)[n0:])

def pyr(b, cx, cy, z0, hw, z1, hwy=None):
    hwy = hw if hwy is None else hwy
    n0 = len(b.bm.faces)
    base = [b.bm.verts.new((cx + sx * hw, cy + sy * hwy, z0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    ap = b.bm.verts.new((cx, cy, z1))
    b.bm.faces.new(base[::-1])
    for i in range(4):
        b.bm.faces.new((base[i], base[(i + 1) % 4], ap))
    b.bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(b.bm, faces=list(b.bm.faces)[n0:])

def pinnacle(b, x, y, z0, w, shaft, tip):
    """小尖塔：方柱 + 四棱锥，柱身腰部一圈线脚。"""
    b.box(x - w / 2, x + w / 2, y - w / 2, y + w / 2, z0, z0 + shaft)
    b.box(x - w * 0.62, x + w * 0.62, y - w * 0.62, y + w * 0.62, z0 + shaft * 0.55, z0 + shaft * 0.55 + 0.25)
    b.box(x - w * 0.6, x + w * 0.6, y - w * 0.6, y + w * 0.6, z0 + shaft, z0 + shaft + 0.2)
    pyr(b, x, y, z0 + shaft + 0.2, w * 0.6, z0 + shaft + 0.2 + tip)
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):        # 四角爬行饰（小块）
        b.box(x + sx * w * 0.5 - 0.1, x + sx * w * 0.5 + 0.1, y + sy * w * 0.5 - 0.1, y + sy * w * 0.5 + 0.1, z0 + shaft + 0.2, z0 + shaft + 0.2 + tip * 0.55)

def spirelet(b, x, y, z0, r, h, seg=8):
    c = bmesh.ops.create_cone(b.bm, cap_ends=True, segments=seg, radius1=r, radius2=0.04, depth=h)
    for v in c['verts']:
        v.co += Vector((x, y, z0 + h / 2))

def flyer(b, p0, p1, z0, z1, width, t_end=2.4, t_mid=0.9, n=14):
    """飞券：从 p0（外侧墩）到 p1（内侧）的平面内，上缘直线下坡，下缘是向上拱起的曲线（支座处厚、跨中薄）。"""
    p0, p1 = Vector((*p0, 0)), Vector((*p1, 0))
    dirv = (p1 - p0).normalized(); side = Vector((-dirv.y, dirv.x, 0))
    loops = []
    for i in range(n + 1):
        t = i / n
        c = p0 + (p1 - p0) * t
        zt = z0 + (z1 - z0) * t
        th = t_mid + (t_end - t_mid) * (1 - math.sin(math.pi * t)) ** 1.5
        hw = width / 2
        loops.append([(c.x - side.x * hw, c.y - side.y * hw, zt), (c.x + side.x * hw, c.y + side.y * hw, zt),
                      (c.x + side.x * hw, c.y + side.y * hw, zt - th), (c.x - side.x * hw, c.y - side.y * hw, zt - th)])
    _faces(d2, loops)

def gargoyle(b, x, y, z, sx, sy=0.0):
    """滴水兽：向外探出的方块，末端略低，带一块“头”。(sx, sy) 为外向单位方向。"""
    L = 1.7; w = 0.38
    p0 = Vector((x, y, z)); p1 = p0 + Vector((sx * L, sy * L, -0.35))
    rod(b, p0, p1, w * 0.55, 6)
    h = p1 + Vector((sx * 0.25, sy * 0.25, -0.1))
    b.box(h.x - 0.28, h.x + 0.28, h.y - 0.28, h.y + 0.28, h.z - 0.3, h.z + 0.3)

# ---------------------------------------------------------------- 中殿与唱诗区飞扶壁（两跨）
MID_X = AISLE_PIER_X                    # 中间墩：落在侧廊柱线上
for y in BUTTRESS_Y:
    for s in (-1, 1):
        xo = s * (CHAPEL_OUT_X - 1.6)                       # 外墩中心
        d2.box(s * (CHAPEL_OUT_X - 2.6), s * (CHAPEL_OUT_X + 0.4), y - 0.75, y + 0.75, 29.0, 31.0)       # 外墩加高
        pinnacle(d2, xo, y, 31.0, 1.5, 2.5, 4.6)                                                         # 外墩尖塔
        # 中间墩（落在楼廊屋面之上）与尖塔
        d2.box(s * (MID_X - 0.55), s * (MID_X + 0.55), y - 0.55, y + 0.55, 16.5, 26.0)
        pinnacle(d2, s * MID_X, y, 26.0, 1.2, 2.2, 3.6)
        flyer(d2, (xo - s * 0.75, y), (s * (MID_X + 0.55), y), 27.2, 25.0, 0.8, 2.0, 0.8)               # 外跨
        flyer(d2, (s * (MID_X - 0.55), y), (s * (ARC_X + 0.9), y), 29.0, 31.0, 0.8, 1.9, 0.8)             # 内跨（向上顶高墙）
        gargoyle(d2, s * (CHAPEL_OUT_X + 0.2), y + 0.9, 26.2, s)                                          # 外墩上的滴水兽
        gargoyle(d2, s * (CHAPEL_OUT_X + 0.2), y - 0.9, 13.5, s)                                          # 礼拜堂檐口
# 开间中部的檐口滴水兽（外侧廊屋檐、楼廊屋檐）
for ys in (NAVE_BAYS, CHOIR_BAYS):
    for ya, yb in bays(ys):
        for s in (-1, 1):
            gargoyle(d2, s * (CHAPEL_OUT_X + 0.1), (ya + yb) / 2, 13.2, s)
            gargoyle(d2, s * (AISLE_PIER_X + 0.9), (ya + yb) / 2, 20.8, s)

# ---------------------------------------------------------------- 后殿放射飞扶壁
for i in range(1, 10):
    a = math.pi * i / 10
    ca, sa = math.cos(a), math.sin(a)
    px = lambda r: (r * ca * 1.0, APSE_CY + r * sa * (APSE_OUT[1] / APSE_OUT[0]))
    r_pier = APSE_OUT[0] - 1.6
    x0, y0 = px(r_pier)
    # 放射墩：礼拜堂外墙上方到 29 m，朝圆心方向 2.6 m，宽 1.3 m
    d2.box(x0 - 0.9, x0 + 0.9, y0 - 0.9, y0 + 0.9, 14.0, 29.0)
    pinnacle(d2, x0, y0, 29.0, 1.5, 2.5, 4.6)
    gargoyle(d2, *(px(APSE_OUT[0] + 0.1)), 13.4, ca, sa * (APSE_OUT[1] / APSE_OUT[0]))
    # 单跨长飞券：从外墩到高墙
    xin, yin = px(ARC_X + 0.9)
    flyer(d2, (x0 - ca * 0.9, y0 - sa * 0.9 * 1.0), (xin, yin), 28.0, 29.5, 0.9, 3.2, 1.0, 18)

# ---------------------------------------------------------------- 塔顶、立面扶壁、耳堂转角
for s in (-1, 1):
    xa, xb_ = s * (TW0 + 0.9), s * (TW1 - 0.9)
    ya, yb = WALL_Y0 + 0.9, TOWER_DEPTH - 0.9
    for x_ in (xa, xb_):
        for y_ in (ya, yb):
            pinnacle(d2, x_, y_, TOWER_TOP_BAL + 1.5, 1.5, 1.8, 3.6)                                     # 塔顶四角尖塔
    # 塔身中段的角柱（目视照片：钟楼层四角的细长塔式角扶壁）
    for x_ in (xa, xb_):
        for y_ in (ya, yb):
            d2.box(x_ - 0.7, x_ + 0.7, y_ - 0.7, y_ + 0.7, TOP_BAL_Z1, TOWER_TOP_BAL)
xcs = [-F_BUTT_OUT, -F_BUTT_IN, F_BUTT_IN, F_BUTT_OUT]
for xb in xcs:
    pinnacle(d2, xb, 0.9, TOP_BAL_Z0 + 0.3, 1.5, 2.2, 3.4)                                              # 立面扶壁顶

TY0_, TY1_ = TRANSEPT_Y0, TRANSEPT_Y1
for s in (-1, 1):
    for y_ in (TY0_ + 0.9, TY1_ - 0.9):
        x_ = s * (TRANSEPT_OUT_X - 1.0)
        d2.box(x_ - 1.0, x_ + 1.0, y_ - 1.0, y_ + 1.0, HIGH_WALL_TOP - 3.0, HIGH_WALL_TOP + 4.0)       # 转角塔身
        spirelet(d2, x_, y_, HIGH_WALL_TOP + 4.0, 1.2, 8.0, 8)                                           # 八角尖顶
    # 山墙顶尖塔
    pinnacle(d2, s * (TRANSEPT_OUT_X - 0.6), (TY0_ + TY1_) / 2, ROOF_RIDGE + 1.0, 1.4, 1.5, 3.0)

# ---------------------------------------------------------------- 钟楼侧面百叶（原来只有前后面）
for s in (-1, 1):
    xc = s * (TW0 + TW1) / 2; yc = (WALL_Y0 + TOWER_DEPTH) / 2
    for dy in (-BELFRY_DX, BELFRY_DX):
        for k in range(10):
            z = BELFRY_Z0 + 0.6 + k * 0.85
            for x in (s * (TW0 + 0.8), s * (TW1 - 0.8)):
                d2.box(x - 0.06, x + 0.06, yc + dy - BELFRY_W, yc + dy + BELFRY_W, z, z + 0.45)
        # 拱顶部分填板
        for x in (s * (TW0 + 0.8), s * (TW1 - 0.8)):
            d2.box(x - 0.06, x + 0.06, yc + dy - BELFRY_W, yc + dy + BELFRY_W, BELFRY_Z0 + 0.6 + 10 * 0.85, BELFRY_Z1 - 1.2)

# ---------------------------------------------------------------- 窗棂与花格（所有尖拱窗、耳堂玫瑰窗）
def _w(M, x, y, z):
    return M @ Vector((x, y, z))
for kind, M, xc, p1, p2, p3, p4, t in WIN_LOG:
    ym = t / 2
    if kind == 'win':
        w, zb, zs, zc = p1, p2, p3, p4
        if w < 0.5: continue
        lights = 2 if w < 1.3 else (3 if w < 2.0 else 4)
        top = lambda dx: zs + (zc - zs) * max(0.0, 1.0 - (abs(dx) / w) ** 2) * 0.82
        for i in range(1, lights):                                     # 竖棂
            dx = -w + 2 * w * i / lights
            rod(d2, _w(M, xc + dx, ym, zb + 0.15), _w(M, xc + dx, ym, top(dx) - 0.1), 0.09)
        rod(d2, _w(M, xc - w, ym, zs), _w(M, xc + w, ym, zs), 0.07)    # 横档（起拱线）
        rz = zs + (zc - zs) * 0.50; rr = min(w * 0.42, (zc - zs) * 0.28)   # 拱顶小圆窗花格
        if rr > 0.25:
            pts = [_w(M, xc + rr * math.cos(2 * math.pi * k / 12), ym, rz + rr * math.sin(2 * math.pi * k / 12)) for k in range(13)]
            for a_, b_ in zip(pts, pts[1:]):
                rod(d2, a_, b_, 0.06)
    else:
        cz, r = p1, p2
        for k in range(12):                                            # 12 根放射窗棂
            a = 2 * math.pi * k / 12
            rod(d2, _w(M, xc + 0.14 * r * math.cos(a), ym, cz + 0.14 * r * math.sin(a)), _w(M, xc + 0.97 * r * math.cos(a), ym, cz + 0.97 * r * math.sin(a)), 0.1)
        for rr_, n_ in ((0.14, 16), (0.46, 24), (0.78, 24), (0.99, 32)):  # 同心环
            pts = [_w(M, xc + rr_ * r * math.cos(2 * math.pi * k / n_), ym, cz + rr_ * r * math.sin(2 * math.pi * k / n_)) for k in range(n_ + 1)]
            for a_, b_ in zip(pts, pts[1:]):
                rod(d2, a_, b_, 0.09)

d2_obj = d2.done()
print('exterior2 ok', len(d2_obj.data.polygons))
