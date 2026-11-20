"""最小结构补全：接地岩基、树根、连续分枝、叶柄及花梗。"""
import bpy, math, json, numpy as np
from pathlib import Path
from collections import defaultdict
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils import noise
ROOT=Path(__file__).resolve().parent.parent

class Tubes:
    def __init__(self):self.vertices=[];self.faces=[];self.segments=[]
    def add(self,points,radii,sides=6):
        points=[Vector(p) for p in points];start=len(self.vertices)
        for i,(p,r) in enumerate(zip(points,radii)):
            direction=points[min(i+1,len(points)-1)]-points[max(0,i-1)]
            if direction.length<1e-7:direction=Vector((0,0,1))
            direction.normalize();u=direction.cross(Vector((0,0,1)))
            if u.length<.01:u=direction.cross(Vector((1,0,0)))
            u.normalize();v=direction.cross(u)
            for j in range(sides):self.vertices.append(p+r*(u*math.cos(j*2*math.pi/sides)+v*math.sin(j*2*math.pi/sides)))
        for i in range(len(points)-1):
            for j in range(sides):
                a=start+i*sides+j;b=start+i*sides+(j+1)%sides
                self.faces.append((a,b,b+sides,a+sides))
            self.segments.append((points[i],points[i+1],radii[i],radii[i+1]))
        self.faces.append(tuple(start+j for j in reversed(range(sides))))
        last=start+(len(points)-1)*sides;self.faces.append(tuple(last+j for j in range(sides)))
    def finish(self,name,mat):return mesh(name,self.vertices,self.faces,mat)

def mesh(name,vertices,faces,mat):
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(ob);me.materials.append(mat)
    for p in me.polygons:p.use_smooth=True
    return ob

def world_vertices(ob):
    xyz=np.empty(len(ob.data.vertices)*3,np.float32);ob.data.vertices.foreach_get('co',xyz);xyz=xyz.reshape(-1,3)
    matrix=np.array(ob.matrix_world,dtype=np.float32)
    return xyz@matrix[:3,:3].T+matrix[:3,3]

def component_roots(ob):
    """沿真实网格连通片和叶/瓣UV的纵向起点取附着点，非包围盒猜测。"""
    me=ob.data;n=len(me.vertices);parent=np.arange(n,dtype=np.int32)
    def find(a):
        while parent[a]!=a:parent[a]=parent[parent[a]];a=parent[a]
        return a
    edges=np.empty(len(me.edges)*2,np.int32);me.edges.foreach_get('vertices',edges)
    for a,b in edges.reshape(-1,2):
        a=find(a);b=find(b)
        if a!=b:parent[b]=a
    for i in range(n):parent[i]=find(i)
    uv=me.uv_layers.active
    loop_vertices=np.empty(len(me.loops),np.int32);me.loops.foreach_get('vertex_index',loop_vertices)
    coords=np.empty(len(me.loops)*2,np.float32);uv.data.foreach_get('uv',coords)
    vv=np.ones(n,np.float32);vv[loop_vertices]=coords.reshape(-1,2)[:,1]
    xyz=world_vertices(ob);order=np.argsort(parent);boundaries=np.flatnonzero(np.diff(parent[order]))+1
    result=[]
    for indices in np.split(order,boundaries):
        if len(indices)<3:continue
        low=float(vv[indices].min());root=indices[vv[indices]<=low+.0001]
        result.append(xyz[root].mean(axis=0))
    return np.array(result,dtype=np.float32)

def nearest(point,segments):
    p=Vector(point);best=None;distance=1e20
    for a,b,*_ in segments:
        d=b-a;t=max(0,min(1,(p-a).dot(d)/max(d.length_squared,1e-12)));q=a+d*t
        if (p-q).length_squared<distance:distance=(p-q).length_squared;best=q
    return best

def footprint(vertices):
    points=sorted(set((float(p[0]),float(p[1])) for p in vertices))
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower=[];upper=[]
    for p in points:
        while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    hull=np.array(lower[:-1]+upper[:-1]);closed=np.vstack((hull,hull[:1]));length=np.linalg.norm(np.diff(closed,axis=0),axis=1);distance=np.r_[0,np.cumsum(length)]
    samples=np.linspace(0,distance[-1],max(24,min(300,int(distance[-1]/.065))),endpoint=False)
    return np.column_stack([np.interp(samples,distance,closed[:,i]) for i in (0,1)])

def apply(scene):
    if scene.get('rationalized_version')==1:return
    dg=bpy.context.evaluated_depsgraph_get()
    ground=[]
    for name in ('连续浅海沙床与湿干沙滩','前景砂砾真实高度面'):
        ob=scene.objects[name];ground.append((ob.matrix_world.copy(),BVHTree.FromObject(ob,dg)))
    def bed(x,y):
        heights=[]
        for matrix,tree in ground:
            inv=matrix.inverted();hit=tree.ray_cast(inv@Vector((x,y,20)),(inv.to_3x3()@Vector((0,0,-1))).normalized(),80)[0]
            if hit is not None:heights.append((matrix@hit).z)
        if not heights:raise RuntimeError(f'沙床采样缺失：{x},{y}')
        return max(heights)
    report={'rocks':[],'leafRoots':0,'flowerStalks':0,'treeRoots':[],'removedRepeatedOffshoreRocks':[],'note':'最小结构合理化；不改变水动画和参考机位。'}
    # 主礁下部使用连续侵蚀岩基，覆盖原模型悬空的下表面；不移动上部剪影。
    mat=bpy.data.materials.new('合理化_潮湿侵蚀岩基');mat.use_nodes=True;nt=mat.node_tree;bs=nt.nodes.get('Principled BSDF')
    ns=nt.nodes.new('ShaderNodeTexNoise');ns.inputs['Scale'].default_value=6.5;ns.inputs['Detail'].default_value=3
    tc=nt.nodes.new('ShaderNodeTexCoord');nt.links.new(tc.outputs['Object'],ns.inputs['Vector'])
    ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.085,.069,.047,1);ramp.color_ramp.elements[1].color=(.30,.27,.21,1)
    nt.links.new(ns.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.94
    image=next((i for i in bpy.data.images if 'coast_land_rocks_03_diff' in i.name),None)
    if image is None:image=bpy.data.images.load(str(ROOT/'tropical-shallows/assets/rock_pitted_mossy_diff_2k.jpg'),check_existing=True)
    tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image;tex.projection='BOX';tex.projection_blend=.25
    mapping=nt.nodes.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=.55;nt.links.new(tc.outputs['Object'],mapping.inputs[0]);nt.links.new(mapping.outputs[0],tex.inputs['Vector'])
    tint=nt.nodes.new('ShaderNodeHueSaturation');tint.inputs['Saturation'].default_value=.30;tint.inputs['Value'].default_value=.80;nt.links.new(tex.outputs['Color'],tint.inputs['Color'])
    mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.92,.82,.72,1);nt.links.new(tint.outputs[0],mix.inputs[1]);nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
    for ob in list(scene.objects):
        if ob.type!='MESH' or not any(ob.name.startswith(s) for s in ('真实侵蚀礁岸','散落潮间礁石','潮礁基底与前缘块石','远海低礁')):continue
        if ob.name.startswith('远海低礁') and ob.name not in ('远海低礁_00','远海低礁_04'):
            report['removedRepeatedOffshoreRocks'].append(ob.name);bpy.data.objects.remove(ob,do_unlink=True);continue
        vertices=world_vertices(ob);low=vertices[:,2].min();height=np.ptp(vertices[:,2]);candidates=vertices[vertices[:,2]<low+max(.08,height*.14)]
        if len(candidates)>350:candidates=candidates[np.linspace(0,len(candidates)-1,350,dtype=int)]
        minimum=min(float(p[2])-bed(float(p[0]),float(p[1])) for p in candidates)
        shift=0
        # 小块石只需适量埋入沙床；远海礁保持水面轮廓，用下部岩根接海底。
        if minimum>.025 and ob.name.startswith('散落潮间礁石'):
            shift=minimum+.025;ob.location.z-=shift;vertices[:,2]-=shift
        add_base=ob.name.startswith(('真实侵蚀礁岸','潮礁基底与前缘块石','远海低礁'))
        entry={'name':ob.name,'minimumGroundGapBefore':minimum,'loweredMetres':shift,'support':None}
        if add_base:
            matrix=ob.matrix_world.copy();tree=BVHTree.FromObject(ob,bpy.context.evaluated_depsgraph_get());inv=matrix.inverted()
            outline=footprint(vertices);center=outline.mean(axis=0);top=[]
            for xy in outline:
                position=None
                for fraction in (.985,.94,.86,.72,.5):
                    p=center+(xy-center)*fraction;z=bed(float(p[0]),float(p[1]));hit=tree.ray_cast(inv@Vector((p[0],p[1],z-0.12)),(inv.to_3x3()@Vector((0,0,1))).normalized(),30)[0]
                    if hit is not None:position=np.array(matrix@hit);break
                if position is None:position=np.array([p[0],p[1],max(z,float(vertices[:,2].min()))])
                position[2]=max(position[2],z)+.075;top.append(position)
            top=np.array(top);n=len(top);verts=[];faces=[];contact=[]
            if ob.name.startswith('远海'):top[:,2]=np.minimum(top[:,2],-.25)
            layers=max(8,min(40,int((max(top[:,2])-bed(float(center[0]),float(center[1])))/.085)+1))
            if ob.name.startswith('远海'):layers=8
            # 连续、不规则、向海床展开的岩体，取代竖直栅格侧墙。
            for layer,t in enumerate(np.linspace(0,1,layers)):
                for j,p in enumerate(top):
                    radial=p[:2]-center;radial/=max(np.linalg.norm(radial),.001)
                    depth=max(.2,p[2]-bed(float(p[0]),float(p[1])))
                    spread=min(1.55,.17+depth*.42)
                    rough=.045*math.sin(j*2.13+layer*1.4)*math.sin(math.pi*t)
                    xy=p[:2]+radial*(spread*t**.7+rough)
                    floor=bed(float(xy[0]),float(xy[1]))-.065
                    z=(1-t)*p[2]+t*floor
                    lump=noise.noise_vector(Vector((xy[0]*8,xy[1]*8,z*8)))*(.052*math.sin(math.pi*t))
                    xy+=np.array([lump.x,lump.y]);z+=lump.z
                    verts.append((float(xy[0]),float(xy[1]),float(z)));contact.append(layer==layers-1)
            for layer in range(layers-1):
                for j in range(n):
                    a=layer*n+j;b=layer*n+(j+1)%n;faces.append((a+n,b+n,b,a))
            top_center=len(verts);verts.append(tuple(top.mean(axis=0)));contact.append(False)
            bottom_center=len(verts);verts.append((float(center[0]),float(center[1]),bed(float(center[0]),float(center[1]))-.065));contact.append(True)
            for j in range(n):faces.extend([(top_center,j,(j+1)%n),(bottom_center,(layers-1)*n+(j+1)%n,(layers-1)*n+j)])
            support=mesh('合理化_接地岩基_'+ob.name,verts,faces,mat)
            attr=support.data.attributes.new('rock_base_contact','BOOLEAN','POINT');attr.data.foreach_set('value',contact)
            entry['support']=support.name;entry['supportVertices']=len(verts)
        report['rocks'].append(entry)
    # 叶片位置保留；从叶片真实连通片起点建立连续的根->干->枝->叶柄。
    leaves=scene.objects['照片纹理弯曲鸡蛋花叶'];roots=component_roots(leaves);report['leafRoots']=len(roots)
    bark=bpy.data.materials.get('鸡蛋花褐色枝皮');wood=Tubes();petioles=Tubes()
    camera=Vector((0,-14,2.15));near=lambda p:camera+(Vector(p)-camera)*.48
    near_centers=[near(p) for p in [(2.1,-9.7,1.1),(2.7,-8.8,2.1),(2.2,-8,3.2),(3.3,-6.8,4.3),(2,-6.8,3.8)]]
    main=[near(p) for p in [(4,-10.3,.2),(4,-9.4,1.6),(4,-8.3,3.5),(4.4,-6.8,4.6)]]
    root=main[0].copy();root.z=bed(root.x,root.y)-.035;main.insert(0,root)
    wood.add(main,[.045,.029,.025,.019,.008],9)
    for c in near_centers:
        start=nearest(c,wood.segments);middle=start.lerp(c,.52)+Vector((0,0,.07));wood.add([start,middle,c],[.016,.010,.0045],7)
    report['treeRoots'].append({'name':'近景鸡蛋花','position':list(root),'ground':bed(root.x,root.y)})
    for name in ('鸡蛋花分叉木枝','细分鸡蛋花叶柄'):
        if scene.objects.get(name):bpy.data.objects.remove(scene.objects[name],do_unlink=True)
    back=[((-2,12.5,3.9),2.3,1.8),((.7,14.3,5),2.7,2),((3,16,5.5),2.7,2.2),((8.2,20,5),3,2.1),((12,13.5,4),2.8,2.2),((5.7,8,2),1.3,1)]
    centers=near_centers+[Vector(c) for c,_,_ in back]
    scales=[Vector((.35,.35,.35)) for _ in near_centers]+[Vector((rx,rx,rz)) for _,rx,rz in back]
    skeletons=[list(wood.segments) for _ in near_centers]
    for ci,(c,rx,rz) in enumerate(back):
        c=Vector(c);start=Vector((c.x,c.y,bed(c.x,c.y)-.04));mid=Vector((c.x+.11,c.y-.08,c.z-.55));top=c+Vector((.07,.04,.45));begin=len(wood.segments)
        wood.add([start,start.lerp(mid,.52),mid,top],[.085,.065,.04,.015],8)
        for j in range(7):
            angle=j*2*math.pi/7+.4*ci;tip=c+Vector((math.cos(angle)*rx*.68,math.sin(angle)*rx*.68,math.sin(angle+.3)*rz*.35))
            wood.add([mid,mid.lerp(tip,.55)+Vector((0,0,.2)),tip],[.026,.018,.006],6)
        skeletons.append(wood.segments[begin:]);report['treeRoots'].append({'name':f'后方灌丛{ci}','position':list(start),'ground':bed(start.x,start.y)})
    groups=defaultdict(list)
    for point in roots:
        ci=min(range(len(centers)),key=lambda i:sum(((Vector(point)-centers[i])[k]/scales[i][k])**2 for k in range(3)))
        size=.13 if ci<5 else .44;cell=tuple(math.floor((float(point[k])-centers[ci][k])/size) for k in range(3));groups[ci,cell].append(point)
    for (ci,_),points in groups.items():
        hub=Vector(np.mean(points,axis=0));start=nearest(hub,skeletons[ci]);twig=hub-start
        if twig.length>.02:
            wood.add([start,start.lerp(hub,.5)+Vector((0,0,.025)),hub],[.008,.005,.0028],5)
        for p in points:
            p=Vector(p)
            if (p-hub).length<.002:petioles.add([hub-Vector((0,0,.006)),p],[.0024,.0018],5)
            else:petioles.add([hub,hub.lerp(p,.65)+Vector((0,0,.008)),p],[.003,.0022,.0015],5)
    # 每朵花的五瓣起点重合，去重后补一根短花梗。
    flowers=component_roots(scene.objects['弯曲五瓣鸡蛋花']);seen=set()
    for p in flowers:
        key=tuple(round(float(v),3) for v in p)
        if key in seen:continue
        seen.add(key);p=Vector(p);c=min(near_centers,key=lambda c:(p-c).length_squared)
        wood.add([c,c.lerp(p,.65)+Vector((0,0,.012)),p],[.0034,.0025,.0015],5);report['flowerStalks']+=1
    wood_ob=wood.finish('合理化_连续树干分枝',bark);petiole_ob=petioles.finish('合理化_连接叶柄',bark)
    # 顶部三片取景用椰羽原来只有叶轴；补一个位于右侧画外的弯干和冠部连接。
    axes=scene.objects['垂落椰叶中轴'];axis_points=world_vertices(axes)
    assert len(axis_points)==3*41*7,'顶部叶轴布局变化，需重新检查根部'
    palm=Tubes();rachis=Tubes();base=Vector((7,-7,bed(7,-7)-.04));crown=Vector((-1.8,-4.3,8.4))
    c1=base+Vector((-.4,.1,4));c2=crown+Vector((2,0,0));points=[]
    for t in np.linspace(0,1,25):points.append((1-t)**3*base+3*(1-t)**2*t*c1+3*(1-t)*t*t*c2+t**3*crown)
    palm.add(points,[.15*(1-i/32) for i in range(25)],10)
    for j in range(3):
        end=Vector(axis_points[j*41*7:j*41*7+7].mean(axis=0));middle=crown.lerp(end,.55)+Vector((0,0,.08))
        rachis.add([crown,middle,end],[.045,.037,.031],7)
    palm.finish('合理化_画外接地椰树',bpy.data.materials.get('椰干斑驳树皮') or bark)
    rachis.finish('合理化_顶部椰羽接冠',bpy.data.materials.get('叶绿0') or bark)
    report['treeRoots'].append({'name':'顶部椰羽所属椰树','position':list(base),'ground':bed(base.x,base.y)})
    report['overheadFrondsConnected']=3
    # 海岸木廊的承重柱补到实际砂地，地上部分不变。
    footings=Tubes();plank=bpy.data.materials.get('柚木纵向纤维') or bark
    for ob in scene.objects:
        if not ob.name.startswith('开放木廊承重柱'):continue
        vv=world_vertices(ob);bottom=vv[:,2].min();center=vv.mean(axis=0);z=bed(float(center[0]),float(center[1]))
        if bottom>z+.025:footings.add([(center[0],center[1],z-.05),(center[0],center[1],bottom+.08)],[.10,.10],4)
    if footings.vertices:footings.finish('合理化_木廊接地柱脚',plank)
    # 细小前景部件只修接合：鸟眼嵌入头表面，蟹胸部连接头、足根和壳口。
    head=scene.objects['写实滨鹬头'];eye=scene.objects['写实滨鹬眼'];head_tree=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())
    eye_xyz=world_vertices(eye);eye_center=Vector(eye_xyz.mean(axis=0));radius=float(np.linalg.norm(eye_xyz-np.array(eye_center),axis=1).max())
    hit,normal,_,_=head_tree.find_nearest(head.matrix_world.inverted()@eye_center);world_hit=head.matrix_world@hit;gap=(eye_center-world_hit).length
    if gap>radius*.85:
        normal=(head.matrix_world.to_3x3().inverted().transposed()@normal).normalized()
        eye.matrix_world.translation+=world_hit+normal*.002-eye_center
    report['birdEyeGapBefore']=gap
    crab_center=world_vertices(scene.objects['写实蟹头']).mean(axis=0)+np.array((.11,.09,.03))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=tuple(crab_center))
    thorax=bpy.context.object;thorax.name='合理化_寄居蟹胸部';thorax.scale=(.16,.12,.08);thorax.data.materials.append(bpy.data.materials['朱红寄居蟹甲壳'])
    for p in thorax.data.polygons:p.use_smooth=True
    report['crabThoraxAdded']=True
    report['newBranches']=len(wood.segments);report['newPetioleSegments']=len(petioles.segments)
    report['generatedTriangles']=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH' and o.name.startswith('合理化_'))
    scene['rationalized_version']=1
    (ROOT/'work/tropical-shallows/rationalization-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    # 逐叶附着点给独立验证器使用，验证器重新在保存网格上查接触。
    np.save(ROOT/'work/tropical-shallows/leaf-attachment-points.npy',roots)
    print('RATIONALIZED',json.dumps({k:report[k] for k in ('leafRoots','flowerStalks','newBranches','newPetioleSegments','generatedTriangles')},ensure_ascii=False),flush=True)
    return report
