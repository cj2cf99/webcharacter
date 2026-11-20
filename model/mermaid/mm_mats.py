# 材质：设定第 8 节锁定色（HEX 为底色参考），皮肤暖象牙白、鳞片珠光蓝、尾鳍半透明蓝紫、珍珠、浅金、珊瑚。
import bpy
from mm_common import *

C = dict(scale=srgb('#368EC9'), deep=srgb('#245C9F'), light=srgb('#8CCEF5'), lilac=srgb('#B6AFE6'),
         pearl=srgb('#F5F0E9'), gold=srgb('#D9B477'), hair=srgb('#392D2E'), skin=srgb('#ECC9B6'),
         coral=srgb('#E8786A'), ribbon=srgb('#BDE3FF'), gem=srgb('#4DA5E8'))


def skin_common(t):
    t.set(Roughness=.40, Subsurface_Weight=.32, Subsurface_Scale=.014,
          Subsurface_Radius=(1.0, .40, .22), Specular_IOR_Level=.45, Coat_Weight=.18, Coat_Roughness=.28)
    # 微观皮肤纹理：细噪声 + 毛孔（Voronoi）凹凸；光泽度轻微起伏（湿润感不均匀）
    n = t.node('ShaderNodeTexNoise', i_Scale=900., i_Detail=4.)
    vo = t.node('ShaderNodeTexVoronoi', i_Scale=2600.)
    pores = t.math('SUBTRACT', t.math('MULTIPLY', n.outputs['Fac'], .6), t.math('MULTIPLY', t.math('LESS_THAN', vo.outputs['Distance'], .18), .35))
    b = t.node('ShaderNodeBump', i_Strength=.08, i_Distance=.0004)
    t.link(pores, b.inputs['Height']); t.link(b.outputs['Normal'], t.bsdf.inputs['Normal'])
    rn = t.node('ShaderNodeTexNoise', i_Scale=60., i_Detail=2.)
    t.set(Roughness=t.math('ADD', .30, t.math('MULTIPLY', rn.outputs['Fac'], .22)))


def skin_tone(t, base):
    """大尺度肤色斑驳（±4%）。"""
    mn = t.node('ShaderNodeTexNoise', i_Scale=22., i_Detail=3.)
    return t.mix(t.math('MULTIPLY', t.math('SUBTRACT', mn.outputs['Fac'], .5), .5), base, srgb('#E6B3A3'))


def body_mat():
    m, t = new_mat('MM_Skin_Body', C['skin'])
    skin_common(t)
    tm = t.attr('tailmask').outputs['Fac']
    fl = t.attr('flush').outputs['Fac']
    skin = t.mix(t.math('MULTIPLY', fl, .38), C['skin'], srgb('#E89C90'))
    skin = skin_tone(t, skin)
    col = t.mix(tm, skin, C['deep'])
    t.set(Base_Color=col)
    return m


def head_mat():
    m, t = new_mat('MM_Skin_Head', C['skin'])
    skin_common(t)
    t.set(Base_Color=skin_tone(t, t.attr('paint').outputs['Color']))
    lip = t.attr('lip').outputs['Fac']
    t.set(Roughness=t.math('SUBTRACT', .42, t.math('MULTIPLY', lip, .2)))
    # 发区：发丝下的头皮呈“发片”质感（沿流向各向异性高光 + 细条纹），避免露出平涂色块
    hb = t.node('ShaderNodeBsdfPrincipled')
    ac = t.attr('hacross').outputs['Fac']
    st = t.math('SINE', t.math('MULTIPLY', ac, 420.))
    st2 = t.math('SINE', t.math('MULTIPLY', ac, 1310.))
    stripe = t.math('ADD', t.math('MULTIPLY', st, .5), t.math('MULTIPLY', st2, .3))
    col = t.mix(t.math('ADD', t.math('MULTIPLY', stripe, .35), .5), srgb('#2A1E1A'), srgb('#5A3D30'))
    t.link(col, hb.inputs['Base Color']); hb.inputs['Roughness'].default_value = .34
    hb.inputs['Anisotropic'].default_value = .85; hb.inputs['Specular Tint'].default_value = srgb('#E8C9B0')
    fl = t.attr('hflow'); t.link(fl.outputs['Vector'], hb.inputs['Tangent'])
    bump = t.node('ShaderNodeBump', i_Strength=.3, i_Distance=.0003); t.link(stripe, bump.inputs['Height']); t.link(bump.outputs['Normal'], hb.inputs['Normal'])
    mix = t.node('ShaderNodeMixShader')
    t.link(t.attr('hairmask').outputs['Fac'], mix.inputs[0]); t.link(t.bsdf.outputs[0], mix.inputs[1]); t.link(hb.outputs[0], mix.inputs[2])
    t.link(mix.outputs[0], t.out.inputs['Surface'])
    return m


def eye_mat():
    m, t = new_mat('MM_Eye', (1, 1, 1, 1))
    ec = t.attr('eyecos').outputs['Fac']
    # 巩膜 → 角膜缘（暗）→ 琥珀浅棕虹膜（放射纹）→ 瞳孔
    ramp = t.node('ShaderNodeValToRGB')
    el = ramp.color_ramp.elements
    el[0].position = .0; el[0].color = srgb('#E9E3E0')
    el[1].position = .76; el[1].color = srgb('#E6DEDB')
    for pos, hx in ((.800, '#3E2618'), (.818, '#875A33'), (.90, '#C99358'), (.948, '#6E4224'), (.956, '#120C0A'), (1., '#0A0707')):
        e = el.new(pos); e.color = srgb(hx)
    t.link(ec, ramp.inputs['Fac'])
    ang = t.attr('eyeang').outputs['Fac']
    streak = t.math('MULTIPLY', t.math('SINE', t.math('MULTIPLY', ang, 53.)), t.math('SINE', t.math('ADD', t.math('MULTIPLY', ang, 17.), 1.3)))
    band = t.math('MULTIPLY', t.math('GREATER_THAN', ec, .815), t.math('LESS_THAN', ec, .95))
    k = t.math('ADD', 1., t.math('MULTIPLY', t.math('MULTIPLY', streak, band), .35))
    col = t.node('ShaderNodeMix'); col.data_type = 'RGBA'; col.blend_type = 'MULTIPLY'; col.inputs[0].default_value = 1.
    t.link(ramp.outputs['Color'], col.inputs[6]); cr = t.node('ShaderNodeCombineColor'); t.link(k, cr.inputs[0]); t.link(k, cr.inputs[1]); t.link(k, cr.inputs[2])
    t.link(cr.outputs[0], col.inputs[7])
    t.set(Base_Color=col.outputs[2], Roughness=.05, Coat_Weight=1., Coat_Roughness=.02, Specular_IOR_Level=.6)
    return m


def ramp(t, src, stops):
    r = t.node('ShaderNodeValToRGB'); el = r.color_ramp.elements
    el[0].position = stops[0][0]; el[0].color = stops[0][1]
    el[1].position = stops[-1][0]; el[1].color = stops[-1][1]
    for pos, col in stops[1:-1]:
        e = el.new(pos); e.color = col
    t.link(src, r.inputs['Fac'])
    return r.outputs['Color']


def scale_mat():
    m, t = new_mat('MM_Scales', C['scale'])
    r = t.attr('sc_r').outputs['Fac']; tone = t.attr('sc_tone').outputs['Fac']; s = t.attr('sc_s').outputs['Fac']
    base = ramp(t, r, [(0, srgb('#79BEEC')), (.35, srgb('#4C9FD8')), (.70, C['scale']), (.86, C['deep']),
                       (.91, C['gold']), (1, C['gold'])])
    # 少量鳞片带淡紫虹彩；越近尾柄越偏深海蓝
    lw = t.node('ShaderNodeLayerWeight', i_Blend=.45)
    tint = t.math('MULTIPLY', t.math('ADD', t.math('MULTIPLY', t.math('POWER', tone, 2.), .75), .08), lw.outputs['Facing'])
    col = t.mix(tint, base, C['lilac'])
    col = t.mix(t.math('MULTIPLY', s, .25), col, C['deep'])
    col = t.mix(t.math('MULTIPLY', t.math('SUBTRACT', 1., t.math('MINIMUM', t.math('MULTIPLY', s, 4.), 1.)), .45), col, srgb('#C9B5EC'))   # 臀根附近偏淡紫粉
    metal = t.math('MULTIPLY', t.math('GREATER_THAN', r, .9), .85)
    t.set(Base_Color=col, Metallic=t.math('ADD', metal, .12), Roughness=.24, Coat_Weight=.5, Coat_Roughness=.12,
          Thin_Film_Thickness=380., Thin_Film_IOR=1.45, Specular_IOR_Level=.6)
    return m


def fin_mat():
    m, t = new_mat('MM_Fin', C['light'])
    ft = t.attr('fin_t').outputs['Fac']; fv = t.attr('fin_v').outputs['Fac']; lay = t.attr('fin_layer').outputs['Fac']
    col = ramp(t, ft, [(0, srgb('#2A6AB2')), (.25, srgb('#4F9CE0')), (.55, srgb('#94B6F0')), (.8, srgb('#B3ADEC')), (1, srgb('#CDB8F0'))])
    # 鳍条：沿鳍叶从根部向鳍尖放射的细线
    k = t.math('FRACT', t.math('ADD', t.math('MULTIPLY', fv, 6.5), .5))
    ray = t.math('SUBTRACT', 1., t.math('MINIMUM', t.math('MULTIPLY', t.math('ABSOLUTE', t.math('SUBTRACT', k, .5)), 9.), 1.))
    ray = t.math('MULTIPLY', ray, t.math('SUBTRACT', 1., t.math('MULTIPLY', ft, .5)))
    col = t.mix(t.math('MULTIPLY', ray, .45), col, srgb('#EAF3FF'))
    col = t.mix(t.math('MULTIPLY', lay, .12), col, C['deep'])
    edge = t.math('POWER', t.math('ABSOLUTE', fv), 3.)
    alpha = t.math('ADD', t.math('MULTIPLY', t.math('SUBTRACT', 1., t.math('MULTIPLY', ft, .55)), t.math('SUBTRACT', 1., t.math('MULTIPLY', edge, .4))), t.math('MULTIPLY', ray, .18))
    alpha = t.math('MULTIPLY', alpha, .88, clamp=True)
    t.set(Base_Color=col, Alpha=alpha, Roughness=.16, Transmission_Weight=.3, Coat_Weight=.4,
          Thin_Film_Thickness=520., Thin_Film_IOR=1.38, Specular_IOR_Level=.55)
    bump = t.node('ShaderNodeBump', i_Strength=.25, i_Distance=.0006)
    t.link(ray, bump.inputs['Height']); t.link(bump.outputs['Normal'], t.bsdf.inputs['Normal'])
    m.use_backface_culling = False
    return m


def gold_mat():
    m, t = new_mat('MM_Gold', C['gold']); t.set(Metallic=1., Roughness=.26)
    return m


def pearl_mat():
    m, t = new_mat('MM_Pearl', C['pearl'])
    t.set(Roughness=.2, Coat_Weight=1., Coat_Roughness=.08, Sheen_Weight=.3, Subsurface_Weight=.15,
          Subsurface_Scale=.003, Thin_Film_Thickness=260., Thin_Film_IOR=1.6)
    return m


def shell_mat(name='MM_Shell', color='#9DC0EC'):
    m, t = new_mat(name, srgb(color))
    lw = t.node('ShaderNodeLayerWeight', i_Blend=.5)
    col = t.mix(t.math('MULTIPLY', lw.outputs['Facing'], .6), srgb(color), C['lilac'])
    t.set(Base_Color=col, Roughness=.2, Coat_Weight=.8, Coat_Roughness=.1, Thin_Film_Thickness=250.,
          Thin_Film_IOR=1.5, Subsurface_Weight=.1, Subsurface_Scale=.004)
    return m


def gem_mat():
    m, t = new_mat('MM_Gem', C['gem'])
    t.set(Roughness=.02, Transmission_Weight=.9, IOR=1.7, Coat_Weight=1.)
    return m


def hair_mat():
    m, t = new_mat('MM_Hair', C['hair'])
    rnd = t.attr('hair_rand').outputs['Fac']; ht = t.attr('hair_t').outputs['Fac']
    col = t.mix(t.math('MULTIPLY', rnd, .6), srgb('#32241F'), srgb('#5A3D30'))
    col = t.mix(t.math('MULTIPLY', ht, .35), col, srgb('#77513D'))
    tg = t.node('ShaderNodeTangent', direction_type='UV_MAP', uv_map='HairUV')
    t.set(Base_Color=col, Roughness=.36, Anisotropic=.85, Specular_IOR_Level=.55, Sheen_Weight=.15,
          Specular_Tint=srgb('#E8C9B0'))
    t.link(tg.outputs['Tangent'], t.bsdf.inputs['Tangent'])
    return m


def coral_mat():
    m, t = new_mat('MM_Coral', C['coral'])
    t.set(Roughness=.55, Subsurface_Weight=.3, Subsurface_Scale=.003, Subsurface_Radius=(1., .35, .3))
    n = t.node('ShaderNodeTexNoise', i_Scale=1800., i_Detail=3.)
    b = t.node('ShaderNodeBump', i_Strength=.4, i_Distance=.0003)
    t.link(n.outputs['Fac'], b.inputs['Height']); t.link(b.outputs['Normal'], t.bsdf.inputs['Normal'])
    return m


def ribbon_mat():
    m, t = new_mat('MM_Ribbon', C['ribbon'])
    t.set(Alpha=.55, Roughness=.25, Transmission_Weight=.4, Sheen_Weight=.4, Thin_Film_Thickness=300.)
    m.use_backface_culling = False
    return m


def make_all():
    return dict(body=body_mat(), head=head_mat(), eye=eye_mat(), scales=scale_mat(), fin=fin_mat(),
                gold=gold_mat(), pearl=pearl_mat(), shell=shell_mat(), gem=gem_mat(),
                blue=shell_mat('MM_BluePetal', '#9CCBF0'), hair=hair_mat(), coral=coral_mat(), ribbon=ribbon_mat())
