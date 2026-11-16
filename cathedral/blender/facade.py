# 第 2 阶段：西立面与双塔细部。由 massing.py 在末尾 exec（共享其工具函数与集合）。
# 尺寸全部来自 dims.py 的“西立面细部”一节（照片与 1861 年平面图实测）。
import bpy, bmesh, math
from mathutils import Vector, Matrix

WALL_Y0, WALL_Y1 = F_BUTT_PROJ, F_BUTT_PROJ + 2.0      # 立面墙体：扶壁之后的墙面 y=1.6，厚 2 m
glass = material('Glass', (0.05, 0.08, 0.16), 0.15)
wood = bpy.data.materials.get('Wood') or material('Wood', (0.18, 0.1, 0.05), 0.6)
statue_m = material('Statue', (0.70, 0.66, 0.58))

# ---------------------------------------------------------------- 墙体
TW0, TW1 = ARC_X, TOWER_OUT_X                     # 塔楼横向范围
center = solid('W_Center', EXT, stone, -TW0, TW0, WALL_Y0, WALL_Y1, 0, TOP_BAL_Z0)
towers_low = {s: solid('W_TowerLow_' + 'NS'[s > 0], EXT, stone, s * TW0, s * TW1, WALL_Y0, TOWER_DEPTH, 0, TOP_BAL_Z0) for s in (-1, 1)}
towers_up = {s: solid('W_TowerUp_' + 'NS'[s > 0], EXT, stone, s * (TW0 + 0.4), s * (TW1 - 0.4), WALL_Y0 + 0.4, TOWER_DEPTH - 0.4, TOP_BAL_Z0, TOWER_TOP_BAL) for s in (-1, 1)}

PC_X, PS_X = 0.0, (F_BUTT_IN + F_BUTT_OUT) / 2     # 门洞中心 x
PC_W, PS_W = 5.5, 4.05                              # 外拱半宽：照片按扶壁间距比例推算
DOOR_C_W, DOOR_S_W = PORTAL_C[1] / 2, 1.9          # 门扇半宽：中门取平面图 5.6 m；侧门推算
GAL_SECTIONS = [(-TW0 + 0.6, TW0 - 0.6)] + [(s * (TW0 + 1.0), s * (TW1 - 1.0)) for s in (-1, 1)]

def gallery_shapes(x0, x1, n):
    out = []; w = abs(x1 - x0) / n
    lo = min(x0, x1)
    for i in range(n):
        cx = lo + w * (i + 0.5)
        out.append((opening(cx, w / 2 - 0.12, GALLERY_Z0, GALLERY_Z1 - 1.6, GALLERY_Z1 - 0.4), WALL_Y0 - 0.1, WALL_Y1 + 0.1))
    return out

# 中央：中门、玫瑰窗、大连拱廊、国王廊壁龛
cut(center, [(opening(PC_X, PC_W, -1, PORTAL_SPRING, PORTAL_C_CROWN), WALL_Y0 - 0.1, WALL_Y1 + 0.1),
             (circle(0, ROSE_CZ, ROSE_R + 0.6), WALL_Y0 - 0.1, WALL_Y1 + 0.1)]
             + gallery_shapes(-TW0 + 0.6, TW0 - 0.6, 6))
for s, t in towers_low.items():
    cut(t, [(opening(s * PS_X, PS_W, -1, PORTAL_SPRING, PORTAL_S_CROWN), WALL_Y0 - 0.1, WALL_Y1 + 0.1),
            ('box', s * (TW0 + 0.01), s * (TW1 - 1.6), WALL_Y1, TOWER_DEPTH + 0.1, -1, AISLE_VAULT),  # 塔下底层（连通侧廊）
            (opening(s * PS_X, 3.6, SIDE_WIN_Z0, SIDE_WIN_Z1 - 3.0, SIDE_WIN_Z1), WALL_Y0 - 0.1, WALL_Y0 + 0.8)]
          + gallery_shapes(s * (TW0 + 1.0), s * (TW1 - 1.0), 5))
for s, t in towers_up.items():
    xc = s * (TW0 + TW1) / 2; yc = (WALL_Y0 + TOWER_DEPTH) / 2
    sh = [('box', s * (TW0 + 1.6), s * (TW1 - 1.6), WALL_Y0 + 1.6, TOWER_DEPTH - 1.6, TOP_BAL_Z1 + 0.6, TOWER_TOP_BAL - 1.2)]   # 钟室
    for dx in (-BELFRY_DX, BELFRY_DX):          # 前后面：沿 y 贯穿
        sh.append((opening(xc + dx, BELFRY_W, BELFRY_Z0, BELFRY_Z1 - 2.2, BELFRY_Z1), WALL_Y0 - 1, TOWER_DEPTH + 1))
    for dy in (-BELFRY_DX, BELFRY_DX):          # 两侧面：沿 x 贯穿（轮廓的“横坐标”当作 y）
        sh.append(('x', opening(yc + dy, BELFRY_W, BELFRY_Z0, BELFRY_Z1 - 2.2, BELFRY_Z1), s * TW0 - s, s * TW1 + s))
    # 钟楼下的盲拱带改成真开口（用户 2026-11-16：“这个位置没开窗吗”）：每面 5 个尖拱，只切穿各自那一道墙（不贯通整座塔，免得在角墩里切出长槽）
    xa_, xb2 = sorted((s * (TW0 + 0.4), s * (TW1 - 0.4))); wa_ = (xb2 - xa_) / 5
    for k in range(5):
        cxk = xa_ + wa_ * (k + 0.5); pr = opening(cxk, wa_ / 2 - 0.55, 47.9, 49.6, 51.0)
        sh.append((pr, WALL_Y0 - 1, WALL_Y0 + 1.9))                  # 前墙
        sh.append((pr, TOWER_DEPTH - 1.9, TOWER_DEPTH + 1))          # 后墙
    ya_, yb2 = WALL_Y0 + 0.4, TOWER_DEPTH - 0.4; wb_ = (yb2 - ya_) / 5
    for k in range(5):
        cyk = ya_ + wb_ * (k + 0.5); pr = opening(cyk, wb_ / 2 - 0.55, 47.9, 49.6, 51.0)
        sh.append(('x', pr, s * (TW1 - 1.9), s * TW1 + s))           # 外侧墙
        sh.append(('x', pr, s * TW0 - s, s * (TW0 + 1.9)))           # 内侧墙
    cut(t, sh)

# ---------------------------------------------------------------- 附加构件
d = Builder('W_Detail', EXT, stone)
st = Builder('W_Statues', EXT, statue_m)
gl = Builder('W_Glass', EXT, bpy.data.materials['GlassOut'])
wd = Builder('W_Doors', EXT, wood)

# 扶壁：门洞层 0–18 m，国王廊以上 24.3–45 m；塔身转角扶壁 47–67.5 m
for xb in (-F_BUTT_OUT, -F_BUTT_IN, F_BUTT_IN, F_BUTT_OUT):
    d.box(xb - F_BUTT_W / 2, xb + F_BUTT_W / 2, 0, WALL_Y0, 0, KINGS_Z0)
    d.box(xb - F_BUTT_W / 2 + 0.2, xb + F_BUTT_W / 2 - 0.2, 0.4, WALL_Y0, VIRGIN_BAL_Z + 1.2, TOP_BAL_Z0)
    figure(st, xb, -0.1, 9.0, 3.0)                     # 扶壁正面立像（照片：约 9–12 m）
    d.box(xb - 0.9, xb + 0.9, -0.3, WALL_Y0, 8.6, 9.0)  # 立像托台
for s in (-1, 1):
    for xb in (TW0 + 0.6, TW1 - 0.6):
        d.box(s * (xb - 0.7), s * (xb + 0.7), WALL_Y0 - 0.2, WALL_Y0 + 1.2, TOP_BAL_Z1, TOWER_TOP_BAL)
        d.box(s * (xb - 0.7), s * (xb + 0.7), TOWER_DEPTH - 1.2, TOWER_DEPTH + 0.2, TOP_BAL_Z1, TOWER_TOP_BAL)

# 塔基两侧外凸（1861 年平面图：合计宽 47.1 m）；高度取礼拜堂外墙顶（推算），并与礼拜堂外墙相接
for s_ in (-1, 1):
    d.box(s_ * TW1, s_ * TOWER_BASE_X, WALL_Y0, TOWER_DEPTH + 0.5, 0, CHAPEL_WALL_TOP)

# 门洞：逐层内收的拱券（拱券上排小立像）、侧壁立像、门楣浮雕区（实心）、门扇、中门间柱
def portal(cx, w_out, crown, w_door, n_jamb):
    steps = PORTAL_STEPS
    t = (w_out - w_door) / steps
    for k in range(steps):
        wo, wi = w_out - k * t, w_out - (k + 1) * t
        co, ci = crown - k * t * 0.9, crown - (k + 1) * t * 0.9
        y0 = WALL_Y0 + k * (2.0 / steps); y1 = y0 + 2.0 / steps
        outer = arch_pts(cx, wo, PORTAL_SPRING, co); inner = arch_pts(cx, wi, PORTAL_SPRING, ci)
        band(d, inner, outer, y0, y1, c=(cx, PORTAL_SPRING))
        for sx in (-1, 1):
            d.box(cx + sx * wo, cx + sx * wi, y0, y1, 0, PORTAL_SPRING)
        # 拱券小立像：沿拱的中线每约 0.9 m 一尊（拱顶留空）
        mid = arch_pts(cx, (wo + wi) / 2, PORTAL_SPRING, (co + ci) / 2, 40)
        acc = 0.0
        for (x0, z0), (x1, z1) in zip(mid, mid[1:]):
            acc += math.hypot(x1 - x0, z1 - z0)
            if acc > 0.9 and abs(x1 - cx) > 0.3:
                acc = 0.0
                figure(st, x1, y0 - 0.05, z1 - 0.35, 0.7)
    # 侧壁立像：沿内收面，每侧 n_jamb 尊
    for sx in (-1, 1):
        for i in range(n_jamb):
            f = (i + 0.5) / n_jamb
            x = cx + sx * (w_out - f * (w_out - w_door)); y = WALL_Y0 + f * 2.0 - 0.3
            figure(st, x, y, 1.6, 2.6, -sx * 0.6)
    # 门楣浮雕区（简化为实心拱面）与门扇
    tym = [(cx - w_door, PORTAL_DOOR_H)] + arch_pts(cx, w_door, PORTAL_SPRING, crown - steps * t * 0.9)[1:-1] + [(cx + w_door, PORTAL_DOOR_H)]
    bm = d.bm
    prism(bm, tym, WALL_Y1 - 0.4, WALL_Y1)
    if cx != 0:                                   # 中门门板单独建（可开合），见文件末尾
        wd.box(cx - w_door, cx + w_door, WALL_Y1 - 0.15, WALL_Y1, 0, PORTAL_DOOR_H)
    # 门楣浮雕：分层的人像带（中门 3 层、侧门 2 层；照片可见分层，人物为简化体块）
    top = crown - steps * t * 0.9
    regs = 3 if w_door > 2.5 else 2
    z = PORTAL_DOOR_H + 0.7
    hreg = (top - 0.8 - z) / regs
    for r_ in range(regs):
        zc = z + r_ * hreg
        d.box(cx - w_door, cx + w_door, WALL_Y1 - 0.65, WALL_Y1 - 0.4, zc - 0.15, zc)        # 每层底部的横带
        # 该高度处尖拱内的可用半宽
        level = zc + hreg * 0.8
        half = max([abs(x_ - cx) for x_, z_ in arch_pts(cx, w_door, PORTAL_SPRING, top, 30) if z_ >= level] or [0.3]) - 0.2
        n = max(1, int(2 * half / 0.65))
        for i in range(n):
            figure(st, cx - half + (i + 0.5) * 2 * half / n, WALL_Y1 - 0.6, zc, hreg * 0.8)
    d.box(cx - w_door - 0.1, cx + w_door + 0.1, WALL_Y1 - 0.5, WALL_Y1, PORTAL_DOOR_H, PORTAL_DOOR_H + 0.6)   # 门楣

portal(PC_X, PC_W, PORTAL_C_CROWN, DOOR_C_W, 4)
for s in (-1, 1):
    portal(s * PS_X, PS_W, PORTAL_S_CROWN, DOOR_S_W, 3)
d.box(-0.35, 0.35, WALL_Y1 - 0.9, WALL_Y1 - 0.15, 0, PORTAL_DOOR_H)         # 中门间柱
figure(st, 0, WALL_Y1 - 1.0, 2.2, 3.0)                                     # 间柱立像

# 国王廊：前凸的连续拱廊带，28 个壁龛各一尊像
KX0, KX1 = -TW1, TW1
d.box(KX0, KX1, -0.4, WALL_Y0, KINGS_Z0 - 0.4, KINGS_Z0)                   # 底部挑檐
d.box(KX0, KX1, -0.4, WALL_Y0, KINGS_Z1, KINGS_Z1 + 0.5)                   # 顶部挑檐
kw = (KX1 - KX0) / KINGS_N
for i in range(KINGS_N + 1):
    x = KX0 + i * kw
    rod(d, (x, 0.0, KINGS_Z0), (x, 0.0, KINGS_Z1 - 1.0), 0.16)
    if i < KINGS_N:
        band(d, arch_pts(x + kw / 2, kw / 2 - 0.15, KINGS_Z1 - 1.0, KINGS_Z1 - 0.2, 8),
             arch_pts(x + kw / 2, kw / 2, KINGS_Z1 - 1.0, KINGS_Z1, 8), -0.2, 0.2, c=(x + kw / 2, KINGS_Z1 - 1.0))
        figure(st, x + kw / 2, 0.6, KINGS_Z0, 3.6)                       # 像高约 3.5–4 m（照片推算）
d.box(KX0, KX1, 0.9, WALL_Y0 + 0.01, KINGS_Z0, KINGS_Z1)                   # 壁龛背墙

# 圣母廊栏杆、塔基栏杆、塔顶栏杆
balustrade(d, -TW1, TW1, -0.1, VIRGIN_BAL_Z)
d.box(-TW1, TW1, -0.4, WALL_Y0, VIRGIN_BAL_Z - 0.3, VIRGIN_BAL_Z)
balustrade(d, -TW1, TW1, WALL_Y0 - 0.2, TOP_BAL_Z0 + 0.2, 1.6, 0.6)
for s in (-1, 1):
    x0, x1 = s * TW0, s * TW1
    for (a, b_, y) in ((x0, x1, WALL_Y0 + 0.2), (x0, x1, TOWER_DEPTH - 0.2)):
        balustrade(d, a, b_, y, TOWER_TOP_BAL, TOWER_TOP - TOWER_TOP_BAL)
    d.box(x0, x1, WALL_Y0 + 0.4, TOWER_DEPTH - 0.4, TOWER_TOP_BAL - 0.3, TOWER_TOP_BAL)   # 塔顶平台

# 玫瑰窗：玻璃 + 花格（三圈环 + 12/24 根辐条）+ 外框
glass_prism(gl.bm, circle(0, ROSE_CZ, ROSE_R, 64), WALL_Y0 + 1.25, WALL_Y0 + 1.3, 'rose')      # 西玫瑰窗
yr = WALL_Y0 + 1.0
for rr in (ROSE_R, ROSE_R * 0.55, ROSE_R * 0.25):
    pts = circle(0, ROSE_CZ, rr, 48)
    for (x0, z0), (x1, z1) in zip(pts, pts[1:] + pts[:1]):
        rod(d, (x0, yr, z0), (x1, yr, z1), 0.12)
for n, r0, r1 in ((12, 0.25, 0.55), (24, 0.55, 1.0)):
    for i in range(n):
        a = 2 * math.pi * (i + 0.5) / n
        rod(d, (r0 * ROSE_R * math.cos(a), yr, ROSE_CZ + r0 * ROSE_R * math.sin(a)),
               (r1 * ROSE_R * math.cos(a), yr, ROSE_CZ + r1 * ROSE_R * math.sin(a)), 0.1)
ring_o = circle(0, ROSE_CZ, ROSE_R + 0.6, 48); ring_i = circle(0, ROSE_CZ, ROSE_R, 48)
band(d, ring_i + ring_i[:1], ring_o + ring_o[:1], WALL_Y0 + 0.2, WALL_Y0 + 1.4, c=(0, ROSE_CZ))

# 两侧双尖窗 + 小圆窗（盲窗/玻璃）
for s in (-1, 1):
    cx = s * PS_X
    for dx in (-1.6, 1.6):
        glass_prism(gl.bm, opening(cx + dx, 1.25, SIDE_WIN_Z0, SIDE_WIN_Z0 + 4.5, SIDE_WIN_Z0 + 6.2), WALL_Y0 + 0.7, WALL_Y0 + 0.8, 'gris')
    glass_prism(gl.bm, circle(cx, SIDE_WIN_Z1 - 1.8, 1.0, 24), WALL_Y0 + 0.7, WALL_Y0 + 0.8, 'gris')
    rod(d, (cx, WALL_Y0 + 0.75, SIDE_WIN_Z0), (cx, WALL_Y0 + 0.75, SIDE_WIN_Z0 + 5.5), 0.25)

# 大连拱廊小柱：每个开口两侧一根，柱头水平横梁
for x0, x1 in GAL_SECTIONS:
    n = 6 if x0 * x1 < 0 else 5
    lo, hi = min(x0, x1), max(x0, x1); w = (hi - lo) / n
    for i in range(n + 1):
        rod(d, (lo + i * w, WALL_Y0 + 1.0, GALLERY_Z0), (lo + i * w, WALL_Y0 + 1.0, GALLERY_Z1 - 1.6), 0.18)
    for i in range(n):                                      # 开口内的细分小柱（双联尖拱）
        cx = lo + (i + 0.5) * w
        rod(d, (cx, WALL_Y0 + 1.0, GALLERY_Z0), (cx, WALL_Y0 + 1.0, GALLERY_Z1 - 2.6), 0.1)

# 钟楼百叶：每个开口内一排斜板条（外缘低、内缘高）。前后两面各一层，开口上半的尖拱部分也填满
for s in (-1, 1):
    xc = s * (TW0 + TW1) / 2
    for dx in (-BELFRY_DX, BELFRY_DX):
        for k in range(15):
            z = BELFRY_Z0 + 0.5 + k * 0.62
            if z > BELFRY_Z1 - 0.9: break
            hw = BELFRY_W if z < BELFRY_Z1 - 2.2 else BELFRY_W * max(0.35, 1 - (z - (BELFRY_Z1 - 2.2)) / 2.4)
            slat_y(d, xc + dx - hw, xc + dx + hw, WALL_Y0 + 0.8, z, -1)
            slat_y(d, xc + dx - hw, xc + dx + hw, TOWER_DEPTH - 0.8, z, +1)

for b_ in (d, st, wd):
    b_.done()
gl_obj = gl.done()
for _n in GLASS_ORDER[1:]:
    gl_obj.data.materials.append(bpy.data.materials[_n])        # 槽位顺序与 walls.py 的 Glass_Panes 一致

# 中门两扇门板：原点在铰链（门洞两侧），向室内（+y）开。门板之间留出间柱位置。
DOOR_COLL = collection('Door')
for side in (-1, 1):
    b = Builder('Door_' + ('L' if side < 0 else 'R'), DOOR_COLL, wood)
    w = DOOR_C_W - 0.35
    b.box(0, -side * w, -0.15, 0, 0, PORTAL_DOOR_H)                              # 门板（局部坐标）
    for z in (1.2, 3.6, 6.0):                                                    # 铁铰链带
        b.box(-side * 0.05, -side * w * 0.8, -0.2, -0.15, z, z + 0.12)
    o = b.done()
    o.location = (side * DOOR_C_W, WALL_Y1, 0)

print('facade ok')
