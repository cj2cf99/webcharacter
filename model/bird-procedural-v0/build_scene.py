# 极乐鸟场景粗模：在 Blender 中 exec 本文件即可重建整个场景（会清空当前场景）。
# 坐标：Z 向上，树干顶面 z=0；鸟局部前方为 -Y。set_stage(0..3) 设置雄鸟变身阶段。
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler

R = math.radians
C = bpy.context.scene.collection

def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)

def link(name, me, parent=None):
    o = bpy.data.objects.new(name, me)
    C.objects.link(o)
    if parent:
        o.parent = parent
    return o

def bsdf(m):
    return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')

def setin(node, name, val):
    if name in node.inputs:
        node.inputs[name].default_value = val

def mat(name, color, rough=0.5, spec=0.5, metal=0.0, emit=None, emit_s=0.0, sheen=0.0, sheen_tint=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = bsdf(m)
    setin(b, 'Base Color', (*color, 1))
    setin(b, 'Roughness', rough)
    setin(b, 'IOR Level', spec)
    setin(b, 'Metallic', metal)
    if emit:
        setin(b, 'Emission Color', (*emit, 1))
        setin(b, 'Emission Strength', emit_s)
    if sheen:
        setin(b, 'Sheen Weight', sheen)
        setin(b, 'Sheen Roughness', 0.45)
        if sheen_tint:
            setin(b, 'Sheen Tint', (*sheen_tint, 1))
    return m

def smooth(me):
    for p in me.polygons:
        p.use_smooth = True

def ellipsoid(name, radii, M, material, parent, segs=32, rings=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.transform(M)
    smooth(me)
    me.materials.append(material)
    return link(name, me, parent)

def grid(name, nu, nv, fn, material, parent):
    """fn(u in [-1,1], v in [0,1]) -> Vector；返回网格物体。"""
    me = bpy.data.meshes.new(name)
    verts = [fn(-1 + 2 * i / (nu - 1), j / (nv - 1)) for j in range(nv) for i in range(nu)]
    faces = [(j * nu + i, j * nu + i + 1, (j + 1) * nu + i + 1, (j + 1) * nu + i)
             for j in range(nv - 1) for i in range(nu - 1)]
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UV')      # u 横向 0→1，v 根部→外缘
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            uvl.data[li].uv = ((vi % nu) / (nu - 1), (vi // nu) / (nv - 1))
    smooth(me)
    me.materials.append(material)
    return link(name, me, parent)

def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
    return n

def fuzz(obj, strength=0.006, size=0.012):
    """羽毛蓬松感：高频位移让轮廓起毛。"""
    tex = bpy.data.textures.get('FeatherFuzz') or bpy.data.textures.new('FeatherFuzz', 'CLOUDS')
    tex.noise_scale = size
    sub = obj.modifiers.new('细分', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
    d = obj.modifiers.new('起毛', 'DISPLACE'); d.texture = tex; d.strength = strength; d.mid_level = 0.5

def about(pivot, rot_x):
    p = Vector(pivot)
    return Matrix.Translation(p) @ Matrix.Rotation(R(rot_x), 4, 'X') @ Matrix.Translation(-p)

def T(loc, rot=(0, 0, 0)):
    return Matrix.Translation(Vector(loc)) @ Euler([R(a) for a in rot]).to_matrix().to_4x4()

# ---------------------------------------------------------------- 材质
def make_materials():
    M = {}
    M['black'] = mat('UltraBlack', (0.0002, 0.0002, 0.0003), rough=1.0, spec=0.0,
                     sheen=0.03, sheen_tint=(0.2, 0.4, 0.38))
    # 披肩：放射状羽轴（只在掠射光下隐约可见）+ 外缘羽毛毛边（透明抖动）
    m = mat('CapeFeather', (0.0002, 0.0002, 0.0003), rough=1.0, spec=0.0, sheen=0.03, sheen_tint=(0.2, 0.4, 0.38))
    nt = m.node_tree; b = bsdf(m)
    uv = node(nt, 'ShaderNodeUVMap'); uv.uv_map = 'UV'
    sep = node(nt, 'ShaderNodeSeparateXYZ'); nt.links.new(uv.outputs['UV'], sep.inputs['Vector'])
    sh = node(nt, 'ShaderNodeMath'); sh.operation = 'MULTIPLY'; sh.inputs[1].default_value = 34.0
    nt.links.new(sep.outputs['X'], sh.inputs[0])
    sw = node(nt, 'ShaderNodeMath'); sw.operation = 'PINGPONG'; sw.inputs[1].default_value = 0.5
    nt.links.new(sh.outputs[0], sw.inputs[0])
    bump = node(nt, 'ShaderNodeBump', Strength=0.35, Distance=0.002)
    nt.links.new(sw.outputs[0], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    ns = node(nt, 'ShaderNodeTexNoise', Scale=60.0, Detail=4.0)
    nt.links.new(uv.outputs['UV'], ns.inputs['Vector'])
    edge = node(nt, 'ShaderNodeMath'); edge.operation = 'MULTIPLY_ADD'
    edge.inputs[1].default_value = 0.04; nt.links.new(ns.outputs['Fac'], edge.inputs[0]); nt.links.new(sep.outputs['Y'], edge.inputs[2])
    al = node(nt, 'ShaderNodeMapRange'); al.inputs['From Min'].default_value = 1.025; al.inputs['From Max'].default_value = 1.0
    nt.links.new(edge.outputs[0], al.inputs['Value']); nt.links.new(al.outputs['Result'], b.inputs['Alpha'])
    try:
        m.surface_render_method = 'DITHERED'
    except Exception:
        m.blend_method = 'HASHED'
    M['cape'] = m
    M['beak'] = mat('Beak', (0.006, 0.006, 0.007), rough=0.3, spec=0.6)
    M['leg'] = mat('Leg', (0.03, 0.035, 0.045), rough=0.45, spec=0.5)
    M['eye'] = mat('EyeSpot', (0.7, 0.95, 1.0), rough=0.3, emit=(0.55, 0.92, 1.0), emit_s=2.5)
    M['iris'] = mat('Iris', (0.05, 0.02, 0.01), rough=0.05, spec=1.0)
    # 胸盾：面朝度 → 色带模拟结构色；Voronoi 做鳞片状羽片
    m = mat('Breastplate', (0.05, 0.6, 0.65), rough=0.22, metal=0.55, spec=0.8)
    nt = m.node_tree; b = bsdf(m)
    tc = node(nt, 'ShaderNodeTexCoord')
    vo = node(nt, 'ShaderNodeTexVoronoi', Scale=70.0)
    nt.links.new(tc.outputs['Generated'], vo.inputs['Vector'])
    vb = node(nt, 'ShaderNodeBump', Strength=0.25, Distance=0.002)
    nt.links.new(vo.outputs['Distance'], vb.inputs['Height']); nt.links.new(vb.outputs['Normal'], b.inputs['Normal'])
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.45
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position = 0.0; els[0].color = (0.3, 0.72, 0.88, 1)
    els[1].position = 1.0; els[1].color = (0.0, 0.12, 0.3, 1)
    e = els.new(0.45); e.color = (0.06, 0.45, 0.68, 1)
    nt.links.new(lw.outputs['Facing'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Emission Color'])
    setin(b, 'Emission Strength', 0.3)
    M['plate'] = m
    M['crown'] = mat('Crown', (0.0, 0.18, 0.3), rough=0.25, metal=0.7, spec=0.8, emit=(0.0, 0.3, 0.45), emit_s=0.15)
    M['gape'] = mat('Gape', (0.85, 0.8, 0.08), rough=0.4, emit=(0.9, 0.85, 0.1), emit_s=0.6)
    M['female'] = mat('FemaleBrown', (0.16, 0.085, 0.04), rough=0.8, spec=0.3, sheen=0.3, sheen_tint=(0.9, 0.7, 0.5))
    M['female_head'] = mat('FemaleHead', (0.045, 0.03, 0.022), rough=0.8, spec=0.3, sheen=0.2)
    # 雌鸟腹部：浅褐底 + 深色横斑
    m = mat('FemaleBelly', (0.45, 0.33, 0.2), rough=0.85, spec=0.3, sheen=0.2)
    nt = m.node_tree; b = bsdf(m)
    tc = node(nt, 'ShaderNodeTexCoord')
    wv = node(nt, 'ShaderNodeTexWave', Scale=28.0, Distortion=3.0, Detail=2.0)
    wv.bands_direction = 'Z'
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    mx = node(nt, 'ShaderNodeMix'); mx.data_type = 'RGBA'
    mx.inputs['A'].default_value = (0.5, 0.38, 0.24, 1); mx.inputs['B'].default_value = (0.12, 0.07, 0.035, 1)
    st = node(nt, 'ShaderNodeMapRange'); st.inputs['From Min'].default_value = 0.55; st.inputs['From Max'].default_value = 0.75
    nt.links.new(wv.outputs['Fac'], st.inputs['Value']); nt.links.new(st.outputs['Result'], mx.inputs['Factor'])
    nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
    M['female_belly'] = m
    M['mush'] = mat('MushroomCap', (0.75, 0.38, 0.12), rough=0.5, spec=0.4, sheen=0.3)
    M['stem'] = mat('MushroomStem', (0.85, 0.75, 0.55), rough=0.6, spec=0.3)
    M['moss'] = mat('MossClump', (0.05, 0.12, 0.015), rough=0.95, spec=0.1, sheen=0.8, sheen_tint=(0.6, 0.9, 0.3))
    M['female_beak'] = mat('FemaleBeak', (0.05, 0.05, 0.05), rough=0.4)
    # 树干：噪波凹凸 + 朝上的面长苔藓
    m = mat('BarkMoss', (0.1, 0.06, 0.035), rough=0.9, spec=0.3)
    nt = m.node_tree; b = bsdf(m)
    # 树皮：沿树干拉长的 Voronoi 裂纹 + 细噪波
    tc = node(nt, 'ShaderNodeTexCoord')
    mp = node(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.3, 2.2, 2.2)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    cr = node(nt, 'ShaderNodeTexVoronoi', Scale=7.0, Randomness=1.0); cr.feature = 'DISTANCE_TO_EDGE'
    nt.links.new(mp.outputs['Vector'], cr.inputs['Vector'])
    noise = node(nt, 'ShaderNodeTexNoise', Scale=40.0, Detail=8.0)
    hsum = node(nt, 'ShaderNodeMath'); hsum.operation = 'MULTIPLY_ADD'; hsum.inputs[1].default_value = 0.25
    crk = node(nt, 'ShaderNodeMapRange'); crk.inputs['From Max'].default_value = 0.025
    nt.links.new(cr.outputs['Distance'], crk.inputs['Value'])
    nt.links.new(noise.outputs['Fac'], hsum.inputs[0]); nt.links.new(crk.outputs['Result'], hsum.inputs[2])
    bump = node(nt, 'ShaderNodeBump', Strength=1.0, Distance=0.02)
    nt.links.new(hsum.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Normal'], sep.inputs['Vector'])
    moss_n = nt.nodes.new('ShaderNodeTexNoise'); moss_n.inputs['Scale'].default_value = 3.0
    add = nt.nodes.new('ShaderNodeMath'); add.operation = 'ADD'
    nt.links.new(sep.outputs['Z'], add.inputs[0])
    nt.links.new(moss_n.outputs['Fac'], add.inputs[1])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 1.2; mr.inputs['From Max'].default_value = 1.38
    nt.links.new(add.outputs['Value'], mr.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    bark_c = node(nt, 'ShaderNodeMix'); bark_c.data_type = 'RGBA'     # 裂纹处更深
    bark_c.inputs['A'].default_value = (0.03, 0.018, 0.01, 1)
    bark_c.inputs['B'].default_value = (0.26, 0.21, 0.16, 1)
    nt.links.new(hsum.outputs[0], bark_c.inputs['Factor'])
    nt.links.new(bark_c.outputs['Result'], mix.inputs['A'])
    mix.inputs['B'].default_value = (0.3, 0.42, 0.06, 1)
    nt.links.new(mr.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    M['bark'] = m
    return M

# ---------------------------------------------------------------- 雄鸟
# 三阶段链式形态键：S1 胸盾横展+披肩两侧下垂 → S2 两扇竖起、仰头张嘴 → S3 合拢成椭圆。
# K1 相对 Basis、K2 相对 K1、K3 相对 K2；stage 0→3 时依次把三个键推到 1。
HIP = (0, 0.0, 0.19)
STAGES = ('S1', 'S2', 'S3')
PARTS = []          # 带形态键的物体

def stage_keys(obj, fns):
    """fns: 三个函数 fn(i, basis_co) -> 该阶段坐标。"""
    obj.shape_key_add(name='Basis')
    prev = obj.data.shape_keys.key_blocks['Basis']
    for name, fn in zip(STAGES, fns):
        k = obj.shape_key_add(name=name, from_mix=False)
        k.relative_key = prev
        for i, v in enumerate(obj.data.vertices):
            k.data[i].co = fn(i, v.co.copy())
        prev = k
    PARTS.append(obj)

def rigid(*Ms):
    return [lambda i, co, m=m: m @ co for m in Ms]

def set_stage(stage, frame=None):
    """stage 0..3；给出 frame 时同时打关键帧。"""
    w = [min(1, max(0, stage - n)) for n in range(3)]
    for o in PARTS:
        kb = o.data.shape_keys.key_blocks
        for name, val in zip(STAGES, w):
            kb[name].value = val
            if frame is not None:
                kb[name].keyframe_insert('value', frame=frame)

def build_male(M):
    root = bpy.data.objects.new('Male', None)
    C.objects.link(root)

    body = ellipsoid('M_Body', (0.095, 0.16, 0.105), T((0, 0.01, 0.28), (-20, 0, 0)), M['black'], root)
    stage_keys(body, rigid(about(HIP, -25), about(HIP, -45), T((0, 0.06, 0)) @ about(HIP, -48)))
    fuzz(body)
    tail = ellipsoid('M_Tail', (0.045, 0.16, 0.016), T((0, 0.2, 0.2), (22, 0, 0)), M['black'], root, 16, 8)
    stage_keys(tail, rigid(about(HIP, -25), about(HIP, -40), about(HIP, -40)))

    # 头部及附件统一跟随头部矩阵
    hn = Vector((0, -0.135, 0.395))
    H = [T(p) @ Matrix.Rotation(R(r), 4, 'X') @ T(-hn) for p, r in
         (((0, -0.12, 0.47), -20), ((0, -0.07, 0.50), -60), ((0, -0.01, 0.45), 18))]
    hide = [h @ T(hn) @ Matrix.Scale(0.05, 4) @ T(-hn) for h in H]     # 缩进披肩内，只留两个眼点
    Hs = [H[0], H[1], hide[2]]
    head = ellipsoid('M_Head', (0.068, 0.085, 0.07), T(hn), M['black'], root, 24, 12)
    stage_keys(head, rigid(*Hs))
    fuzz(head, 0.004, 0.008)
    neck = ellipsoid('M_Neck', (0.06, 0.07, 0.07), T((0, -0.1, 0.35), (30, 0, 0)), M['black'], root, 20, 10)
    stage_keys(neck, rigid(about(HIP, -25), about(HIP, -45), T((0, 0.08, 0)) @ about(HIP, -48)))
    for sx in (-1, 1):          # 眼睛（深褐、高光）
        ey = ellipsoid('M_Eye', (0.011, 0.011, 0.011), T((sx * 0.056, -0.165, 0.405)), M['iris'], root, 12, 8)
        stage_keys(ey, rigid(*Hs))
        mc = ellipsoid('M_MouthCorner', (0.006, 0.022, 0.005), T((sx * 0.02, -0.2, 0.378), (8, 0, 0)), M['gape'], root, 10, 6)
        stage_keys(mc, rigid(*Hs))
    crown = ellipsoid('M_Crown', (0.052, 0.06, 0.022), T((0, -0.14, 0.455), (-12, 0, 0)), M['crown'], root, 20, 10)
    stage_keys(crown, rigid(*Hs))
    for sx in (-1, 1):
        e = ellipsoid('M_EyeSpot', (0.009, 0.006, 0.007), T((sx * 0.036, -0.19, 0.415)), M['eye'], root, 12, 6)
        stage_keys(e, rigid(*H))
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.019, radius2=0.0015, depth=0.11, matrix=Matrix.Translation((0, 0, 0.055)))
    for v in bm.verts:           # 横向压扁、尖端下弯
        v.co.x *= 0.8
        v.co.y -= 0.12 * (v.co.z / 0.11) ** 2 * 0.11 * 0.6
    me = bpy.data.meshes.new('M_Beak'); bm.to_mesh(me); bm.free()
    me.transform(T((0, -0.19, 0.385), (95, 0, 0)))
    smooth(me); me.materials.append(M['beak'])
    stage_keys(link('M_Beak', me, root), rigid(*Hs))
    # 张嘴露出的黄色口角：基础形态缩在头内，S2/S3 展开
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=3, radius1=0.03, radius2=0.002, depth=0.07)
    me = bpy.data.meshes.new('M_Gape'); bm.to_mesh(me); bm.free()
    gape_M = T((0, -0.215, 0.37), (90, 0, 0)) @ Matrix.Diagonal((1, 0.35, 1, 1))
    me.transform(gape_M)
    me.materials.append(M['gape'])
    gape = link('M_Gape', me, root)
    hidden = lambda i, co: Vector((0, -0.12, 0.39)) + (co - Vector((0, -0.215, 0.37))) * 0.05
    stage_keys(gape, [lambda i, co: H[0] @ hidden(i, co), lambda i, co: H[1] @ co, lambda i, co: H[2] @ hidden(i, co)])
    # 基础形态也隐藏
    for v, k in zip(gape.data.vertices, gape.data.shape_keys.key_blocks['Basis'].data):
        k.co = hidden(0, v.co.copy())

    for sx in (-1, 1):   # 腿和三趾
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.01, radius2=0.007, depth=0.2)
        me = bpy.data.meshes.new('M_Leg'); bm.to_mesh(me); bm.free()
        me.transform(T((sx * 0.035, 0.0, 0.1), (8, 0, 0)))
        me.materials.append(M['leg'])
        link('M_Leg', me, root)
        for a in (-25, 0, 25):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.005, radius2=0.002, depth=0.06)
            me = bpy.data.meshes.new('M_Toe'); bm.to_mesh(me); bm.free()
            me.transform(T((sx * 0.035, 0.0, 0.004), (90, 0, a)) @ T((0, 0, 0.03)))
            me.materials.append(M['leg'])
            link('M_Toe', me, root)

    # 披肩：左右两片扇形。u 0→1 由内侧到外侧，v 0→1 由根部到外缘
    def fringe(u, v):            # 大起伏 + 外缘一根根羽尖
        return 1 + 0.006 * math.sin(u * 23) * v ** 3
    def lobe(s):
        def fold(u, v):        # 收在背上
            return Vector((s * (0.01 + 0.045 * u * (0.6 + v)), -0.06 + 0.2 * v, 0.405 - 0.065 * v - 0.035 * u * u))
        def droop(u, v):       # S1：从肩部向两侧下垂到地面
            a = R(108 + 42 * u); r = (0.1 + 0.9 * v) * 0.36 * fringe(u, v)
            return Vector((s * (0.07 + math.sin(a) * r), 0.06 + 0.05 * v, 0.36 + math.cos(a) * r))
        def raise_(u, v):      # S2：两扇竖起
            a = R(-8 + 120 * u); r = (0.1 + 0.9 * v) * 0.4 * fringe(u, v)
            return Vector((s * (0.09 + math.sin(a) * r), 0.04 - 0.1 * r * r, 0.42 + math.cos(a) * r))
        def full(u, v):        # S3：与另一片在头顶合拢成椭圆
            a = R(184) * u; r = (0.02 + 0.98 * v) * fringe(u, v)    # 从中心铺起，上下都与另一片交叠
            ca = math.cos(a)
            return Vector((s * (math.sin(a) * 0.43 * r - 0.03 * (1 - u) ** 2),
                           0.02 + 0.004 * s - 0.3 * r ** 1.6 * abs(math.sin(a)) ** 1.3 - 0.06 * r * r * max(ca, 0),
                           0.44 + (ca * 0.46 if ca > 0 else -(-ca * 0.62) / (1 + (-ca * 0.62 / 0.4) ** 4) ** 0.25) * r))
        return fold, droop, raise_, full
    nu, nv = 65, 21
    for s in (-1, 1):
        fold, *stages = lobe(s)
        ob = grid('M_Cape' + ('L' if s < 0 else 'R'), nu, nv, lambda u, v: fold((u + 1) / 2, v), M['cape'], root)
        uv = lambda i: ((i % nu) / (nu - 1), (i // nu) / (nv - 1))
        stage_keys(ob, [lambda i, co, f=f: f(*uv(i)) for f in stages])
        ob.modifiers.new('厚度', 'SOLIDIFY').thickness = 0.006
        ob.modifiers.new('平滑', 'SUBSURF').levels = 1

    # 胸盾：u -1→1 横向，v 0→1 由内缘/上缘到外缘/下缘
    def collar(u, v):          # 基础：喉下一圈领子
        a = R(75) * u
        return Vector((math.sin(a) * 0.072, -0.085 - math.cos(a) * 0.072, 0.35 - 0.045 * v))
    def tray(u, v):            # S1：横向展开成托盘，两端下垂
        return Vector((u * (0.06 + 0.3 * v), -0.12 - 0.07 * v * (1 - u * u), 0.315 - 0.06 * v * (1 - u * u) - 0.05 * (u * v) ** 2))
    def tray2(u, v):           # S2：托盘略上抬
        return Vector((u * (0.06 + 0.3 * v), -0.12 - 0.08 * v * (1 - u * u), 0.33 - 0.035 * v - 0.04 * (u * v) ** 2))
    def smile(u, v):           # S3：椭圆下方的“微笑”
        zt = 0.32 + 0.06 * u * u
        zb = zt - 0.1 * (1 - u * u) ** 0.75 - 0.004 - 0.003 * abs(math.sin(u * math.pi * 11))
        return Vector((u * 0.37, -0.09 - 0.19 * abs(u) ** 1.6, zt + (zb - zt) * v))
    pu, pv = 89, 9
    plate = grid('M_Breastplate', pu, pv, collar, M['plate'], root)
    puv = lambda i: (-1 + 2 * (i % pu) / (pu - 1), (i // pu) / (pv - 1))
    stage_keys(plate, [lambda i, co, f=f: f(*puv(i)) for f in (tray, tray2, smile)])
    plate.modifiers.new('厚度', 'SOLIDIFY').thickness = 0.004
    plate.modifiers.new('平滑', 'SUBSURF').levels = 1
    return root

# ---------------------------------------------------------------- 雌鸟（朴素褐色）
def build_female(M):
    root = bpy.data.objects.new('Female', None)
    C.objects.link(root)
    fuzz(ellipsoid('F_Body', (0.08, 0.14, 0.09), T((0, 0.01, 0.2), (-20, 0, 0)), M['female'], root))
    fuzz(ellipsoid('F_Belly', (0.072, 0.112, 0.074), T((0, -0.03, 0.175), (-20, 0, 0)), M['female_belly'], root))
    fuzz(ellipsoid('F_Head', (0.058, 0.068, 0.06), T((0, -0.13, 0.31)), M['female_head'], root, 24, 12), 0.003, 0.008)
    ellipsoid('F_Tail', (0.045, 0.19, 0.012), T((0, 0.25, 0.1), (22, 0, 0)), M['female'], root, 16, 8)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.016, radius2=0.002, depth=0.07)
    me = bpy.data.meshes.new('F_Beak'); bm.to_mesh(me); bm.free()
    me.transform(T((0, -0.215, 0.305), (90, 0, 0)))
    me.materials.append(M['female_beak'])
    link('F_Beak', me, root)
    for sx in (-1, 1):
        ellipsoid('F_Eye', (0.01, 0.01, 0.01), T((sx * 0.05, -0.16, 0.325)), M['iris'], root, 10, 6)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.008, radius2=0.006, depth=0.13)
        me = bpy.data.meshes.new('F_Leg'); bm.to_mesh(me); bm.free()
        me.transform(T((sx * 0.03, 0.0, 0.065)))
        me.materials.append(M['leg'])
        link('F_Leg', me, root)
    root.location = (-0.7, -0.3, 0)
    root.rotation_euler = (0, 0, R(-115))   # 面向雄鸟
    return root

# ---------------------------------------------------------------- 环境
def build_env(M):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.55, depth=5, location=(0, 0.15, -0.55), rotation=(0, R(90), 0))
    log = bpy.context.active_object; log.name = 'Log'
    log.data.materials.append(M['bark'])
    smooth(log.data)
    log.modifiers.new('细分', 'SUBSURF').levels = 1
    # 树干上的苔藓团和橙色小蘑菇（参考图里都有）
    import random
    random.seed(11)
    for c in range(14):          # 14 簇，每簇若干小团
        cx = random.uniform(-2.2, 2.2)
        if abs(cx) < 0.3:
            continue
        ca = random.uniform(-1.0, 1.0)
        for i in range(random.randint(3, 7)):
            x = cx + random.gauss(0, 0.06); ang = ca + random.gauss(0, 0.08)
            p = Vector((x, 0.15 + math.sin(ang) * 0.55, -0.55 + math.cos(ang) * 0.55))
            o = ellipsoid(f'Moss{c}_{i}', (random.uniform(0.02, 0.06), random.uniform(0.02, 0.05), 0.012),
                          T(p, (math.degrees(-ang), 0, random.uniform(0, 180))), M['moss'], None, 12, 6)
            fuzz(o, 0.018, 0.005)
    for i, (x, y, h, r) in enumerate([(-0.32, 0.05, 0.05, 0.028), (-0.38, 0.12, 0.035, 0.02), (-0.27, 0.16, 0.04, 0.022),
                                      (0.42, 0.18, 0.045, 0.026), (0.5, 0.1, 0.03, 0.018), (1.0, -0.1, 0.05, 0.03)]):
        z0 = -0.55 + math.sqrt(max(0, 0.55 ** 2 - (y - 0.15) ** 2)) - 0.005
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=r * 0.22, depth=h, location=(x, y, z0 + h / 2))
        st = bpy.context.active_object; st.name = f'MushStem{i}'; st.data.materials.append(M['stem'])
        cap = ellipsoid(f'MushCap{i}', (r, r, r * 0.45), T((x, y, z0 + h)), M['mush'], None, 20, 10)
    # 远景：大片虚化的绿色树林卡片
    bgm = bpy.data.materials.new('ForestCard'); bgm.use_nodes = True
    nt = bgm.node_tree; b = bsdf(bgm)
    ns = node(nt, 'ShaderNodeTexNoise', Scale=3.0, Detail=6.0)
    ramp = nt.nodes.new('ShaderNodeValToRGB'); els = ramp.color_ramp.elements
    els[0].position = 0.35; els[0].color = (0.02, 0.05, 0.015, 1)
    els[1].position = 0.75; els[1].color = (0.35, 0.5, 0.12, 1)
    e = els.new(0.55); e.color = (0.08, 0.18, 0.04, 1)
    nt.links.new(ns.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Emission Color']); setin(b, 'Emission Strength', 0.9)
    setin(b, 'Base Color', (0, 0, 0, 1))
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 7, 1.2), rotation=(R(90), 0, 0))
    card = bpy.context.active_object; card.name = 'ForestCard'; card.scale = (16, 8, 1)
    card.data.materials.append(bgm)
    # 远处虚化光斑
    random.seed(3)
    for i in range(26):
        col = random.choice([(0.25, 0.6, 0.12), (0.5, 0.75, 0.2), (0.9, 0.85, 0.45), (0.15, 0.4, 0.15)])
        m = mat(f'Bokeh{i}', (0, 0, 0), emit=col, emit_s=random.uniform(0.6, 2.0))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=random.uniform(0.05, 0.2), segments=16, ring_count=8,
                                             location=(random.uniform(-5, 5), random.uniform(6, 11), random.uniform(-0.5, 3.5)))
        o = bpy.context.active_object; o.name = f'Bokeh{i}'
        o.data.materials.append(m)
    w = bpy.data.worlds.new('Forest')
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.05, 0.08, 0.035, 1)
    bg.inputs['Strength'].default_value = 1.0
    bpy.context.scene.world = w

    def area(name, loc, target, power, color, size):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = power; L.color = color; L.size = size
        o = link(name, L)
        o.location = loc
        d = Vector(target) - Vector(loc)
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    area('Key', (-1.2, -1.6, 1.8), (0, 0, 0.3), 180, (1.0, 0.93, 0.8), 1.5)
    area('RimCool', (0.9, 1.2, 1.0), (0, 0, 0.4), 260, (0.6, 0.95, 1.0), 0.8)
    area('RimWarm', (-1.0, 1.0, 0.8), (0, 0, 0.4), 160, (1.0, 0.85, 0.6), 0.8)
    area('Fill', (0.8, -1.5, 0.3), (0, 0, 0.3), 10, (0.7, 0.9, 0.8), 1.5)

    cam = bpy.data.cameras.new('Cam'); cam.lens = 50
    cam.dof.use_dof = True; cam.dof.aperture_fstop = 2.0
    co = link('Camera', cam)
    co.location = (-0.15, -3.1, 0.8)
    co.rotation_euler = (Vector((-0.35, 0, 0.36)) - co.location).to_track_quat('-Z', 'Y').to_euler()
    cam.dof.focus_distance = 3.1
    bpy.context.scene.camera = co

def setup_render():
    sc = bpy.context.scene
    items = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        if eng in items:
            sc.render.engine = eng
            break
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.resolution_percentage = 100
    try:
        sc.eevee.taa_render_samples = 48
    except Exception:
        pass
    sc.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else sc.view_settings.view_transform
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass

clear()
MATS = make_materials()
MALE = build_male(MATS)
FEMALE = build_female(MATS)
build_env(MATS)
setup_render()
print('built', len(bpy.data.objects), 'objects; engine', bpy.context.scene.render.engine)
