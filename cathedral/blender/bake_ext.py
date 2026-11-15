# W3：外部“颜色 + 遮蔽”烘焙（不含光照）。在 bake.py 之后 exec（用到它的 select_only / bake_image / set_target /
# load_exr / save_webp / export_material / export_glb / B_* 物体）。
# 输出到 site/assets_next/，现有 site/assets/ 不动，等 W4 的网页着色器完成后再切换。
#   tex_<组>.webp        颜色（sRGB 8 位），导出进 glb 当 baseColor
#   tex_<组>_ao.webp     环境遮蔽（灰度，线性 8 位），网页里只乘天光，不乘阳光
# 室内仍走原来的光照烘焙（W6 改为按时间的关键帧）。
import os, shutil
import numpy as np

NEXT = ROOT + "/site/assets_next"
os.makedirs(NEXT, exist_ok=True)
EXT_RES = {'ext_a': (4096, 2048), 'ext_b': (4096, 2048), 'ground': (2048, 1024), 'door_l': (512, 256), 'door_r': (512, 256)}   # (颜色, 遮蔽)
AO_DISTANCE = 6.0          # 米：遮蔽射线长度。建筑尺度下取 6 m，柱廊、拱券内侧、墙角会变暗，大面不受影响
AO_SAMPLES = 96

def srgb_oetf(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)

def bake_albedo(name):
    res = EXT_RES[name][0]
    o = bpy.data.objects['B_' + name]
    img = bake_image(name + '_alb', res)
    set_target(o, img)
    bpy.context.scene.cycles.samples = 4          # 只取颜色，不需要采样
    select_only([o])
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=4, use_clear=True)
    img.filepath_raw = f"{WORK}/{name}_alb.exr"; img.file_format = 'OPEN_EXR'; img.save()
    print('albedo', name)

def bake_ao(name):
    res = EXT_RES[name][1]
    o = bpy.data.objects['B_' + name]
    img = bake_image(name + '_ao', res)
    set_target(o, img)
    sc = bpy.context.scene
    sc.world.light_settings.distance = AO_DISTANCE
    sc.cycles.samples = AO_SAMPLES
    glass = bpy.data.objects.get('B_glass')
    if glass: glass.hide_render = True           # 窗玻璃是薄片，不参与遮蔽
    select_only([o])
    bpy.ops.object.bake(type='AO', margin=4, use_clear=True)
    if glass: glass.hide_render = False
    img.filepath_raw = f"{WORK}/{name}_ao.exr"; img.file_format = 'OPEN_EXR'; img.save()
    print('ao', name)

def encode_ext():
    for name in EXT_RES:
        a, w, h = load_exr(f"{WORK}/{name}_alb.exr")
        save_webp(srgb_oetf(a).astype(np.float32), w, h, f"{NEXT}/tex_{name}.webp", 90)
        a, w, h = load_exr(f"{WORK}/{name}_ao.exr")
        g = np.clip(a.mean(axis=2, keepdims=True), 0, 1).repeat(3, axis=2).astype(np.float32)
        save_webp(g, w, h, f"{NEXT}/tex_{name}_ao.webp", 82)
    print('encoded')

def export_ext():
    """导出 exterior.glb（ext_a、ext_b、地面、玻璃）和 door.glb 到 assets_next。玻璃重烘一遍，保证与当前 UV 对应。"""
    global SITE
    saved = SITE
    SITE = NEXT
    try:
        bake_glass()
        a, w, h = load_exr(f"{WORK}/glass.exr")
        save_webp(np.clip(a, 0, 1) ** (1 / 2.2), w, h, f"{NEXT}/tex_glass.webp", 85)
        for name in list(EXT_RES) + ['glass']:
            o = bpy.data.objects['B_' + name]
            if name == 'glass' and 'local' in o.data.uv_layers:
                o.data.uv_layers.remove(o.data.uv_layers['local'])
            m = export_material(name)
            o.data.materials.clear(); o.data.materials.append(m)
        B = lambda *n: [bpy.data.objects['B_' + x] for x in n]
        export_glb(f"{NEXT}/exterior.glb", B('ext_a', 'ext_b', 'ground', 'glass'), normals=True)      # 实时光照需要法线
        export_glb(f"{NEXT}/door.glb", B('door_l', 'door_r'), normals=True)
    finally:
        SITE = saved
    for f in sorted(os.listdir(NEXT)):
        print(f, os.path.getsize(f"{NEXT}/{f}"))
print('bake_ext.py loaded')
