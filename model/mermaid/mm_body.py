# 人体 + 鱼尾连续主体：沿中轴放样截面（宽度为设定表锁定值），双臂、双手单独放样，最后体素重构为一个无缝网格。
import numpy as np, bpy
from mm_common import *

# ---- 截面控制点（h：自头顶向下，米；a：半宽；f：前深；b：后深） ----
# 鱼尾 s=0/35/80/115/140 cm 的横向全宽 39/32/20/13/9 cm 为设定锁定值；
# 前后深度设定未给出数值，此处为【推定·非锁定】的建模取值（约为宽度的 0.55–0.62）。
_H = [0.185, 0.215, 0.240, 0.262, 0.278, 0.296, 0.318, 0.350, 0.380, 0.410, 0.450, 0.500,
      0.550, 0.600, 0.650, 0.700, 0.750, 0.790, 0.820,
      0.82 + .10, 0.82 + .35, 0.82 + .80, 0.82 + 1.15, 0.82 + 1.40, 0.82 + 1.43]
_A = [.041, .043, .045, .049, .092, .126, .138, .140, .137, .134, .127, .121,
      .116, .113, .128, .152, .175, .189, .195,
      .186, .160, .100, .065, .045, .030]
_F = [.047, .047, .048, .050, .054, .062, .074, .088, .096, .098, .091, .086,
      .083, .080, .083, .089, .094, .096, .096,
      .093, .086, .060, .040, .026, .016]
_B = [.052, .053, .054, .056, .058, .064, .076, .084, .088, .086, .082, .078,
      .074, .070, .082, .102, .118, .122, .120,
      .110, .094, .064, .042, .028, .017]
_YC = [.020, .022, .022, .018, .012, .008, .004, .002, .000, -.002, -.002, .000,
       .002, .004, .004, .002, .000, .000, .000,
       .000, .000, .000, .000, .000, .000]
_N = [2.0, 2.0, 2.0, 2.0, 2.0, 2.05, 2.15, 2.2, 2.2, 2.2, 2.2, 2.2,
      2.15, 2.1, 2.1, 2.15, 2.15, 2.1, 2.05,
      2.05, 2.05, 2.05, 2.1, 2.2, 2.2]
SEC_A, SEC_F, SEC_B, SEC_YC, SEC_N = (pchip(_H, v) for v in (_A, _F, _B, _YC, _N))
H_END = _H[-1]


def tail_width_cm(s_cm):
    """鱼尾 s(cm) 处横向全宽（设定控制点 + 单调平滑）。"""
    return 2 * 100 * SEC_A(0.82 + np.asarray(s_cm) / 100)


# ---- 局部隆起（外表体积） ----
# (类型, 中心x, 中心h, 半径x, 半径h, 幅度, 朝向 front/back/any, 下垂)
BUMPS = [
    ('breast', +.072, .405, .064, .064, .054, 'front'),
    ('breast', -.072, .405, .064, .064, .054, 'front'),
    ('glute', +.088, .800, .110, .110, .036, 'back'),
    ('glute', -.088, .800, .110, .110, .036, 'back'),
    ('scap', +.075, .375, .055, .060, .008, 'back'),
    ('scap', -.075, .375, .055, .060, .008, 'back'),
    ('notch', 0, .283, .014, .012, -.007, 'front'),                 # 胸骨上窝
    ('sternum', 0, .370, .008, .060, -.0018, 'front'),
    ('linea', 0, .575, .006, .100, -.0016, 'front'),                # 腹白线
    ('abs', +.030, .585, .026, .075, .0020, 'front'),
    ('abs', -.030, .585, .026, .075, .0020, 'front'),
    ('ribarch', +.062, .468, .045, .014, .0028, 'front'),
    ('ribarch', -.062, .468, .045, .014, .0028, 'front'),
    ('iliac', +.105, .745, .030, .030, .0030, 'front'),
    ('iliac', -.105, .745, .030, .030, .0030, 'front'),
    ('spine', 0, .560, .014, .250, -.0055, 'back'),
    ('lumbar', 0, .660, .060, .060, -.006, 'back'),
    ('navel', 0, .640, .007, .008, -.0045, 'front'),
    ('belly', 0, .700, .085, .060, .005, 'front'),
    ('ribs', 0, .470, .080, .040, .004, 'front'),
]
# 锁骨：沿弧线的一串小隆起（内低外略高）
for sg in (1, -1):
    for k in range(9):
        u = k / 8
        BUMPS.append(('clav', sg * (.022 + .118 * u), .296 - .010 * u + .014 * (u - .55) ** 2, .020, .008, .0068, 'front'))


def section_points(h, t):
    """h(m) 与环向角 t 的外表点（未加隆起），以及近似法线。"""
    h, t = np.broadcast_arrays(np.asarray(h, float), np.asarray(t, float))
    a, f, b, yc, n = SEC_A(h), SEC_F(h), SEC_B(h), SEC_YC(h), SEC_N(h)
    c, s = np.cos(t), np.sin(t)
    e = 2.0 / n
    x = a * np.sign(c) * np.abs(c) ** e
    d = np.where(s < 0, f, b)
    y = yc + d * np.sign(s) * np.abs(s) ** e
    nx, ny = x / (a * a), (y - yc) / (d * d)
    nl = np.sqrt(nx * nx + ny * ny) + 1e-12
    return x, y, nx / nl, ny / nl


def bump_offset(x, h, ny):
    off = np.zeros_like(x)
    for kind, cx, ch, rx, rh, amp, side in BUMPS:
        d2 = ((x - cx) / rx) ** 2 + ((h - ch) / rh) ** 2
        prof = np.where(d2 < 1, (1 - d2) ** 2, 0.)
        if side == 'front': w = np.clip(-ny * 1.6, 0, 1)
        elif side == 'back': w = np.clip(ny * 1.6, 0, 1)
        else: w = 1.
        if kind == 'breast':  # 圆润半球 + 自然下垂：上缘平缓、下缘圆
            prof = np.where(d2 < 1, np.sqrt(np.clip(1 - d2, 0, 1)) ** 1.3, 0.) * smoothstep(1.0, .55, np.sqrt(d2)) ** .5
            up = np.clip((ch - h) / rh, 0, 1)
            prof = prof * (1 - .4 * up)
        off += amp * prof * w
    return off


def surface(h, t, extra=0.):
    """主体外表点（含隆起）。返回 (N,3) 世界坐标与 2D 法线。"""
    x, y, nx, ny = section_points(h, t)
    hh = np.broadcast_to(h, x.shape) if np.ndim(h) else np.full_like(x, h)
    off = bump_offset(x, hh, ny) + extra
    x = x + nx * off; y = y + ny * off
    z = z_of(hh)
    return np.stack([x, y, z], -1), np.stack([nx, ny, np.zeros_like(nx)], -1)


def body_loft(ring=144):
    hs = np.concatenate([np.linspace(.185, .82, 190), np.linspace(.825, H_END, 260)])
    t = np.linspace(0, 2 * np.pi, ring, endpoint=False)
    T, Hh = np.meshgrid(t, hs)
    P, _ = surface(Hh, T)
    V = P.reshape(-1, 3); F = grid_faces(len(hs), ring)
    # 尾端封口
    c = np.array([0, 0, z_of(H_END + .004)]); V = np.vstack([V, c]); ci = len(V) - 1
    k = np.arange(ring); base = (len(hs) - 1) * ring
    tris = np.stack([base + k, np.full(ring, ci), base + (k + 1) % ring, base + (k + 1) % ring], 1)
    top = np.array([0, SEC_YC(.185), z_of(.18)]); V = np.vstack([V, top]); ti = len(V) - 1
    tris2 = np.stack([(k + 1) % ring, np.full(ring, ti), k, k], 1)
    return V, np.vstack([F, tris, tris2])


# ---- 双臂与手 ----
def rot(axis, ang):
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * K @ K


def arm_rig(sg):
    """sg=+1 左臂(+x)，-1 右臂。返回关节位置（A 姿态，臂外展约 22°）。"""
    S = np.array([sg * .138, .008, z_of(.342)])
    d1 = np.array([sg * np.sin(np.radians(25)), -.05, -np.cos(np.radians(25))]); d1 /= np.linalg.norm(d1)
    E = S + .285 * d1
    d2 = np.array([sg * np.sin(np.radians(15)), -.20, -np.cos(np.radians(15))]); d2 /= np.linalg.norm(d2)
    W = E + .235 * d2
    return S, E, W, d1, d2


def loft_path(P, r1, r2, ref, seg):
    """沿路径放样椭圆截面，ref 为截面 r1 方向的参考向量。"""
    P = np.asarray(P, float); n = len(P)
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True)
    ang = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    V = np.zeros((n, seg, 3))
    for i in range(n):
        ex = ref - T[i] * np.dot(ref, T[i]); ex /= np.linalg.norm(ex); ey = np.cross(T[i], ex)
        V[i] = P[i] + np.outer(np.cos(ang) * r1[i], ex) + np.outer(np.sin(ang) * r2[i], ey)
    V = V.reshape(-1, 3); F = grid_faces(n, seg)
    a = len(V); V = np.vstack([V, P[0] - T[0] * .002, P[-1] + T[-1] * .002])
    k = np.arange(seg)
    caps = np.vstack([np.stack([np.full(seg, a), (k + 1) % seg, k, k], 1),
                      np.stack([np.full(seg, a + 1), (n - 1) * seg + k, (n - 1) * seg + (k + 1) % seg,
                                (n - 1) * seg + (k + 1) % seg], 1)])
    return V, np.vstack([F, caps])


def arm_mesh(sg):
    S, E, W, d1, d2 = arm_rig(sg)
    parts = []
    # 上臂：起点埋入躯干肩部，三角肌外侧加厚
    u = np.linspace(-.035, .30, 64)
    P = S[None] + u[:, None] * d1[None]
    out = np.array([sg, 0, 0.])
    r1 = pchip([-.035, 0, .04, .09, .16, .23, .30], [.034, .044, .043, .040, .037, .033, .030])(u)
    r2 = pchip([-.035, 0, .04, .09, .16, .23, .30], [.034, .043, .042, .040, .037, .033, .030])(u)
    P = P + out[None] * (np.clip(.006 * (1 - np.abs(u - .03) / .07), 0, None))[:, None]
    parts.append(loft_path(P, r1, r2, out, 40))
    # 前臂：肘部稍收，前臂上段饱满，腕部扁
    u = np.linspace(-.045, .238, 60)
    P = E[None] + u[:, None] * d2[None]
    r1 = pchip([-.045, -.01, .03, .08, .14, .20, .238], [.026, .032, .036, .036, .031, .025, .0235])(u)
    r2 = pchip([-.045, -.01, .03, .08, .14, .20, .238], [.026, .031, .033, .032, .026, .019, .0170])(u)
    ref = np.array([0, 1., 0])  # r1 沿前后 → 手腕在前后方向较宽（掌面朝内）
    parts.append(loft_path(P, r1, r2, ref, 36))
    parts += hand_parts(sg, W, d2)
    return merge(parts)


def hand_parts(sg, W, d):
    d = d / np.linalg.norm(d)
    w = np.array([0, 1., 0]); w = w - d * np.dot(w, d); w /= np.linalg.norm(w)   # 指向背侧（+y）
    pn = np.cross(w, d); pn /= np.linalg.norm(pn)
    if pn[0] * sg > 0: pn = -pn          # 掌心朝向身体
    parts = []
    # 手掌
    u = np.linspace(-.01, .092, 26)
    P = W[None] + u[:, None] * d[None] + pn[None] * .002
    hw = pchip([-.01, .02, .06, .092], [.022, .030, .039, .040])(u)
    ht = pchip([-.01, .02, .06, .092], [.016, .015, .013, .011])(u)
    parts.append(loft_path(P, hw, ht, w, 28))
    # 四指：根部沿掌宽排列，轻微外展与自然屈曲（朝掌心）
    fingers = [(-.028, (.041, .025, .020), .0084, -6), (-.0095, (.046, .029, .021), .0088, -2),
               (.0095, (.043, .027, .020), .0083, 2), (.027, (.033, .020, .017), .0074, 7)]
    for off, segs, r0, spread in fingers:
        base = W + d * .088 - w * off * -1 * -1
        base = W + d * .088 + w * off
        dirn = rot(pn, np.radians(spread) * (1 if sg > 0 else -1)) @ d
        pts = [base]; rad = [r0]; cur = dirn
        for j, L in enumerate(segs):
            cur = rot(np.cross(pn, cur), np.radians([10, 16, 10][j])) @ cur  # 朝掌心屈曲
            for k in range(1, 7):
                pts.append(pts[-1] + cur * L / 6); rad.append(r0 * (1 - .28 * (sum(segs[:j]) + L * k / 6) / sum(segs)))
        pts = np.array(pts); rad = np.array(rad)
        parts.append(loft_path(pts, rad, rad * .9, pn, 16))
    # 拇指：自掌根前侧伸出，朝前下并略向掌心
    base = W + d * .030 - w * .022 + pn * .004
    cur = (d * .9 - w * .32 + pn * .10); cur /= np.linalg.norm(cur)
    pts = [base]; rad = [.0115]
    for j, L in enumerate((.036, .030, .024)):
        cur = rot(np.cross(w, cur), np.radians(8)) @ cur
        cur = (cur + d * .25 * (j + 1) / 3); cur /= np.linalg.norm(cur)
        for k in range(1, 7):
            pts.append(pts[-1] + cur * L / 6); rad.append(.0115 * (1 - .33 * (j * 6 + k) / 18))
    pts = np.array(pts); rad = np.array(rad)
    parts.append(loft_path(pts, rad, rad * .9, pn, 16))
    return parts


def build_body(mat, voxel=.0024):
    V, F = body_loft()
    parts = [(V, F)] + [arm_mesh(sg) for sg in (1, -1)]
    V, F = merge(parts)
    deg = F[:, 2] == F[:, 3]
    ob = make_mixed('MM_Body', V, F[~deg], F[deg][:, :3], mat)
    m = ob.modifiers.new('Remesh', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = voxel; m.adaptivity = 0
    m.use_smooth_shade = True
    sm = ob.modifiers.new('Smooth', 'SMOOTH'); sm.factor = .5; sm.iterations = 2
    bpy.context.view_layer.objects.active = ob
    for md in list(ob.modifiers):
        with bpy.context.temp_override(object=ob):
            bpy.ops.object.modifier_apply(modifier=md.name)
    body_attributes(ob)
    return ob


def tail_fraction(V):
    """每个顶点的鳞片过渡系数：0 皮肤 → 1 鳞片区。后、侧较早，腹侧较晚（6–10 cm 过渡带）。"""
    h = H_TOTAL - V[:, 2]
    ang_front = np.clip(-V[:, 1] / (np.abs(V[:, 0]) + np.abs(V[:, 1]) + 1e-6), 0, 1)  # 1=正前
    start = .785 + .045 * ang_front + .012 * np.sin(V[:, 0] * 60)   # 臀后/侧更早
    limb = np.abs(V[:, 0]) > SEC_A(np.clip(h, .185, H_END)) + .012       # 手臂/手
    return np.where(limb, 0., smoothstep(start, start + .08, h))


def body_attributes(ob):
    me = ob.data
    V = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
    tf = tail_fraction(V)
    a = me.attributes.new('tailmask', 'FLOAT', 'POINT'); a.data.foreach_set('value', tf.astype(np.float32))
    s = np.clip((H_TOTAL - V[:, 2] - .82) / 1.40, 0, 1)
    a = me.attributes.new('tail_s', 'FLOAT', 'POINT'); a.data.foreach_set('value', s.astype(np.float32))
    # 自然血色：肩头、肘、手背 / 指节、锁骨上方
    fl = np.zeros(len(V))
    for sg in (1, -1):
        S, E, W, d1, d2 = arm_rig(sg)
        fl += .9 * np.exp(-np.sum((V - (S + [sg * .030, 0, .015])) ** 2, 1) / .035 ** 2)
        fl += .8 * np.exp(-np.sum((V - (E + [0, .02, 0])) ** 2, 1) / .030 ** 2)
        fl += .9 * np.exp(-np.sum((V - (W + d2 * .10)) ** 2, 1) / .055 ** 2)
    fl += .35 * np.exp(-((H_TOTAL - V[:, 2] - .31) / .03) ** 2) * (V[:, 1] < 0) * (np.abs(V[:, 0]) < .12)
    a = me.attributes.new('flush', 'FLOAT', 'POINT'); a.data.foreach_set('value', np.clip(fl, 0, 1).astype(np.float32))
