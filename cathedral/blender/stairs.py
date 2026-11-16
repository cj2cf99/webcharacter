# 楼梯（用户 2026-11-16：“需要设置登上钟楼和二楼的楼梯，没有你就要加”）
# 1) 塔内螺旋楼梯（南、北塔各一座）：圆柱井（facade.py 切出）内的螺旋踏步 + 中柱，从地面到钟楼地板（47.6 m）。
#    每圈 22 级，级高 0.18 m。真实北塔有 387 级、通到塔顶平台；这里只做到钟楼，塔顶平台走观景点 1/2。
# 2) 内侧廊直跑楼梯（南、北各一座）：沿 y 从 17 m 升到 34.6 m，上到楼廊地面 11.3 m（massing.py 在楼板上留了洞口）。
# 数字（级高、每圈级数、井位置）是按使用尺度的推算，不是测绘数据（待核实）。
import math
from mathutils import Vector

def wedge(b, cx, cy, r0, r1, a0, a1, zb, zt):
    n0 = len(b.bm.faces)
    P = lambda r, a, z: b.bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z))
    v = {}
    for ri, r in (('i', r0), ('o', r1)):
        for ai, a in (('0', a0), ('1', a1)):
            for zi, z in (('b', zb), ('t', zt)):
                v[ri + ai + zi] = P(r, a, z)
    for q in (('i0b', 'i1b', 'o1b', 'o0b'), ('i0t', 'o0t', 'o1t', 'i1t'), ('i0b', 'i0t', 'i1t', 'i1b'),
              ('o0b', 'o1b', 'o1t', 'o0t'), ('i0b', 'o0b', 'o0t', 'i0t'), ('i1b', 'i1t', 'o1t', 'o1b')):
        b.bm.faces.new([v[k] for k in q])
    b.bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(b.bm, faces=list(b.bm.faces)[n0:])

spiral = Builder('W_Stairs', EXT, stone)
N_PER, RISE = 22, 0.18
for s in (-1, 1):
    cx, cy = s * STAIR_X, STAIR_Y
    n = int(math.ceil((TOP_BAL_Z1 + 0.6) / RISE))
    for i in range(n):
        a0 = 2 * math.pi * i / N_PER * s; a1 = a0 + 2 * math.pi / N_PER * s * 1.08
        zt = (i + 1) * RISE
        wedge(spiral, cx, cy, 0.42, STAIR_R - 0.12, a0, a1, zt - 0.40, zt)
    c = bmesh.ops.create_cone(spiral.bm, cap_ends=True, segments=12, radius1=0.45, radius2=0.45, depth=TOP_BAL_Z1 + 0.6)
    for vv in c['verts']:
        vv.co += Vector((cx, cy, (TOP_BAL_Z1 + 0.6) / 2))
spiral_obj = spiral.done()

tstairs = Builder('Int_Stairs', INT, pier_m)
for s in (-1, 1):
    xm = s * 9.9
    for i in range(63):
        y0_ = 17.0 + i * 0.28
        tstairs.box(xm - 0.9, xm + 0.9, y0_, y0_ + 0.28, 0.0, (i + 1) * 0.18)
    for sg in (-1, 1):                                                  # 两侧矮墙（扶手）
        tstairs.box(xm + sg * 0.95 - 0.07, xm + sg * 0.95 + 0.07, 17.0, 34.8, 0.0, 0.0 + 0.9)
        for i in range(0, 63, 3):
            y0_ = 17.0 + i * 0.28
            tstairs.box(xm + sg * 0.95 - 0.04, xm + sg * 0.95 + 0.04, y0_, y0_ + 0.08, (i + 1) * 0.18, (i + 1) * 0.18 + 0.9)
tstairs_obj = tstairs.done()
