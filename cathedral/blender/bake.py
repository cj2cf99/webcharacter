# 烘焙与导出（第一轮）。先 exec massing.py、materials.py、lighting.py，再 exec 本文件定义函数，
# 然后按组调用 prepare_all() → bake_group(name) …… → tonemap_all() → export_all()。
# 原始浮点结果存 work/bake/*.exr，便于不重烘就重调亮度。
import bpy, bmesh, math, os
import numpy as np

ROOT = r"G:/selftool/Cathedral"
WORK = ROOT + "/work/bake"
SITE = ROOT + "/site/assets"
os.makedirs(WORK, exist_ok=True); os.makedirs(SITE, exist_ok=True)

GROUPS = {   # 名称: (成员物体, 贴图边长, 采样数)
    'ext_a': (['Ext_Stone', 'Ext_Sheets', 'Ext_Walls', 'Ext_Roof', 'W_Center', 'W_TowerLow_N', 'W_TowerLow_S', 'W_TowerUp_N', 'W_TowerUp_S'], 4096, 128),
    'ext_b': (['W_Detail', 'W_Detail2', 'W_Statues', 'W_Doors', 'T_Doors'], 4096, 128),
    'ground': (['Ground'], 2048, 128),
    'int': (['Int_Stone', 'Int_Sheets', 'Int_Floor'], 4096, 256),
    'door_l': (['Door_L'], 512, 128),
    'door_r': (['Door_R'], 512, 128),
}
GLASS_GROUP = ['Glass_Panes', 'W_Glass']

def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

def join(name, names):
    objs = [bpy.data.objects[n] for n in names if n in bpy.data.objects]
    if len(objs) > 1:
        select_only(objs)
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active if len(objs) > 1 else objs[0]
    o.name = 'B_' + name
    return o

ISLAND_MARGIN = 0.0007      # 原 0.003：每个小岛带 12 像素边距，1.5 万个小面会把图集浪费 93%，柱面（27 cm 宽）窄得烘不到像素

def unwrap(o):
    me = o.data
    if 'bake' in me.uv_layers:
        me.uv_layers.remove(me.uv_layers['bake'])          # 保留 'local'（玻璃图案坐标），只重建烘焙用的 'bake'
    lay = me.uv_layers.new(name='bake')
    me.uv_layers.active = lay
    select_only([o])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=ISLAND_MARGIN, area_weight=0.0)
    bpy.ops.object.mode_set(mode='OBJECT')

def classify_interior():
    """外部组（ext_a）里有朝向室内的面（墙内皮、礼拜堂隔墙侧面、塔楼内腔……）。它们要用室内光照，不能用外部实时光照。
    判据：面心沿法线外推 3 cm 的点 p——在教堂平面范围内，并且从 p 垂直向上的射线会碰到东西（屋顶、拱顶、楼板）→ 室内。
    平面范围：|x| ≤ 23.52、y ≥ 3.6（立面墙内皮）、后殿为半椭圆。窗玻璃薄片不算遮挡。返回新增的室内物体名。"""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); sc = bpy.context.scene
    from mathutils import Vector
    FWX, Y0 = CHAPEL_OUT_X + 0.02, F_BUTT_PROJ + 2.0
    rx, ry = APSE_OUT[0] - WALL_T + 0.02, APSE_OUT[1] - WALL_T + 0.02
    def in_plan(x, y):
        if y < Y0: return False
        if y <= APSE_CY: return abs(x) <= FWX
        return (x / rx) ** 2 + ((y - APSE_CY) / ry) ** 2 <= 1.0
    def covered(p):
        o = p.copy()
        for _ in range(6):
            hit, loc, n, i, ob, m = sc.ray_cast(dg, o, Vector((0, 0, 1)), distance=100.0)
            if not hit: return False
            if 'Glass' in ob.name:                      # 窗玻璃：穿过去继续
                o = loc + Vector((0, 0, 0.01)); continue
            return True
        return True
    def outer_face(c, n, zmax):
        """朝外的高墙面：中殿高墙在楼廊屋面（24.8 m）以上、楼廊墙在侧廊屋面（17 m）以上，法线背离中轴 → 外部。
        （这些面上方有屋顶挑檐或飞券，射线法会误判成室内，导致从外面看高墙整块消失。）"""
        if c.y <= APSE_CY:
            out = (1 if c.x > 0 else -1) * n.x > 0.6; ax = abs(c.x)
        else:
            rv = Vector((c.x, c.y - APSE_CY, 0)); out = rv.length > 1e-6 and n.dot(rv.normalized()) > 0.6
            ax = math.hypot(c.x, (c.y - APSE_CY) * APSE_OUT[0] / APSE_OUT[1])
        if ax >= AISLE_PIER_X + 0.6 and c.z >= 17.0 and c.y > TRANSEPT_Y1 + 3 or (ax >= AISLE_PIER_X + 0.6 and c.z >= 17.0 and c.y < TRANSEPT_Y0 - 3):
            return True                       # 侧廊屋面以上、飞扶壁一带：全是室外
        if not out: return False
        return (ARC_X <= ax <= AISLE_PIER_X + 1.6 and zmax >= 26.0) or (AISLE_PIER_X <= ax <= CHAPEL_OUT_X + 0.1 and zmax >= 18.0)
    made = []
    for src in list(GROUPS['ext_a'][0]):
        o = bpy.data.objects.get(src)
        if not o: continue
        M = o.matrix_world
        bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
        cls = []
        for f in bm.faces:
            c = M @ f.calc_center_median(); n = (M.to_3x3() @ f.normal).normalized()
            p = c + n * 0.03
            cls.append(1 if (in_plan(p.x, p.y) and not outer_face(c, n, max((M @ v.co).z for v in f.verts)) and covered(p)) else 0)
        n_int = sum(cls)
        if n_int:
            bm2 = bm.copy(); bm2.faces.ensure_lookup_table()
            bmesh.ops.delete(bm2, geom=[f for f, k in zip(bm2.faces, cls) if k == 0], context='FACES')
            me2 = bpy.data.meshes.new(src + '_in'); bm2.to_mesh(me2); bm2.free()
            for mat in o.data.materials: me2.materials.append(mat)
            o2 = bpy.data.objects.new(src + '_in', me2); o2.matrix_world = M
            for c_ in o.users_collection: c_.objects.link(o2)
            made.append(src + '_in')
            bmesh.ops.delete(bm, geom=[f for f, k in zip(bm.faces, cls) if k == 1], context='FACES')
            bm.to_mesh(o.data)
        print('classify', src, 'faces', len(cls), 'interior', n_int)
        bm.free()
    return made

def prepare_all():
    """合并分组、展 UV、玻璃按朝向分内外材质。"""
    if 'PlanOverlay' in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects['PlanOverlay'])
    made = classify_interior()
    GROUPS['int'][0].extend(made)                 # 室内组：原有物体 + 地板 + 从外部分出来的室内面
    for name, (names, res, spp) in GROUPS.items():
        o = join(name, names)
        for i, m in enumerate(o.data.materials):      # 合并后可能出现空材质槽
            if m is None:
                o.data.materials[i] = bpy.data.materials['Stone']
        unwrap(o)
    g = join('glass', GLASS_GROUP)
    assert [m.name for m in g.data.materials] == GLASS_ORDER, [m.name for m in g.data.materials]   # 槽位顺序必须一致
    unwrap(g)
    print('prepared', [o.name for o in bpy.data.objects if o.name.startswith('B_')])

def bake_image(name, res):
    img = bpy.data.images.get('bake_' + name)
    if img:
        bpy.data.images.remove(img)
    return bpy.data.images.new('bake_' + name, res, res, alpha=False, float_buffer=True)

def set_target(o, img):
    for m in o.data.materials:
        nt = m.node_tree
        n = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
        n.name = 'BAKE_TARGET'; n.image = img
        nt.nodes.active = n

def bake_group(name):
    g = bpy.data.objects.get('B_glass')
    assert g and not any(m and m.name.startswith('EX_') for m in g.data.materials),         "玻璃已被导出步骤换成不透明的单色材质（EX_*），光进不了室内。请先重建场景（STEP='model'）再烘焙；室内要在 ext2 / export 之前烘焙。"
    names, res, spp = GROUPS[name]
    o = bpy.data.objects['B_' + name]
    img = bake_image(name, res)
    set_target(o, img)
    sc = bpy.context.scene
    sc.cycles.samples = spp
    select_only([o])
    bpy.ops.object.bake(type='COMBINED', margin=4, use_clear=True)
    img.filepath_raw = f"{WORK}/{name}.exr"; img.file_format = 'OPEN_EXR'; img.save()
    print('baked', name)

def bake_glass():
    """玻璃不烘光照：外侧固定深色，内侧烘焙各类彩色玻璃的图案颜色（EMIT）。"""
    o = bpy.data.objects['B_glass']
    img = bake_image('glass', 2048)
    saved = {}
    for m in o.data.materials:
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        saved[m.name] = [l.from_socket for l in out.inputs['Surface'].links]
        em = nt.nodes.new('ShaderNodeEmission'); em.name = 'TMP_EMIT'
        if m.name.startswith('St_'):
            nt.links.new(nt.nodes['STAINED_SRC'].outputs['Color'], em.inputs['Color'])      # 图案原色，不取透光用的淡化色
        else:
            em.inputs['Color'].default_value = (0.035, 0.045, 0.06, 1)
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    set_target(o, img)
    select_only([o])
    bpy.ops.object.bake(type='EMIT', margin=4, use_clear=True)
    img.filepath_raw = f"{WORK}/glass.exr"; img.file_format = 'OPEN_EXR'; img.save()
    for m in o.data.materials:      # 还原
        nt = m.node_tree; out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        for src in saved[m.name]:
            nt.links.new(src, out.inputs['Surface'])
        nt.nodes.remove(nt.nodes['TMP_EMIT'])
    print('baked glass')

def render_sky():
    """天空全景（等距柱状投影），不含建筑。"""
    sc = bpy.context.scene
    cam = bpy.data.objects.get('SkyCam') or bpy.data.objects.new('SkyCam', bpy.data.cameras.new('SkyCam'))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.data.type = 'PANO'
    try:
        cam.data.panorama_type = 'EQUIRECTANGULAR'
    except Exception:
        cam.data.cycles.panorama_type = 'EQUIRECTANGULAR'
    cam.location = (0, 0, 1.65); cam.rotation_euler = (math.radians(90), 0, 0)
    hidden = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render]
    for o in hidden: o.hide_render = True
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 2048, 1024
    sc.cycles.samples = 32
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.filepath = f"{WORK}/sky.exr"
    bpy.ops.render.render(write_still=True)
    for o in hidden: o.hide_render = False
    print('sky ok')

# ---------------------------------------------------------------- 编码：线性辐亮度 → 8 位对数编码
# y = ln(1 + A·x·K) / ln(1 + A·XMAX)，网页着色器按同一公式解码回线性值，再做动态曝光与 ACES 色调映射。
# 可表示 0.0005–4（相对阳光直射墙面≈0.9）的范围；室内中位数约 0.0015。
LOG_A, LOG_XMAX = 1000.0, 4.0
def tone(x, K):
    y = np.log1p(LOG_A * np.clip(x * K, 0, None)) / np.log1p(LOG_A * LOG_XMAX)
    return np.clip(y, 0, 1)

def load_exr(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[:, :, :3], w, h

def save_webp(arr, w, h, path, quality=85):
    img = bpy.data.images.new('tmp_out', w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'          # 原样写入，不做色彩转换
    rgba = np.concatenate([arr, np.ones((h, w, 1), np.float32)], axis=2)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path; img.file_format = 'WEBP'
    img.save(quality=quality)
    bpy.data.images.remove(img)

def exposure_key():
    a, w, h = load_exr(f"{WORK}/ext_a.exr")
    lum = a.mean(axis=2)
    return 0.9 / float(np.percentile(lum[lum > 0], 99.0))

def tonemap_all():
    K = exposure_key()
    for name in list(GROUPS) + ['sky']:
        a, w, h = load_exr(f"{WORK}/{name}.exr")
        save_webp(tone(a, K), w, h, f"{SITE}/tex_{name}.webp", 88 if name != 'sky' else 82)
    a, w, h = load_exr(f"{WORK}/glass.exr")
    save_webp(np.clip(a, 0, 1) ** (1 / 2.2), w, h, f"{SITE}/tex_glass.webp", 85)      # 玻璃：普通 sRGB 颜色
    import json
    json.dump({'K': K, 'A': LOG_A, 'XMAX': LOG_XMAX}, open(f"{SITE}/encoding.json", 'w'))
    print('tonemapped K=', K)
    return K

# ---------------------------------------------------------------- 导出 glTF
def export_material(name):
    m = bpy.data.materials.get('EX_' + name) or bpy.data.materials.new('EX_' + name)
    m.use_nodes = True
    m.use_backface_culling = False          # 导出为 doubleSided：Blender 5 新建材质默认剔除背面，镜像墙段的玻璃朝向会反，室内看到外侧面
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in ('OUTPUT_MATERIAL', 'BSDF_PRINCIPLED'):
            nt.nodes.remove(n)
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    img = bpy.data.images.load(f"{SITE}/tex_{name}.webp", check_existing=True)
    img.colorspace_settings.name = 'sRGB'
    tex.image = img
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    return m

def export_glb(path, objs, normals=False):
    select_only(objs)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_texcoords=True, export_normals=normals, export_materials='EXPORT',
                              export_image_format='AUTO', export_apply=True, export_yup=True,
                              export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression')      # 网页端用 vendor/three/meshopt_decoder.module.js 解码

def export_all():
    """把每组的材质换成“烘焙贴图”单材质后导出（三个 glb）。会改动场景，导出后请重建场景。"""
    for name in list(GROUPS) + ['glass']:
        o = bpy.data.objects['B_' + name]
        if name == 'glass' and 'local' in o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers['local'])      # 只导出烘焙 UV
        if name == 'glass':
            # 玻璃保留内外两个材质下标，但都指向同一张烘焙贴图
            m = export_material('glass')
            o.data.materials.clear(); o.data.materials.append(m)
        else:
            m = export_material(name)
            o.data.materials.clear(); o.data.materials.append(m)
    B = lambda *n: [bpy.data.objects['B_' + x] for x in n]
    export_glb(f"{SITE}/exterior.glb", B('ext_a', 'ext_b', 'ground', 'glass'))
    export_glb(f"{SITE}/interior.glb", B('int'))
    export_glb(f"{SITE}/door.glb", B('door_l', 'door_r'))
    for f in os.listdir(SITE):
        print(f, os.path.getsize(f"{SITE}/{f}"))
print('bake.py loaded')


def export_interior():
    """只重烘/导出室内：编码 tex_int.webp（沿用 encoding.json 里的 K，保持亮度标定不变）并导出 interior.glb 到 site/assets。"""
    import json
    K = json.load(open(f"{SITE}/encoding.json"))['K']
    a, w, h = load_exr(f"{WORK}/int.exr")
    save_webp(tone(a, K), w, h, f"{SITE}/tex_int.webp", 88)
    o = bpy.data.objects['B_int']
    m = export_material('int'); o.data.materials.clear(); o.data.materials.append(m)
    export_glb(f"{SITE}/interior.glb", [o])
    print('interior exported', os.path.getsize(f"{SITE}/interior.glb"))
