"""重开合理化工程，独立检查叶片附着点和新增根基真实接触。"""
import bpy,numpy as np,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'work/tropical-shallows/realtime-grounded.blend'))
sc=bpy.context.scene;dg=bpy.context.evaluated_depsgraph_get()
def tree(ob):return (ob.matrix_world.copy(),BVHTree.FromObject(ob,dg))
ground=[tree(sc.objects[n]) for n in ('连续浅海沙床与湿干沙滩','前景砂砾真实高度面')]
def height(x,y):
    zs=[]
    for m,t in ground:
        inv=m.inverted();p=t.ray_cast(inv@Vector((x,y,20)),(inv.to_3x3()@Vector((0,0,-1))).normalized(),80)[0]
        if p is not None:zs.append((m@p).z)
    if not zs:raise RuntimeError('缺少沙床')
    return max(zs)
branches=[tree(sc.objects[n]) for n in ('合理化_连续树干分枝','合理化_连接叶柄')]
points=np.load(ROOT/'work/tropical-shallows/leaf-attachment-points.npy');distances=[]
leaf_matrix,leaf_tree=tree(sc.objects['照片纹理弯曲鸡蛋花叶']);leaf_surface_gaps=[]
for p in points:
    p=Vector(p);ds=[]
    leaf_point=leaf_tree.find_nearest(leaf_matrix.inverted()@p)[0]
    leaf_surface_gaps.append((leaf_matrix@leaf_point-p).length)
    for m,t in branches:
        q=t.find_nearest(m.inverted()@p)[0]
        if q is not None:ds.append((m@q-p).length)
    distances.append(min(ds))
report=json.loads((ROOT/'work/tropical-shallows/rationalization-report.json').read_text(encoding='utf8'))
roots=[]
for r in report['treeRoots']:
    p=Vector(r['position']);roots.append({'name':r['name'],'gap':p.z-height(p.x,p.y)})
supports=[];finite=True
for ob in sc.objects:
    if ob.type!='MESH' or not ob.name.startswith('合理化_'):continue
    coords=np.empty(len(ob.data.vertices)*3,np.float32);ob.data.vertices.foreach_get('co',coords);coords=coords.reshape(-1,3)
    if not np.isfinite(coords).all():finite=False
    if '接地岩基' in ob.name:
        # 每个底层顶点都是实际网格；抽样核对与保存沙床之间的埋入量。
        flags=np.empty(len(coords),dtype=bool);ob.data.attributes['rock_base_contact'].data.foreach_get('value',flags)
        bottom=coords[flags];stride=max(1,len(bottom)//300)
        gaps=[float(p[2])-height(float(p[0]),float(p[1])) for p in bottom[::stride]]
        supports.append({'name':ob.name,'samples':len(gaps),'highestBottomGap':max(gaps),'lowestBottomGap':min(gaps)})
axes=sc.objects['垂落椰叶中轴'];rachis=tree(sc.objects['合理化_顶部椰羽接冠']);axisgaps=[]
for j in range(3):
    p=sum((axes.matrix_world@axes.data.vertices[i].co for i in range(j*287,j*287+7)),Vector())/7
    q=rachis[1].find_nearest(rachis[0].inverted()@p)[0];axisgaps.append((rachis[0]@q-p).length)
def world_points(ob):
    return np.array([ob.matrix_world@v.co for v in ob.data.vertices])
head=sc.objects['写实滨鹬头'];eye=sc.objects['写实滨鹬眼'];eye_center=Vector(world_points(eye).mean(axis=0));ht=tree(head)
eye_head_gap=(ht[0]@ht[1].find_nearest(ht[0].inverted()@eye_center)[0]-eye_center).length
thorax=sc.objects['合理化_寄居蟹胸部'];crab_head=sc.objects['写实蟹头']
def world_tree(ob):return BVHTree.FromPolygons(world_points(ob),[list(p.vertices) for p in ob.data.polygons])
head_body_overlap=bool(world_tree(thorax).overlap(world_tree(crab_head)))
leg=sc.objects['真实节肢蟹腿'];parent=list(range(len(leg.data.vertices)))
def find(a):
    while parent[a]!=a:parent[a]=parent[parent[a]];a=parent[a]
    return a
for edge in leg.data.edges:
    a,b=map(find,edge.vertices)
    if a!=b:parent[b]=a
components={}
for i in range(len(parent)):components.setdefault(find(i),[]).append(i)
leg_points=world_points(leg);leg_roots=[]
for ids in components.values():
    if len(ids)==36:leg_roots.append(Vector(leg_points[ids[:9]].mean(axis=0)))
leg_roots_inside=[(thorax.matrix_world.inverted()@p).length<.99 for p in leg_roots]
checks={'saved_corrected_scene':sc.get('rationalized_version')==1,'all_leaf_roots_touch_stems':max(distances)<.012,
    'attachment_points_on_actual_leaves':max(leaf_surface_gaps)<.004,
    'all_tree_roots_enter_sand':all(-.08<r['gap']<.005 for r in roots),
    'all_added_rock_bases_enter_bed':all(s['highestBottomGap']<.005 and s['lowestBottomGap']>-.12 for s in supports),
    'three_overhead_fronds_connected':max(axisgaps)<.012,'finite_added_geometry':finite,
    'bird_eye_attached_to_head':eye_head_gap<.006,'crab_head_meets_thorax':head_body_overlap,
    'six_leg_roots_enter_thorax':len(leg_roots)==6 and all(leg_roots_inside)}
out={'checks':checks,'leafCount':len(points),'maximumLeafAttachmentGap':max(distances),'maximumLeafSurfaceGap':max(leaf_surface_gaps),'treeRoots':roots,'rockBases':supports,'overheadAttachmentGaps':axisgaps,'birdEyeHeadGap':eye_head_gap,'crabLegRootsInsideThorax':leg_roots_inside,'note':'保存网格的接触检查，不代替浏览器整体视觉检查或90%评分。'}
(ROOT/'work/tropical-shallows/connection-verification.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(out,ensure_ascii=False),flush=True)
assert all(checks.values()),'保存后的连接检查未通过'
