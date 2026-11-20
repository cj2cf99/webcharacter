"""浅滩水专用：清晰折射、受控偏振反射、真实水体吸收和弱散射。"""
import bpy,math,numpy as np

def apply_water(scene,variant=1):
    settings={1:(.35,.85,.025),2:(.48,1.20,.035),3:(.26,.65,.040)}
    reflection,absorption,scattering=settings[variant]
    m=bpy.data.materials.new('浅滩清水专项_%d'%variant); m.use_nodes=True
    nt=m.node_tree; nt.nodes.clear()
    def n(kind,**inputs):
        node=nt.nodes.new(kind)
        for key,value in inputs.items():node.inputs[key].default_value=value
        return node
    def l(a,ao,b,bi):nt.links.new(a.outputs[ao],b.inputs[bi])
    out=n('ShaderNodeOutputMaterial')
    tc=n('ShaderNodeTexCoord'); mapping=n('ShaderNodeVectorMath'); mapping.operation='MULTIPLY'; mapping.inputs[1].default_value=(1,1.55,1);l(tc,'Object',mapping,0)
    ns=n('ShaderNodeTexNoise',Scale=7.5,Detail=3.0,Roughness=.70);l(mapping,'Vector',ns,'Vector')
    b1=n('ShaderNodeBump',Strength=.43,Distance=.020);l(ns,'Fac',b1,'Height')
    small=n('ShaderNodeTexNoise',Scale=38.0,Detail=2.0,Roughness=.65);l(tc,'Object',small,'Vector')
    b2=n('ShaderNodeBump',Strength=.22,Distance=.005);l(b1,'Normal',b2,'Normal');l(small,'Fac',b2,'Height')
    refr=n('ShaderNodeBsdfRefraction',Color=(1,1,1,1),Roughness=.015,IOR=1.333);l(b2,'Normal',refr,'Normal')
    spec=n('ShaderNodeBsdfAnisotropic',Color=(.92,.98,1,1),Roughness=.045);l(b2,'Normal',spec,'Normal')
    fresnel=n('ShaderNodeFresnel',IOR=1.333);l(b2,'Normal',fresnel,'Normal')
    distance_coord=n('ShaderNodeSeparateXYZ');l(tc,'Object',distance_coord,0)
    distance_reflection=n('ShaderNodeMapRange');distance_reflection.inputs['From Min'].default_value=15;distance_reflection.inputs['From Max'].default_value=120;distance_reflection.inputs['To Min'].default_value=reflection;distance_reflection.inputs['To Max'].default_value=.85;l(distance_coord,'Y',distance_reflection,'Value')
    polar=n('ShaderNodeMath');polar.operation='MULTIPLY';l(fresnel,'Fac',polar,0);l(distance_reflection,'Result',polar,1)
    mix=n('ShaderNodeMixShader');l(polar,0,mix,0);l(refr,0,mix,1);l(spec,0,mix,2)
    # 水面让直接阴影射线透过，避免未求解折射焦散时把水下沙底完全压黑。
    # 折射的相机/反射射线仍使用真实界面，沙底聚光是下方的材质近似。
    lp=n('ShaderNodeLightPath');shadow=n('ShaderNodeBsdfTransparent',Color=(1,1,1,1))
    shadow_mix=n('ShaderNodeMixShader');l(lp,'Is Shadow Ray',shadow_mix,0);l(mix,0,shadow_mix,1);l(shadow,0,shadow_mix,2);l(shadow_mix,0,out,'Surface')
    absorb=n('ShaderNodeVolumeAbsorption',Color=(.32,.82,.91,1),Density=absorption)
    scatter=n('ShaderNodeVolumeScatter',Color=(.76,.90,.95,1),Density=scattering,Anisotropy=.40)
    add=n('ShaderNodeAddShader');l(absorb,0,add,0);l(scatter,0,add,1);l(add,0,out,'Volume')
    scene.objects['透光浅水与细波'].data.materials[0]=m

    # 浅水中向岸传播的低矮波脊；对照参考的卷曲浪线，而非整片平滑镜面。
    water=scene.objects['透光浅水与细波']
    if not water.get('shoaling_added'):
        def shoaling(x,y):
            coast=np.where(y<=3,1.127+.447*y-.1396*y*y,1.212+.55*(y-3))
            d=np.maximum(0,coast+.77-x)
            return .042*np.sin(2*math.pi*d/1.35+.22*np.sin(y*1.1))*np.exp(-d/4)*np.minimum(d*3,1)
        for name in ('透光浅水与细波','蕾丝状近岸浪沫','独立海沫泡缘'):
            obj=scene.objects.get(name)
            if not obj:continue
            xyz=np.empty(len(obj.data.vertices)*3,np.float32);obj.data.vertices.foreach_get('co',xyz);xyz=xyz.reshape(-1,3)
            mask=xyz[:,2]>-1
            xyz[mask,2]+=shoaling(xyz[mask,0],xyz[mask,1])
            obj.data.vertices.foreach_set('co',xyz.ravel());obj.data.update()
        water['shoaling_added']=True

    # 水下砂床的弱聚光纹理。仅作用于低于水面的区域，保持砂床本来的颗粒。
    sand=bpy.data.materials['浅奶油色珊瑚砂'];sn=sand.node_tree
    bs=sn.nodes.get('Principled BSDF')
    if not sn.nodes.get('水下聚光乘色'):
        old=bs.inputs['Base Color'].links[0].from_socket
        tc2=sn.nodes.new('ShaderNodeTexCoord');sep=sn.nodes.new('ShaderNodeSeparateXYZ');sn.links.new(tc2.outputs['Object'],sep.inputs[0])
        below=sn.nodes.new('ShaderNodeMath');below.operation='LESS_THAN';below.inputs[1].default_value=.07;sn.links.new(sep.outputs['Z'],below.inputs[0])
        warp=sn.nodes.new('ShaderNodeTexNoise');warp.inputs['Scale'].default_value=2.6;warp.inputs['Detail'].default_value=2;sn.links.new(tc2.outputs['Object'],warp.inputs['Vector'])
        offset=sn.nodes.new('ShaderNodeVectorMath');offset.operation='SCALE';offset.inputs['Scale'].default_value=.22;sn.links.new(warp.outputs['Color'],offset.inputs[0])
        plus=sn.nodes.new('ShaderNodeVectorMath');plus.operation='ADD';sn.links.new(tc2.outputs['Object'],plus.inputs[0]);sn.links.new(offset.outputs['Vector'],plus.inputs[1])
        vor=sn.nodes.new('ShaderNodeTexVoronoi');vor.feature='DISTANCE_TO_EDGE';vor.inputs['Scale'].default_value=5.2;sn.links.new(plus.outputs['Vector'],vor.inputs['Vector'])
        ramp=sn.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.015;ramp.color_ramp.elements[0].color=(1,1,1,1);ramp.color_ramp.elements[1].position=.075;ramp.color_ramp.elements[1].color=(0,0,0,1);sn.links.new(vor.outputs['Distance'],ramp.inputs[0])
        amount=sn.nodes.new('ShaderNodeMath');amount.operation='MULTIPLY';sn.links.new(below.outputs[0],amount.inputs[0]);sn.links.new(ramp.outputs['Color'],amount.inputs[1])
        mix=sn.nodes.new('ShaderNodeMixRGB');mix.name='水下聚光乘色';mix.blend_type='MULTIPLY';mix.inputs[2].default_value=(1.45,1.45,1.30,1)
        sn.links.new(amount.outputs[0],mix.inputs[0]);sn.links.new(old,mix.inputs[1]);sn.links.new(mix.outputs[0],bs.inputs['Base Color'])
    scene['water_variant']=variant
    scene['water_polarization_note']='反射权重缩减是偏振滤镜外观近似，非完整偏振光传输求解；沙床聚光为材质近似。'
    # 水面反射使用与相机背景接近的环境曝光，避免双背景曝光差造成远海发黑。
    world=scene.world.node_tree
    if not world.nodes.get('水面环境反射曝光'):
        output=world.nodes.get('World Output');previous=output.inputs['Surface'].links[0].from_socket
        env=next(nd for nd in world.nodes if nd.type=='TEX_ENVIRONMENT')
        sky=world.nodes.new('ShaderNodeBackground');sky.name='水面环境反射曝光';sky.inputs['Strength'].default_value=1.1;world.links.new(env.outputs['Color'],sky.inputs['Color'])
        path=world.nodes.new('ShaderNodeLightPath');mix=world.nodes.new('ShaderNodeMixShader')
        world.links.new(path.outputs['Is Glossy Ray'],mix.inputs[0]);world.links.new(previous,mix.inputs[1]);world.links.new(sky.outputs[0],mix.inputs[2]);world.links.new(mix.outputs[0],output.inputs['Surface'])
    return m
