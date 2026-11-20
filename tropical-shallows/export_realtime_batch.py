"""复用精简检查点，一次烘焙静态批次，避免逐物件重复初始化。"""
import bpy,json,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'tropical-shallows/site/assets/realtime'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'work/tropical-shallows/realtime-prepared.blend'))
sc=bpy.context.scene
import runpy
runpy.run_path(str(ROOT/'tropical-shallows/rationalize_scene.py'))['apply'](sc)
static=[o for o in sc.objects if o.type=='MESH' and not o.hide_render]
# 每个网格原来的当前UV必须在合并前归一到同名通道，否则叶片/花瓣会读到别的物件的空UV。
for me in {o.data for o in static}:
    color=me.color_attributes.get('BakedLight') or me.color_attributes.new(name='BakedLight',type='FLOAT_COLOR',domain='CORNER')
    me.color_attributes.active_color=color
    uv=me.uv_layers.active
    if uv:
        for other in list(me.uv_layers):
            if other!=uv:me.uv_layers.remove(other)
        uv.name='RealtimeUV'
    else:me.uv_layers.new(name='RealtimeUV')
for mat in {m for o in static for m in o.data.materials if m and m.use_nodes}:
    for node in mat.node_tree.nodes:
        if node.type in {'UVMAP','NORMAL_MAP'}:node.uv_map='RealtimeUV'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'work/tropical-shallows/realtime-grounded.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in static:o.select_set(True)
bpy.context.view_layer.objects.active=static[0]
count=len(static)
bpy.ops.object.join()
obj=bpy.context.object;obj.name='静态浅滩光照批次'
obj.data.validate(verbose=True)
static=[obj];unique={obj.data.name:obj}
sc.cycles.samples=4;sc.cycles.device='GPU'
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='OPTIX'
except Exception:sc.cycles.device='CPU'
print('BATCH_BAKE_START',count,len(obj.data.vertices),len(obj.data.polygons),flush=True)
bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'},target='VERTEX_COLORS')
print('BAKE_DONE',flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'work/tropical-shallows/realtime-baked.blend'))
source=(ROOT/'tropical-shallows/export_realtime.py').read_text(encoding='utf8')
exec(compile(source[source.index('# 顶点颜色保存'):],str(ROOT/'tropical-shallows/export_realtime.py'),'exec'))
info=json.loads((OUT/'scene.json').read_text(encoding='utf8'))
info['shading']='albedo-vertex-bake-realtime-lighting'
info['note']='真实三维几何，顶点表面颜色烘焙；浏览器实时光照、阴影和海水。'
(OUT/'scene.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf8')
