# 第一轮材质（Cycles 程序化），只用于烘焙；网页端显示烘焙后的贴图。
# 在 massing.py 之后 exec。不下载外部素材。
import bpy

def nodes(m):
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    return nt, b

def N(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        if k in n.inputs:
            n.inputs[k].default_value = v
    return n

def stone_shader(m, light=(0.80, 0.74, 0.63), dark=(0.55, 0.50, 0.42), dirt=(0.25, 0.23, 0.2)):
    """风化石灰岩：大块色差 + 细噪 + 砌块灰缝凹凸 + 底部与凹处的污渍（AO）。"""
    nt, b = nodes(m)
    tc = N(nt, 'ShaderNodeTexCoord')
    big = N(nt, 'ShaderNodeTexNoise', Scale=0.35, Detail=4.0, Roughness=0.6)
    fine = N(nt, 'ShaderNodeTexNoise', Scale=6.0, Detail=8.0)
    nt.links.new(tc.outputs['Object'], big.inputs['Vector']); nt.links.new(tc.outputs['Object'], fine.inputs['Vector'])
    c1 = N(nt, 'ShaderNodeMix'); c1.data_type = 'RGBA'
    c1.inputs['A'].default_value = (*dark, 1); c1.inputs['B'].default_value = (*light, 1)
    nt.links.new(big.outputs['Fac'], c1.inputs['Factor'])
    # 砌块：砖纹理，行高 0.4 m、块长 0.9 m（目视推算）
    brick = N(nt, 'ShaderNodeTexBrick', Scale=1.0, **{'Mortar Size': 0.012, 'Brick Width': 0.9, 'Row Height': 0.4})
    mp = N(nt, 'ShaderNodeMapping')
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], brick.inputs['Vector'])
    ao = N(nt, 'ShaderNodeAmbientOcclusion', Distance=1.5)
    ao.samples = 8
    sep = N(nt, 'ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    low = N(nt, 'ShaderNodeMapRange'); low.inputs['From Min'].default_value = 0.0; low.inputs['From Max'].default_value = 4.0
    nt.links.new(sep.outputs['Z'], low.inputs['Value'])
    grime = N(nt, 'ShaderNodeMath'); grime.operation = 'MULTIPLY'
    nt.links.new(ao.outputs['AO'], grime.inputs[0]); nt.links.new(low.outputs['Result'], grime.inputs[1])
    g2 = N(nt, 'ShaderNodeMapRange'); g2.inputs['To Min'].default_value = 0.35
    nt.links.new(grime.outputs['Value'], g2.inputs['Value'])
    c2 = N(nt, 'ShaderNodeMix'); c2.data_type = 'RGBA'; c2.inputs['A'].default_value = (*dirt, 1)
    nt.links.new(g2.outputs['Result'], c2.inputs['Factor']); nt.links.new(c1.outputs['Result'], c2.inputs['B'])
    c3 = N(nt, 'ShaderNodeMix'); c3.data_type = 'RGBA'; c3.blend_type = 'MULTIPLY'
    c3.inputs['Factor'].default_value = 0.12
    nt.links.new(c2.outputs['Result'], c3.inputs['A']); nt.links.new(fine.outputs['Color'], c3.inputs['B'])
    mortar = N(nt, 'ShaderNodeMix'); mortar.data_type = 'RGBA'; mortar.blend_type = 'MULTIPLY'
    nt.links.new(brick.outputs['Fac'], mortar.inputs['Factor'])
    nt.links.new(c3.outputs['Result'], mortar.inputs['A']); mortar.inputs['B'].default_value = (0.7, 0.68, 0.64, 1)
    nt.links.new(mortar.outputs['Result'], b.inputs['Base Color'])
    bump = N(nt, 'ShaderNodeBump', Strength=0.35, Distance=0.02)
    hs = N(nt, 'ShaderNodeMath'); hs.operation = 'SUBTRACT'
    nt.links.new(fine.outputs['Fac'], hs.inputs[0]); nt.links.new(brick.outputs['Fac'], hs.inputs[1])
    nt.links.new(hs.outputs['Value'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.85

def lead_shader(m):
    nt, b = nodes(m)
    tc = N(nt, 'ShaderNodeTexCoord')
    wave = N(nt, 'ShaderNodeTexWave', Scale=0.9, Distortion=0.0)
    wave.bands_direction = 'X'; wave.wave_profile = 'SAW'
    nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
    ns = N(nt, 'ShaderNodeTexNoise', Scale=2.0, Detail=6.0)
    mix = N(nt, 'ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (0.20, 0.23, 0.26, 1); mix.inputs['B'].default_value = (0.36, 0.40, 0.43, 1)
    nt.links.new(ns.outputs['Fac'], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    bump = N(nt, 'ShaderNodeBump', Strength=0.3); nt.links.new(wave.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Metallic'].default_value = 0.6; b.inputs['Roughness'].default_value = 0.45

def paving_shader(m, scale=1.4, c=((0.52, 0.49, 0.45), (0.40, 0.38, 0.35))):
    nt, b = nodes(m)
    tc = N(nt, 'ShaderNodeTexCoord')
    br = N(nt, 'ShaderNodeTexBrick', Scale=scale, **{'Mortar Size': 0.02, 'Brick Width': 0.6, 'Row Height': 0.3})
    br.inputs['Color1'].default_value = (*c[0], 1); br.inputs['Color2'].default_value = (*c[1], 1)
    br.inputs['Mortar'].default_value = (0.2, 0.19, 0.18, 1)
    nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
    nt.links.new(br.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.8

def wood_shader(m):
    nt, b = nodes(m)
    tc = N(nt, 'ShaderNodeTexCoord')
    wv = N(nt, 'ShaderNodeTexWave', Scale=6.0, Distortion=4.0, Detail=3.0)
    wv.bands_direction = 'Z'
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    mix = N(nt, 'ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (0.10, 0.05, 0.025, 1); mix.inputs['B'].default_value = (0.22, 0.12, 0.06, 1)
    nt.links.new(wv.outputs['Fac'], mix.inputs['Factor']); nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.6

def transparent(m, color_socket=None, color=(0.9, 0.9, 0.9), wash_f=0.3):
    """烘焙用玻璃：透明（阴影光线可穿过并被染色）。"""
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    if color_socket is None:
        tr.inputs['Color'].default_value = (*color, 1)
    else:
        col = color_socket(nt)
        # 透光颜色向白色混合 wash_f：彩窗 0.25–0.3（I9：60% 太淡，光斑发白），灰色调玻璃 0.65（几乎透明）
        wash = nt.nodes.new('ShaderNodeMix'); wash.data_type = 'RGBA'
        wash.inputs['Factor'].default_value = wash_f; wash.inputs['B'].default_value = (0.92, 0.9, 0.86, 1)
        nt.links.new(col, wash.inputs['A']); nt.links.new(wash.outputs['Result'], tr.inputs['Color'])
    nt.links.new(tr.outputs[0], out.inputs['Surface'])

M = bpy.data.materials
for name in ('Stone', 'Pier', 'StoneWall'):
    if name in M: stone_shader(M[name])
stone_shader(M['Statue'], light=(0.84, 0.79, 0.69), dark=(0.66, 0.61, 0.52))
lead_shader(M['Roof'])
paving_shader(M['Floor'], scale=1.0)       # 室内地板：铺石花纹直接烘进室内贴图（石板 0.6 × 0.3 m）
# 地面：烘焙里只留光影（平色底）；铺石细节在网页里按世界坐标平铺并与光照图相乘（blender/paving_texture.py）
_b = next(n for n in M['Ground'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
_b.inputs['Base Color'].default_value = (0.50, 0.48, 0.45, 1); _b.inputs['Roughness'].default_value = 0.9
wood_shader(M['Wood'])
transparent(M['GlassOut'], color=(0.88, 0.9, 0.92))
# 彩色玻璃：四类图案贴图（blender/glass_textures.py）按 “local” UV 贴到每块玻璃上。
import os, numpy as np
_gt = {}
exec(open(os.path.join(HERE, 'glass_textures.py'), encoding='utf-8').read(), _gt)
GLASS_WASH = {'rose': 0.25, 'abs': 0.25, 'med': 0.30, 'gris': 0.65}
os.makedirs(r"G:/selftool/Cathedral/work/glass_tex", exist_ok=True)

def glass_image(kind):
    arr = _gt['ALL'][kind]()
    h, w = arr.shape[:2]
    name = 'gtex_' + kind
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.concatenate([arr[::-1], np.ones((h, w, 1), np.float32)], axis=2).astype(np.float32)   # Blender 行 0 在底部
    img.pixels.foreach_set(rgba.ravel())
    img.pack()                                   # 打包进 .blend，不依赖磁盘文件
    return img

def stained_src(img):
    def build(nt):
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'local'
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.name = 'STAINED_SRC'
        tex.extension = 'EXTEND'; tex.interpolation = 'Linear'
        nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
        return tex.outputs['Color']
    return build

for _k, _w in GLASS_WASH.items():
    transparent(M['St_' + _k], color_socket=stained_src(glass_image(_k)), wash_f=_w)
print('materials ok')
