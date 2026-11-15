"""后台重新打开 .blend 后验证拆分资产；不保存测试中的临时转动。"""
import bpy
import json
import math
from pathlib import Path
from mathutils.bvhtree import BVHTree

root=Path(__file__).resolve().parents[2]
source=root/'model/bird/build_model.py'
assert bpy.data.texts['build_model.py'].as_string()==source.read_text(encoding='utf8')
namespace={'__file__':str(source),'__name__':'bird_saved_verification'}
exec(compile(source.read_text(encoding='utf8'),str(source),'exec'),namespace)
# 前颈羽毛应沿截面外法线抬起，不能因颈部弯曲而埋入体内。
for i in range(36):
    s=.50+i*.01
    centre=namespace['body_point'](s,math.pi*.5)
    for j in range(17):
        a=math.pi-.8+j*.1
        p,_,normal=namespace['body_surface'](s,a,0)
        radial=p-namespace['Vector']((0,centre.y,centre.z))
        assert normal.dot(radial)>0, 'Front neck feather normal points into body'
# 沿喉部至喙根的腹侧轮廓不应反向折回，避免下巴出现尖折凹口。
chin=[namespace['body_point'](.80+i*.002,math.pi) for i in range(101)]
assert all(b.y<=a.y+.00002 and b.z>=a.z-.00002 for a,b in zip(chin,chin[1:])), 'Chin contour folds back'
parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent and o.parent.name=='Male']
animated=[o for o in parts if o.data.shape_keys]
assert all(all(abs(o.data.shape_keys.key_blocks[n].value)<1e-6 for n in ('S1','S2','S3')) for o in animated)

for side in ('L','R'):
    for part in ('Shoulder','Coverts','Secondaries','Primaries'):
        obj=bpy.data.objects['M_'+part+side]
        assert all(obj.data is not other.data for other in parts if other!=obj)
        if part in ('Secondaries','Primaries'):
            assert all(g.name.endswith('.'+side) for g in obj.vertex_groups)
            assert len(json.loads(obj['feather_roots_model']))==len(obj.vertex_groups)

body=bpy.data.objects['M_Body'];breast=bpy.data.objects['M_Breastplate']
body_points=[body.matrix_world@v.co for v in body.data.vertices]
tree=BVHTree.FromPolygons(body_points,[p.vertices for p in body.data.polygons])
folded=[breast.matrix_world@v.co for v in breast.data.vertices]
folded_width=max(p.x for p in folded)-min(p.x for p in folded)
body_width=max(p.x for p in body_points)-min(p.x for p in body_points)
folded_gap=max(tree.find_nearest(p)[3] for p in folded)
assert folded_gap<.008, 'Resting breast feathers float away from chest'
assert folded_width<body_width*.85, 'Resting breast still forms a wide display fan'
expanded=[breast.matrix_world@v.co for v in breast.data.shape_keys.key_blocks['S3'].data]
assert max(p.x for p in expanded)-min(p.x for p in expanded)>folded_width*2, 'Display breast cannot expand'
tail=bpy.data.objects['M_Tail']
assert len([g for g in tail.vertex_groups if g.name.startswith('Tail_')])==10
assert len(json.loads(tail['feather_roots_model']))==10
for side in ('L','R'):
    eye=bpy.data.objects['M_Eye'+side]
    assert len(eye.data.materials)==3
    assert {p.material_index for p in eye.data.polygons}=={0,1,2}
    for lid in ('Upper','Lower'):
        obj=bpy.data.objects['M_Eyelid'+lid+side]
        assert obj.data is not eye.data
        assert (obj.location-eye.location).length<1e-7
        assert obj.data.shape_keys and len(obj.data.shape_keys.key_blocks)==4
assert 'M_TailBase' in bpy.data.objects
for name in ('M_RumpCoverts','M_UndertailCoverts'):
    obj=bpy.data.objects[name]
    ids={obj.vertex_groups[n].index for n in ('Torso','TailBase')}
    assert all(abs(sum(g.weight for g in v.groups if g.group in ids)-1)<1e-5 for v in obj.data.vertices)

# 验证下喙确实能绕自身原点转动，上喙不联动；随后恢复，不写回磁盘。
upper=bpy.data.objects['M_BeakUpper'];lower=bpy.data.objects['M_BeakLower']
bpy.context.view_layer.update()
# 两侧闭合喙缝在侧视投影中应为平顺直线，防止再次出现 S 形。
for edge in (0,16):
    seam=[upper.matrix_world@upper.data.vertices[row*17+edge].co for row in range(25)]
    dy=seam[-1].y-seam[0].y;dz=seam[-1].z-seam[0].z
    assert max(abs((p.y-seam[0].y)*dz-(p.z-seam[0].z)*dy)/math.hypot(dy,dz) for p in seam)<1e-6
    assert 0<=math.atan2(dz,abs(dy))<math.radians(8), 'Resting bill tilts upward too far'
before_upper=upper.matrix_world@upper.data.vertices[-1].co
before_lower=lower.matrix_world@lower.data.vertices[-1].co
pivot=lower.matrix_world.translation.copy()
rotation=lower.rotation_euler.copy()
try:
    lower.rotation_euler.x+=math.radians(15)
    bpy.context.view_layer.update()
    after_lower=lower.matrix_world@lower.data.vertices[-1].co
    assert (after_lower-before_lower).length>.001
    assert (upper.matrix_world@upper.data.vertices[-1].co-before_upper).length<1e-8
    assert (lower.matrix_world.translation-pivot).length<1e-8
finally:
    lower.rotation_euler=rotation
    bpy.context.view_layer.update()

report={'saved_state':'PASS: resting pose','embedded_source':'PASS','independent_meshes':'PASS',
        'left_right_groups':'PASS','tail_groups':10,'lower_jaw_pivot_rotation':'PASS; restored without saving',
        'external_head_parts':'PASS: pupil/iris/outer rim and independent upper/lower eyelids',
        'bill_side_seam':'PASS: no S bend in closed seam projection',
        'resting_bill_pitch':'PASS: closed seam rises less than 8 degrees',
        'front_neck_normals':'PASS: 612 samples point outwards',
        'chin_contour':'PASS: 101 samples without reverse fold',
        'folded_breast':'PASS: hugs chest, narrower than torso; display shape retained',
        'folded_breast_max_gap':folded_gap,'folded_breast_width':folded_width,
        'mesh_count':len(parts),'animated_meshes':len(animated),
        'scope':'Bind-pose preparation only; no full rig, walking or flight animation verification'}
(root/'work/bird-model/saved-model-check.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('SAVED_PARTS_PASS',json.dumps(report))
