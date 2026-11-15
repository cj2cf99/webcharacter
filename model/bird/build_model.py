"""极乐鸟结构预览。仅在独立场景运行；不依赖 work 内的旧源码。

blender --background --factory-startup --python model/bird/build_model.py -- --preview
坐标沿用粗模：Z 向上，-Y 朝前，脚底 Z=0。
"""
import bpy
import bmesh
import math
import json
import sys
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'work/bird-model'
PARTS = []
STAGES = ('S1', 'S2', 'S3')
R = math.radians


def clamp(x, a=0., b=1.):
    return min(b, max(a, x))


def smooth(x):
    x = clamp(x)
    return x*x*(3-2*x)


def about(p, a):
    return Matrix.Translation(p) @ Matrix.Rotation(R(a), 4, 'X') @ Matrix.Translation(-Vector(p))


HIP = Vector((0, 0, .14))
HN = Vector((0, -.118, .405))
BODY = [Matrix.Identity(4), about(HIP, -25), about(HIP, -45),
        Matrix.Translation((0, .06, 0)) @ about(HIP, -48)]
HEAD = [Matrix.Identity(4)] + [Matrix.Translation(p) @ Matrix.Rotation(R(a), 4, 'X') @ Matrix.Translation(-HN)
        for p, a in [((0, -.10, .455), -20), ((0, -.045, .50), -45), ((0, -.01, .45), 18)]]
DISPLAY_HEAD = HEAD[3].copy()
# 原粗模的展开态头部藏入披肩，只保留蓝色展示眼点。
HEAD[3] = HEAD[3] @ Matrix.Translation(HN) @ Matrix.Scale(.10, 4) @ Matrix.Translation(-HN)


def deform(p, stage, head_weight=0.):
    return (BODY[stage] @ p).lerp(HEAD[stage] @ p, head_weight)


def body_binding(s):
    head=smooth((s-.62)/.16)
    neck=smooth((s-.40)/.18)*(1-head)
    return (1-head-neck,neck,head)


def mesh(name, positions, faces, uv, material, root, animated=True, pivot=None, bindings=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(positions[0], [], faces)
    me.update()
    me.materials.append(material)
    layer = me.uv_layers.new(name='FeatherUV')
    tone = me.color_attributes.new(name='FeatherTone', type='FLOAT_COLOR', domain='POINT')
    tone.data.foreach_set('color', [1., 1., 1., 1.] * len(positions[0]))
    for poly in me.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            layer.data[li].uv = uv[me.loops[li].vertex_index]
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    if animated:
        prev = obj.shape_key_add(name='Basis')
        for stage, coords in zip(STAGES, positions[1:]):
            key = obj.shape_key_add(name=stage)
            key.relative_key = prev
            for dst, p in zip(key.data, coords):
                dst.co = p
            prev = key
        PARTS.append(obj)
    if bindings:
        for index,group_name in enumerate(('Torso','Neck','Head')):
            group=obj.vertex_groups.new(name=group_name)
            for vi,weights in enumerate(bindings):
                if weights[index]>.00001:
                    group.add([vi],weights[index],'REPLACE')
    if pivot is not None:
        obj.location=Vector(pivot)
        me.transform(Matrix.Translation(-Vector(pivot)),shape_keys=True)
        me.update()
    obj['animation_pivot']=list(obj.location)
    return obj


def set_stage(stage, frame=None):
    """保留旧动画调用约定；连续值 0..3。"""
    for obj in PARTS:
        for i, name in enumerate(STAGES):
            key = obj.data.shape_keys.key_blocks[name]
            key.value = clamp(stage-i)
            if frame is not None:
                key.keyframe_insert('value', frame=frame)
    bpy.context.view_layer.update()


def material(name, color, feather=False, iridescent=False, flight=False, down=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = .96 if feather else .3
    b.inputs['Specular IOR Level'].default_value = .015 if feather else .45
    if feather:
        tone = nt.nodes.new('ShaderNodeAttribute'); tone.attribute_name = 'FeatherTone'
        b.inputs['Sheen Weight'].default_value = .012
        b.inputs['Sheen Roughness'].default_value = .7
        # 羽枝沿中轴向外倾斜，不用整片 Voronoi 冒充羽毛。
        uv = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(uv.outputs['UV'], sep.inputs[0])
        def op(kind, a, bval):
            n = nt.nodes.new('ShaderNodeMath'); n.operation = kind
            nt.links.new(a, n.inputs[0])
            if isinstance(bval, (float, int)):
                n.inputs[1].default_value = bval
            else:
                nt.links.new(bval, n.inputs[1])
            return n.outputs[0]
        x = op('SUBTRACT', sep.outputs['X'], .5)
        ax = op('ABSOLUTE', x, 0)
        slope = op('MULTIPLY', ax, .32)
        phase = op('ADD',op('MULTIPLY', op('SUBTRACT', sep.outputs['Y'], slope), 210.),op('MULTIPLY',tone.outputs['Alpha'],6.283185))
        barb = op('SINE', phase, 0)
        shaft = op('LESS_THAN', ax, .018)
        height = op('ADD', op('MULTIPLY', barb, .16), shaft)
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .22
        bump.inputs['Distance'].default_value = .00018
        nt.links.new(height, bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
        # 羽缘由羽枝形成细小缺口，避免每片都像实心塑料鳞片。
        cut = op('SUBTRACT', op('MULTIPLY', barb, .022), -.472)
        coverage=op('LESS_THAN', ax, cut)
        if down:
            edge_mask=op('MINIMUM',op('MAXIMUM',op('MULTIPLY',op('SUBTRACT',ax,.20),5.),0.),1.)
            gaps=op('MULTIPLY',op('SUBTRACT',op('MULTIPLY',barb,-.5),-.5),op('MULTIPLY',edge_mask,.85))
            coverage=op('MULTIPLY',coverage,op('SUBTRACT',op('MULTIPLY',gaps,-1.),-1.))
            b.inputs['Sheen Weight'].default_value=.045
            b.inputs['Roughness'].default_value=.88
            b.inputs['Specular IOR Level'].default_value=.04
            bump.inputs['Distance'].default_value=.00013
            bump.inputs['Strength'].default_value=.16
        nt.links.new(coverage, b.inputs['Alpha'])
    if iridescent:
        # 逐羽弧面法线参与视角色带；不是薄膜物理模拟，也不加自发光。
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
        nt.links.new(bump.outputs['Normal'], dot.inputs[0])
        nt.links.new(geo.outputs['Incoming'], dot.inputs[1])
        lobe = op('POWER', op('ABSOLUTE', dot.outputs['Value'], 0), 9.)
        ramp = nt.nodes.new('ShaderNodeMixRGB')
        ramp.inputs[1].default_value = (.001, .025, .12, 1)
        ramp.inputs[2].default_value = (.008, .38, .68, 1)
        nt.links.new(lobe, ramp.inputs[0])
        nt.links.new(ramp.outputs[0], b.inputs['Base Color'])
        b.inputs['Metallic'].default_value = .18
        b.inputs['Roughness'].default_value = .60
        b.inputs['Specular IOR Level'].default_value = .14
        bump.inputs['Strength'].default_value = .11
    if flight:
        b.inputs['Roughness'].default_value=.68
        b.inputs['Specular IOR Level'].default_value=.065
        bump.inputs['Distance'].default_value=.00045
        bump.inputs['Strength'].default_value=.35
        stripe=op('MULTIPLY',op('ADD',op('MULTIPLY',sep.outputs['X'],.25),.75),
                  op('SUBTRACT',op('MULTIPLY',shaft,-.30),-1.0))
        stripe=op('MULTIPLY',stripe,op('ADD',op('MULTIPLY',tone.outputs['Alpha'],.30),.78))
        tint=nt.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
        tint.inputs[1].default_value=(*color,1)
        nt.links.new(stripe,tint.inputs[2]);nt.links.new(tint.outputs[0],b.inputs['Base Color'])
    if feather:
        tint = nt.nodes.new('ShaderNodeMixRGB'); tint.blend_type = 'MULTIPLY'
        tint.inputs[0].default_value = 1
        current = next((l.from_socket for l in nt.links if l.to_socket == b.inputs['Base Color']), None)
        if current:
            nt.links.new(current, tint.inputs[1])
        else:
            tint.inputs[1].default_value = (*color, 1)
        nt.links.new(tone.outputs['Color'], tint.inputs[2])
        nt.links.new(tint.outputs[0], b.inputs['Base Color'])
    return mat


class FeatherBatch:
    """一个部位一个网格；每片羽毛保留同一顶点次序及局部 UV。"""
    def __init__(self):
        self.positions = [[] for _ in range(4)]
        self.faces, self.uv = [], []
        self.tones = []
        self.bindings=[]
        self.groups={}
        self.group_roots={}
        self.count = 0

    def add(self, sample, width, lift=.0007, seed=0., rows=8, rounded=False, exposure=None, tilt=.025, fray=.035, skin=None, group=None):
        base = len(self.uv)
        for j in range(rows+1):
            t = j/rows
            # 圆羽尖、较窄羽根；羽缘有克制的羽枝断口。
            profile = (.32+.68*math.sin(math.pi*t*.85)) * max(.025, (1-t)**.25)
            if rounded:
                profile = (.5+.5*math.sin(math.pi*t*.75))*math.sqrt(max(.0001,1-max(0,(t-.7)/.3)**2))
            if j == rows:
                profile = .012
            samples = [sample(k, t) for k in range(4)]
            for i in range(5):
                u = -1+i*.5
                edge = 1 + fray*(math.sin(t*87+seed)+.30*math.sin(t*213+seed*2.1))*abs(u)**3
                for k in range(4):
                    center, across, n = samples[k]
                    p = center + across*(u*width*.5*profile*edge)
                    p += n*(lift*math.sin(math.pi*t)*(.5+.5*(1-u*u)))
                    p += n*(u*width*.5*profile*tilt*math.sin(seed*3.19))
                    self.positions[k].append(p)
                self.uv.append(((u+1)*.5, t))
                tone = (.94+.06*math.sin(seed*7.13)) * (exposure(t) if exposure else 1.)
                self.tones.append((tone, tone, tone, .15+.85*((seed*.6180339)%1)))
                self.bindings.append(skin(t) if skin else (1.,0.,0.))
        for j in range(rows):
            for i in range(4):
                a = base+j*5+i
                self.faces.append((a, a+1, a+6, a+5))
        self.count += 1
        if group:
            self.groups.setdefault(group,[]).extend(range(base,len(self.uv)))
            if group!='ChestRoots':
                self.group_roots[group]=list(self.positions[0][base+2])

    def finish(self, name, mat, root,pivot=None,bind=False):
        obj = mesh(name, self.positions, self.faces, self.uv, mat, root,pivot=pivot,bindings=self.bindings if bind else None)
        attr = obj.data.color_attributes['FeatherTone']
        for item, color in zip(attr.data, self.tones):
            item.color = color
        obj['feather_count'] = self.count
        for name,indices in self.groups.items():
            obj.vertex_groups.new(name=name).add(indices,1.,'REPLACE')
        if self.group_roots:
            obj['feather_roots_model']=json.dumps(self.group_roots)
        return obj


# 截面参数：中心 Y/Z、半宽、背侧半径、腹侧半径；尾根至喙根。
SECTIONS = [(.135,.155,.0065,.009,.008),(.055,.200,.057,.066,.067),
            (-.012,.240,.074,.074,.083),(-.067,.295,.070,.062,.074),
            (-.095,.355,.041,.039,.037),(-.126,.418,.036,.035,.040),
            (-.163,.432,.027,.018,.019),(-.183,.426,.009,.009,.003)]


def body_point(s, a):
    x = clamp(s)* (len(SECTIONS)-1)
    i = min(len(SECTIONS)-2, int(x)); t = x-i
    vals, gradients = [], []
    for col in range(5):
        p0, p1, p2, p3 = [SECTIONS[min(len(SECTIONS)-1, max(0, j))][col] for j in (i-1, i, i+1, i+2)]
        vals.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
        gradients.append(.5*((-p0+p2)+2*(2*p0-5*p1+4*p2-p3)*t+3*(-p0+3*p1-3*p2+p3)*t*t))
    y,z,w,dorsal,ventral=vals
    # 截面随脊线转向，而不是把竖直圆环堆在一起。
    dy, dz = gradients[:2]
    length = max(1e-8, math.hypot(dy, dz))
    radial = (dorsal if math.cos(a)>=0 else ventral)*math.cos(a)
    p=Vector((w*math.sin(a), y+radial*dz/length, z-radial*dy/length))
    # 只补前颈：两段平缓鼓形连接胸颈与下颌，不推大胸口或后颈。
    fullness=.012*math.exp(-((s-.61)/.07)**2)+.008*math.exp(-((s-.77)/.065)**2)
    p.y-=fullness*max(0,-math.cos(a))**2
    # 下颌腹侧平缓补足，消除喙下至喉部的反折；不改变头顶与喙角。
    p.y-=.008*math.exp(-((s-.906)/.070)**2)*max(0,-math.cos(a))**4
    return p


def body_surface(s, a, stage):
    p = body_point(s, a)
    ds = body_point(clamp(s+.002), a)-body_point(clamp(s-.002), a)
    da = body_point(s, a+.002)-body_point(s, a-.002)
    n = da.cross(ds).normalized()
    # 包含前后分量的实际截面径向判断，避免前颈外法线被翻进体内。
    centre=body_point(s,math.pi*.5)
    if n.dot(Vector((p.x,p.y-centre.y,p.z-centre.z))) < 0:
        n = -n
    hw = smooth((s-.45)/.27)
    point = deform(p, stage, hw)
    across = deform(p+da.normalized()*.01, stage, hw)-point
    normal = deform(p+n*.01, stage, hw)-point
    return point, across.normalized(), normal.normalized()


def cape_point(side, stage, u, v):
    # 保持原有四种整体形态，用同一参数曲面承载独立羽片。
    if stage == 0:
        p, _, n = body_surface(.68-.30*v, side*(.15+.90*u), 0)
        return p+n*(.00025+.00015*v)
    if stage == 1:
        a = R(108+42*u); r = (.1+.9*v)*.36
        return Vector((side*(.07+math.sin(a)*r), .06+.05*v, .36+math.cos(a)*r))
    if stage == 2:
        a = R(-8+120*u); r = (.1+.9*v)*.4
        return Vector((side*(.09+math.sin(a)*r), .04-.1*r*r, .42+math.cos(a)*r))
    a = R(184)*u; r = .02+.98*v; ca = math.cos(a)
    zz = ca*.46 if ca > 0 else -(-ca*.62)/(1+(-ca*.62/.4)**4)**.25
    return Vector((side*(math.sin(a)*.43*r-.03*(1-u)**2),
                   .02+.004*side-.3*r**1.6*abs(math.sin(a))**1.3-.06*r*r*max(ca, 0), .44+zz*r))


def plate_edge(stage, u, v):
    if stage == 0:
        a = R(75)*u
        return Vector((math.sin(a)*.072, -.085-math.cos(a)*.072, .35-.045*v))
    if stage in (1, 2):
        return Vector((u*(.06+.3*v), -.12-(.07 if stage == 1 else .08)*v*(1-u*u),
                       (.315-.06*v*(1-u*u)-.05*(u*v)**2) if stage == 1 else (.33-.035*v-.04*(u*v)**2)))
    zt = .32+.06*u*u
    return Vector((u*.37, -.09-.19*abs(u)**1.6, zt-(.1*max(0, 1-u*u)**.75+.004)*v))


def plate_point(stage, u, v):
    # 羽根与同一身体曲面绑定；黑色根段接至原胸盾，保留蓝色微笑外形。
    if stage == 0:
        # 常态沿胸口收拢贴伏；扇面只保留在后续展示形态。
        p,_,n=body_surface(.60-.20*v,math.pi-u*(.65+.10*math.sin(math.pi*v)),0)
        return p+n*.0009
    root, _, n = body_surface(.60, math.pi-u*.70, stage)
    root += n*.0007
    if v < .45:
        return root.lerp(plate_edge(stage, u, 0), smooth(v/.45))
    return plate_edge(stage, u, (v-.45)/.55)


def surface_sample(fn, k, u, v, offset=0.):
    p = fn(k, u, v)
    a = fn(k, u+.0003, v)-fn(k, u-.0003, v)
    b = fn(k, u, v+.0003)-fn(k, u, v-.0003)
    n = a.cross(b).normalized()
    if n.y > 0:
        n = -n
    return p+n*offset, a.normalized(), n


def blade(batch, root, tip, width, transform, seed=0, rounded=False,roll=0.,group=None,curve=(0,0,0)):
    d = tip-root
    across = d.cross(Vector((0, -1, .2))).normalized()
    across=Matrix.Rotation(R(roll),3,d.normalized())@across
    n = across.cross(d).normalized()
    def sample(k, t):
        p = root+d*t+(n*.003+Vector(curve))*math.sin(math.pi*t)
        q = transform(p, k)
        return q, (transform(p+across*.01, k)-q).normalized(), (transform(p+n*.01, k)-q).normalized()
    batch.add(sample, width, .001, seed,rows=12 if rounded else 8,rounded=rounded,group=group)


def sphere(name, loc, radii, mat, root, head=True, display=False):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1)
    coords = [Vector((v.co.x*radii[0], v.co.y*radii[1], v.co.z*radii[2]))+Vector(loc) for v in bm.verts]
    bm.verts.index_update()
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    positions = []
    for k in range(4):
        points = []
        for p in coords:
            if display and k < 3:
                # 展示眼点只在完全展开时显露，常态藏入头内，不形成四只眼。
                q = HEAD[k] @ (HN+(p-Vector(loc))*.01)
            else:
                q = (DISPLAY_HEAD if display else HEAD[k])@p if head else p
            points.append(q)
        positions.append(points)
    return mesh(name, positions, faces, [(0, 0)]*len(coords), mat, root, head,pivot=HN if head else loc)


def bill_point(t,a,half):
    # 按标准侧视：喙缝为直线，弧背用单段贝塞尔，避免分段插值形成 S 弯。
    t=clamp(t)
    width=.0135*(1-t)**.90+.00012
    seam=.423+.006*t
    dorsal=(1-t)**3*.438+3*(1-t)**2*t*.450+3*(1-t)*t*t*.451+t**3*.4452-.016*t
    height=dorsal-seam if half==0 else .0030*(1-t)**.8+.00010
    y=-.160-(.064 if half==0 else .063)*t-.014*abs(math.sin(a))*(1-t)**2
    return Vector((width*math.cos(a),y,seam+height*math.sin(a)-half*.00020))


def build_eye(side,root,pupil,iris,limbus):
    """单个外表眼球网格：外表虹膜/瞳孔，不制作内部眼球结构。"""
    surface,_,normal=body_surface(.79,side*1.70,0)
    normal=normal.lerp(Vector((side*.90,-.25,.20)).normalized(),.25).normalized()
    vertical=(Vector((0,0,1))-normal*normal.z).normalized()
    horizontal=vertical.cross(normal).normalized()
    centre=surface-normal*.0048
    bm=bmesh.new();bmesh.ops.create_uvsphere(bm,u_segments=40,v_segments=24,radius=.0077)
    bm.verts.index_update()
    coords=[v.co.copy()+centre for v in bm.verts]
    faces=[tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    uv=[(0,0)]*len(coords);slots=[0]*len(faces)
    radii=(.00010,.0020,.0040,.0043,.0048,.0053,.0058,.0064)
    base=len(coords);segments=64
    for radius in radii:
        for i in range(segments):
            a=i/segments*math.tau
            coords.append(centre+normal*math.sqrt(.0083**2-radius**2)+radius*(horizontal*math.cos(a)+vertical*math.sin(a)))
            uv.append((i/segments,radius/.0064))
    faces.append(tuple(base+i for i in reversed(range(segments))));slots.append(0)
    for row in range(len(radii)-1):
        material_index=0 if radii[row+1]<=.0040 else (1 if radii[row+1]<=.0058 else 2)
        for i in range(segments):
            a=base+row*segments+i;b=base+row*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments));slots.append(material_index)
    obj=mesh('M_Eye'+('L' if side<0 else 'R'),[[HEAD[k]@p for p in coords] for k in range(4)],faces,uv,pupil,root,pivot=centre)
    obj.data.materials.append(iris);obj.data.materials.append(limbus)
    for face,slot in zip(obj.data.polygons,slots):face.material_index=slot
    obj['exterior_eye_axis']=list(normal)
    return surface,normal,horizontal,vertical,centre


def tube(name, paths, mat, root, transform=None,pivot=None):
    """少量截面生成带关节的腿、分趾及弯爪，不使用逐根骨骼。"""
    positions=[[] for _ in range(4)]; faces=[]; uv=[]
    for path in paths:
        points=[Vector(p) for p,r in path]; radii=[r for p,r in path]
        def at(t):
            index=min(len(points)-2,int(t)); f=t-index
            ids=[min(len(points)-1,max(0,j)) for j in (index-1,index,index+1,index+2)]
            weights=(-.5*f+f*f-.5*f**3,1-2.5*f*f+1.5*f**3,.5*f+2*f*f-1.5*f**3,-.5*f*f+.5*f**3)
            p=sum((points[j]*w for j,w in zip(ids,weights)),Vector())
            r=max(.00012,sum(radii[j]*w for j,w in zip(ids,weights)))
            return p,r
        base=len(uv); steps=(len(points)-1)*6
        for j in range(steps+1):
            t=(len(points)-1)*j/steps; p,r=at(t)
            tangent=(at(min(len(points)-1,t+.01))[0]-at(max(0,t-.01))[0]).normalized()
            a=(Vector((1,0,0))-tangent*tangent.x).normalized(); b=tangent.cross(a).normalized()
            for i in range(10):
                angle=i/10*math.tau; q=p+r*(a*math.cos(angle)+b*math.sin(angle))
                for k in range(4):
                    positions[k].append(transform(q,k) if transform else q)
                uv.append((i/10,j/steps))
        for j in range(steps):
            for i in range(10):
                a=base+j*10+i; b=base+j*10+(i+1)%10
                faces.append((a,b,b+10,a+10))
        faces.extend([tuple(base+i for i in reversed(range(10))),tuple(base+steps*10+i for i in range(10))])
    return mesh(name,positions,faces,uv,mat,root,animated=transform is not None,pivot=pivot)


def build():
    PARTS.clear()
    root = bpy.data.objects.new('Male', None)
    bpy.context.scene.collection.objects.link(root)
    black = material('Black feather • velvet', (.003, .004, .0048), True,down=True)
    head_black=black.copy();head_black.name='Head feather • short velvet'
    hb=head_black.node_tree.nodes['Principled BSDF']
    hb.inputs['Specular IOR Level'].default_value=.015
    hb.inputs['Roughness'].default_value=.96;hb.inputs['Sheen Weight'].default_value=.018
    flight=material('Flight feather • layered vane',(.0045,.0055,.0065),True,flight=True)
    skin = material('Underfeather body', (.003, .004, .0048))
    skin.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.96
    skin.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value=.02
    cape = material('Cape • barbs', (.0015, .002, .0026), True)
    iri = material('Blue green • per feather', (.01, .35, .4), True, True)
    dark = material('Beak and claws', (.009, .012, .014))
    dark.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value=.12
    dark.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.60
    eye = material('Eyes', (.0015, .0012, .001))
    eb=eye.node_tree.nodes['Principled BSDF'];eb.inputs['Roughness'].default_value=.16
    eb.inputs['Specular IOR Level'].default_value=.25
    eb.inputs['Coat Weight'].default_value=.08;eb.inputs['Coat Roughness'].default_value=.12
    iris=material('Iris • external brown radial surface',(.055,.022,.006))
    ib=iris.node_tree.nodes['Principled BSDF'];ib.inputs['Roughness'].default_value=.20
    ib.inputs['Coat Weight'].default_value=.18;ib.inputs['Coat Roughness'].default_value=.12
    nt=iris.node_tree
    uvn=nt.nodes.new('ShaderNodeTexCoord');sep=nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(uvn.outputs['UV'],sep.inputs[0])
    phase=nt.nodes.new('ShaderNodeMath');phase.operation='MULTIPLY';phase.inputs[1].default_value=210
    nt.links.new(sep.outputs['X'],phase.inputs[0])
    wave=nt.nodes.new('ShaderNodeMath');wave.operation='SINE';nt.links.new(phase.outputs[0],wave.inputs[0])
    ramp=nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position=0;ramp.color_ramp.elements[0].color=(.003,.0012,.0004,1)
    ramp.color_ramp.elements[1].position=1;ramp.color_ramp.elements[1].color=(.023,.008,.002,1)
    nt.links.new(wave.outputs[0],ramp.inputs[0]);nt.links.new(ramp.outputs[0],ib.inputs['Base Color'])
    eye_rim=material('Eyelid • charcoal rim',(.009,.011,.013))
    eye_rim.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
    eye_rim.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value=.04
    bill_mat=material('Bill • horn surface',(.008,.010,.012))
    bb=bill_mat.node_tree.nodes['Principled BSDF'];bb.inputs['Roughness'].default_value=.25
    bb.inputs['Specular IOR Level'].default_value=.18;bb.inputs['Coat Weight'].default_value=.08
    nt=bill_mat.node_tree;noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=145
    bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.08;bump.inputs['Distance'].default_value=.00006
    nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],bb.inputs['Normal'])
    nasal=material('Nostril • exterior depression',(.0005,.0004,.0003))
    nasal.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.90
    nasal.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value=.04
    spot = material('Display eye marks', (.04, .50, .58))
    # 连续体表，环首尾封口。
    positions = [[] for _ in range(4)]; uv = []; faces = [];body_weights=[]
    ns, na = 65, 48
    for j in range(ns):
        s = j/(ns-1)
        for i in range(na):
            a = i/na*math.tau
            for k in range(4):
                positions[k].append(body_surface(s, a, k)[0])
            uv.append((i/na, s))
            body_weights.append(body_binding(s))
    for j in range(ns-1):
        for i in range(na):
            a=j*na+i; b=j*na+(i+1)%na
            faces.append((a, b, b+na, a+na))
    faces.extend([tuple(reversed(range(na))), tuple((ns-1)*na+i for i in range(na))])
    mesh('M_Body', positions, faces, uv, skin, root,pivot=HIP,bindings=body_weights)
    coats={'Torso':FeatherBatch(),'HeadNeck':FeatherBatch()}
    # 沿每条经线累计实际距离；颈内外弯不再共用一圈规整羽列。
    for i in range(96):
        a = i/96*math.tau
        travelled = (i%2)*.0035
        last = body_point(.992, a)
        row = 0
        for step in range(1, 239):
            s = .992-step*.004
            p = body_point(s, a)
            travelled += (p-last).length; last = p
            pitch = (.0028 if s>.68 else .0056)*(1+.08*math.sin(i*1.7+s*23))
            pitch*=1-.25*smooth((s-.80)/.07)*max(0,-math.cos(a))**4
            if travelled < pitch:
                continue
            travelled %= pitch
            row += 1
            seed=i*71+row*19
            sj=clamp(s+.0020*math.sin(seed),.01,.992)
            aj=a+.025*math.sin(seed*2.13)
            derivative=(body_point(sj+.001,aj)-body_point(sj-.001,aj)).length/.002
            width=(min(.0030,max(.0011,body_point(sj,math.pi/2).x*.10)) if sj>.68 else .0085)*(1+.10*math.sin(seed*1.73))
            eye_distance=((sj-.79)/.065)**2+((abs((aj+math.pi)%math.tau-math.pi)-1.70)/.30)**2
            if eye_distance<1:
                width*=.75
            loose=.18<sj<.80
            length=(min(.007,max(.0025,width*2.5)) if sj>.68 else (.011 if sj>.50 else .018))*(1+.14*math.sin(seed*3.7))
            if eye_distance<1:length*=.70
            chin_patch=smooth((sj-.80)/.07)*max(0,-math.cos(aj))**4
            length*=1-.38*chin_patch
            span=min(.10,length/max(.05,derivative))
            def sample(k,t,s=sj,a=aj,span=span,seed=seed):
                p, ac, n=body_surface(max(.003,s-t*span),a+.025*math.sin(seed)*t*t,k)
                return p+n*((.00038 if s>.68 else .0008)+.0005*t*t),ac,n
            coats['HeadNeck' if sj>.50 else 'Torso'].add(sample,width,.00023 if loose else .00008,seed,rows=7,rounded=sj<.68,tilt=.018 if loose else .006,fray=.20 if sj>.68 else .12,skin=lambda t,s=sj,span=span:body_binding(max(.003,s-t*span)))
    # 短额羽朝喙根错列伸出，打散截面边界；仍合入原头颈羽区。
    for row in range(3):
        for i in range(17):
            s=.910+row*.014;a=(i-8)*.12;seed=700+row*17+i
            def sample(k,t,s=s,a=a,seed=seed):
                p,ac,n=body_surface(min(.995,s+(.040+.005*math.sin(seed))*t),a,k)
                return p+n*(.0007+.0010*math.sin(math.pi*t)),ac,n
            coats['HeadNeck'].add(sample,.0025,.0004,seed,rows=7,fray=.22,tilt=.03,skin=lambda t:body_binding(.94))
    coats['Torso'].finish('M_TorsoFeathers',black,root,pivot=HIP,bind=True)
    coats['HeadNeck'].finish('M_HeadNeckFeathers',head_black,root,pivot=body_point(.55,0),bind=True)
    for side in (-1, 1):
        wing_parts={name:FeatherBatch() for name in ('Primaries','Secondaries','Coverts','Shoulder')}
        for row,count in [(0,11),(1,13),(2,17),(3,19),(4,21),(5,21),(6,23),(7,23),(8,25)]:
            for i in range(count):
                f=i/(count-1)
                angle=side*((1.15+.60*f) if row<2 else (.72+1.37*f+.035*math.sin(i*3.2+row)))
                start=(.43 if row==0 else .46) if row<2 else .51-(row-2)*.028+.003*math.sin(i*2.7+row)
                span=(.35-.025*f) if row==0 else ((.26+.035*f) if row==1 else .052+.006*math.sin(i*1.9))
                def sample(k,t,angle=angle,start=start,span=span,row=row,i=i):
                    sweep=(.20 if row<2 else .08)*t
                    p,a,n=body_surface(max(.015,start-span*t),angle+side*sweep,k)
                    height=(.0018+.00045*i) if row<2 else (.004+.00022*(8-row))
                    p+=n*(height+.0014*math.sin(math.pi*t))
                    if row==0:
                        delta=Vector((0,.025,-.005))*smooth((t-.65)/.35)
                        p+=BODY[k].to_3x3()@delta
                    return p,a,n
                part='Primaries' if row==0 else ('Secondaries' if row==1 else ('Shoulder' if row<4 else 'Coverts'))
                wing_parts[part].add(sample,.012 if row<2 else .014,.0010 if row<2 else .0030,i+row*37,rows=12,rounded=True,tilt=.035,fray=.065,group=(f'{part}_{i+1:02d}.'+('L' if side<0 else 'R') if row<2 else None))
        pivot=body_surface(.52,side*1.2,0)[0]
        for part,batch in wing_parts.items():
            batch.finish('M_'+part+('L' if side<0 else 'R'),flight,root,pivot=pivot)
    tail = FeatherBatch()
    tail_root=Vector((0,.09,.18))
    def tail_transform(p,k):
        if k==0:
            return p
        # 躯干直立时，尾根继续跟随，尾羽独立上抬，避免穿过脚底平面。
        pivot=BODY[k]@tail_root
        return pivot+Matrix.Rotation(R(40 if k==1 else 57),3,'X')@(p-tail_root)
    for i in range(10):
        u=(i-4.5)/4.5
        blade(tail, Vector((u*.014,.09,.18+.0015*(i%3))),Vector((u*.020,.31-abs(u)*.018,-.104+.060*abs(u)**1.4+.002*math.sin(i))),
              .025,tail_transform,i,rounded=True,roll=(-1 if i<5 else 1)*(18+24*abs(u)),group=f'Tail_{i+1:02d}',curve=(0,.025,.020))
    tail.finish('M_Tail', flight, root,pivot=tail_root)
    def tail_axis(t):
        return tail_root+Vector((0,.22,-.28))*t+Vector((0,.025,.020))*math.sin(math.pi*t)
    tube('M_TailBase',[[
        (tail_root,.026),(tail_axis(.09),.019),(tail_axis(.18),.011),
        (tail_axis(.30),.008),(tail_axis(.42),.0035)
    ]],skin,root,tail_transform,pivot=tail_root)
    # 臀部在尾根内收，上/下尾覆羽跨过皮肤末端，遮住尾羽插入区。
    for underside,name in ((False,'M_RumpCoverts'),(True,'M_UndertailCoverts')):
        coverts=FeatherBatch();attachments=[]
        for row in range(3):
            count=19 if not underside else 17
            for i in range(count):
                a=(-1.18+2.36*(i+.5+(row%2)*.2)/count)+(math.pi if underside else 0)
                s=.13-row*.040+.003*math.sin(i*2.3+row)
                start,_,_=body_surface(s,a,0)
                tail_normal=Vector((0,.78,.62))*(-1 if underside else 1)
                end=tail_axis(.22+row*.035)+Vector((math.sin(a)*.018,0,0))+tail_normal*.0035
                def sample(k,t,s=s,a=a,end=end,underside=underside):
                    p0,_,n0=body_surface(s,a,k)
                    p1=tail_transform(end,k)
                    tail_n=Vector((0,.78,.62))*(-1 if underside else 1)
                    n1=(tail_transform(end+tail_n*.01,k)-p1).normalized()
                    n=n0.lerp(n1,t).normalized()
                    along=(p1-p0).normalized()
                    across=n.cross(along).normalized()
                    p=p0.lerp(p1,t)+n*(.0010+.003*math.sin(math.pi*t))
                    return p,across,n
                attachments.append(len(coverts.uv)+2)
                coverts.add(sample,.014,.0009,i+row*31,rows=12,rounded=True,fray=.10)
        obj=coverts.finish(name,black,root,pivot=tail_root)
        torso=obj.vertex_groups.new(name='Torso')
        base=obj.vertex_groups.new(name='TailBase')
        for vi,(_,t) in enumerate(coverts.uv):
            if t<1: torso.add([vi],1-t,'REPLACE')
            if t>0: base.add([vi],t,'REPLACE')
        obj.vertex_groups.new(name='BodyRootAttachment').add(attachments,1.,'REPLACE')
    for side in (-1, 1):
        batch = FeatherBatch()
        for row in range(4):
            count = 80
            v0 = row*.205
            for i in range(count):
                u = (i+.5+(row%2)*.32+.15*math.sin(i*2.71+row*4.1))/count
                fn = lambda k,u,v,side=side: cape_point(side,k,u,v)
                length=(.36 if row<3 else .385)+.018*math.sin(i*2.39+row*4.1)+.007*math.sin(i*.73)
                def sample(k,t,u=u,v0=v0,row=row,fn=fn,length=length):
                    return surface_sample(fn,k,u+.0015*math.sin(u*27+row)*t*t,v0+t*length, .0006*(4-row))
                # 宽度随该阶段切向尺度变化，收拢时不挤成固定宽羽片。
                def scaled(k,t,sample=sample,u=u,v0=v0,fn=fn):
                    p,a,n=sample(k,t)
                    width=(fn(k,u+.0065,v0+t*.36)-fn(k,u-.0065,v0+t*.36)).length
                    return p,a*max(.08,width/.027),n
                batch.add(scaled, .037, .00065, i+row*17, rows=14, rounded=True)
        batch.finish('M_Cape'+('L' if side<0 else 'R'), cape, root,pivot=body_point(.65,0))
    batch = FeatherBatch()
    breast_roots = []
    for row in range(10):
        for i in range(50):
            seed=i*13+row*173
            u=-.98+(i+.5+(row%2)*.4+.14*math.sin(seed))/50*1.94
            v0=row*.095+(.003*math.sin(seed*2.3) if row else 0)
            feather_span=.14+.035*abs(u)
            def sample(k,t,u=u,v0=v0,row=row,feather_span=feather_span):
                v=v0+t*feather_span
                p,a,n=surface_sample(plate_point,k,u,v,.00025*(10-row))
                scale=(plate_point(k,u+.020,v)-plate_point(k,u-.020,v)).length/.018
                return p,a*scale,n
            exposure=(None if row<4 else lambda t,v0=v0,feather_span=feather_span: .009+.991*smooth((v0+t*feather_span-.36)/.07))
            if row == 0:
                breast_roots.append(len(batch.uv)+2)
            batch.add(sample,.026,.00050,seed,rows=10,rounded=True,exposure=exposure,tilt=.08,fray=.04,group='ChestRoots' if row<4 else None)
    breast = batch.finish('M_Breastplate', iri, root,pivot=plate_point(0,0,0))
    breast.data.materials.append(black)
    root_indices=set(batch.groups['ChestRoots'])
    for poly in breast.data.polygons:
        if all(i in root_indices for i in poly.vertices):
            poly.material_index=1
    breast.vertex_groups.new(name='BodyAttachment').add(breast_roots, 1., 'REPLACE')
    crown=FeatherBatch()
    for row in range(14):
        for i in range(17):
            s=.89-row*.0078
            a=(i-8+(row%2)*.30)*.095
            seed=i+row*29
            def sample(k,t,s=s,a=a,seed=seed):
                p,ac,n=body_surface(s-t*(.015+.002*math.sin(seed)),a+.012*math.sin(seed)*t,k)
                return p+n*(.00055+.0010*t*t),ac,n
            crown.add(sample,.0042,.00030,seed,rows=8,rounded=True,tilt=.06,fray=.14,skin=lambda t,s=s:body_binding(s-t*.017))
    crown.finish('M_Crown',iri,root,pivot=HN,bind=True)
    for side in (-1,1):
        p,n,ac,up,centre=build_eye(side,root,eye,iris,eye_rim)
        suffix='L' if side<0 else 'R'
        for upper_lid in (True,False):
            rim=[]
            for j in range(25):
                a=(j/24+(0 if upper_lid else 1))*math.pi
                rim.append((p+n*.00035+(ac*math.cos(a)+up*math.sin(a))*.0068,.00038))
            tube('M_Eyelid'+('Upper' if upper_lid else 'Lower')+suffix,[rim],eye_rim,root,lambda p,k:HEAD[k]@p,pivot=centre)
        sphere('M_EyeSpot'+str(side),HN+Vector((side*.033,-.055,.020)),(.007,.003,.005),spot,root,display=True)
    # 上下喙分别用弧背、喙缝、下缘的截面生成，保留独立绑定转轴。
    for half in (0,1):
        coords=[];faces=[]
        base=0
        for j in range(25):
            t=j/24
            for i in range(17):
                coords.append(bill_point(t,(i/16+half)*math.pi,half))
        for j in range(24):
            for i in range(16):
                a=j*17+i;faces.append((a,a+1,a+18,a+17))
        nasal_start=len(faces)
        if half==0:
            for side in (-1,1):
                t=.26;a=.48 if side>0 else math.pi-.48
                p=bill_point(t,a,0)
                dt=bill_point(t+.0005,a,0)-bill_point(t-.0005,a,0)
                da=bill_point(t,a+.0005,0)-bill_point(t,a-.0005,0)
                n=da.cross(dt).normalized();major=dt.normalized();minor=n.cross(major).normalized()
                c=len(coords);coords.append(p+n*.00010)
                for i in range(32):
                    angle=i/32*math.tau
                    coords.append(p+n*.00020+major*(.0025*math.cos(angle))+minor*(.00085*math.sin(angle)))
                for i in range(32):faces.append((c,c+1+i,c+1+(i+1)%32))
            # 贴着真实面颊表面延伸的细喙缝，避免加宽整只喙来连接嘴角。
            for side in (-1,1):
                start=len(coords)
                for j in range(17):
                    t=j/16;s=.84+.15*t
                    low,high=0.,math.pi
                    for _ in range(24):
                        a=(low+high)*.5;p=body_point(s,a)
                        seam=bill_point((-p.y-.160)/.064,0,0).z
                        if p.z>seam:low=a
                        else:high=a
                    p,_,n=body_surface(s,side*a,0)
                    p+=n*.00065
                    radius=.00005+.00032*math.sin(math.pi*t)
                    coords.extend((p+Vector((0,0,radius)),p-Vector((0,0,radius))))
                for j in range(16):
                    a=start+j*2;faces.append((a,a+1,a+3,a+2))
        obj=mesh('M_BeakUpper' if half==0 else 'M_BeakLower',[[HEAD[k]@p for p in coords] for k in range(4)],faces,[(0,0)]*len(coords),bill_mat,root,pivot=(0,-.160,.423))
        if half==0:
            obj.data.materials.append(nasal)
            for face in list(obj.data.polygons)[nasal_start:]:face.material_index=1
    for side in (-1,1):
        x=side*.032
        leg=[((x,.012,.20),.014),((x,.022,.12),.012),((x,.030,.075),.0035),((x,-.001,.014),.0028)]
        transform=lambda p,k: p.lerp(BODY[k]@p,smooth((p.z-.07)/.12))
        leg_obj=tube('M_Leg'+str(side),[leg],dark,root,transform,pivot=(x,.012,.20))
        toes=[];claws=[]
        for i in (-1,0,1):
            length=.048 if i==0 else .037
            endx=x+i*.014
            toes.append([((x+i*.003,-.002,.013),.0024),((x+i*.009,-length*.55,.010),.0019),((endx,-length,.007),.0012)])
            claws.append([((endx,-length,.007),.0014),((endx,-length-.006,.005),.0010),((endx,-length-.008,.0015),.00015)])
        toes.append([((x,.003,.013),.0024),((x-side*.006,.019,.010),.0018),((x-side*.009,.030,.006),.0010)])
        claws.append([((x-side*.009,.030,.006),.0012),((x-side*.009,.034,.003),.0008),((x-side*.009,.035,.001),.00015)])
        tube('M_Feet'+str(side),toes,dark,root,pivot=(x,0,.014))
        tube('M_Claws'+str(side),claws,dark,root,pivot=(x,0,.014))
    thighs=FeatherBatch()
    for side in (-1,1):
        for row in range(6):
            for i in range(28):
                a=(i+(row%2)*.5)/28*math.tau
                z=.195-row*.016+.002*math.sin(i*2.71+row*3)
                length=.026+.008*math.sin(i*2.13+row)
                def sample(k,t,a=a,z=z,side=side,length=length):
                    zz=z-t*length
                    radius=.013-.004*clamp((.195-zz)/.10)
                    n=Vector((math.cos(a),math.sin(a),0))
                    ac=Vector((-math.sin(a),math.cos(a),0))
                    p=Vector((side*.032,.012+(.195-zz)*.10,zz))+n*radius
                    q=transform(p,k)
                    return q,(transform(p+ac*.01,k)-q).normalized(),(transform(p+n*.01,k)-q).normalized()
                thighs.add(sample,.0045,.0004,i+row*29,rows=6,rounded=True,fray=.15)
    thighs.finish('M_ThighFeathers',black,root,pivot=HIP)
    root['description']='雄鸟结构预览；set_stage(0..3)，非最终动画或网页性能验收'
    return root


def studio():
    sc=bpy.context.scene
    sc.render.engine='CYCLES'
    sc.cycles.samples=24
    sc.cycles.use_denoising=True
    sc.render.resolution_x=880;sc.render.resolution_y=880
    sc.render.resolution_percentage=100
    sc.world=bpy.data.worlds.new('Model studio')
    sc.world.use_nodes=True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.15,.17,1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value=.4
    # 三视图用浅色纸背景；环境光保持原值，不靠提亮羽毛伪造细节。
    nt=sc.world.node_tree
    background=nt.nodes['Background']
    paper=nt.nodes.new('ShaderNodeBackground');paper.inputs['Color'].default_value=(.88,.91,.93,1)
    path=nt.nodes.new('ShaderNodeLightPath')
    mix=nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(path.outputs['Is Camera Ray'],mix.inputs[0])
    nt.links.new(background.outputs[0],mix.inputs[1]);nt.links.new(paper.outputs[0],mix.inputs[2])
    nt.links.new(mix.outputs[0],nt.nodes.get('World Output').inputs['Surface'])
    for name,loc,power,size,color in [('Key',(-1,-1.8,2.4),150,1.8,(.84,.94,1)),
                                       ('Rim',(1.3,.9,1.6),210,1.3,(.65,.87,.9)),
                                       ('Fill',(1,-1.2,.6),50,1.1,(1,.88,.72))]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
        if name!='Key':data.specular_factor=.10
        obj=bpy.data.objects.new(name,data);sc.collection.objects.link(obj);obj.location=loc
        obj.rotation_euler=(Vector((0,0,.4))-obj.location).to_track_quat('-Z','Y').to_euler()
    cam=bpy.data.cameras.new('Camera');obj=bpy.data.objects.new('Camera',cam);sc.collection.objects.link(obj);sc.camera=obj
    cam.type='ORTHO';cam.ortho_scale=1.12
    sc.view_settings.view_transform='AgX'
    sc.render.image_settings.file_format='PNG'


def render(name,loc,target=(0,0,.43),scale=1.12):
    sc=bpy.context.scene;cam=sc.camera
    cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=scale
    sc.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)


def validate():
    sc=bpy.context.scene
    stats={'objects':len([o for o in sc.objects if o.parent and o.parent.name=='Male']),
           'animated_meshes':len(PARTS),'vertices':sum(len(o.data.vertices) for o in PARTS),
           'faces':sum(len(o.data.polygons) for o in PARTS),
           'feathers':sum(o.get('feather_count',0) for o in PARTS),'stages':[]}
    for o in PARTS:
        keys=o.data.shape_keys.key_blocks
        assert [k.name for k in keys]==['Basis',*STAGES]
        assert all(len(k.data)==len(o.data.vertices) for k in keys)
        for k in keys:
            assert all(math.isfinite(c) for v in k.data for c in v.co)
        assert keys['S2'].relative_key==keys['S1'] and keys['S3'].relative_key==keys['S2']
    for step in range(13):
        stage = step*.25
        set_stage(stage)
        dg=bpy.context.evaluated_depsgraph_get()
        minimum=1.
        minimum_z=1.
        for obj in PARTS:
            me=obj.evaluated_get(dg).to_mesh()
            assert all(math.isfinite(c) for v in me.vertices for c in v.co)
            if obj.name!='M_Tail':
                minimum_z=min(minimum_z,min((obj.matrix_world@v.co).z for v in me.vertices))
            minimum=min(minimum,min((p.area for p in me.polygons if len(p.vertices)==4),default=1))
            obj.evaluated_get(dg).to_mesh_clear()
        body = bpy.data.objects['M_Body'].evaluated_get(dg)
        breast = bpy.data.objects['M_Breastplate'].evaluated_get(dg)
        body_mesh, breast_mesh = body.to_mesh(), breast.to_mesh()
        tree = BVHTree.FromPolygons([body.matrix_world@v.co for v in body_mesh.vertices], [p.vertices for p in body_mesh.polygons])
        group = bpy.data.objects['M_Breastplate'].vertex_groups['BodyAttachment'].index
        roots = [v.index for v in bpy.data.objects['M_Breastplate'].data.vertices if any(g.group==group for g in v.groups)]
        gap = max(tree.find_nearest(breast.matrix_world@breast_mesh.vertices[i].co)[3] for i in roots)
        body.to_mesh_clear(); breast.to_mesh_clear()
        covert_gap=0.
        for name in ('M_RumpCoverts','M_UndertailCoverts'):
            obj=bpy.data.objects[name];evaluated=obj.evaluated_get(dg);me=evaluated.to_mesh()
            gid=obj.vertex_groups['BodyRootAttachment'].index
            ids=[v.index for v in obj.data.vertices if any(g.group==gid for g in v.groups)]
            covert_gap=max(covert_gap,max(tree.find_nearest(evaluated.matrix_world@me.vertices[i].co)[3] for i in ids))
            evaluated.to_mesh_clear()
        assert covert_gap<.008,('Tail covert root detached',stage,covert_gap)
        assert gap < .010, ('Breast root detached',stage,gap)
        assert minimum_z > -.002, ('Body below foot anchor plane',stage,minimum_z)
        stats['stages'].append({'stage':stage,'min_quad_area':minimum,'breast_root_gap_max':gap,'tail_covert_root_gap_max':covert_gap,'minimum_non_tail_z':minimum_z})
        assert minimum>1e-13, (stage,minimum)
    set_stage(0,frame=1);set_stage(3,frame=30)
    assert all(o.data.shape_keys.animation_data for o in PARTS)
    for o in PARTS:
        o.data.shape_keys.animation_data_clear()
    set_stage(0)
    stats['keyframe_interface']='PASS; temporary keys removed'
    stats['tail_below_foot_anchor']='Allowed by user turnaround; no ground surface in this model study'
    for name in ('M_Body','M_TorsoFeathers','M_HeadNeckFeathers','M_Crown'):
        obj=bpy.data.objects[name]
        ids={obj.vertex_groups[n].index for n in ('Torso','Neck','Head')}
        assert all(abs(sum(g.weight for g in v.groups if g.group in ids)-1)<.0001 for v in obj.data.vertices),name
    tail_groups=[g for g in bpy.data.objects['M_Tail'].vertex_groups if g.name.startswith('Tail_')]
    assert len(tail_groups)==10
    for name in ('M_BeakUpper','M_BeakLower','M_PrimariesL','M_PrimariesR','M_SecondariesL','M_SecondariesR','M_CovertsL','M_CovertsR','M_ShoulderL','M_ShoulderR'):
        assert name in bpy.data.objects and bpy.data.objects[name] in PARTS,name
    for side in ('L','R'):
        for part in ('Primaries','Secondaries'):
            obj=bpy.data.objects['M_'+part+side]
            assert all(g.name.endswith('.'+side) for g in obj.vertex_groups)
            roots=json.loads(obj['feather_roots_model'])
            assert len(roots)==len(obj.vertex_groups)
            assert all(all(math.isfinite(c) for c in p) for p in roots.values())
    stats['animation_partition']='PASS; body weights normalized, bilateral wing regions, separate jaws, ten tail groups'
    parts=[{'name':o.name,'pivot_bind_pose':list(o.location),'vertex_groups':[g.name for g in o.vertex_groups],
            'feather_roots_model':json.loads(o.get('feather_roots_model','{}')),
            'shape_keys':[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else []}
           for o in sc.objects if o.type=='MESH' and o.parent and o.parent.name=='Male']
    (OUT/'animation-parts.json').write_text(json.dumps(parts,indent=2),encoding='utf8')
    (OUT/'validation.json').write_text(json.dumps(stats,indent=2),encoding='utf8')
    print('MODEL_VALIDATION',json.dumps(stats))


def main():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    OUT.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    build();studio();validate()
    # 内嵌源码使 .blend 中的阶段操作可直接调用，仍保留磁盘正式源码。
    text=bpy.data.texts.get('build_model.py') or bpy.data.texts.new('build_model.py')
    text.clear();text.write(Path(__file__).read_text(encoding='utf8'))
    set_stage(0)
    sc=bpy.context.scene;sc.camera.location=(1.1,-2,.40)
    sc.camera.data.ortho_scale=.68
    sc.camera.rotation_euler=(Vector((0,.03,.19))-sc.camera.location).to_track_quat('-Z','Y').to_euler()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.shading.type='MATERIAL'
                area.spaces.active.shading.use_scene_world=True
                area.spaces.active.shading.use_scene_lights=True
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'bird-model.blend'))
    if '--preview' in args:
        for stage in [0,.5,1,1.5,2,2.5,3]:
            set_stage(stage)
            sc.render.resolution_percentage=55
            render('stage-'+str(stage),(0,-2,.72))
            render('stage-'+str(stage)+'-side',(2,-.15,.75))
        sc.render.resolution_percentage=100
        set_stage(0)
        render('folded-profile',(1.7,-.55,.72),target=(0,.06,.26),scale=.78)
        render('folded-back',(0,2,.38),target=(0,.03,.19),scale=.68)
        render('rest-front',(0,-2,.23),target=(0,.02,.19),scale=.68)
        render('rest-side',(2,.03,.19),target=(0,.03,.19),scale=.68)
        render('rest-three',(1.1,-2,.40),target=(0,.03,.19),scale=.68)
        render('head-detail',(.9,-1.1,.56),target=(0,-.12,.39),scale=.26)
        set_stage(3)
        render('display-front',(0,-2,.65))
        render('display-three',(.9,-2,.85))
        render('display-back',(0,2,.85))
        render('breast-detail',(.28,-2,.55),target=(0,-.15,.30),scale=.56)
    if '--baseline' in args:
        baseline=Path(args[args.index('--baseline')+1])
        # 只执行旧雄鸟相关定义，不重建旧环境/雌鸟。
        code=baseline.read_text(encoding='utf8').split('# ---------------------------------------------------------------- 雌鸟')[0]
        ns={'__name__':'baseline'};exec(compile(code,str(baseline),'exec'),ns)
        ns['clear']();ns['build_male'](ns['make_materials']());studio()
        ns['set_stage'](0);render('before-profile',(1.7,-.55,.72),target=(0,.06,.26),scale=.65)
        ns['set_stage'](3);render('before-front',(0,-2,.65))


if __name__=='__main__':
    main()
