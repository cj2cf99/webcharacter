# 中殿、唱诗区、耳堂、后殿的墙体与窗（第一轮）。由 massing.py 在 ext.done() 之前 exec。
# 每段墙在局部坐标里建：x 沿墙长 [0, L]，y 为墙厚 [0, t]（+y 指向室内），z 向上；
# 用 EXACT 布尔开洞后，按矩阵变换到世界坐标并并入同材质网格。
# 窗的高度区间：Fletcher 剖面/开间立面目视读取，均为推算（见审核报告），待细节阶段核实。
import bpy, bmesh, math
from mathutils import Vector, Matrix

glass_out = material('GlassOut', (0.06, 0.08, 0.1), 0.15)        # 窗玻璃外侧（从外面看偏暗）
for _n in GLASS_ORDER[1:]:                                       # 内侧：rose 玫瑰窗 / abs 抽象 / med 圆章 / gris 灰色调（shader 在 materials.py）
    material(_n, (0.3, 0.3, 0.6), 0.5)
stone_in = material('StoneWall', (0.62, 0.57, 0.49))
wood = bpy.data.materials.get('Wood') or material('Wood', (0.18, 0.1, 0.05), 0.6)
T_DOORS = Builder('T_Doors', EXT, wood)
WALLS = Builder('Ext_Walls', EXT, stone)
GLASS = Builder('Glass_Panes', EXT, glass_out)
GLASS.bm.free(); GLASS.bm = bmesh.new()

def frame(p0, p1, inward):
    """局部 → 世界矩阵：原点 p0，x 轴指向 p1，y 轴为 inward（水平单位向量）。"""
    p0 = Vector((p0[0], p0[1], 0)); p1 = Vector((p1[0], p1[1], 0))
    ex = (p1 - p0).normalized(); ey = Vector((inward[0], inward[1], 0)).normalized(); ez = Vector((0, 0, 1))
    M = Matrix((ex, ey, ez)).transposed().to_4x4()
    M.translation = p0
    return M, (p1 - p0).length

def merge(target_bm, obj, M):
    me = obj.data.copy(); me.transform(M)
    if M.to_3x3().determinant() < 0:
        me.flip_normals()
    target_bm.from_mesh(me)
    bpy.data.meshes.remove(me)

def segment(p0, p1, inward, t, z0, z1, wins=(), roses=()):
    """一段墙。wins: [(相对位置 0–1, 半宽, 底, 起拱, 拱顶[, 玻璃类型])]；roses: [(相对位置, 中心高, 半径)]。
    玻璃类型：'rose' 'abs' 'med' 'gris'；None = 不装玻璃（开口）；省略时贴地的不装，其余为 'gris'（灰色调）。"""
    M, L = frame(p0, p1, inward)
    o = solid('tmp_wall', EXT, stone, 0, L, 0, t, z0, z1)
    shapes = [(opening(f * L, w, zb, zs, zc), -0.1, t + 0.1) for f, w, zb, zs, zc, *_ in wins]
    shapes += [(circle(f * L, cz, r, 40), -0.1, t + 0.1) for f, cz, r in roses]
    if shapes:
        cut(o, shapes)
    merge(WALLS.bm, o, M)
    bpy.data.objects.remove(o)
    tmp = bmesh.new()
    for f, w, zb, zs, zc, *k in wins:
        kind = k[0] if k else ('gris' if zb > 0.5 else None)
        if kind:
            glass_prism(tmp, opening(f * L, w, zb, zs, zc), t / 2 - 0.02, t / 2 + 0.02, kind)
    for f, cz, r in roses:
        glass_prism(tmp, circle(f * L, cz, r, 40), t / 2 - 0.02, t / 2 + 0.02, 'rose')
    tmp.transform(M)
    me = bpy.data.meshes.new('tmpg'); tmp.to_mesh(me); tmp.free()
    GLASS.bm.from_mesh(me); bpy.data.meshes.remove(me)

# ---------------------------------------------------------------- 中殿与唱诗区（直段）
NAVE_BAYS = [TOWER_DEPTH] + NAVE_PIERS_Y[2:] + [TRANSEPT_Y0]
CHOIR_BAYS = [TRANSEPT_Y1] + CHOIR_PIERS_Y
def bays(ys):
    return list(zip(ys, ys[1:]))

for ys, high_kind in ((NAVE_BAYS, 'abs'), (CHOIR_BAYS, 'med')):
    for ya, yb in bays(ys):
        for s in (-1, 1):
            inward = (-s, 0)
            # 礼拜堂外墙：每开间一扇高窗
            x = s * CHAPEL_OUT_X
            segment((x, ya), (x, yb), inward, WALL_T, 0, CHAPEL_WALL_TOP,
                    wins=[(0.5, (yb - ya) * 0.28, 3.0, 9.0, 12.2)])
            # 楼廊外墙：窗在外侧廊屋顶（16.5 m）之上
            x = s * (AISLE_PIER_X + 0.5)
            segment((x, ya), (x, yb), inward, 1.0, AISLE_VAULT, TRIBUNE_WALL_TOP,
                    wins=[(0.5, (yb - ya) * 0.25, 17.0, 19.3, 20.9)])
            # 主连拱上方高墙：连拱（贴地开到 11 m）、楼廊开口、高侧窗
            x = s * (ARC_X + 0.5)
            segment((x, ya), (x, yb), inward, 1.0, 8.5, HIGH_WALL_TOP,
                    wins=[(0.5, (yb - ya) / 2 - 0.75, 0, 8.0, ARCADE_CROWN),
                          (0.5, (yb - ya) / 2 - 1.0, TRIBUNE_FLOOR + 0.9, 17.5, TRIBUNE_VAULT - 0.4, None),      # 楼廊开口：不装玻璃
                          (0.5, (yb - ya) * 0.22, 21.8, 23.2, 24.2, high_kind)])      # 高侧窗：中殿抽象（1966）、唱诗区叙事版式
            # 外侧廊与礼拜堂之间的拱（礼拜堂入口）：用扶壁隔墙已表达，这里不建墙

# ---------------------------------------------------------------- 耳堂
TY0, TY1 = TRANSEPT_Y0, TRANSEPT_Y1
ROSE_T_R = 13.10 / 2                       # 官方直径
ROSE_T_CZ = 22.5                           # 推算：门洞拱顶约 13 m 之上，墙顶 35 m 之下
for s in (-1, 1):
    x = s * TRANSEPT_OUT_X
    segment((x, TY1 if s < 0 else TY0), (x, TY0 if s < 0 else TY1), (-s, 0), 1.2, 0, HIGH_WALL_TOP,
            wins=[(0.5, 2.3, 0, 7.5, 12.0)], roses=[(0.5, ROSE_T_CZ, ROSE_T_R)])
    T_DOORS.box(x - s * 0.3, x - s * 0.5, (TY0 + TY1) / 2 - 2.3, (TY0 + TY1) / 2 + 2.3, 0, 7.5)   # 耳堂门（关闭，不可开）
    # 门楣：填满门顶 7.5 m 到门洞拱顶 12 m 之间的尖拱部分（石质，与门同一平面）
    pts = opening((TY0 + TY1) / 2, 2.3, 7.5, 7.5, 12.0)
    xa, xb = sorted((x - s * 0.2, x - s * 0.6))
    _n0 = len(WALLS.bm.faces)
    A_ = [WALLS.bm.verts.new((xa, y_, z_)) for y_, z_ in pts]
    B_ = [WALLS.bm.verts.new((xb, y_, z_)) for y_, z_ in pts]
    WALLS.bm.faces.new(A_); WALLS.bm.faces.new(B_[::-1])
    for i_ in range(len(pts)):
        j_ = (i_ + 1) % len(pts)
        WALLS.bm.faces.new((A_[i_], B_[i_], B_[j_], A_[j_]))
    WALLS.bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(WALLS.bm, faces=list(WALLS.bm.faces)[_n0:])
    she.poly([(x, TY0, HIGH_WALL_TOP), (x, TY1, HIGH_WALL_TOP), (x, (TY0 + TY1) / 2, ROOF_RIDGE + 1.0)])   # 山墙三角
    # 耳堂东西墙：外段（礼拜堂线到耳堂端）全高，内段（高墙线到礼拜堂线）在楼廊顶以上
    for (ya, inward) in ((TY0, (0, 1)), (TY1 - 1.2, (0, -1))):
        y = ya if inward[1] > 0 else ya + 1.2
        segment((s * AISLE_WALL_X, y), (s * (TRANSEPT_OUT_X - 1.2), y), inward, 1.2, 0, HIGH_WALL_TOP,
                wins=[(0.5, 1.4, 16.0, 26.0, 30.5)])
        segment((s * (ARC_X + 0.5), y), (s * AISLE_WALL_X, y), inward, 1.2, AISLE_VAULT, HIGH_WALL_TOP,      # 从侧廊拱顶高度起补墙（PLAN I7）
                wins=[(0.5, 2.2, 23.0, 28.5, 31.5)])

# ---------------------------------------------------------------- 后殿：三圈弦段墙
def apse_ring(rx, ry, n, t, z0, z1, wins):
    pts = [(math.cos(math.pi * i / n) * rx, APSE_CY + math.sin(math.pi * i / n) * ry) for i in range(n + 1)]
    for p0, p1 in zip(pts, pts[1:]):
        mid = Vector(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - APSE_CY, 0))
        inward = (-mid.x, -mid.y)                      # 指向圆心
        L = math.dist(p0, p1)
        segment(p0, p1, inward, t, z0, z1, wins=[(f, w * L, zb, zs, zc, *g) for f, w, zb, zs, zc, *g in wins])

apse_ring(APSE_OUT[0], APSE_OUT[1], 10, WALL_T, 0, CHAPEL_WALL_TOP, [(0.5, 0.25, 3.0, 9.0, 12.2)])
apse_ring(APSE_AISLE[0] + 0.5, APSE_AISLE[1] + 0.5, 10, 1.0, AISLE_VAULT, TRIBUNE_WALL_TOP, [(0.5, 0.22, 17.0, 19.3, 20.9)])
apse_ring(APSE_ARC[0] + 0.5, APSE_ARC[1] + 0.5, 5, 1.0, 8.5, HIGH_WALL_TOP,
          [(0.5, 0.36, 0, 8.0, ARCADE_CROWN), (0.5, 0.3, TRIBUNE_FLOOR + 0.9, 17.5, TRIBUNE_VAULT - 0.4, None), (0.5, 0.18, 21.8, 23.2, 24.2, 'med')])

# 后殿侧廊顶棚与楼廊顶（环形水平板）
for z, r0, r1 in ((AISLE_VAULT, ARC_X + 0.5, APSE_OUT[0] - WALL_T), (TRIBUNE_VAULT, ARC_X + 0.5, APSE_AISLE[0] + 0.5)):
    shi.revolve([(r0, z), (r1, z)], APSE_CY, sy=1.03)

WALLS.done()
T_DOORS.done()
g_obj = GLASS.done()
for _n in GLASS_ORDER[1:]:
    g_obj.data.materials.append(bpy.data.materials[_n])        # 槽位顺序必须与 GLASS_ORDER 一致
g_obj.name = 'Glass_Panes'
print('walls ok', len(g_obj.data.polygons))
