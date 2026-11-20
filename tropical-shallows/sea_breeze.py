"""原生 Ocean FFT 微风弱浪：真实风浪频谱和可播放的时间轴。"""
import bpy,numpy as np

def add_sea_breeze(scene,wind=3.5,wave_scale=.25):
    names=('透光浅水与细波','蕾丝状近岸浪沫','独立海沫泡缘')
    for name in names:
        obj=scene.objects.get(name)
        if not obj:continue
        coords=np.empty(len(obj.data.vertices)*3,np.float32);obj.data.vertices.foreach_get('co',coords);coords=coords.reshape(-1,3)
        surface=coords[:,2]>-1
        coords[surface,2]=.078 if name=='透光浅水与细波' else .086
        obj.data.vertices.foreach_set('co',coords.ravel());obj.data.update()
        for modifier in list(obj.modifiers):
            if modifier.type=='OCEAN':obj.modifiers.remove(modifier)
        oc=obj.modifiers.new('海风微风弱浪','OCEAN');oc.geometry_mode='DISPLACE'
        oc.resolution=32;oc.viewport_resolution=20;oc.spatial_size=90
        oc.spectrum='TEXEL_MARSEN_ARSLOE';oc.depth=2.5;oc.wind_velocity=wind
        oc.wave_scale=wave_scale;oc.wave_scale_min=.025;oc.choppiness=.65
        oc.wave_alignment=.65;oc.wave_direction=0;oc.damping=.65
        oc.use_normals=True;oc.random_seed=27
        oc.time=1;oc.keyframe_insert('time',frame=1)
        oc.time=5;oc.keyframe_insert('time',frame=121)
        if obj.animation_data and obj.animation_data.action:
            # Blender 5 的分槽 Action 使用现有通道袋，不假定旧 fcurves 接口。
            action=obj.animation_data.action
            for layer in action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for curve in bag.fcurves:
                            if curve.data_path.endswith('.time'):
                                for key in curve.keyframe_points:key.interpolation='LINEAR'
    water=scene.objects['透光浅水与细波'];water['shoaling_added']=True
    water['wind_metres_per_second']=wind;water['spectrum']='TMA, depth 2.5 m'
    scene.render.fps=30;scene.frame_start=1;scene.frame_end=121
    scene.frame_set(51)
