# 公共几何工具（由 massing.py exec，依赖其中的 Builder / pointed / material）。
import bpy, bmesh, math
from mathutils import Vector, Matrix

# ---------------------------------------------------------------- 几何工具
def arch_pts(cx, w, z0, crown, n=14):
    return [(cx + x, z) for x, z in pointed(w, z0, crown, n)]

def prism(bm, pts, y0, y1):
    """xz 平面闭合多边形沿 y 拉伸成封闭实体。法线统一重算为朝外（Cycles 烘焙只照亮法线一侧，朝内的面会烘成黑色）。"""
    n0 = len(bm.faces)
    a = [bm.verts.new((x, y0, z)) for x, z in pts]
    b = [bm.verts.new((x, y1, z)) for x, z in pts]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.ensure_lookup_table()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)[n0:])

def opening(cx, w, z_bottom, z_spring, crown):
    return [(cx - w, z_bottom)] + arch_pts(cx, w, z_spring, crown) + [(cx + w, z_bottom)]

def circle(cx, cz, r, n=48):
    return [(cx + r * math.cos(2 * math.pi * i / n), cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]

def cut(obj, shapes):
    """shapes: [(pts, y0, y1) | ('box', x0,x1,y0,y1,z0,z1) | ('x', pts_yz, x0, x1)]。
    逐个做 EXACT 布尔差集（相互重叠的切割体合成一个网格会让布尔失败）。"""
    for s in shapes:
        bm = bmesh.new()
        if s[0] == 'box':
            _, x0, x1, y0, y1, z0, z1 = s
            x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
            r = bmesh.ops.create_cube(bm, size=1)
            for v in r['verts']:
                v.co = Vector((x0 if v.co.x < 0 else x1, y0 if v.co.y < 0 else y1, z0 if v.co.z < 0 else z1))
        elif s[0] == 'x':
            _, pts, x0, x1 = s
            x0, x1 = sorted((x0, x1))
            a_ = [bm.verts.new((x0, y, z)) for y, z in pts]
            b_ = [bm.verts.new((x1, y, z)) for y, z in pts]
            bm.faces.new(a_); bm.faces.new(b_[::-1])
            for i in range(len(pts)):
                j = (i + 1) % len(pts)
                bm.faces.new((a_[i], b_[i], b_[j], a_[j]))
        else:
            prism(bm, *s)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new('cutter'); bm.to_mesh(me); bm.free()
        cutter = bpy.data.objects.new('cutter', me)
        bpy.context.scene.collection.objects.link(cutter)
        m = obj.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.solver = 'EXACT'; m.object = cutter
        dg = bpy.context.evaluated_depsgraph_get()
        new = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
        obj.modifiers.clear()
        old = obj.data; obj.data = new; bpy.data.meshes.remove(old)
        bpy.data.objects.remove(cutter); bpy.data.meshes.remove(me)

def solid(name, coll, mat, x0, x1, y0, y1, z0, z1):
    b = Builder(name, coll, mat); b.box(x0, x1, y0, y1, z0, z1); return b.done()

def figure(b, x, y, z, h, yaw=0.0):
    """简化石雕人像：下摆（外张）+ 躯干 + 肩 + 双臂 + 头 + 冠/光环。面向 -y，绕 z 转 yaw。（2026-11-16 加细：原来只有一个锥体加一个球）"""
    R = Matrix.Rotation(yaw, 4, 'Z')
    O = Vector((x, y, z))
    r = h * 0.13
    def place(res, sx=1.0, sy=1.0, dz=0.0, dy=0.0, dx=0.0):
        for v in res['verts']:
            v.co = O + R @ Vector((v.co.x * sx + dx, v.co.y * sy + dy, v.co.z + dz))
    place(bmesh.ops.create_cone(b.bm, cap_ends=True, segments=8, radius1=r * 1.15, radius2=r * 0.85, depth=h * 0.42), 1.0, 0.8, h * 0.21)      # 下摆
    place(bmesh.ops.create_cone(b.bm, cap_ends=True, segments=8, radius1=r * 0.85, radius2=r * 0.6, depth=h * 0.40), 1.0, 0.75, h * 0.62)     # 躯干
    place(bmesh.ops.create_uvsphere(b.bm, u_segments=8, v_segments=5, radius=r * 0.7), 1.35, 0.7, h * 0.80)                                  # 肩
    for sg in (-1, 1):                                                                                                                       # 双臂
        p0 = O + R @ Vector((sg * r * 0.95, 0, h * 0.78)); p1 = O + R @ Vector((sg * r * 1.0, -r * 0.55, h * 0.50))
        rod(b, p0, p1, r * 0.16, 5)
    place(bmesh.ops.create_uvsphere(b.bm, u_segments=8, v_segments=6, radius=h * 0.085), 1.0, 1.0, h * 0.90, -h * 0.02)                      # 头
    if h > 2.0:                                                                                                                              # 大像加冠
        place(bmesh.ops.create_cone(b.bm, cap_ends=True, segments=8, radius1=h * 0.09, radius2=h * 0.065, depth=h * 0.05), 1.0, 1.0, h * 0.985, -h * 0.02)

def band(b, inner, outer, y0, y1, c=None):
    """两条等长折线（xz）之间的条带，沿 y 拉伸（拱券环）。
    c = (cx, cz)：拱的圆心，用来把每个面的法线朝向摆对（前面朝 -y，后面朝 +y，外弧面朝外，内弧面朝圆心）。
    不摆对会有一半面朝向实体内部，烘焙后是黑色（PLAN 第 7 步：门洞拱券发黑）。"""
    n = len(inner)
    I0 = [b.bm.verts.new((x, y0, z)) for x, z in inner]; I1 = [b.bm.verts.new((x, y1, z)) for x, z in inner]
    O0 = [b.bm.verts.new((x, y0, z)) for x, z in outer]; O1 = [b.bm.verts.new((x, y1, z)) for x, z in outer]
    def put(verts, want):
        f = b.bm.faces.new(verts)
        f.normal_update()
        ctr = f.calc_center_median()
        e = Vector(want(ctr)) if callable(want) else Vector(want)
        if c is not None and f.normal.dot(e) < 0:
            f.normal_flip()
    for i in range(n - 1):
        radial = lambda ctr: (ctr.x - c[0], 0.0, ctr.z - c[1]) if c else (0, 0, 0)
        put((O0[i], O0[i + 1], I0[i + 1], I0[i]), (0, -1, 0))                       # 前
        put((I1[i], I1[i + 1], O1[i + 1], O1[i]), (0, 1, 0))                        # 后
        put((O0[i + 1], O0[i], O1[i], O1[i + 1]), radial)                           # 外弧面（朝外）
        put((I0[i], I0[i + 1], I1[i + 1], I1[i]), lambda ctr: tuple(-v for v in radial(ctr)))   # 内弧面（朝圆心）

def rod(b, p0, p1, r, seg=6):
    """两点间的细杆（花格、栏杆柱、小柱）。"""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    res = bmesh.ops.create_cone(b.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length)
    q = d.to_track_quat('Z', 'Y')
    for v in res['verts']:
        v.co = (p0 + p1) / 2 + q @ v.co

def balustrade(b, x0, x1, y, z, h=1.1, step=0.45):
    b.box(x0, x1, y - 0.25, y + 0.25, z, z + 0.18)
    b.box(x0, x1, y - 0.3, y + 0.3, z + h - 0.15, z + h)
    n = max(1, int(abs(x1 - x0) / step))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        rod(b, (x, y, z + 0.18), (x, y, z + h - 0.15), 0.07)



# ---------------------------------------------------------------- 玻璃片
# 材质槽顺序固定：0 外侧（深色）、1.. 内侧按类型。walls.py / facade.py 的玻璃物体都按这个顺序挂材质。
GLASS_ORDER = ['GlassOut', 'St_rose', 'St_abs', 'St_med', 'St_gris', 'St_rose_s', 'St_rose_n']   # rose 西窗、rose_s 南耳堂、rose_n 北耳堂

def glass_prism(bm, pts, y0, y1, kind):
    """窗玻璃薄片：xz 轮廓沿 y 拉伸。朝 +y（室内）的大面用 St_<kind>，其余面用 GlassOut。
    “local” UV：按轮廓包围盒归一化到 0–1，给彩色玻璃图案用（与烘焙用的 UV 无关）。"""
    idx_in = GLASS_ORDER.index('St_' + kind)
    n0 = len(bm.faces)
    prism(bm, pts, y0, y1)
    uvl = bm.loops.layers.uv.get('local') or bm.loops.layers.uv.new('local')
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    bm.faces.ensure_lookup_table()
    ymid = (y0 + y1) / 2
    for f in list(bm.faces)[n0:]:
        f.normal_update()
        if abs(f.normal.y) > 0.5:
            # 按位置分内外：y 大的一面靠近室内（局部 +y 即朝向室内）。不能用法线：拉伸时的顶点顺序决定法线朝向，会分反。
            f.material_index = idx_in if f.calc_center_median().y > ymid else 0
            for lp in f.loops:
                lp[uvl].uv = ((lp.vert.co.x - x0) / (x1 - x0), (lp.vert.co.z - z0) / (z1 - z0))
        else:
            f.material_index = 0
