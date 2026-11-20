"""离线工程 -> 精简网格和顶点光照烘焙 GLB；原工程保持不变。"""
import bpy, os, json, time, sys, numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'tropical-shallows/site/assets/realtime'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'work/tropical-shallows/tropical-shallows-swash.blend'))
sc=bpy.context.scene; sc.frame_set(1)
water_names=('透光浅水与细波','冲滩薄水层','随浪前缘碎沫','留滩碎沫')
static=[o for o in sc.objects if o.type=='MESH' and not o.hide_render and o.name not in water_names]
for name in water_names:
    if bpy.data.objects.get(name):bpy.data.objects[name].hide_render=True
# 在共享数据上只精简一次，实例仍共用网格。
unique={o.data.name:o for o in static}
for name,obj in unique.items():
    me=obj.data; tri=sum(len(p.vertices)-2 for p in me.polygons)
    limit=100000 if '树冠' in obj.name else 180000 if '鸡蛋花叶' in obj.name else 150000 if '礁岸' in obj.name else 90000 if '沙' in obj.name else 55000
    if tri<=limit:continue
    users=[o for o in static if o.data==me]
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    obj.data=me.copy()
    dec=obj.modifiers.new('实时几何精简','DECIMATE');dec.ratio=limit/tri
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for o in users:o.data=obj.data
    print('DECIMATE',obj.name,tri,'->',sum(len(p.vertices)-2 for p in obj.data.polygons),flush=True)
unique={o.data.name:o for o in static}
for obj in unique.values():
    me=obj.data
    color=me.color_attributes.get('BakedLight') or me.color_attributes.new(name='BakedLight',type='FLOAT_COLOR',domain='CORNER')
    me.color_attributes.active_color=color
sc.render.engine='CYCLES';sc.cycles.samples=4
sc.cycles.use_denoising=False
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for dev in prefs.devices:dev.use=dev.type=='OPTIX'
    sc.cycles.device='GPU'
except Exception:sc.cycles.device='CPU'
sc.render.bake.target='VERTEX_COLORS';sc.render.bake.use_clear=True
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'work/tropical-shallows/realtime-prepared.blend'))
if '--prepare-only' in sys.argv:
    print('PREPARED_FOR_BATCH',flush=True)
    bpy.ops.wm.quit_blender()
bpy.ops.object.select_all(action='DESELECT')
for o in unique.values():o.select_set(True)
bpy.context.view_layer.objects.active=next(iter(unique.values()))
print('BAKE_START',len(unique),flush=True)
bpy.ops.object.bake(type='COMBINED',pass_filter={'COLOR','DIRECT','INDIRECT','DIFFUSE','EMIT'},target='VERTEX_COLORS')
print('BAKE_DONE',flush=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'work/tropical-shallows/realtime-baked.blend'))
# 顶点颜色保存离线光照，原纹理仅保留透明遮罩，避免颜色重复相乘。
for m in {m for o in static for m in o.data.materials if m}:
    if not m.use_nodes:continue
    nt=m.node_tree
    bsdf=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if bsdf:
        for slot in ('Base Color','Normal','Metallic','Roughness'):
            for link in list(bsdf.inputs[slot].links):nt.links.remove(link)
        bsdf.inputs['Base Color'].default_value=(1,1,1,1)
        bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=1
    else:
        nt.nodes.clear();bsdf=nt.nodes.new('ShaderNodeBsdfPrincipled');out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(bsdf.outputs[0],out.inputs['Surface']);bsdf.inputs['Base Color'].default_value=(1,1,1,1)
    m.use_backface_culling=False
# glTF 颜色若超过1会被裁切，统一曝光缩放并在浏览器恢复 HDR。
scale=8.0
for obj in unique.values():
    attr=obj.data.color_attributes['BakedLight'];rgba=np.empty(len(attr.data)*4,np.float32);attr.data.foreach_get('color',rgba);rgba=rgba.reshape(-1,4)
    rgba[:,:3]=np.clip(rgba[:,:3]/scale,0,1);rgba[:,3]=1
    attr.data.foreach_set('color',rgba.ravel())
bpy.ops.object.select_all(action='DESELECT')
for o in static:o.select_set(True)
bpy.context.view_layer.objects.active=static[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'shore.glb'),export_format='GLB',use_selection=True,
    export_apply=False,export_animations=False,export_cameras=False,export_lights=False,
    export_materials='EXPORT',export_normals=True,export_yup=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,
    export_active_vertex_color_when_no_material=True,export_image_format='AUTO')
cam=sc.camera
metadata={'colorScale':scale,'cameraMatrix':[list(row) for row in cam.matrix_world],
    'fovY':float(2*np.arctan(24/(2*cam.data.lens))*180/np.pi),
    'objects':len(static),'uniqueMeshes':len(unique),
    'trianglesWithInstances':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in static),
    'glbBytes':(OUT/'shore.glb').stat().st_size,
    'note':'真实三维几何，离线顶点光照烘焙；海水由浏览器独立渲染。'}
(OUT/'scene.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf8')
print('EXPORTED',json.dumps(metadata,ensure_ascii=False),flush=True)
