# 光照：Nishita 天空（不含日盘）+ 太阳灯。太阳位置由 sun.py 按“巴黎夏至 + 当地时钟时间”算出（SUN_HOURS，默认 17:00）。
# 2026-11-15 之前这里写死 方位 235°/仰角 32°，在模型坐标里实际是西北偏北（罗盘 325°），巴黎夏至不可能出现，已废弃。
import bpy, math
from mathutils import Vector
exec(open(r"G:/selftool/Cathedral/blender/sun.py", encoding="utf-8").read(), globals())      # sun_dir / sky_params

sc = bpy.context.scene
SUN_HOURS = globals().get('SUN_HOURS', 17.0)      # 巴黎当地时钟时间（小时）。关键帧烘焙时由外部设定
SUN_EL, SUN_ROT = sky_params(SUN_HOURS)

w = bpy.data.worlds.get('Sky') or bpy.data.worlds.new('Sky')
w.use_nodes = True
nt = w.node_tree
bg = next(n for n in nt.nodes if n.type == 'BACKGROUND')
sky = next((n for n in nt.nodes if n.type == 'TEX_SKY'), None) or nt.nodes.new('ShaderNodeTexSky')
for t in ('NISHITA', 'MULTIPLE_SCATTERING', 'SINGLE_SCATTERING'):
    try:
        sky.sky_type = t; break
    except TypeError:
        pass
try:
    sky.sun_disc = False
except Exception:
    pass
sky.sun_elevation = SUN_EL
sky.sun_rotation = SUN_ROT         # = atan2(x, y)，2026-11-15 实测：相机朝太阳灯方向拍天空，光晕落在画面中心
nt.links.new(sky.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.08
sc.world = w

sun = bpy.data.objects.get('Sun') or bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
if sun.name not in sc.collection.objects:
    sc.collection.objects.link(sun)
sun.data.energy = 4.5
sun.data.angle = math.radians(0.55)
sun.data.color = (1.0, 0.95, 0.86)
d = Vector(sun_dir(SUN_HOURS))
sun.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()

sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
for dv in prefs.devices:
    dv.use = dv.type == 'OPTIX'
sc.cycles.device = 'GPU'
sc.cycles.max_bounces = 6
sc.cycles.transparent_max_bounces = 8
sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
try:
    sc.view_settings.view_transform = 'AgX'
except TypeError:
    pass
sc.view_settings.exposure = 0
print('lighting ok')
