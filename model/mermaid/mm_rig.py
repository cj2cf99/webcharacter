# 骨架与蒙皮：脊柱 + 颈头、连续 10 段尾椎（避免硬骨）、尾鳍根 / 左右鳍叶两段、双臂三段、发束三链。
# 权重按几何关系直接计算（沿中轴的分段线性插值、到臂骨的投影），再写入顶点组。
import numpy as np, bpy
from mathutils import Vector
from mm_common import *
import mm_body as B
import mm_hair as Hr
import mm_tail as T

# 躯干链：(名称, 头 h, 尾 h)；h 自头顶向下
SPINE = [('Pelvis', .82, .70), ('Spine1', .70, .55), ('Spine2', .55, .42), ('Chest', .42, .30),
         ('Neck', .27, .20), ('Head', .20, .02)]
TAIL = [(f'Tail{i + 1:02d}', .82 + .14 * i, .82 + .14 * (i + 1)) for i in range(10)]
CHAIN = [('Head', .11), ('Neck', .235), ('Chest', .36), ('Spine2', .485), ('Spine1', .625), ('Pelvis', .76)] + \
        [(n, (a + b) / 2) for n, a, b in TAIL]
HAIR_B = [('HairB1', .26), ('HairB2', .42), ('HairB3', .58), ('HairB4', .74)]
HAIR_S = [('HairS1', .30), ('HairS2', .46), ('HairS3', .62)]


def build_armature():
    arm = bpy.data.armatures.new('MM_Rig'); ob = bpy.data.objects.new('MM_Rig', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones

    def bone(name, h, t, parent=None, connect=False):
        b = eb.new(name); b.head = Vector(h); b.tail = Vector(t)
        if parent: b.parent = eb[parent]; b.use_connect = connect
        return b
    root = bone('Root', (0, 0, z_of(.82)), (0, .25, z_of(.82)))
    prev = 'Root'
    for n, a, b in SPINE:
        yc = lambda h: float(B.SEC_YC(h))
        bone(n, (0, yc(a), z_of(a)), (0, yc(b), z_of(b)), prev if n != 'Pelvis' else 'Root', connect=n not in ('Pelvis', 'Neck'))
        prev = n
        if n == 'Chest': chest = n
    eb['Neck'].parent = eb['Chest']
    prev = 'Root'
    for n, a, b in TAIL:
        bone(n, (0, 0, z_of(a)), (0, 0, z_of(b)), prev, connect=prev != 'Root'); prev = n
    fr = T.FIN_ROOT_Z
    bone('FinRoot', (0, 0, fr + .01), (0, 0, fr - .08), 'Tail10')
    k = T.fin_scale_to_width()
    for sg, s in ((1, 'L'), (-1, 'R')):
        d = np.array([sg * np.sin(np.radians(30)) * k, 0, -np.cos(np.radians(30))]); d /= np.linalg.norm(d)
        p0 = np.array([0, 0, fr]); p1 = p0 + d * .40
        d2 = np.array([sg * np.sin(np.radians(55)) * k, 0, -np.cos(np.radians(55))]); d2 /= np.linalg.norm(d2)
        bone('Fin.' + s, p0, p1, 'FinRoot'); bone('FinTip.' + s, p1, p1 + d2 * .38, 'Fin.' + s, True)
        S, E, W, d1, dd2 = B.arm_rig(sg)
        bone('UpperArm.' + s, S, E, 'Chest'); bone('Forearm.' + s, E, W, 'UpperArm.' + s, True)
        bone('Hand.' + s, W, W + dd2 * .17, 'Forearm.' + s, True)
        prevh = 'Chest'
        for i, (n, h) in enumerate(HAIR_S):
            h2 = h + .16
            x = sg * .10
            bone(n + '.' + s, (x, -.03, z_of(h)), (x, -.03, z_of(h2)), prevh, False); prevh = n + '.' + s
    prevh = 'Head'
    for i, (n, h) in enumerate(HAIR_B):
        bone(n, (0, .10, z_of(h)), (0, .10, z_of(h + .16)), prevh, i > 0); prevh = n
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def tent(vals, mids):
    """分段线性插值权重：vals(N) 落在 mids 之间的两根骨。返回 (N, len(mids))。"""
    mids = np.asarray(mids); N = len(vals); W = np.zeros((N, len(mids)))
    v = np.clip(vals, mids[0], mids[-1])
    i = np.clip(np.searchsorted(mids, v) - 1, 0, len(mids) - 2)
    t = (v - mids[i]) / (mids[i + 1] - mids[i])
    W[np.arange(N), i] = 1 - t; W[np.arange(N), i + 1] = t
    return W


def verts(ob):
    V = np.empty(len(ob.data.vertices) * 3, np.float32); ob.data.vertices.foreach_get('co', V)
    return V.reshape(-1, 3).astype(float)


def attr(ob, name):
    a = ob.data.attributes.get(name)
    if a is None: return None
    v = np.empty(len(a.data), np.float32); a.data.foreach_get('value', v); return v


def assign(ob, weights):
    """weights: {bone: array}；按 0.01 量化分批写入顶点组。"""
    tot = sum(weights.values()); tot = np.where(tot > 1e-6, tot, 1)
    for name, w in weights.items():
        w = w / tot
        if w.max() < .005: continue
        vg = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
        q = np.round(w * 100).astype(int)
        for val in np.unique(q):
            if val == 0: continue
            idx = np.nonzero(q == val)[0].tolist()
            vg.add(idx, val / 100, 'REPLACE')


def chain_weights(V):
    h = H_TOTAL - V[:, 2]
    W = tent(h, [m for _, m in CHAIN])
    return {n: W[:, i] for i, (n, _) in enumerate(CHAIN)}


def arm_weights(V, base):
    """在 base（躯干权重）上叠加双臂；肩部 4–6 cm 内渐变。"""
    out = dict(base)
    blend_total = np.zeros(len(V))
    for sg, s in ((1, 'L'), (-1, 'R')):
        S, E, W, d1, d2 = B.arm_rig(sg)
        Hd_end = W + d2 * .20
        side = V[:, 0] * sg > .06
        u1 = (V - S) @ d1
        u2 = (V - E) @ d2
        # 到骨段距离
        def segd(P0, P1):
            d = P1 - P0; t = np.clip(((V - P0) @ d) / (d @ d), 0, 1)
            return np.linalg.norm(V - (P0 + t[:, None] * d), axis=1)
        dist = np.minimum(np.minimum(segd(S, E), segd(E, W)), segd(W, Hd_end))
        aw = side * (dist < .075) * smoothstep(-.035, .045, u1)
        along = np.where(u1 < .285, u1, .285 + np.clip(u2, 0, None))
        Wt = tent(along, [.12, .40, .56])
        out['UpperArm.' + s] = aw * Wt[:, 0]; out['Forearm.' + s] = aw * Wt[:, 1]; out['Hand.' + s] = aw * Wt[:, 2]
        blend_total += aw
    for n in base: out[n] = base[n] * (1 - np.clip(blend_total, 0, 1))
    return out


def skin(ob, rig, weights):
    assign(ob, weights)
    ob.parent = rig
    m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = rig
    m.use_deform_preserve_volume = ob.name in ('MM_Body',)


def fin_weights(V):
    root = np.array([0, 0, T.FIN_ROOT_Z])
    r = np.linalg.norm(V - root, axis=1); t = r / .80
    sg = np.sign(V[:, 0]); cen = np.exp(-(V[:, 0] / .04) ** 2)     # 中央鳍叶左右各半
    w_root = smoothstep(.12, .0, t); w_mid = np.clip(1 - w_root, 0, 1) * smoothstep(.75, .45, t)
    w_tip = np.clip(1 - w_root - w_mid, 0, 1)
    L = (sg > 0) * (1 - cen) + cen * .5; R = 1 - L
    return {'Tail10': w_root * .6, 'FinRoot': w_root * .4, 'Fin.L': w_mid * L, 'Fin.R': w_mid * R,
            'FinTip.L': w_tip * L, 'FinTip.R': w_tip * R}


def hair_weights(V, kind=None, t_attr=None):
    h = H_TOTAL - V[:, 2]
    head = smoothstep(.27, .20, h)
    sg = np.sign(V[:, 0])
    front = (kind == 2) if kind is not None else (V[:, 1] < -.01)
    Wb = tent(h, [m for _, m in HAIR_B]); Ws = tent(h, [m for _, m in HAIR_S])
    out = {'Head': head}
    rest = 1 - head
    for i, (n, _) in enumerate(HAIR_B): out[n] = rest * Wb[:, i] * ~front
    for i, (n, _) in enumerate(HAIR_S):
        out[n + '.L'] = rest * Ws[:, i] * front * (sg > 0)
        out[n + '.R'] = rest * Ws[:, i] * front * (sg <= 0)
    return out


def rig_all(objs):
    rig = build_armature()
    for ob in objs:
        if ob.type != 'MESH' or ob.name == 'MM_Rig': continue
        V = verts(ob); n = ob.name
        if n == 'MM_Body':
            w = arm_weights(V, chain_weights(V))
        elif n in ('MM_Scales', 'MM_SideFins'):
            w = chain_weights(V)
        elif n.startswith('MM_Fin') or n in ('MM_FinRim',):
            w = fin_weights(V)
        elif n in ('MM_TailChain', 'MM_TailDrop'):
            w = fin_weights(V)
        elif n.startswith('MM_Tail'):
            w = {'Tail10': np.ones(len(V))}
        elif n == 'MM_Hair':
            k = attr(ob, 'hair_kind')
            w = hair_weights(V, k)
        elif n == 'MM_Ribbons':
            w = hair_weights(V); w = {kk: vv for kk, vv in w.items()}
        elif n == 'MM_Head':
            hh = H_TOTAL - V[:, 2]
            w = {'Head': smoothstep(.235, .19, hh), 'Neck': smoothstep(.19, .235, hh) * smoothstep(.29, .25, hh),
                 'Chest': smoothstep(.25, .29, hh)}
        elif n.startswith(('MM_Arm',)):
            w = {'UpperArm.L': (V[:, 0] > 0).astype(float), 'UpperArm.R': (V[:, 0] <= 0).astype(float)}
        elif n.startswith(('MM_Bra', 'MM_Bow')):
            w = {'Chest': np.ones(len(V)) * .8, 'Spine2': np.ones(len(V)) * .2}
        elif n.startswith('MM_Necklace'):
            w = {'Chest': np.ones(len(V)) * .7, 'Neck': np.ones(len(V)) * .3}
        else:
            w = {'Head': np.ones(len(V))}     # 眼、耳、眉睫、发饰、耳饰、眉心纹
        skin(ob, rig, w)
    return rig


def swim_action(rig, frames=96):
    """原地游动循环（4 s @24fps）：海豚式上下波动、尾鳍滞后跟随、发束漂动；整体俯卧水平。"""
    sc = bpy.context.scene; sc.frame_start = 1; sc.frame_end = frames; sc.render.fps = 24
    rig.rotation_mode = 'XYZ'
    pb = rig.pose.bones
    for b in pb: b.rotation_mode = 'XYZ'
    spine = ['Pelvis', 'Spine1', 'Spine2', 'Chest']
    tail = [n for n, _, _ in TAIL]
    for f in range(1, frames + 2):
        ph = 2 * np.pi * (f - 1) / frames
        rig.rotation_euler = (np.radians(80) + .05 * np.sin(ph + 1.2), 0, 0)
        rig.location = (0, 0, .03 * np.sin(ph + .6))
        rig.keyframe_insert('rotation_euler', frame=f); rig.keyframe_insert('location', frame=f)
        for i, n in enumerate(spine):
            pb[n].rotation_euler = (.035 * np.sin(ph - .5 * i), 0, .015 * np.sin(ph * .5 + i))
            pb[n].keyframe_insert('rotation_euler', frame=f)
        pb['Neck'].rotation_euler = (-.68 + .04 * np.sin(ph + .8), 0, .05 * np.sin(ph * .5))
        pb['Head'].rotation_euler = (-.50 - .05 * np.sin(ph + .8), .04 * np.sin(ph * .5 + 1), 0)
        for n in ('Neck', 'Head'): pb[n].keyframe_insert('rotation_euler', frame=f)
        for i, n in enumerate(tail):
            amp = .05 + .16 * (i / 9) ** 1.3
            pb[n].rotation_euler = (amp * np.sin(ph - .62 * (i + 1)), 0, .02 * np.sin(ph * .5 - .3 * i))
            pb[n].keyframe_insert('rotation_euler', frame=f)
        pb['FinRoot'].rotation_euler = (.30 * np.sin(ph - 7.0), 0, 0)
        pb['FinRoot'].keyframe_insert('rotation_euler', frame=f)
        for s in 'LR':
            sg = 1 if s == 'L' else -1
            pb['Fin.' + s].rotation_euler = (.22 * np.sin(ph - 7.6), 0, sg * .08 * np.sin(ph - 7.6))
            pb['FinTip.' + s].rotation_euler = (.30 * np.sin(ph - 8.3), 0, sg * .06 * np.sin(ph - 8.4))
            pb['UpperArm.' + s].rotation_euler = (.10 * np.sin(ph + 1.5), 0, sg * (.22 + .06 * np.sin(ph + 1.5)))
            pb['Forearm.' + s].rotation_euler = (-.25 + .08 * np.sin(ph + 2.2), 0, 0)
            pb['Hand.' + s].rotation_euler = (.15 * np.sin(ph + 2.8), 0, 0)
            for n in ('Fin.', 'FinTip.', 'UpperArm.', 'Forearm.', 'Hand.'):
                pb[n + s].keyframe_insert('rotation_euler', frame=f)
            for i, (n, _) in enumerate(HAIR_S):
                pb[n + '.' + s].rotation_euler = (.10 * np.sin(ph - .8 * i - 1), 0, sg * .06 * np.sin(ph * .5 - i))
                pb[n + '.' + s].keyframe_insert('rotation_euler', frame=f)
        for i, (n, _) in enumerate(HAIR_B):
            pb[n].rotation_euler = ((1.0 if i == 0 else -.04) + .12 * np.sin(ph - .8 * i - 1.4), 0, .05 * np.sin(ph * .5 - .7 * i))
            pb[n].keyframe_insert('rotation_euler', frame=f)
    act = rig.animation_data.action; act.name = 'MM_Swim'
    try:
        for fc in act.fcurves:
            fc.modifiers.new('CYCLES')
    except Exception:
        pass
    return act
