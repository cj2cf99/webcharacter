"""保存后重新打开工程的交付检查；不以检查通过代替视觉验收。"""
import bpy, math, json, os
from bpy_extras.object_utils import world_to_camera_view

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sc=bpy.context.scene
checks={}
checks['correct_saved_scene']=os.path.normcase(os.path.abspath(bpy.data.filepath))==os.path.normcase(os.path.join(ROOT,'work','tropical-shallows','tropical-shallows.blend'))
checks['camera_and_cycles']=sc.camera is not None and sc.camera.name=='参考固定低机位' and sc.render.engine=='CYCLES'
checks['resolution_1536_1024']=(sc.render.resolution_x,sc.render.resolution_y)==(1536,1024)
checks['all_textures_packed']=all(i.packed_file is not None and i.size[0]>0 for i in bpy.data.images if i.source=='FILE')
checks['finite_geometry']=all(all(math.isfinite(c) for c in v.co) for ob in sc.objects if ob.type=='MESH' for v in ob.data.vertices)
checks['external_reference_not_used']=not any('clipboard' in i.name.lower() or 'clipboard' in i.filepath.lower() for i in bpy.data.images)
framing={}
for name in ('寄居蟹螺壳','蟹头','前景空螺壳','滨鹬身体','五腕颗粒海星'):
    ob=bpy.data.objects.get(name)
    points=[world_to_camera_view(sc,sc.camera,ob.matrix_world@v.co) for v in ob.data.vertices] if ob else []
    good=bool(points) and all(0<=p.x<=1 and 0<=p.y<=1 and p.z>0 for p in points)
    framing[name]={'fully_inside':good,'bounds':[[min(p.x for p in points),min(p.y for p in points)],[max(p.x for p in points),max(p.y for p in points)]] if points else []}
checks['main_small_props_in_frame']=all(v['fully_inside'] for v in framing.values())
report={'checks':checks,'framing':framing,'images':[{'name':i.name,'packed':bool(i.packed_file),'size':list(i.size)} for i in bpy.data.images if i.source=='FILE'],'objects':len(sc.objects),'visual_target':'未达到90%，数值检查不能替代参考符合性和用户验收'}
with open(os.path.join(ROOT,'work','tropical-shallows','verification.json'),'w',encoding='utf-8') as f: json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps(report,ensure_ascii=False),flush=True)
assert all(checks.values()), '交付完整性检查失败，详见 verification.json'
