# 体块阶段的预览渲染：太阳 + Nishita 天空，EEVEE，几个固定视角。
# 用法：先 exec massing.py，再 exec 本文件；渲染图写到 work/renders/。
import bpy, math, os
from mathutils import Vector

OUT = r"G:/selftool/Cathedral/work/renders"
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene

items = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in items else 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
try:
    sc.eevee.taa_render_samples = 32
    sc.eevee.use_raytracing = True
except Exception:
    pass
for o in bpy.data.objects:
    o.hide_render = o.name in ('PlanOverlay',)
try:
    sc.view_settings.view_transform = 'AgX'      # 色彩管理是动态枚举，直接尝试
except TypeError:
    pass
sc.view_settings.exposure = -1.5

# 天空：Nishita；下午，太阳在西南偏西（西立面受光）
w = bpy.data.worlds.get('Sky') or bpy.data.worlds.new('Sky')
w.use_nodes = True
nt = w.node_tree
bg = next(n for n in nt.nodes if n.type == 'BACKGROUND')
sky = next((n for n in nt.nodes if n.type == 'TEX_SKY'), None) or nt.nodes.new('ShaderNodeTexSky')
try:
    sky.sky_type = 'NISHITA'
except TypeError:
    pass
SUN_EL, SUN_AZ = math.radians(32), math.radians(235)    # 仰角 32°，方位：从北顺时针 235°（西南偏西）
try:
    sky.sun_elevation = SUN_EL
    sky.sun_rotation = math.radians(90) - SUN_AZ          # Blender 的旋转从 +X 起逆时针
except Exception:
    pass
nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.25
sc.world = w

sun = bpy.data.objects.get('Sun')
if not sun:
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sc.collection.objects.link(sun)
sun.data.energy = 4.0
sun.data.angle = math.radians(0.6)
d = Vector((math.sin(SUN_AZ) * math.cos(SUN_EL), math.cos(SUN_AZ) * math.cos(SUN_EL), math.sin(SUN_EL)))   # 指向太阳
sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()

def shot(name, loc, target, lens=24, ortho=0):
    cam = bpy.data.objects.get('Cam_' + name)
    if not cam:
        cam = bpy.data.objects.new('Cam_' + name, bpy.data.cameras.new('Cam_' + name))
        sc.collection.objects.link(cam)
    cam.data.lens = lens
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    cam.data.ortho_scale = ortho or 1
    cam.data.clip_end = 1000
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)

shot('ext_parvis', (0, -115, 1.65), (0, 0, 30), 35)        # 广场人眼（约 115 m 外，常见正面照的位置）
shot('ext_se', (95, 140, 40), (0, 60, 20), 30)             # 东南侧俯视（对照 Fletcher 插图 B）
shot('ext_portal', (0, -22, 1.65), (0, 2, 10), 24)         # 中门近景
sc.render.resolution_x, sc.render.resolution_y = 900, 1300
shot('ext_facade_ortho', (0, -200, 36), (0, 0, 36), 50, 76)   # 立面正投影（与照片对照）
sc.render.resolution_x, sc.render.resolution_y = 1280, 720
shot('int_nave', (0, 18, 1.65), (0, 110, 12), 20)          # 中殿由西向东
print('preview ok')
