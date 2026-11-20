"""岸边冲滩/回退：移动水舌、随前缘运动的碎沫和留滩泡沫。

使用烘入工程的形态键，不依赖打开工程时运行 Python，也不把上下抖动冒充冲滩。
这是外观运动学近似，不是浅水方程求解。
"""
import bpy,math,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from math import pi

def coast(y):return np.where(y<=3,1.127+.447*y-.1396*y*y,1.212+.55*(y-3))
def bed(x,y):
    d=x-coast(y)
    return .025+.069*np.minimum(7,np.maximum(d,0))+.092*np.minimum(d,0)
def ease(t):
    t=np.clip(t,0,1);return t*t*t*(t*(t*6-15)+10)
def front_at(seconds,y):
    t=np.mod(seconds+.12*np.sin(y*.30),6.0)
    advance=ease(t/1.65);retreat=ease((t-1.65)/3.45)
    f=np.where(t<1.65,.20+1.5*advance,np.where(t<5.10,1.70-1.5*retreat,.20))
    return f+.055*np.sin(y*2.7)+.025*np.sin(y*10.1+seconds*.3)

def linear(action):
    if not action:return
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='LINEAR'

def mesh_object(scene,name,vertices,faces,material):
    me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);me.materials.append(material)
    for p in me.polygons:p.use_smooth=True
    return ob

def foam_material(name):
    m=bpy.data.materials.new(name);m.use_nodes=True;nt=m.node_tree;nt.nodes.clear()
    out=nt.nodes.new('ShaderNodeOutputMaterial');white=nt.nodes.new('ShaderNodeBsdfDiffuse');white.inputs['Color'].default_value=(.89,.92,.87,1);white.inputs['Roughness'].default_value=.35
    tr=nt.nodes.new('ShaderNodeBsdfTransparent');tc=nt.nodes.new('ShaderNodeTexCoord')
    noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=12;noise.inputs['Detail'].default_value=3.0;nt.links.new(tc.outputs['Object'],noise.inputs['Vector'])
    ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.46;ramp.color_ramp.elements[1].position=.64;nt.links.new(noise.outputs['Fac'],ramp.inputs[0])
    amount=nt.nodes.new('ShaderNodeValue');amount.name='随冲退消散';amount.outputs[0].default_value=1
    mult=nt.nodes.new('ShaderNodeMath');mult.operation='MULTIPLY';nt.links.new(amount.outputs[0],mult.inputs[0]);nt.links.new(ramp.outputs['Color'],mult.inputs[1])
    mix=nt.nodes.new('ShaderNodeMixShader');nt.links.new(mult.outputs[0],mix.inputs[0]);nt.links.new(tr.outputs[0],mix.inputs[1]);nt.links.new(white.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],out.inputs['Surface'])
    return m,amount

def add_film_micro(scene):
    m=bpy.data.materials.get('冲滩毫米薄水膜')
    if not m or m.node_tree.nodes.get('冲滩微涟法线'):return
    nt=m.node_tree;tc=nt.nodes.new('ShaderNodeTexCoord')
    attr=next(n for n in nt.nodes if n.type=='ATTRIBUTE' and n.attribute_name=='swash_u')
    fade=nt.nodes.new('ShaderNodeMath');fade.operation='SUBTRACT';fade.inputs[0].default_value=1;nt.links.new(attr.outputs['Fac'],fade.inputs[1])
    mapping=nt.nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(1,1.55,1);nt.links.new(tc.outputs['Object'],mapping.inputs[0])
    prev=None
    for scale,strength,distance in ((7.5,.43,.020),(38,.22,.005)):
        ns=nt.nodes.new('ShaderNodeTexNoise');ns.inputs['Scale'].default_value=scale;ns.inputs['Detail'].default_value=3 if scale<10 else 2;ns.inputs['Roughness'].default_value=.70 if scale<10 else .65
        nt.links.new((mapping if scale<10 else tc).outputs['Vector' if scale<10 else 'Object'],ns.inputs['Vector'])
        amount=nt.nodes.new('ShaderNodeMath');amount.operation='MULTIPLY';amount.inputs[1].default_value=strength;nt.links.new(fade.outputs[0],amount.inputs[0])
        bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=distance;nt.links.new(ns.outputs['Fac'],bump.inputs['Height']);nt.links.new(amount.outputs[0],bump.inputs['Strength'])
        if prev:nt.links.new(prev.outputs['Normal'],bump.inputs['Normal'])
        prev=bump
    prev.name='冲滩微涟法线'
    for n in nt.nodes:
        if n.bl_idname in ('ShaderNodeBsdfRefraction','ShaderNodeBsdfAnisotropic','ShaderNodeFresnel'):nt.links.new(prev.outputs['Normal'],n.inputs['Normal'])

def add_swash(scene):
    water=scene.objects['透光浅水与细波'];oc=next(m for m in water.modifiers if m.type=='OCEAN')
    if not water.get('swash_ocean_trimmed'):
        xyz=np.empty(len(water.data.vertices)*3,np.float32);water.data.vertices.foreach_get('co',xyz);xyz=xyz.reshape(-1,3)
        xyz[:,0]-=2.90;water.data.vertices.foreach_set('co',xyz.ravel());water.data.update();water['swash_ocean_trimmed']=True
    for name in ('蕾丝状近岸浪沫','独立海沫泡缘'):
        ob=scene.objects.get(name)
        if ob:bpy.data.objects.remove(ob,do_unlink=True)
    for ob in list(scene.objects):
        if ob.name.startswith(('冲滩薄水','随浪前缘','留滩碎沫')):bpy.data.objects.remove(ob,do_unlink=True)
    oc.time=7;oc.keyframe_insert('time',frame=181);linear(water.animation_data.action)
    old_resolution=oc.viewport_resolution;oc.viewport_resolution=oc.resolution
    scene.frame_start=1;scene.frame_end=181;scene.render.fps=30
    Y,N=500,42
    ys=np.linspace(-17,18,Y+1,dtype=np.float32);u=np.linspace(0,1,N+1,dtype=np.float32)
    yy=np.repeat(ys,N+1);uu=np.tile(u,Y+1);top_count=len(yy)
    faces=[]
    for j in range(Y):
        for i in range(N):
            a=j*(N+1)+i;faces.append((a,a+1,a+N+2,a+N+1))
    top_faces=faces.copy();faces.extend([tuple(v+top_count for v in reversed(f)) for f in top_faces])
    boundary=list(range(N+1))+[j*(N+1)+N for j in range(1,Y+1)]+[Y*(N+1)+i for i in range(N-1,-1,-1)]+[j*(N+1) for j in range(Y-1,0,-1)]
    # 顶面网格是沿 x 增加的逆时针方向，封闭侧面对应外法线。
    for i,a in enumerate(boundary):
        b=boundary[(i+1)%len(boundary)];faces.append((b,a,a+top_count,b+top_count))
    fy=np.repeat(ys,9);fu=np.tile(np.linspace(0,1,9),Y+1)
    # 贴合实际带砂砾起伏的地面，避免薄水层/泡沫穿入粗略解析沙坡。
    trees=[];dg=bpy.context.evaluated_depsgraph_get()
    for name in ('连续浅海沙床与湿干沙滩','前景砂砾真实高度面'):
        ob=scene.objects.get(name)
        if ob:trees.append(BVHTree.FromObject(ob,dg))
    ds=np.linspace(-2.4,2.2,101);ground_grid=np.empty((Y+1,len(ds)),np.float32)
    for j,y in enumerate(ys):
        xx=coast(y)+ds
        for i,x in enumerate(xx):
            height=float(bed(x,y))
            for tree in trees:
                hit=tree.ray_cast(Vector((float(x),float(y),5)),Vector((0,0,-1)),20)
                if hit[0] is not None:height=max(height,hit[0].z)
            ground_grid[j,i]=height
    def ground_height(x,y):
        d=x-coast(y);iy=np.clip((y+17)/35*Y,0,Y-.001);ix=np.clip((d+2.4)/4.6*100,0,100-.001)
        y0=iy.astype(np.int32);x0=ix.astype(np.int32);ay=iy-y0;ax=ix-x0
        return (ground_grid[y0,x0]*(1-ax)+ground_grid[y0,x0+1]*ax)*(1-ay)+(ground_grid[y0+1,x0]*(1-ax)+ground_grid[y0+1,x0+1]*ax)*ay
    foam_faces=[]
    for j in range(Y):
        for i in range(8):
            a=j*9+i;foam_faces.append((a,a+1,a+10,a+9))
    fm,front_amount=foam_material('移动冲滩薄沫')
    rm,residue_amount=foam_material('冲滩后留沫')
    times=list(range(1,182,6));snapshots=[];foam_snapshots=[]
    ncols=961;nrows=1001
    assert len(water.data.vertices)==2*ncols*nrows,'海面采样布局发生变化，需重新核对接缝'
    edge_indices=np.arange(nrows)*ncols
    for frame in times:
        seconds=(frame-1)/30
        scene.frame_set(frame);bpy.context.view_layer.update()
        evaluated=water.evaluated_get(bpy.context.evaluated_depsgraph_get())
        rear=np.array([evaluated.data.vertices[int(i)].co[:] for i in edge_indices],dtype=np.float32)
        rear_inner=np.array([evaluated.data.vertices[int(i+1)].co[:] for i in edge_indices],dtype=np.float32)
        rear_z=np.interp(yy,rear[:,1],rear[:,2]);rear_d=np.interp(yy,rear[:,1],rear[:,0])-coast(yy)
        rear_slope=np.clip((rear[:,2]-rear_inner[:,2])/np.maximum(.025,rear[:,0]-rear_inner[:,0]),-.6,.6)
        slope=np.interp(yy,rear[:,1],rear_slope)
        front=front_at(seconds,yy);d=rear_d+(front-rear_d)*uu;xx=coast(yy)+d;ground=ground_height(xx,yy)
        a=np.clip((d-rear_d)/(front-rear_d),0,1);blend=ease(a)
        thickness=.018*(1-a)**.65+.002
        native_extension=rear_z+slope*(d-rear_d)*np.exp(-np.maximum(0,d-rear_d)/.55)
        height=(1-blend)*native_extension+blend*(ground+thickness)
        crest=.021*np.exp(-((front-d-.30)/.20)**2)*np.sin(pi*np.clip(seconds/1.65,0,1))**2
        height=np.maximum(height+crest,ground+.002)
        top=np.column_stack((xx,yy,height));bottom=np.column_stack((xx,yy,ground-.003));snapshots.append(np.vstack((top,bottom)).astype(np.float32))
        ffront=front_at(seconds,fy);width=(.10+.19*max(0,math.sin(min(seconds/1.65,1)*pi))+.08*math.exp(-((seconds-1.65)/1.0)**2))*(.5+.5*np.sin(fy*2.2)**2)
        fd=ffront-fu*width;fx=coast(fy)+fd;fg=ground_height(fx,fy)
        frz=np.interp(fy,rear[:,1],rear[:,2]);frd=np.interp(fy,rear[:,1],rear[:,0])-coast(fy);fa=np.clip((fd-frd)/(ffront-frd),0,1);fb=ease(fa)
        fh=np.maximum((1-fb)*frz+fb*(fg+.018*(1-fa)**.65+.002),fg+.002)+.003
        foam_snapshots.append(np.column_stack((fx,fy,fh)).astype(np.float32))
        print('SWASH_KEY',frame,flush=True)
    film=bpy.data.materials.new('冲滩毫米薄水膜');film.use_nodes=True;fn=film.node_tree;fn.nodes.clear()
    fo=fn.nodes.new('ShaderNodeOutputMaterial');clear=fn.nodes.new('ShaderNodeBsdfTransparent');clear.inputs['Color'].default_value=(.97,.99,1,1)
    parameter=fn.nodes.new('ShaderNodeAttribute');parameter.attribute_name='swash_u'
    tint=fn.nodes.new('ShaderNodeMixRGB');tint.inputs[1].default_value=(.68,.89,.91,1);tint.inputs[2].default_value=(.97,.99,1,1);fn.links.new(parameter.outputs['Fac'],tint.inputs[0])
    refr=fn.nodes.new('ShaderNodeBsdfRefraction');refr.inputs['IOR'].default_value=1.333;refr.inputs['Roughness'].default_value=.015;fn.links.new(tint.outputs[0],refr.inputs['Color'])
    thin=fn.nodes.new('ShaderNodeMapRange');thin.inputs['From Min'].default_value=.35;thin.inputs['From Max'].default_value=.95;fn.links.new(parameter.outputs['Fac'],thin.inputs['Value'])
    transmission=fn.nodes.new('ShaderNodeMixShader');fn.links.new(thin.outputs['Result'],transmission.inputs[0]);fn.links.new(refr.outputs[0],transmission.inputs[1]);fn.links.new(clear.outputs[0],transmission.inputs[2])
    gloss=fn.nodes.new('ShaderNodeBsdfAnisotropic');gloss.inputs['Color'].default_value=(.90,.97,1,1);gloss.inputs['Roughness'].default_value=.045
    fres=fn.nodes.new('ShaderNodeFresnel');fres.inputs['IOR'].default_value=1.333
    weight=fn.nodes.new('ShaderNodeMapRange');weight.inputs['To Min'].default_value=.48;weight.inputs['To Max'].default_value=.12;fn.links.new(parameter.outputs['Fac'],weight.inputs['Value'])
    polar=fn.nodes.new('ShaderNodeMath');polar.operation='MULTIPLY';fn.links.new(fres.outputs[0],polar.inputs[0]);fn.links.new(weight.outputs['Result'],polar.inputs[1])
    mix=fn.nodes.new('ShaderNodeMixShader');fn.links.new(polar.outputs[0],mix.inputs[0]);fn.links.new(transmission.outputs[0],mix.inputs[1]);fn.links.new(gloss.outputs[0],mix.inputs[2])
    lp=fn.nodes.new('ShaderNodeLightPath');shadow=fn.nodes.new('ShaderNodeMixShader');fn.links.new(lp.outputs['Is Shadow Ray'],shadow.inputs[0]);fn.links.new(mix.outputs[0],shadow.inputs[1]);fn.links.new(clear.outputs[0],shadow.inputs[2]);fn.links.new(shadow.outputs[0],fo.inputs['Surface'])
    water_layer=mesh_object(scene,'冲滩薄水层',snapshots[0][:top_count],top_faces,film)
    attr=water_layer.data.attributes.new('swash_u','FLOAT','POINT');attr.data.foreach_set('value',uu.astype(np.float32))
    # 海水与薄水层之间是内部介质接缝，不能再作为水/空气折射面渲染。
    gate=bpy.data.materials.new('内部水体接缝透过');gate.use_nodes=True;gn=gate.node_tree;gn.nodes.clear()
    output=gn.nodes.new('ShaderNodeOutputMaterial');tr=gn.nodes.new('ShaderNodeBsdfTransparent');gn.links.new(tr.outputs[0],output.inputs['Surface'])
    water.data.materials.append(gate);water_layer.data.materials.append(gate)
    for obj,columns,number in ((water,ncols,ncols*nrows),(water_layer,N+1,top_count)):
        material_index=len(obj.data.materials)-1
        first_side=2*(columns-1)*(number//columns-1)
        for poly in obj.data.polygons[first_side:]:
            if len(poly.vertices)==4 and any(i<number for i in poly.vertices) and any(i>=number for i in poly.vertices) and all((i%number)%columns==0 for i in poly.vertices):poly.material_index=material_index
    foam=mesh_object(scene,'随浪前缘碎沫',foam_snapshots[0],foam_faces,fm)
    for obj,keys in ((water_layer,snapshots),(foam,foam_snapshots)):
        obj.shape_key_add(name='Basis')
        for i,(frame,coords) in enumerate(zip(times,keys)):
            key=obj.shape_key_add(name='冲退_%03d'%frame);key.data.foreach_set('co',coords[:len(key.data)].ravel())
            schedule=[]
            if frame>1:schedule.append((frame-6,0))
            schedule.append((frame,1))
            if frame<181:schedule.append((frame+6,0))
            for at,value in schedule:
                key.value=value;key.keyframe_insert('value',frame=at)
        linear(obj.data.shape_keys.animation_data.action)
    # 固留在最高冲滩线附近的稀碎泡沫，退水时淡出。
    rd=1.70-fu*.23+.055*np.sin(fy*2.7);rx=coast(fy)+rd
    residue=mesh_object(scene,'留滩碎沫',np.column_stack((rx,fy,ground_height(rx,fy)+.005)),foam_faces,rm)
    for frame,value in ((1,.05),(31,.70),(51,1),(96,.35),(145,.03),(181,.05)):
        residue_amount.outputs[0].default_value=value;residue_amount.outputs[0].keyframe_insert('default_value',frame=frame)
    for frame,value in ((1,.18),(22,.75),(51,1),(87,.50),(130,.18),(160,.08),(181,.18)):
        front_amount.outputs[0].default_value=value;front_amount.outputs[0].keyframe_insert('default_value',frame=frame)
    for material in (fm,rm):linear(material.node_tree.animation_data.action)
    # 多次弱浪已润湿的留滩带；退水后仍保留，避免湿痕随水立即消失。
    for name in ('连续浅海沙床与湿干沙滩','前景砂砾真实高度面'):
        ob=scene.objects.get(name)
        if not ob or not ob.data.attributes.get('wetness'):continue
        p=np.empty(len(ob.data.vertices)*3,np.float32);ob.data.vertices.foreach_get('co',p);p=p.reshape(-1,3)
        d=p[:,0]-coast(p[:,1]);old=np.empty(len(p),np.float32);ob.data.attributes['wetness'].data.foreach_get('value',old)
        wet=np.clip((1.85-d)/.35,0,1)*np.clip((d+.2)/.35,0,1)*.75
        ob.data.attributes['wetness'].data.foreach_set('value',np.maximum(old,wet))
    oc.viewport_resolution=old_resolution
    scene['swash_period_seconds']=6.0;scene['swash_uprush_seconds']=1.65;scene['swash_backwash_seconds']=3.45
    scene['swash_note']='移动前缘的薄水层、泡沫和留滩湿痕；形态键运动学近似，不是完整流体求解。'
    add_film_micro(scene)
    scene.frame_set(51)
    return water_layer,foam,residue
