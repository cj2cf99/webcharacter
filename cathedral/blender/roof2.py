# 屋面与耳堂的第二轮细节（2026-11-16，对照用户给的侧面和后殿实景照片）：
# 屋檐栏杆（中殿、楼廊、礼拜堂三层檐口）、屋脊饰、老虎窗、耳堂山墙（斜边卷叶、小圆窗、盲拱带）、
# 耳堂门楣小山花、玫瑰窗外框环、尖塔的爬行饰与塔基小尖塔。
# 由 exterior2.py 在 d2.done() 之前 exec，共享 facade2.py 的 P / _arch_rods 与 dims 常量。
# 说明：老虎窗数量与位置、屋脊饰间距、耳堂各层小拱数量都是目视照片的推算，未找到测绘来源（待核实）。
import math
from mathutils import Vector

def rail_y(x, y0, y1, z, h=1.0, step=0.7, w=0.22):
    """沿 y 方向的镂空栏杆：上下横档 + 小立柱。"""
    d2.box(x - w, x + w, y0, y1, z, z + 0.15)
    d2.box(x - w, x + w, y0, y1, z + h - 0.14, z + h)
    n = max(1, int((y1 - y0) / step))
    for i in range(n + 1):
        yy = y0 + (y1 - y0) * i / n
        d2.box(x - 0.08, x + 0.08, yy - 0.08, yy + 0.08, z + 0.15, z + h - 0.14)

def rail_x(y, x0, x1, z, h=1.0, step=0.7, w=0.22):
    d2.box(x0, x1, y - w, y + w, z, z + 0.15)
    d2.box(x0, x1, y - w, y + w, z + h - 0.14, z + h)
    n = max(1, int(abs(x1 - x0) / step))
    for i in range(n + 1):
        xx = x0 + (x1 - x0) * i / n
        d2.box(xx - 0.08, xx + 0.08, y - 0.08, y + 0.08, z + 0.15, z + h - 0.14)

SEGS = [(NAVE_Y0 - 0.5, NAVE_Y1), (CHOIR_Y0, CHOIR_Y1)]

# ---------------------------------------------------------------- 三层檐口栏杆
for (ya, yb) in SEGS:
    for s in (-1, 1):
        rail_y(s * (ARC_X + 1.15), ya, yb, HIGH_WALL_TOP, 1.1, 0.8)                       # 中殿檐口
        rail_y(s * (AISLE_PIER_X + 0.9), ya, yb, TRIBUNE_WALL_TOP, 1.0, 0.8)                # 楼廊屋檐
        rail_y(s * (CHAPEL_OUT_X - 0.5), ya, yb, CHAPEL_WALL_TOP, 1.0, 0.8)                 # 礼拜堂檐口

# ---------------------------------------------------------------- 屋脊饰（中殿、唱诗区、耳堂）
def cresting_y(y0, y1, x=0.0):
    n = int((y1 - y0) / 1.3)
    for i in range(n + 1):
        yy = y0 + (y1 - y0) * i / max(1, n)
        if i % 3 == 0:
            d2.box(x - 0.2, x + 0.2, yy - 0.2, yy + 0.2, ROOF_RIDGE + 0.15, ROOF_RIDGE + 0.75)       # 稀疏的小花饰块，坐在脊线上
    d2.box(x - 0.18, x + 0.18, y0, y1, ROOF_RIDGE - 0.05, ROOF_RIDGE + 0.3)                        # 连续脊线（略埋入屋面）
for (ya, yb) in SEGS:
    cresting_y(ya + 0.5, yb - 0.5)
ymid_t = (TRANSEPT_Y0 + TRANSEPT_Y1) / 2
n_ = int(2 * TRANSEPT_OUT_X / 1.3)
for i in range(n_ + 1):
    xx = -TRANSEPT_OUT_X + 2 * TRANSEPT_OUT_X * i / n_
    if i % 3 == 0:
        d2.box(xx - 0.2, xx + 0.2, ymid_t - 0.2, ymid_t + 0.2, ROOF_RIDGE + 0.2, ROOF_RIDGE + 0.75)

d2.box(-TRANSEPT_OUT_X + 0.3, TRANSEPT_OUT_X - 0.3, ymid_t - 0.18, ymid_t + 0.18, ROOF_RIDGE - 0.05, ROOF_RIDGE + 0.3)      # 耳堂连续脊线（原来只有小块、悬在脊上）

# ---------------------------------------------------------------- 老虎窗：带山花的小窗（侧壁 + 人字顶 + 正面尖拱窗框 + 顶端小尖饰），不再是一个方块顶一个棱锥
def dormer(x, yc, zs, s):
    """x、yc：窗在屋坡上的位置；zs：该处屋面高度；s：朝外方向（±x）。"""
    xo = x + s * 0.55; xi = x - s * 0.7                       # 外立面与向屋脊内收的后端
    z0 = zs - 0.35
    d2.box(*sorted((xi, xo)), yc - 0.62, yc - 0.5, z0, zs + 1.25)         # 两侧颊墙
    d2.box(*sorted((xi, xo)), yc + 0.5, yc + 0.62, z0, zs + 1.25)
    d2.box(*sorted((xo - 0.12 * s, xo)), yc - 0.62, yc + 0.62, z0, zs + 0.15)     # 窗台以下的前墙
    # 人字顶：两片斜板（沿 x 方向的脊）+ 前山花三角
    zr = zs + 2.45
    for sg in (-1, 1):
        n0_ = len(d2.bm.faces)
        A_ = [d2.bm.verts.new((xo + s * 0.12, yc + sg * 0.78, zs + 1.2)), d2.bm.verts.new((xi, yc + sg * 0.78, zs + 1.2)),
              d2.bm.verts.new((xi, yc, zr)), d2.bm.verts.new((xo + s * 0.12, yc, zr))]
        B_ = [d2.bm.verts.new((v.x, v.y, v.z - 0.14)) for v in [Vector(p.co) for p in A_]]
        for q in ((A_[0], A_[1], A_[2], A_[3]), (B_[3], B_[2], B_[1], B_[0]), (A_[0], B_[0], B_[1], A_[1]), (A_[1], B_[1], B_[2], A_[2]), (A_[2], B_[2], B_[3], A_[3]), (A_[3], B_[3], B_[0], A_[0])):
            d2.bm.faces.new(q)
        d2.bm.faces.ensure_lookup_table(); bmesh.ops.recalc_face_normals(d2.bm, faces=list(d2.bm.faces)[n0_:])
    n1_ = len(d2.bm.faces)
    T_ = [d2.bm.verts.new((xo + s * 0.12 - s * 0.02, yc - 0.78, zs + 1.2)), d2.bm.verts.new((xo + s * 0.12 - s * 0.02, yc + 0.78, zs + 1.2)), d2.bm.verts.new((xo + s * 0.12 - s * 0.02, yc, zr + 0.02))]
    T2_ = [d2.bm.verts.new((v.co.x - s * 0.18, v.co.y, v.co.z)) for v in T_]
    for q in ((T_[0], T_[1], T_[2]), (T2_[2], T2_[1], T2_[0]), (T_[0], T2_[0], T2_[1], T_[1]), (T_[1], T2_[1], T2_[2], T_[2]), (T_[2], T2_[2], T2_[0], T_[0])):
        d2.bm.faces.new(q)
    d2.bm.faces.ensure_lookup_table(); bmesh.ops.recalc_face_normals(d2.bm, faces=list(d2.bm.faces)[n1_:])
    # 前面的尖拱窗框 + 竖棂；小尖饰
    face = ('x', xo + s * 0.14, s)
    # 窗框：尖拱从窗台（颊墙顶）升起，拱顶顶到人字顶底；中棂上下都抵到实体（原来整个窗框悬在开口里）
    for sg in (-1, 1):
        rod(d2, P(face, yc + sg * 0.36, zs + 0.1, 0.0), P(face, yc + sg * 0.36, zs + 0.5, 0.0), 0.05)
    _arch_rods(P, face, yc, 0.36, zs + 0.5, zs + 1.25, 0.05, 0.0, 8)
    rod(d2, P(face, yc, zs + 0.1, 0.0), P(face, yc, zs + 1.25, 0.0), 0.045)
    p_ = P(face, yc, zr, 0.05)
    pinnacle(d2, p_.x, p_.y, zr - 0.05, 0.3, 0.35, 0.55)
for ys in (NAVE_BAYS, CHOIR_BAYS):
    for ya, yb in bays(ys):
        yc = (ya + yb) / 2
        for s in (-1, 1):
            x = s * 5.0
            zs = HIGH_WALL_TOP + (ARC_X + 1.0 - abs(x)) / (ARC_X + 1.0) * (ROOF_RIDGE - HIGH_WALL_TOP)
            dormer(x, yc, zs, s)

# ---------------------------------------------------------------- 耳堂：山墙、门楣山花、盲拱带、玫瑰窗外框
ym = (TRANSEPT_Y0 + TRANSEPT_Y1) / 2
for s in (-1, 1):
    face = ('x', s * TRANSEPT_OUT_X, s)
    u0, u1 = TRANSEPT_Y0 + 0.6, TRANSEPT_Y1 - 0.6
    apex = ROOF_RIDGE + 1.0
    # 山墙斜边 + 卷叶饰
    for sg, ue in ((-1, u0), (1, u1)):
        rod(d2, P(face, ue, HIGH_WALL_TOP, 0.35), P(face, ym, apex, 0.35), 0.28)
        for k in range(1, 9):
            f = k / 9
            uu = ue + (ym - ue) * f; zz = HIGH_WALL_TOP + (apex - HIGH_WALL_TOP) * f
            p = P(face, uu, zz, 0.35)
            d2.box(p.x - 0.18, p.x + 0.18, p.y - 0.18, p.y + 0.18, p.z, p.z + 0.5)
    # 山墙内的小圆窗花格
    zc = HIGH_WALL_TOP + 3.4
    pts = [(ym + 1.7 * math.cos(2 * math.pi * k / 20), zc + 1.7 * math.sin(2 * math.pi * k / 20)) for k in range(21)]
    for (a0, z0), (a1, z1) in zip(pts, pts[1:]):
        rod(d2, P(face, a0, z0, 0.3), P(face, a1, z1, 0.3), 0.1)
    for k in range(8):
        a = math.pi * k / 4
        rod(d2, P(face, ym, zc, 0.3), P(face, ym + 1.7 * math.cos(a), zc + 1.7 * math.sin(a), 0.3), 0.08)
    # 玫瑰窗外框：两圈粗环
    for rr in (ROSE_T_R + 0.35, ROSE_T_R + 0.9):
        pts = [(ym + rr * math.cos(2 * math.pi * k / 48), ROSE_T_CZ + rr * math.sin(2 * math.pi * k / 48)) for k in range(49)]
        for (a0, z0), (a1, z1) in zip(pts, pts[1:]):
            rod(d2, P(face, a0, z0, 0.25), P(face, a1, z1, 0.25), 0.2)
    # 玫瑰窗下的盲拱带（z 12.8–16）与窗上的盲拱带（z 31–34.2）
    for z0_, z1_, n_ in ((12.8, 15.8, 9), (31.0, 34.0, 11)):
        wa = (u1 - u0) / n_
        for k in range(n_):
            u = u0 + wa * (k + 0.5); hw = wa / 2 - 0.25
            for sg in (-1, 1):
                rod(d2, P(face, u + sg * hw, z0_, 0.2), P(face, u + sg * hw, z1_ - 1.0, 0.2), 0.09)
            _arch_rods(P, face, u, hw, z1_ - 1.0, z1_, 0.08, 0.2, 6)
        _band(face, u0 - 0.3, u1 + 0.3, z0_ - 0.3, z0_ - 0.05, 0.3)
    _band(face, u0 - 0.3, u1 + 0.3, HIGH_WALL_TOP - 0.3, HIGH_WALL_TOP, 0.35)         # 山墙下腰线
    # 门楣小山花（耳堂门：中心 ym，半宽 2.3，起拱 7.5，拱顶 12）
    hw = 3.0; zb = 9.0; ap = 15.0
    for sg in (-1, 1):
        rod(d2, P(face, ym + sg * hw, zb, 0.3), P(face, ym, ap, 0.3), 0.2)
    rod(d2, P(face, ym - hw, zb, 0.3), P(face, ym + hw, zb, 0.3), 0.16)
    for k in range(1, 6):
        f = k / 6
        for sg in (-1, 1):
            p = P(face, ym + sg * hw * (1 - f), zb + (ap - zb) * f, 0.3)
            d2.box(p.x - 0.14, p.x + 0.14, p.y - 0.14, p.y + 0.14, p.z, p.z + 0.4)
    # 两侧竖向扶壁条（转角塔与门之间）
    for u in (u0 + 3.2, u1 - 3.2):
        p0 = P(face, u, 0.0, 0.0)
        d2.box(min(p0.x, p0.x + s * 0.5), max(p0.x, p0.x + s * 0.5), u - 0.5, u + 0.5, 0, HIGH_WALL_TOP)

# ---------------------------------------------------------------- 尖塔：爬行饰、环线、塔基小尖塔
for k in range(8):
    a = 2 * math.pi * k / 8
    z = SPIRE_DRUM_TOP + 1.5
    while z < SPIRE_TOP - 3:
        r = SPIRE_NEEDLE_R * (1 - (z - SPIRE_DRUM_TOP) / (SPIRE_TOP - SPIRE_DRUM_TOP)) + 0.05
        d2.box(r * math.cos(a) - 0.18, r * math.cos(a) + 0.18, CROSS_YC + r * math.sin(a) - 0.18, CROSS_YC + r * math.sin(a) + 0.18, z, z + 0.5)
        z += 2.4
for z in (SPIRE_DRUM_TOP + 4, SPIRE_DRUM_TOP + 11, SPIRE_DRUM_TOP + 19):                # 环线
    r = SPIRE_NEEDLE_R * (1 - (z - SPIRE_DRUM_TOP) / (SPIRE_TOP - SPIRE_DRUM_TOP)) + 0.12
    pts = [(r * math.cos(2 * math.pi * k / 8), CROSS_YC + r * math.sin(2 * math.pi * k / 8), z) for k in range(9)]
    for a_, b_ in zip(pts, pts[1:]):
        rod(d2, a_, b_, 0.12)
for k in range(8):                                                                         # 塔基一圈小尖塔
    a = 2 * math.pi * (k + 0.5) / 8
    pinnacle(d2, 4.6 * math.cos(a), CROSS_YC + 4.6 * math.sin(a), ROOF_RIDGE - 5.8, 0.9, 7.0, 2.4)

# ---------------------------------------------------------------- 塔顶平台两侧栏杆（原来只有前后两条，转角尖塔悬在没有栏杆的一侧）
for s in (-1, 1):
    for x in (s * (TW0 + 0.25), s * (TW1 - 0.25)):
        rail_y(x, WALL_Y0 + 0.3, TOWER_DEPTH - 0.3, TOWER_TOP_BAL, TOWER_TOP - TOWER_TOP_BAL, 0.8)
