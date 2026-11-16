# 门楣浮雕与塔身的第二轮细节（2026-11-16，用户：“门楣浮雕与塔身”）：
# 三座门的门楣分层人像浮雕（中门：复活—称灵魂—基督受审判；两侧门：圣母加冕、圣母与圣子）、
# 立面侧窗的滴水拱、下塔身侧面的高尖窗与花格、塔身转角的细柱束。
# 由 exterior2.py 在 aisle2.py 之后 exec，共享 figure / pinnacle / bay_dress / bay_Pf / _arch_rods。
# 说明：人像只是简化体块，不是逐像还原；层数、人数、位置为目视照片推算（待核实）。
import math
from mathutils import Vector

TY = WALL_Y1 - 0.45          # 门楣浮雕所在平面（门楣实心拱板前面，朝 -y）

def tymp_halfwidth(cx_w, z, z0=PORTAL_SPRING, top=13.5):
    """门楣拱内某高度的可用半宽（尖拱近似）。"""
    if z <= z0: return cx_w
    t = min(1.0, (z - z0) / max(0.1, top - z0))
    return cx_w * math.sqrt(max(0.0, 1.0 - t ** 1.7))

def fig_row(cx, z, h, n, span, yaw=0.0, seats=False, ys=TY):
    for i in range(n):
        x = cx - span + (2 * span) * (i + 0.5) / n
        if seats:
            d2.box(x - h * 0.2, x + h * 0.2, ys - 0.25, ys, z, z + h * 0.35)
            figure(d2, x, ys - 0.02, z + h * 0.3, h * 0.8, yaw)
        else:
            figure(d2, x, ys - 0.02, z, h, yaw)

def tympanum(cx, w_door, top, kind):
    base = PORTAL_DOOR_H + 0.35
    # —— 下层：一排小像（复活的死者 / 侍从）
    hw = tymp_halfwidth(w_door, base + 0.5, top=top) - 0.3
    n1 = 9 if kind == 'last' else 5
    for i in range(n1):
        x = cx - hw + 2 * hw * (i + 0.5) / n1
        d2.box(x - 0.28, x + 0.28, TY - 0.28, TY, base, base + 0.22)          # 石棺
        figure(d2, x, TY - 0.05, base + 0.2, 0.85)
    z2 = base + 1.25
    if kind == 'last':
        # —— 中层：称灵魂。中央大天使、左右各三人，天平
        h2 = 1.25
        figure(d2, cx, TY - 0.02, z2, 1.7)                                    # 天使长
        rod(d2, (cx - 0.7, TY - 0.15, z2 + 1.45), (cx + 0.7, TY - 0.15, z2 + 1.45), 0.05)
        for sg in (-1, 1):
            rod(d2, (cx + sg * 0.7, TY - 0.15, z2 + 1.45), (cx + sg * 0.7, TY - 0.15, z2 + 1.15), 0.03)
            d2.box(cx + sg * 0.7 - 0.22, cx + sg * 0.7 + 0.22, TY - 0.3, TY - 0.05, z2 + 1.05, z2 + 1.12)
        for sg in (-1, 1):
            for k in range(3):
                figure(d2, cx + sg * (1.0 + 0.55 * k), TY - 0.02, z2, h2 - 0.1 * k, 0.0)
        # —— 上层：端坐的基督、两侧跪拜的天使、光环
        z3 = z2 + 2.0
        d2.box(cx - 0.55, cx + 0.55, TY - 0.45, TY, z3, z3 + 0.55)             # 宝座
        figure(d2, cx, TY - 0.05, z3 + 0.5, 1.9)
        c = bmesh.ops.create_cone(d2.bm, cap_ends=True, segments=12, radius1=0.5, radius2=0.5, depth=0.06)
        for v in c['verts']:
            v.co = Vector((cx + v.co.x, TY - 0.12 + v.co.z, z3 + 2.0 + v.co.y))
        for sg in (-1, 1):
            for k in range(2):
                figure(d2, cx + sg * (1.35 + 0.65 * k), TY - 0.02, z3 + 0.15, 0.9, 0.0)
    else:
        # —— 两侧门：中央端坐圣母（或加冕群像），左右各两位侍立者
        z3 = z2 + 0.2
        d2.box(cx - 0.45, cx + 0.45, TY - 0.4, TY, z3, z3 + 0.5)
        figure(d2, cx, TY - 0.05, z3 + 0.45, 1.5)
        figure(d2, cx + 0.05, TY - 0.18, z3 + 0.55, 0.5)                          # 圣子
        for sg in (-1, 1):
            for k in range(2):
                figure(d2, cx + sg * (0.95 + 0.5 * k), TY - 0.02, z3, 1.1 - 0.12 * k)

# 门楣（中门高拱顶 ≈13.6；侧门 ≈11.6，见 facade.py portal()）
tympanum(0.0, DOOR_C_W, 13.57, 'last')
tympanum(-PS_X, DOOR_S_W, 11.56, 'side')
tympanum(PS_X, DOOR_S_W, 11.56, 'side')

# 门楣各层之间的横带加一圈细线脚（浮雕分区）
for cx, w, top in ((0.0, DOOR_C_W, 13.57), (-PS_X, DOOR_S_W, 11.56), (PS_X, DOOR_S_W, 11.56)):
    for z in (PORTAL_DOOR_H + 1.55, PORTAL_DOOR_H + 3.1):
        if z < top - 0.6:
            hw_ = tymp_halfwidth(w, z, top=top)
            d2.box(cx - hw_, cx + hw_, TY - 0.12, TY, z, z + 0.1)

# ---------------------------------------------------------------- 立面两侧窗（照片：双尖窗上的大尖拱）的滴水拱
for s in (-1, 1):
    face = ('y', WALL_Y0, -1)
    u = s * PS_X
    _arch_rods(P, face, u, 3.95, SIDE_WIN_Z1 - 3.0, SIDE_WIN_Z1 + 1.1, 0.16, 0.25, 12)
    _arch_rods(P, face, u, 3.6, SIDE_WIN_Z1 - 3.0, SIDE_WIN_Z1 + 0.7, 0.1, 0.25, 12)
    for sg in (-1, 1):
        rod(d2, P(face, u + sg * 3.95, SIDE_WIN_Z0, 0.25), P(face, u + sg * 3.95, SIDE_WIN_Z1 - 3.0, 0.25), 0.16)

# ---------------------------------------------------------------- 下塔身侧面的高尖窗（z 25–40）：每扇窗有窗侧柱、滴水拱、竖棂和小圆花格
for s in (-1, 1):
    for fx, sg in ((s * TW1, s), (s * TW0, -s)):
        face = ('x', fx, sg)
        for yy in (WALL_Y0 + 4.0, (WALL_Y0 + TOWER_DEPTH) / 2, TOWER_DEPTH - 4.0):
            Pf = bay_Pf(yy)
            bay_dress(Pf, face, 3.6, 26.0, 33.0, 36.5, 0.85)
            rod(d2, Pf(face, 0, 26.0, 0.2), Pf(face, 0, 34.2, 0.2), 0.1)
            for dz_ in (0.0,):
                pts = [Pf(face, 0.45 * math.cos(2 * math.pi * k / 12), 35.0 + 0.45 * math.sin(2 * math.pi * k / 12), 0.2) for k in range(13)]
                for a_, b_ in zip(pts, pts[1:]):
                    rod(d2, a_, b_, 0.06)

# ---------------------------------------------------------------- 塔身转角：细柱束（每角 3 根，47–67 m）
for s in (-1, 1):
    for xx in (s * (TW0 + 0.9), s * (TW1 - 0.9)):
        for yy in (WALL_Y0 + 0.9, TOWER_DEPTH - 0.9):
            for dx, dy in ((-0.75, 0), (0.75, 0), (0, -0.75), (0, 0.75)):
                rod(d2, (xx + dx, yy + dy, TOP_BAL_Z1 + 0.3), (xx + dx, yy + dy, TOWER_TOP_BAL - 0.2), 0.1)
