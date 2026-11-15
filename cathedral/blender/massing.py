# 第 1 阶段：平面与体块。在 Blender 中 exec 本文件（会清空当前场景并重建）。
# 只用 dims.py 中有出处的尺寸；标“推算”的高度在 dims.py 中有说明。
import bpy, bmesh, math, os
from mathutils import Vector

HERE = r"G:/selftool/Cathedral/blender"
exec(open(os.path.join(HERE, 'dims.py'), encoding='utf-8').read())

# ---------------------------------------------------------------- 基础工具
def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras, bpy.data.lights):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)

def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c

def material(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    m.use_backface_culling = False
    return m

class Builder:
    """把一组几何体累积成一个网格物体（同材质合并，减少物体数）。"""
    def __init__(self, name, coll, mat):
        self.name, self.coll, self.mat = name, coll, mat
        self.bm = bmesh.new()

    def poly(self, pts):
        vs = [self.bm.verts.new(p) for p in pts]
        self.bm.faces.new(vs)

    def box(self, x0, x1, y0, y1, z0, z1):
        if x0 > x1: x0, x1 = x1, x0
        if y0 > y1: y0, y1 = y1, y0
        r = bmesh.ops.create_cube(self.bm, size=1)
        for v in r['verts']:
            v.co = Vector((x0 if v.co.x < 0 else x1, y0 if v.co.y < 0 else y1, z0 if v.co.z < 0 else z1))

    def cyl(self, x, y, r, z0, z1, seg=16):
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0)
        for v in res['verts']:
            v.co += Vector((x, y, (z0 + z1) / 2))

    def extrude(self, profile, y0, y1):
        """profile: [(x, z), ...] 开放折线，沿 y 拉伸成面带。"""
        a = [self.bm.verts.new((x, y0, z)) for x, z in profile]
        b = [self.bm.verts.new((x, y1, z)) for x, z in profile]
        for i in range(len(profile) - 1):
            self.bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))

    def extrude_x(self, profile, x0, x1):
        """profile: [(y, z), ...] 沿 x 拉伸（用于耳堂）。"""
        a = [self.bm.verts.new((x0, y, z)) for y, z in profile]
        b = [self.bm.verts.new((x1, y, z)) for y, z in profile]
        for i in range(len(profile) - 1):
            self.bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))

    def ring(self, rx, ry, cy, z0, z1, t, seg=24):
        """半椭圆墙（后殿），从南侧 (+rx, cy) 经东端到北侧 (-rx, cy)，墙厚 t 向外。"""
        for i in range(seg):
            a0, a1 = math.pi * i / seg, math.pi * (i + 1) / seg
            p = lambda a, k: (math.cos(a) * (rx + k), cy + math.sin(a) * (ry + k))
            (x0, y0), (x1, y1) = p(a0, 0), p(a1, 0)
            (X0, Y0), (X1, Y1) = p(a0, t), p(a1, t)
            for zz in ((z0, z1),):
                self.poly([(x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1)])
                self.poly([(X0, Y0, z0), (X0, Y0, z1), (X1, Y1, z1), (X1, Y1, z0)])
                self.poly([(x0, y0, z1), (x1, y1, z1), (X1, Y1, z1), (X0, Y0, z1)])

    def revolve(self, profile, cy, seg=24, sx=1.0, sy=1.0):
        """profile: [(r, z)]，绕 (0, cy) 半周旋转；r 按椭圆缩放 sx/sy（后殿屋顶、穹顶）。"""
        rings = []
        for i in range(seg + 1):
            a = math.pi * i / seg
            rings.append([self.bm.verts.new((math.cos(a) * r * sx, cy + math.sin(a) * r * sy, z)) for r, z in profile])
        for i in range(seg):
            for j in range(len(profile) - 1):
                self.bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][j + 1], rings[i][j + 1]))

    def done(self):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-4)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me); self.bm.free()
        me.materials.append(self.mat)
        o = bpy.data.objects.new(self.name, me)
        self.coll.objects.link(o)
        return o

def pointed(w, z0, z1, n=12):
    """尖拱剖面：跨度 2w，起拱 z0，拱顶 z1。两段圆弧（圆心在对侧 0.2w 处）。"""
    c = 0.2 * w                          # 圆心偏移，越大越尖
    R = w + c
    pts = []
    for side in (-1, 1):
        cx = -side * c
        half = []
        for i in range(n + 1):
            x = side * w - side * (w * i / n)
            dz = math.sqrt(max(0.0, R * R - (x - cx) ** 2))
            half.append((x, dz))
        top = half[-1][1]
        half = [(x, z0 + dz / top * (z1 - z0)) for x, dz in half]
        pts.append(half)
    left, right = pts[0], pts[1][::-1]
    return left + right[1:]

exec(open(os.path.join(HERE, 'geo.py'), encoding='utf-8').read())

# ---------------------------------------------------------------- 场景
reset()
EXT = collection('Exterior')
INT = collection('Interior')
REF = collection('Reference')
stone = material('Stone', (0.62, 0.57, 0.49))
roof = material('Roof', (0.28, 0.31, 0.35))
ground = material('Ground', (0.42, 0.40, 0.37))
pier_m = material('Pier', (0.66, 0.61, 0.52))

def both(f):
    """左右对称各调用一次：f(s)，s=-1 北、+1 南。"""
    for s in (-1, 1):
        f(s)

NAVE_Y0, NAVE_Y1 = TOWER_DEPTH, TRANSEPT_Y0      # 中殿外墙段（塔楼之后到耳堂）
CHOIR_Y0, CHOIR_Y1 = TRANSEPT_Y1, APSE_CY        # 唱诗区直段
CROSS_YC = (CROSS_W_Y + CROSS_E_Y) / 2
WALL_T = 1.0

ext = Builder('Ext_Stone', EXT, stone)
rf = Builder('Ext_Roof', EXT, roof)
inn = Builder('Int_Stone', INT, pier_m)
she = Builder('Ext_Sheets', EXT, stone)      # 单面薄片（导出前加厚）
shi = Builder('Int_Sheets', INT, pier_m)

# ---- 西立面与双塔：见 facade.py（本文件末尾 exec）

# ---- 中殿、唱诗区、耳堂、后殿的墙体与窗：见 walls.py

# 礼拜堂隔墙与飞扶壁（扶壁墩 + 飞券）。飞券高度按 Fletcher 剖面推算
BUTTRESS_Y = NAVE_PIERS_Y[2:] + CHOIR_PIERS_Y[:-1]
for y in BUTTRESS_Y:
    def b(s):
        ext.box(s * AISLE_WALL_X, s * CHAPEL_OUT_X, y - 0.6, y + 0.6, 0, CHAPEL_WALL_TOP)
        ext.box(s * (CHAPEL_OUT_X - 3.2), s * CHAPEL_OUT_X, y - 0.6, y + 0.6, CHAPEL_WALL_TOP, 29.0)   # 扶壁墩
        for (xa, za, xb, zb) in ((CHAPEL_OUT_X - 3.2, 27.0, AISLE_PIER_X + 0.5, 23.5),
                                 (AISLE_PIER_X - 0.5, 27.5, ARC_X + 0.5, 27.5)):
            # 飞券：两段斜板，厚 0.8
            she.poly([(s * xa, y - 0.4, za), (s * xb, y - 0.4, zb), (s * xb, y - 0.4, zb + 1.2), (s * xa, y - 0.4, za + 1.2)])
            she.poly([(s * xa, y + 0.4, za), (s * xa, y + 0.4, za + 1.2), (s * xb, y + 0.4, zb + 1.2), (s * xb, y + 0.4, zb)])
            she.poly([(s * xa, y - 0.4, za + 1.2), (s * xb, y - 0.4, zb + 1.2), (s * xb, y + 0.4, zb + 1.2), (s * xa, y + 0.4, za + 1.2)])
    both(b)

# ---- 屋顶
gable = [(-(ARC_X + 1.0), HIGH_WALL_TOP), (0, ROOF_RIDGE), (ARC_X + 1.0, HIGH_WALL_TOP)]
rf.extrude(gable, NAVE_Y0 - 0.5, TRANSEPT_Y0)
rf.extrude(gable, TRANSEPT_Y1, APSE_CY)
ym = (TRANSEPT_Y0 + TRANSEPT_Y1) / 2
rf.extrude_x([(TRANSEPT_Y0, HIGH_WALL_TOP), (ym, ROOF_RIDGE), (TRANSEPT_Y1, HIGH_WALL_TOP)], -TRANSEPT_OUT_X, TRANSEPT_OUT_X)
rf.revolve([(ARC_X + 1.0, HIGH_WALL_TOP), (0.01, ROOF_RIDGE)], APSE_CY, sx=1.0, sy=(APSE_ARC[1] + 1.0) / (ARC_X + 1.0))
for (y0, y1) in ((NAVE_Y0, NAVE_Y1), (CHOIR_Y0, CHOIR_Y1)):
    def lean(s):
        rf.extrude([(s * (AISLE_PIER_X + 0.6), TRIBUNE_WALL_TOP), (s * (ARC_X + 0.5), 24.5)], y0, y1)      # 楼廊屋顶
        rf.extrude([(s * CHAPEL_OUT_X, CHAPEL_WALL_TOP), (s * (AISLE_PIER_X + 0.5), 16.5)], y0, y1)       # 外侧廊和礼拜堂屋顶
    both(lean)
rf.revolve([(APSE_AISLE[0] + 0.6, TRIBUNE_WALL_TOP), (APSE_ARC[0] + 0.5, 24.5)], APSE_CY, sy=APSE_AISLE[1] / APSE_AISLE[0])
rf.revolve([(APSE_OUT[0], CHAPEL_WALL_TOP), (APSE_AISLE[0] + 0.5, 16.5)], APSE_CY, sy=APSE_OUT[1] / APSE_OUT[0])

# ---- 尖塔：八角塔身 + 八角尖锥（尺寸见 dims.py）
sp = bmesh.ops.create_cone(rf.bm, cap_ends=True, segments=8, radius1=SPIRE_BASE_R, radius2=SPIRE_BASE_R * 0.92,
                           depth=SPIRE_DRUM_TOP - ROOF_RIDGE + 3)
for v in sp['verts']:
    v.co += Vector((0, CROSS_YC, (SPIRE_DRUM_TOP + ROOF_RIDGE - 3) / 2))
sp = bmesh.ops.create_cone(rf.bm, cap_ends=True, segments=8, radius1=SPIRE_NEEDLE_R, radius2=0.04,
                           depth=SPIRE_TOP - SPIRE_DRUM_TOP)
for v in sp['verts']:
    v.co += Vector((0, CROSS_YC, (SPIRE_TOP + SPIRE_DRUM_TOP) / 2))

# ---------------------------------------------------------------- 室内
# 柱：主连拱圆柱、侧廊圆柱（交替形式在细节阶段做）、交叉口与塔楼束柱用方墩代替
for y in NAVE_PIERS_Y[2:] + CHOIR_PIERS_Y:
    def piers(s):
        inn.cyl(s * ARC_X, y, 0.7, 0, 8.5)
        inn.cyl(s * AISLE_PIER_X, y, 0.5, 0, 8.0)
    both(piers)
for y in (CROSS_W_Y, CROSS_E_Y, NAVE_PIERS_Y[1]):
    both(lambda s: inn.box(s * (ARC_X - 1.2), s * (ARC_X + 1.2), y - 1.2, y + 1.2, 0, 24.3))
def apse_cols(rx, ry, n, r, z1):
    for i in range(1, n):
        a = math.pi * i / n
        inn.cyl(math.cos(a) * rx, APSE_CY + math.sin(a) * ry, r, 0, z1)
apse_cols(*APSE_ARC, 5, 0.7, 8.5)      # 图：主连拱圈 5 段
apse_cols(*APSE_AISLE, 10, 0.5, 8.0)   # 图：内回廊柱圈 10 段

# 拱顶：中殿和唱诗区用尖拱筒面近似（六分肋拱在细节阶段做）
vault = pointed(ARC_X - 0.5, VAULT_SPRING, VAULT_CROWN)
shi.extrude(vault, F_BUTT_PROJ + 2.0, APSE_CY)          # 只从起拱点开始，墙面以下由高墙负责
TR_IN_Y0, TR_IN_Y1 = TRANSEPT_Y0 + 1.2, TRANSEPT_Y1 - 1.2      # 耳堂东西墙内皮
TR_HALF = (TR_IN_Y1 - TR_IN_Y0) / 2
tr_vault = pointed(TR_HALF, VAULT_SPRING, VAULT_CROWN)
shi.extrude_x([(CROSS_YC + x, z) for x, z in tr_vault], -(TRANSEPT_OUT_X - 1.2), TRANSEPT_OUT_X - 1.2)
shi.revolve([(ARC_X - 0.5, VAULT_SPRING)] + [(abs(x), z) for x, z in vault if x >= 0][::-1],
            APSE_CY, sy=APSE_ARC[1] / ARC_X)
# 肋：每根柱位一道横向肋；每个双开间两道斜肋（六分肋拱）。肋贴在拱面下 0.15 m。
def vault_z(x):
    pts = vault
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        if min(x0, x1) <= x <= max(x0, x1) and x1 != x0:
            return z0 + (z1 - z0) * (x - x0) / (x1 - x0) - 0.15
    return VAULT_SPRING
W_ = ARC_X - 0.5
rib_y = [F_BUTT_PROJ + 2.0] + NAVE_PIERS_Y + [CROSS_W_Y, CROSS_E_Y] + CHOIR_PIERS_Y
for y in rib_y:
    prof = [(x, z - 0.15) for x, z in vault]
    for (x0, z0), (x1, z1) in zip(prof, prof[1:]):
        rod(inn, (x0, y, z0), (x1, y, z1), 0.25)
for seq in (NAVE_PIERS_Y[1::2], CHOIR_PIERS_Y[::2]):
    for ya, yb in zip(seq, seq[1:]):
        for sgn in (-1, 1):
            pts = [(sgn * (-W_ + 2 * W_ * i / 24), ya + (yb - ya) * i / 24) for i in range(25)]
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                rod(inn, (x0, y0, vault_z(x0)), (x1, y1, vault_z(x1)), 0.2)

# 柱头：圆柱顶的倒台
for y in NAVE_PIERS_Y[2:] + CHOIR_PIERS_Y:
    for s_ in (-1, 1):
        for x_, r_, z_ in ((ARC_X, 0.7, 8.5), (AISLE_PIER_X, 0.5, 8.0)):
            c = bmesh.ops.create_cone(inn.bm, cap_ends=True, segments=16, radius1=r_, radius2=r_ + 0.45, depth=0.8)
            for v in c['verts']:
                v.co += Vector((s_ * x_, y, z_ - 0.4))

# 侧廊顶、楼廊地面与顶
for (y0, y1) in ((NAVE_Y0 - 6.0, TRANSEPT_Y0), (TRANSEPT_Y1, APSE_CY)):
    def ceilings(s):
        inn.box(s * (ARC_X + 0.5), s * (AISLE_PIER_X - 0.5), y0, y1, AISLE_VAULT, TRIBUNE_FLOOR)      # 内侧廊顶 = 楼廊地面
        inn.box(s * (ARC_X + 0.5), s * (AISLE_PIER_X + 0.5), y0, y1, TRIBUNE_VAULT, TRIBUNE_VAULT + 0.4)
        inn.box(s * (AISLE_PIER_X + 0.5), s * (CHAPEL_OUT_X - WALL_T), y0, y1, AISLE_VAULT - 0.3, AISLE_VAULT)
    both(ceilings)

# ---------------------------------------------------------------- 地面与广场
g = Builder('Ground', EXT, ground)
g.box(-70, 70, -70, 150, -0.3, 0)

# 室内地板：盖在地面上方 4 mm，归入室内组（用室内光照烘焙）；地面（外部实时光照）在它下面
floor_m = material('Floor', (0.50, 0.48, 0.45))
flr = Builder('Int_Floor', INT, floor_m)
FLOOR_Z, FW = 0.004, CHAPEL_OUT_X - WALL_T
Y_IN = F_BUTT_PROJ + 2.0                                   # 立面墙内侧 y=3.6
def _quad(x0, x1, y0, y1):
    flr.poly([(x0, y0, FLOOR_Z), (x1, y0, FLOOR_Z), (x1, y1, FLOOR_Z), (x0, y1, FLOOR_Z)])
_quad(-FW, FW, Y_IN, APSE_CY)                              # 中殿、侧廊、礼拜堂、唱诗区直段
for sgn in (-1, 1):                                        # 耳堂两端（超出礼拜堂线的部分，不与上面重叠）
    _quad(*sorted((sgn * FW, sgn * (TRANSEPT_OUT_X - 1.2))), TRANSEPT_Y0 + 1.2, TRANSEPT_Y1 - 1.2)
_n = 48
for i in range(_n):                                        # 后殿半椭圆
    a0, a1 = math.pi * i / _n, math.pi * (i + 1) / _n
    flr.poly([(0, APSE_CY, FLOOR_Z), (math.cos(a0) * FW, APSE_CY + math.sin(a0) * (APSE_OUT[1] - WALL_T), FLOOR_Z),
              (math.cos(a1) * FW, APSE_CY + math.sin(a1) * (APSE_OUT[1] - WALL_T), FLOOR_Z)])

exec(open(os.path.join(HERE, 'walls.py'), encoding='utf-8').read())
def thicken(o, t=0.15):
    """单面（拉伸/旋转/三角山墙）加厚成双面实体，使两面都能正确烘焙与显示。"""
    m = o.modifiers.new('厚度', 'SOLIDIFY'); m.thickness = t; m.offset = 0.0; m.use_even_offset = True
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); o.modifiers.clear()
    old = o.data; o.data = new; bpy.data.meshes.remove(old)

objs = [ext.done(), rf.done(), inn.done(), g.done(), flr.done()]
she_obj, shi_obj = she.done(), shi.done()
for o_ in (objs[1], she_obj, shi_obj):        # 只加厚单面薄片：屋顶、外部薄片、室内拱面
    thicken(o_)
exec(open(os.path.join(HERE, 'facade.py'), encoding='utf-8').read())

# ---------------------------------------------------------------- 平面图叠图（核对用）
img = bpy.data.images.load("G:/selftool/Cathedral/reference/Plan_de_la_cath\u00e9drale_Notre-Dame-de-Paris._D.14500-14.jpg", check_existing=True)
pm = bpy.data.materials.new('PlanOverlay'); pm.use_nodes = True
nt = pm.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
W, H = img.size[0] * S, img.size[1] * S
bpy.ops.mesh.primitive_plane_add(size=1, location=((img.size[0] / 2 - 1898.5) * S, (6310 - img.size[1] / 2) * S, 0.02))
pl = bpy.context.active_object; pl.name = 'PlanOverlay'; pl.scale = (W, H, 1)
pl.data.materials.append(pm)
for c in pl.users_collection: c.objects.unlink(pl)
REF.objects.link(pl)

print('massing ok', [o.name for o in objs], 'faces', sum(len(o.data.polygons) for o in objs))
