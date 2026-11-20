"""验证保存后岸缘实际前进/回退，不以单纯上下位移冒充冲滩。"""
import bpy,numpy as np,os,json
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sc=bpy.context.scene;ob=sc.objects['冲滩薄水层'];foam=sc.objects['随浪前缘碎沫']
N,Y=42,500;row=round(17/35*Y);index=row*(N+1)+N
samples=[]
for frame in (1,51,130,181):
    sc.frame_set(frame);bpy.context.view_layer.update()
    me=ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
    front=me.vertices[index].co.copy()
    samples.append({'frame':frame,'front':list(front),'foam_strength':foam.data.materials[0].node_tree.nodes['随冲退消散'].outputs[0].default_value})
advance=samples[1]['front'][0]-samples[0]['front'][0]
retreat=samples[1]['front'][0]-samples[2]['front'][0]
rise=abs(samples[1]['front'][2]-samples[0]['front'][2])
finite=True
for key in ob.data.shape_keys.key_blocks:
    xyz=np.empty(len(key.data)*3,np.float32);key.data.foreach_get('co',xyz)
    if not np.isfinite(xyz).all():finite=False
checks={'correct_scene':os.path.basename(bpy.data.filepath)=='tropical-shallows-swash.blend','uprush_moves_landward':bool(advance>1.0),'backwash_moves_seaward':bool(retreat>.8),'horizontal_motion_dominates':bool(advance>rise*5),'foam_follows_moving_edge':foam.data.shape_keys is not None,'foam_dissipates':samples[1]['foam_strength']>samples[2]['foam_strength']+.4,'finite_shape_keys':finite,'packed_images':all(i.packed_file and i.size[0]>0 for i in bpy.data.images if i.source=='FILE')}
report={'checks':checks,'samples':samples,'advance_metres':advance,'retreat_metres':retreat,'slope_rise_metres':rise,'period_seconds':sc.get('swash_period_seconds'),'uprush_seconds':sc.get('swash_uprush_seconds'),'backwash_seconds':sc.get('swash_backwash_seconds'),'note':'这是实际评估网格的运动检查，不是90%视觉评分。薄水膜/泡沫为形态键外观近似。'}
clipfile=os.path.join(ROOT,'work/tropical-shallows/swash-preview.mp4')
if os.path.exists(clipfile):
    clip=bpy.data.movieclips.load(clipfile);report['video']={'size':list(clip.size),'frames':clip.frame_duration}
with open(os.path.join(ROOT,'work/tropical-shallows/swash-verification.json'),'w',encoding='utf8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print(json.dumps(report,ensure_ascii=False),flush=True)
assert all(checks.values()),'岸缘冲退验证未通过'
