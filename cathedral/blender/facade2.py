# 塔身与立面的第二轮细节（2026-11-16，对照用户给的正面实景照片）：
# 门洞山花（三座）、钟楼尖窗的柱束与滴水拱、钟楼下的盲拱带、钟楼上方的小盲拱带、环塔腰线、塔身转角扶壁。
# 由 exterior2.py 在 d2.done() 之前 exec，共享 d2、rod、pointed、dims 常量。
# 尺寸依据：dims.py 的立面实测（照片）；山花高度、盲拱数量为目视照片推算，未找到测绘来源（待核实）。
import math
from mathutils import Vector

def _arch_rods(P, face, u, w, z0, crown, r, proud, n=10):
    """在 face 平面上画一道尖拱（拱脚 z0，拱顶 crown，半宽 w）的细杆轮廓。"""
    pts = pointed(w, z0, crown, n)
    for (x0, a0), (x1, a1) in zip(pts, pts[1:]):
        rod(d2, P(face, u + x0, a0, proud), P(face, u + x1, a1, proud), r)

def P(face, u, z, p):
    kind, c, sg = face
    return Vector((u, c + sg * p, z)) if kind == 'y' else Vector((c + sg * p, u, z))

def _band(face, u0, u1, z0, z1, p, depth=0.0):
    """沿 face 的水平腰线（盒子，凸出 p）。"""
    a, b = sorted((face[1], face[1] + face[2] * p))
    if face[0] == 'y':
        d2.box(u0, u1, a, b, z0, z1)
    else:
        d2.box(a, b, u0, u1, z0, z1)

# ---------------------------------------------------------------- 门洞山花（中门与两侧门）
for cx, w, crown, rise in ((0.0, PC_W, PORTAL_C_CROWN, 6.5), (-PS_X, PS_W, PORTAL_S_CROWN, 5.0), (PS_X, PS_W, PORTAL_S_CROWN, 5.0)):
    zb = PORTAL_SPRING + 2.2
    hw = w + 0.7
    apex = crown + rise
    y = -0.15
    for sx in (-1, 1):                                    # 两道斜边
        rod(d2, (cx + sx * hw, y, zb), (cx, y, apex), 0.24)
    rod(d2, (cx - hw, y, zb), (cx + hw, y, zb), 0.2)      # 底边
    n = 8
    for k in range(1, n):                                 # 斜边上的卷叶饰
        f = k / n
        for sx in (-1, 1):
            xx = cx + sx * hw * (1 - f); zz = zb + (apex - zb) * f
            d2.box(xx - 0.18, xx + 0.18, y - 0.18, y + 0.18, zz, zz + 0.5)
    pinnacle(d2, cx, y, apex - 0.1, 0.8, 1.2, 1.8)        # 顶端小尖塔
    rr = hw * 0.32                                        # 山花内的三叶/圆窗花格
    zc = zb + (apex - zb) * 0.42
    pts = [(cx + rr * math.cos(2 * math.pi * k / 16), zc + rr * math.sin(2 * math.pi * k / 16)) for k in range(17)]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        rod(d2, (x0, y, z0), (x1, y, z1), 0.1)
    for k in range(3):
        a = math.pi / 2 + 2 * math.pi * k / 3
        rod(d2, (cx, y, zc), (cx + rr * math.cos(a), y, zc + rr * math.sin(a)), 0.09)

# ---------------------------------------------------------------- 塔楼各面
for s in (-1, 1):
    xo, xi = s * (TW1 - 0.4), s * (TW0 + 0.4)
    yf, yb = WALL_Y0 + 0.4, TOWER_DEPTH - 0.4
    faces = [
        (('y', yf, -1), (min(xi, xo), max(xi, xo))),
        (('y', yb, +1), (min(xi, xo), max(xi, xo))),
        (('x', xo, s), (yf, yb)),
        (('x', xi, -s), (yf, yb)),
    ]
    for face, (ua, ub) in faces:
        um = (ua + ub) / 2; L = ub - ua
        # 钟楼尖窗：每面两扇（中心距 ±BELFRY_DX）。窗两侧柱束 + 滴水拱
        zs_ = BELFRY_Z1 - 2.2
        for du in (-BELFRY_DX, BELFRY_DX):
            u = um + du
            for off in (BELFRY_W + 0.35, BELFRY_W + 0.8):
                for sg in (-1, 1):
                    rod(d2, P(face, u + sg * off, BELFRY_Z0 - 0.3, 0.2), P(face, u + sg * off, zs_, 0.2), 0.13)
            _arch_rods(P, face, u, BELFRY_W + 0.8, zs_, BELFRY_Z1 + 0.5, 0.14, 0.2, 10)
            _arch_rods(P, face, u, BELFRY_W + 0.35, zs_, BELFRY_Z1 + 0.1, 0.1, 0.2, 10)
        rod(d2, P(face, um, 47.8, 0.25), P(face, um, zs_ + 0.5, 0.25), 0.22)         # 两窗之间的中柱
        # 钟楼下的盲拱带（47.6–51）：5 个尖拱
        nA = 5; wa = L / nA
        for k in range(nA):
            u = ua + wa * (k + 0.5); hw = wa / 2 - 0.3
            for sg in (-1, 1):
                rod(d2, P(face, u + sg * hw, 47.7, 0.15), P(face, u + sg * hw, 49.6, 0.15), 0.1)
            _arch_rods(P, face, u, hw, 49.6, 51.0, 0.09, 0.15, 8)
        # 钟楼上方的小盲拱带（63.6–66.6）：10 个小拱 + 三叶圆
        nB = 10; wb = L / nB
        for k in range(nB):
            u = ua + wb * (k + 0.5); hw = wb / 2 - 0.2
            for sg in (-1, 1):
                rod(d2, P(face, u + sg * hw, 63.8, 0.15), P(face, u + sg * hw, 65.0, 0.15), 0.07)
            _arch_rods(P, face, u, hw, 65.0, 66.4, 0.07, 0.15, 6)
        # 腰线
        for z in (47.0, 51.4, 63.3, 66.9):
            _band(face, ua - 0.4, ub + 0.4, z, z + 0.25, 0.3)
    # 下塔身侧面和背面的腰线（国王廊以上，到钟楼之前）：礼拜堂屋面之上可见部分
    for z in (24.3, 36.6, 45.4):
        d2.box(s * TW1, s * (TW1 + 0.3), WALL_Y0, TOWER_DEPTH, z, z + 0.3)
        d2.box(s * TW0, s * TW1, TOWER_DEPTH, TOWER_DEPTH + 0.3, z, z + 0.3)
    # 下塔身侧面的竖向扶壁条（3 条，宽 1.2 凸 0.5）
    for yy in (WALL_Y0 + 2.5, (WALL_Y0 + TOWER_DEPTH) / 2, TOWER_DEPTH - 2.5):
        d2.box(s * TW1, s * (TW1 + 0.5), yy - 0.6, yy + 0.6, 14.0, 46.0)
        pinnacle(d2, s * (TW1 + 0.25), yy, 46.0, 0.9, 1.5, 2.2)
