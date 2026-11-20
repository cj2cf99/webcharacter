# 人鱼公主 3D 模型构建入口（Blender 5.2 后台运行）。
# 用法：blender --background --factory-startup --python-exit-code 1 --python model/mermaid/build_mermaid.py -- [--render] [--quick]
import sys, os, time, json
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bpy, numpy as np
from mathutils import Vector
import importlib
import mm_common, mm_body, mm_head, mm_mats, mm_tail, mm_hair, mm_acc, mm_rig
for m in (mm_common, mm_body, mm_head, mm_mats, mm_tail, mm_hair, mm_acc, mm_rig): importlib.reload(m)
from mm_common import *

ROOT = HERE.parent.parent
OUT = ROOT / 'work' / 'mermaid'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def log(*a):
    print('[mermaid]', *a, flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'


def gpu():
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind; prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices: d.use = d.type == kind
                    bpy.context.scene.cycles.device = 'GPU'; return kind
            except Exception:
                pass
    except Exception:
        pass
    return 'CPU'


def build():
    t0 = time.time()
    M = mm_mats.make_all()
    coll = bpy.context.scene.collection
    body = mm_body.build_body(M['body']); log('body', len(body.data.vertices), 'verts', round(time.time() - t0, 1), 's')
    head_parts = mm_head.build_head(M['head'], M['eye'], None)
    for e in head_parts:
        if e.name.startswith('MM_Ear'): e.data.materials.clear(); e.data.materials.append(M['body'])
    for e in head_parts:
        if e.name.startswith('MM_Eye'):
            V = np.array([v.co for v in e.data.vertices]); c = V.mean(0)
            d = (V - c) / np.linalg.norm(V - c, axis=1, keepdims=True)
            a = e.data.attributes.new('eyecos', 'FLOAT', 'POINT'); a.data.foreach_set('value', (-d[:, 1]).astype(np.float32))
            a = e.data.attributes.new('eyeang', 'FLOAT', 'POINT'); a.data.foreach_set('value', np.arctan2(d[:, 2], d[:, 0]).astype(np.float32))
            e.data.materials.clear(); e.data.materials.append(M['eye'])
    log('head', round(time.time() - t0, 1), 's')
    scales = mm_tail.build_scales(M['scales']); log('scales', scales['scale_count'], round(time.time() - t0, 1), 's')
    fin, rim, k, finx = mm_tail.build_fins(M['fin'], M['gold'], pearl_mat=M['pearl']); log('fin x-scale', round(k, 3))
    orn = mm_tail.tail_ornament(M['gold'], M['pearl'], M['blue'])
    side_fins = mm_tail.build_side_fins(M['fin'])
    acc = mm_acc.build_all(M); log('accessories', len(acc), round(time.time() - t0, 1), 's')
    if '--nohair' not in ARGS:
        hair, fine = mm_hair.build_hair(M['hair'], per=4 if '--quick' in ARGS else 20)
        log('hair strands', hair['strands'], len(hair.data.vertices), 'verts', round(time.time() - t0, 1), 's')
    return dict(body=body, head=head_parts, mats=M)


def add_rig():
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    rig = mm_rig.rig_all(objs); mm_rig.swim_action(rig)
    log('rig', len(rig.data.bones), 'bones')
    return rig


def underwater_and_video(frames=96):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('Underwater'); sc.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes['Background']
    grad = nt.nodes.new('ShaderNodeTexGradient'); tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].color = srgb('#0A3A5E'); ramp.color_ramp.elements[1].color = srgb('#7CC8E0')
    ramp.color_ramp.elements[0].position = .35; ramp.color_ramp.elements[1].position = .75
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.1
    for o in [o for o in sc.objects if o.type == 'LIGHT']: bpy.data.objects.remove(o)
    d = bpy.data.lights.new('Sun', 'SUN'); d.energy = 4.0; d.angle = .12; d.color = (.85, .95, 1)
    o = bpy.data.objects.new('Sun', d); sc.collection.objects.link(o); o.rotation_euler = (np.radians(25), np.radians(-15), 0)
    d = bpy.data.lights.new('Rim', 'AREA'); d.energy = 600; d.size = 3; d.color = (.7, .85, 1)
    o = bpy.data.objects.new('RimU', d); sc.collection.objects.link(o); o.location = (-2.5, -1.5, -2.0)
    o.rotation_euler = (Vector((0, -1.5, 0)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    cam = sc.camera; cam.data.type = 'PERSP'; cam.data.lens = 35
    cam.location = (4.3, -2.1, 1.35); cam.rotation_euler = (Vector((0, -1.45, .25)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.engine = 'BLENDER_EEVEE'
    try: sc.eevee.taa_render_samples = 64
    except Exception: pass
    sc.render.resolution_x = 1280; sc.render.resolution_y = 720
    sc.frame_start = 1; sc.frame_end = frames
    try: sc.render.image_settings.media_type = 'VIDEO'
    except Exception: pass
    sc.render.image_settings.file_format = 'FFMPEG'
    sc.render.ffmpeg.format = 'MPEG4'; sc.render.ffmpeg.codec = 'H264'; sc.render.ffmpeg.constant_rate_factor = 'HIGH'
    sc.render.filepath = str(OUT / 'swim.mp4')
    bpy.ops.render.render(animation=True); log('video', sc.render.filepath)


def studio(res=1100):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 48 if '--quick' in ARGS else 128
    sc.cycles.use_denoising = True
    sc.render.resolution_x = res; sc.render.resolution_y = res
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    w = bpy.data.worlds.new('Studio'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (.93, .91, .92, 1); bg.inputs[1].default_value = .22
    # 相机看到的背景用参考设定图的浅暖白纸色；环境光照保持不变
    nt = w.node_tree; paper = nt.nodes.new('ShaderNodeBackground'); paper.inputs[0].default_value = srgb('#F3EEEE'); paper.inputs[1].default_value = 1.0
    lp = nt.nodes.new('ShaderNodeLightPath'); mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs[0]); nt.links.new(bg.outputs[0], mx.inputs[1]); nt.links.new(paper.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], nt.nodes['World Output'].inputs['Surface'])
    for name, loc, power, size, color in [('Key', (-2.2, -3.2, 3.8), 430, 2.5, (1, .95, .9)),
                                          ('Rim', (2.4, 2.6, 3.0), 420, 2.0, (.75, .85, 1)),
                                          ('Fill', (2.6, -2.6, 1.4), 80, 3.0, (.95, .9, 1))]:
        d = bpy.data.lights.new(name, 'AREA'); d.energy = power; d.size = size; d.color = color
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (Vector((0, 0, 1.6)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('Cam'); o = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(o); sc.camera = o


def render(name, loc, target, ortho=None, lens=85, rx=None, ry=None):
    sc = bpy.context.scene; cam = sc.camera
    if rx: sc.render.resolution_x = rx
    if ry: sc.render.resolution_y = ry
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
    cam.data.clip_end = 100
    sc.render.filepath = str(OUT / f'{name}.png')
    bpy.ops.render.render(write_still=True); log('render', name)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    reset(); log('gpu', gpu())
    parts = build()
    studio()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'mermaid.blend'))
    views = [a.split('=')[1] for a in ARGS if a.startswith('--views=')]
    views = views[0].split(',') if views else ['front', 'side', 'back', 'face']
    rest = [v for v in views if not v.startswith(('swim', 'swface'))]
    posed = [v for v in views if v.startswith(('swim', 'swface'))]
    for v in rest + ['__rig__'] + posed:
        if v == '__rig__':
            if '--rig' in ARGS or posed or '--anim' in ARGS:
                add_rig(); bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'mermaid.blend'))
            continue
        if v == 'three': render('three', (2.4, -4.2, 2.0), (0, 0, 1.5), lens=35, rx=1000, ry=1400)
        if v.startswith('swim'):
            f = int(v[4:] or 1); bpy.context.scene.frame_set(f)
            render(v, (4.2, -1.9, 1.25), (0, -1.45, .25), lens=38, rx=1400, ry=700)
            continue
        if v == 'front': render('front', (0, -8, 1.55), (0, 0, 1.55), ortho=3.25, rx=700, ry=1300)
        if v == 'side': render('side', (8, 0, 1.55), (0, 0, 1.55), ortho=3.25, rx=700, ry=1300)
        if v == 'back': render('back', (0, 8, 1.55), (0, 0, 1.55), ortho=3.25, rx=700, ry=1300)
        if v == 'upper': render('upper', (0, -4, 2.62), (0, 0, 2.62), ortho=.9, rx=900, ry=900)
        if v == 'upperside': render('upperside', (4, 0, 2.62), (0, 0, 2.62), ortho=.9, rx=900, ry=900)
        if v == 'face': render('face', (-.35, -.95, 2.96), (0, -.02, 2.94), lens=120, rx=900, ry=900)
        if v == 'faceside': render('faceside', (1.0, -.05, 2.95), (0, -.02, 2.94), lens=120, rx=900, ry=900)
        if v == 'fin': render('fin', (0, -5, .55), (0, 0, .55), ortho=1.35, rx=1100, ry=900)
        if v == 'tailmid': render('tailmid', (.9, -1.2, 1.9), (0, 0, 1.75), lens=70, rx=900, ry=900)
        if v == 'eye': render('eye', (.0, -.60, 2.948), (.0, -.06, 2.948), lens=200, rx=1000, ry=500)
        if v == 'mouth': render('mouth', (-.25, -.50, 2.90), (.0, -.07, 2.89), lens=200, rx=900, ry=700)
        if v == 'profile': render('profile', (1.1, -.03, 2.945), (0, -.03, 2.945), lens=150, rx=800, ry=900)
        if v.startswith('swface'):
            bpy.context.scene.frame_set(int(v[6:] or 1)); render(v, (.95, -3.85, .78), (0, -2.8, .48), lens=70, rx=1000, ry=700); continue
        if v == 'beauty': render('beauty', (-.9, -1.7, 2.75), (0, 0, 2.6), lens=70, rx=1100, ry=1300)
        if v == 'facefront': render('facefront', (0, -1.2, 2.94), (0, 0, 2.94), lens=200, rx=800, ry=900)
        if v == 'hand': render('hand', (.9, -.9, 2.25), (.25, -.05, 2.22), lens=110, rx=900, ry=900)
    if '--anim' in ARGS:
        bpy.context.scene.frame_set(1); underwater_and_video()
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'mermaid.blend'))


if __name__ == '__main__':
    main()
