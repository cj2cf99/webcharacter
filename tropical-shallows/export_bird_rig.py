"""从已有未合并工程提取小型头颈权重，不重导出大型静态模型。"""
import bpy,json,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'work/tropical-shallows/realtime-grounded.blend'))
scene=bpy.context.scene
def points(ob):return np.array([ob.matrix_world@v.co for v in ob.data.vertices],dtype=np.float32)[:,[0,2,1]]*np.array([1,1,-1])
neck=points(scene.objects['写实滨鹬颈']);pivot=[float(neck[:,0].mean()),float(neck[:,1].min()+.008),float(neck[:,2].mean())]
weights={};beak=None
for name in ('写实滨鹬头','写实滨鹬眼','写实滨鹬颈','滨鹬细腿与喙'):
    xyz=points(scene.objects[name])
    if name.endswith('颈'):values=np.clip((xyz[:,1]-neck[:,1].min())/(neck[:,1].max()-neck[:,1].min()),0,1)
    elif name=='滨鹬细腿与喙':
        # 源对象的第一段是两环九边喙，之后才是双腿/趾，避免啄食时牵拉腿。
        values=np.zeros(len(xyz));values[:18]=1;beak=xyz[9:18].mean(axis=0).tolist()
    else:values=np.ones(len(xyz))
    for p,w in zip(xyz,values):
        if w>0:weights[','.join(str(round(float(v)*10000)) for v in p)]=round(float(w),5)
result={'version':1,'pivot':pivot,'beakTip':beak,'weights':weights,'note':'仅头、眼、喙与柔性颈部；身体及脚不参与头部关节。'}
out=ROOT/'tropical-shallows/site/assets/realtime/bird-rig.json';out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('BIRD_RIG',len(weights),out.stat().st_size,pivot,beak,flush=True)
