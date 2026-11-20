"""只读调查地面接触、枝叶拓扑与前景构造。"""
import bpy,json,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'work/tropical-shallows/realtime-prepared.blend'))
sc=bpy.context.scene;dg=bpy.context.evaluated_depsgraph_get()
ground=[BVHTree.FromObject(sc.objects[n],dg) for n in ('连续浅海沙床与湿干沙滩','前景砂砾真实高度面')]
def bed(x,y):
    hits=[t.ray_cast(Vector((x,y,20)),Vector((0,0,-1)),60)[0] for t in ground]
    z=[h.z for h in hits if h is not None];return max(z) if z else None
report={'rocks':[],'objects':[]}
for ob in sc.objects:
    if ob.type!='MESH' or ob.hide_render:continue
    box=[ob.matrix_world@Vector(p) for p in ob.bound_box]
    low=np.min([p.z for p in box]);high=np.max([p.z for p in box])
    if any(s in ob.name for s in ['礁','叶','枝','椰树','椰果','海星','螺壳','滨鹬','蟹','基础']):
        report['objects'].append({'name':ob.name,'vertices':len(ob.data.vertices),'bounds':[[min(p[i] for p in box) for i in range(3)],[max(p[i] for p in box) for i in range(3)]]})
    if any(s in ob.name for s in ['真实侵蚀礁岸','散落潮间礁石','潮礁基底','远海低礁']):
        tree=BVHTree.FromObject(ob,dg);samples=[]
        for x in np.linspace(min(p.x for p in box),max(p.x for p in box),13):
            for y in np.linspace(min(p.y for p in box),max(p.y for p in box),13):
                b=bed(float(x),float(y))
                if b is None:continue
                # FromObjectBVH使用对象局部坐标；转换整条射线。
                inv=ob.matrix_world.inverted();origin=inv@Vector((x,y,b+.005));direction=(inv.to_3x3()@Vector((0,0,1))).normalized()
                hit=tree.ray_cast(origin,direction,40)[0]
                if hit is not None:
                    p=ob.matrix_world@hit;gap=p.z-b
                    if gap>0:samples.append(float(gap))
        report['rocks'].append({'name':ob.name,'sampledPositiveGaps':len(samples),'maxGap':max(samples,default=0),'medianGap':float(np.median(samples)) if samples else 0})
(ROOT/'work/tropical-shallows/connection-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'rocks':report['rocks'],'objects':[o for o in report['objects'] if o['name'] in ('鸡蛋花分叉木枝','参考方向垂落椰羽','垂落椰叶中轴','照片纹理弯曲鸡蛋花叶')]},ensure_ascii=False),flush=True)
