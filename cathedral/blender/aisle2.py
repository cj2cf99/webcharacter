# 侧廊（礼拜堂）外墙、楼廊墙、高侧窗外框与后殿的第二轮细节（2026-11-16，对照后殿和侧面实景照片）：
# 墙基与腰线、窗侧柱与滴水拱、每扇礼拜堂窗上的山花、扶壁墩上的小山顶；后殿三圈弦段墙同样处理，圈间转角加小尖塔。
# 由 exterior2.py 在 d2.done() 之前 exec，共享 facade2.py 的 _arch_rods / 本文件的 PC。
# 说明：山花高度、腰线高度为目视照片推算，未找到测绘来源（待核实）。
import math
from mathutils import Vector

def PC(face, u, z, p):
    """弦段平面：face=(cx, cy, tx, ty, nx, ny)；u 沿弦，p 沿外法线。"""
    cx, cy, tx, ty, nx, ny = face
    p = min(p, 0.05)
    return Vector((cx + tx * u + nx * p, cy + ty * u + ny * p, z))

def chord(rx, ry, n, i):
    p0 = Vector((math.cos(math.pi * i / n) * rx, APSE_CY + math.sin(math.pi * i / n) * ry, 0))
    p1 = Vector((math.cos(math.pi * (i + 1) / n) * rx, APSE_CY + math.sin(math.pi * (i + 1) / n) * ry, 0))
    mid = (p0 + p1) / 2; L = (p1 - p0).length
    t = (p1 - p0) / L
    nrm = Vector((t.y, -t.x, 0))
    if nrm.dot(mid - Vector((0, APSE_CY, 0))) < 0: nrm = -nrm
    return (mid.x, mid.y, t.x, t.y, nrm.x, nrm.y), L

def bay_dress(Pf, face, L, zb, zs, zc, w, gable=None):
    """一个开间的窗饰：窗侧柱、双层滴水拱、窗下腰线、（可选）窗上山花。Pf 是平面映射函数。"""
    for sgn in (-1, 1):
        for off in (w + 0.3, w + 0.65):
            rod(d2, Pf(face, sgn * off, zb, 0.18), Pf(face, sgn * off, zs, 0.18), 0.12)
    _arch_rods(Pf, face, 0.0, w + 0.65, zs, zc + 0.6, 0.13, 0.18, 10)
    _arch_rods(Pf, face, 0.0, w + 0.3, zs, zc + 0.2, 0.09, 0.18, 10)
    rod(d2, Pf(face, -(w + 0.65), zb - 0.1, 0.2), Pf(face, w + 0.65, zb - 0.1, 0.2), 0.14)          # 窗台线
    if gable:
        gz0, gz1 = gable                                     # 山花底与顶
        hw = L / 2 - 0.55
        for sg in (-1, 1):
            rod(d2, Pf(face, sg * hw, gz0, 0.3), Pf(face, 0, gz1, 0.3), 0.2)
            for k in range(1, 6):
                f = k / 6
                p = Pf(face, sg * hw * (1 - f), gz0 + (gz1 - gz0) * f, 0.3)
                d2.box(p.x - 0.13, p.x + 0.13, p.y - 0.13, p.y + 0.13, p.z, p.z + 0.38)
        p = Pf(face, 0, gz1, 0.3)
        pinnacle(d2, p.x, p.y, gz1 - 0.1, 0.55, 0.7, 1.1)
        rr = min(hw * 0.28, (gz1 - gz0) * 0.3)
        pts = [Pf(face, rr * math.cos(2 * math.pi * k / 12), gz0 + (gz1 - gz0) * 0.38 + rr * math.sin(2 * math.pi * k / 12), 0.3) for k in range(13)]
        for a_, b_ in zip(pts, pts[1:]):
            rod(d2, a_, b_, 0.07)

def straight_face(s, x):
    return ('x', s * x, s)

def bay_Pf(yc):
    return lambda face, u, z, p: P(face, yc + u, z, p)

# ---------------------------------------------------------------- 直段（中殿、唱诗区）
for ys in (NAVE_BAYS, CHOIR_BAYS):
    for ya, yb in bays(ys):
        yc = (ya + yb) / 2; Lb = yb - ya; Pf = bay_Pf(yc)
        for s in (-1, 1):
            # 礼拜堂外墙（x=±23.5，墙顶 14）：窗 3.0–12.2；山花 12.6–16.8
            f1 = straight_face(s, CHAPEL_OUT_X)
            bay_dress(Pf, f1, Lb, 3.0, 9.0, 12.2, Lb * 0.28, gable=(12.6, 16.8))
            a_, b_ = sorted((s * CHAPEL_OUT_X, s * (CHAPEL_OUT_X + 0.25)))
            d2.box(a_, b_, ya + 0.7, yb - 0.7, 0.0, 1.1)                 # 墙基
            d2.box(a_, b_, ya + 0.7, yb - 0.7, 2.2, 2.45)                # 下腰线
            # 楼廊墙（x=±13.3，z 17–21.5，在礼拜堂屋面上方可见）
            f2 = straight_face(s, AISLE_PIER_X + 0.5)
            bay_dress(Pf, f2, Lb, 17.0, 19.3, 20.9, Lb * 0.25)
            # 高墙（x=±7.4，z 24.6–32.6）窗饰
            f3 = straight_face(s, ARC_X + 0.5)
            bay_dress(Pf, f3, Lb, 24.6, 29.8, 32.6, Lb * 0.26)

# 扶壁墩（礼拜堂线上，z 14 以上）顶部再加一个小山顶
for y in BUTTRESS_Y:
    for s in (-1, 1):
        pinnacle(d2, s * (CHAPEL_OUT_X - 0.3), y, 14.0, 1.1, 1.0, 1.8)

# ---------------------------------------------------------------- 后殿：三圈弦段墙
for (rx, ry, n, zb, zs, zc, ww, gable) in (
        (APSE_OUT[0], APSE_OUT[1], 10, 3.0, 9.0, 12.2, 0.25, (12.6, 16.8)),
        (APSE_AISLE[0] + 0.5, APSE_AISLE[1] + 0.5, 10, 17.0, 19.3, 20.9, 0.22, None),
        (APSE_ARC[0] + 0.5, APSE_ARC[1] + 0.5, 5, 24.6, 29.8, 32.6, 0.28, None)):
    for i in range(n):
        face, L = chord(rx, ry, n, i)
        bay_dress(PC, face, L, zb, zs, zc, L * ww, gable)
        if gable:                                                      # 外圈墙基
            for z in (0.5, 2.3):
                rod(d2, PC(face, -L / 2 + 0.7, z, 0.15), PC(face, L / 2 - 0.7, z, 0.15), 0.15)
    for i in range(1, n):                                              # 圈间转角（含扶壁位置）：小尖塔
        a = math.pi * i / n
        if rx > 20: continue                      # 礼拜堂圈的转角由径向墩与墩顶尖塔负责（见 exterior2.py），这里不再重复
        rin = rx - 0.5                            # 立在墙厚中线上（墙向内厚 1.0 m），原来在墙外缘、半个底座悬空
        x = math.cos(a) * rin; y = APSE_CY + math.sin(a) * ry * (rin / rx)
        pinnacle(d2, x, y, (21.5 if rx > 10 else 35.0) - 0.3, 0.9, 1.5, 2.0)
