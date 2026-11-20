"""诊断单个网格顶点光照烘焙，不写网页或原工程。"""
import bpy,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'work/tropical-shallows/realtime-prepared.blend'))
sc=bpy.context.scene
objects=[o for o in sc.objects if o.type=='MESH' and not o.hide_render and 100<len(o.data.vertices)<500]
obj=objects[0]
for o in sc.objects:
    if o.type=='MESH' and o!=obj:o.hide_render=True
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
sc.cycles.device='CPU';sc.cycles.samples=1
print('PROBE_START',obj.name,len(obj.data.vertices),flush=True)
start=time.monotonic()
bpy.ops.object.bake(type='COMBINED',pass_filter={'COLOR','DIRECT','INDIRECT','DIFFUSE','EMIT'},target='VERTEX_COLORS')
print('PROBE_DONE',time.monotonic()-start,flush=True)
