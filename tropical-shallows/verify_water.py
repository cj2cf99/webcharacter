"""重开工程检查风浪时间轴、实际评估几何和打包资源。"""
import bpy,numpy as np,os,json
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sc=bpy.context.scene;ob=sc.objects['透光浅水与细波']
ocean=next(m for m in ob.modifiers if m.type=='OCEAN')
coords=np.empty(len(ob.data.vertices)*3,np.float32);ob.data.vertices.foreach_get('co',coords);coords=coords.reshape(-1,3)
top=np.where(coords[:,2]>-1)[0]
points=[]
for x,y in ((-8,0),(-12,8),(-20,12),(-6,-2),(-16,22)):
    points.append(int(top[np.argmin((coords[top,0]-x)**2+(coords[top,1]-y)**2)]))
samples=[]
for frame in (1,61,121):
    sc.frame_set(frame);bpy.context.view_layer.update();evaluated=ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    samples.append({'frame':frame,'ocean_time':ocean.time,'points':[list(evaluated.data.vertices[i].co) for i in points]})
motion=np.max(np.abs(np.array(samples[0]['points'])-np.array(samples[-1]['points'])))
finite=True
for me in bpy.data.meshes:
    if not me.users:continue
    data=np.empty(len(me.vertices)*3,np.float32);me.vertices.foreach_get('co',data)
    if not np.isfinite(data).all():finite=False;break
checks={'correct_scene':os.path.basename(bpy.data.filepath)=='tropical-shallows-water.blend','native_ocean':ocean.spectrum=='TEXEL_MARSEN_ARSLOE' and ocean.geometry_mode=='DISPLACE','mild_wind':abs(ocean.wind_velocity-3.5)<.001 and abs(ocean.wave_scale-.25)<.001,'time_evolves':samples[0]['ocean_time']<samples[1]['ocean_time']<samples[2]['ocean_time'],'geometry_moves':bool(motion>.0001),'geometry_finite':finite,'textures_packed':all(i.packed_file and i.size[0]>0 for i in bpy.data.images if i.source=='FILE'),'no_reference_backplate':not any('clipboard' in i.filepath.lower() for i in bpy.data.images)}
report={'checks':checks,'wind':ocean.wind_velocity,'wave_scale':ocean.wave_scale,'native_render_resolution':ocean.resolution,'viewport_resolution':ocean.viewport_resolution,'sampled_motion_metres':float(motion),'samples':samples,'note':'实际几何运动与资源完整性通过不等于90%视觉验收。阴影透光、偏振与砂床聚光使用外观近似。'}
clipfile=os.path.join(ROOT,'work/tropical-shallows/sea-breeze-preview.mp4')
if os.path.exists(clipfile):
    clip=bpy.data.movieclips.load(clipfile);report['video']={'size':list(clip.size),'frames':clip.frame_duration}
with open(os.path.join(ROOT,'work/tropical-shallows/water-verification.json'),'w',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps(report,ensure_ascii=False),flush=True)
assert all(checks.values()),'水专项交付检查未通过'
