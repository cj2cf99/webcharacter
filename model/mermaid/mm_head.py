# 头部：解析 SDF（颅、面、颌、颧、鼻、唇、眼窝、眼睑、颈）沿球面径向求表面 → 高分辨率网格。
# 眼球、耳朵、眉、睫毛为独立部件；唇色、腮红、眼线写入顶点色。
import numpy as np
from mm_common import *

HEAD_C = np.array([0., .004, H_TOTAL - .105])   # 头部局部原点（世界）
EYE_R = .0120
EYE_C = [np.array([s * .0322, -.0645, .005]) for s in (1, -1)]   # 局部


def sd_ell(p, c, r):
    q = (p - c) / r
    k0 = np.linalg.norm(q, axis=-1); k1 = np.linalg.norm(q / r, axis=-1)
    return k0 * (k0 - 1) / (k1 + 1e-9)


def sd_cap(p, a, b, ra, rb):
    a = np.asarray(a); b = np.asarray(b)
    ba = b - a; t = np.clip(((p - a) @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(p - (a + t[..., None] * ba), axis=-1) - (ra + (rb - ra) * t)


def smin(a, b, k):
    h = np.clip(.5 + .5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def head_sdf(p):
    d = sd_ell(p, [0, .014, .028], [.0715, .0935, .0855])                     # 颅
    d = smin(d, sd_ell(p, [0, -.026, -.020], [.0560, .056, .072]), .034)        # 面中
    d = smin(d, sd_ell(p, [0, -.042, .052], [.054, .036, .042]), .022)          # 前额（圆润、较直）
    for s in (1, -1):
        d = smin(d, sd_ell(p, [s * .033, -.050, -.036], [.019, .018, .019]), .016)    # 面颊脂肪（年轻感）
    d = smin(d, sd_ell(p, [0, -.026, -.057], [.0360, .052, .043]), .022)        # 下颌（收窄成鹅蛋 / 微 V）
    d = smin(d, sd_ell(p, [0, -.061, -.088], [.0145, .015, .0135]), .016)       # 下巴（前移，避免后缩）
    for s in (1, -1):
        d = smin(d, sd_ell(p, [s * .040, -.056, -.006], [.016, .014, .013]), .016)   # 颧（轻）
        d = smin(d, sd_ell(p, [s * .037, .006, -.046], [.010, .032, .022]), .02)     # 下颌角
    d = smin(d, sd_ell(p, [0, -.071, .022], [.048, .012, .011]), .014)           # 眉弓（轻）
    # 鼻：鼻梁、鼻尖、鼻翼
    d = smin(d, sd_cap(p, [0, -.075, .006], [0, -.0885, -.029], .0032, .0055), .007)
    d = smin(d, sd_ell(p, [0, -.0875, -.0335], [.0078, .0072, .0072]), .005)
    for s in (1, -1):
        d = smin(d, sd_ell(p, [s * .0080, -.0805, -.0378], [.0054, .0050, .0047]), .004)
        d = smax(d, -sd_ell(p, [s * .0050, -.0840, -.0420], [.0026, .0028, .0018]), .002)   # 鼻孔
    # 唇：上唇基座体积 + 位移场（唇峰、口缝、下唇、人中、口角）
    d = smin(d, sd_ell(p, [0, -.0690, -.0530], [.0200, .0090, .0120]), .010)
    d = d - lip_field(p)
    d = smax(d, -sd_ell(p, [0, -.0700, -.0705], [.013, .004, .0032]), .005)      # 颏唇沟
    # 眼窝与眼睑
    for c in EYE_C:
        d = smax(d, -sd_ell(p, c + [0, -.006, .004], [.013, .004, .006]), .006)        # 上睑沟（轻）
        d = smin(d, sd_ell(p, c + [0, -.0092, .0078], [.0150, .0040, .0038]), .007)   # 上眼睑体积
        d = smax(d, eye_funnel(p, c), .0015)
        d = smax(d, -eye_cut(p, c), .0010)
    # 颈（与身体在项链处交叠）
    d = smin(d, sd_cap(p, [0, .016, -.03], [0, .020, -.175], .042, .046), .02)
    return d


LIP_W = .0176


def lip_lines(x):
    u = np.clip(np.abs(x) / LIP_W, 0, 1)
    zm = -.0565 + .0014 * u ** 2                                   # 口缝
    zu = -.0497 - .0010 * np.exp(-(x / .0016) ** 2) + .0007 * np.exp(-((np.abs(x) - .0055) / .003) ** 2) - .0042 * u ** 2.2  # 唇峰
    zl = -.0635 + .0058 * u ** 1.8                                 # 下唇下缘
    return zm, zu, zl, u


def lip_field(p):
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    zm, zu, zl, u = lip_lines(x)
    front = smoothstep(-.050, -.068, y)
    taper = np.clip(1 - u ** 2, 0, 1) ** .6
    tu = np.clip((z - zm) / (zu - zm + 1e-6), 0, 1.08)               # 0 口缝 → 1 唇峰
    tl = np.clip((zm - z) / (zm - zl + 1e-6), 0, 1.08)
    upper = .0017 * np.maximum(np.sin(np.pi * np.minimum(tu, 1) ** .8), 0) ** .7 * smoothstep(zm - .0003, zm + .0003, z) * smoothstep(zu + .0012, zu - .0002, z)
    lower = .0029 * np.maximum(np.sin(np.pi * np.minimum(tl, 1) ** 1.1), 0) ** .6 * smoothstep(zm + .0003, zm - .0003, z) * smoothstep(zl - .0012, zl + .0002, z)
    groove = -.0011 * np.exp(-((z - zm) / .00055) ** 2)
    phil = .0006 * np.exp(-((np.abs(x) - .0048) / .0016) ** 2) * smoothstep(zu, zu + .004, z) * smoothstep(-.039, -.043, z)
    corner = -.0012 * np.exp(-((np.abs(x) - LIP_W) / .0025) ** 2 - ((z - zm) / .003) ** 2)
    return front * ((upper + lower + groove) * taper + phil + corner)


def eye_open(x, W=.0165):
    u = np.clip(x / W, -1, 1)
    up = .0071 * (1 - u * u) ** .6 + .0013 * u           # 上眼睑弧（外眼角略高）
    lo = -.0050 * (1 - u * u) ** .8 + .0012 * u
    return up, lo


EYE_WA = np.radians(68)


def lid_angles(ax):
    """眼裂上 / 下缘的仰角（rad），ax 为外侧为正的水平角。"""
    u = np.clip(ax / EYE_WA, -1, 1)
    up = np.radians(36) * (1 - u * u) ** .55 + np.radians(6) * u
    lo = -np.radians(24) * (1 - u * u) ** .75 + np.radians(5) * u
    return up, lo


def eye_angles(q, c):
    fwd = np.maximum(-q[..., 1], 1e-5)
    return np.arctan2(q[..., 0] * np.sign(c[0]), fwd), np.arctan2(q[..., 2], fwd)


def eye_funnel(p, c):
    """眼睑贴合：眼裂附近的皮肤不能离眼球太远，向外按角度平滑放开（形成上下眼睑的弧面）。"""
    q = p - c
    ax, az = eye_angles(q, c)
    up, lo = lid_angles(ax)
    ang = np.maximum(np.maximum(az - up, lo - az), np.maximum(ax - EYE_WA, -ax - np.radians(52)))
    ang = np.maximum(ang, 0)
    rmax = EYE_R + .0028 + .045 * ang ** 1.25
    out = np.linalg.norm(q, axis=-1) - rmax
    return np.where(q[..., 1] < -.002, out, -1.)


def eye_cut(p, c):
    """杏仁形眼裂（以眼球中心的角度定义）：切面沿径向，睑缘贴合眼球曲面，侧面不露空洞。"""
    q = p - c
    ax, az = eye_angles(q, c)
    Wa = EYE_WA
    up, lo = lid_angles(ax)
    almond = np.maximum(np.maximum(az - up, lo - az), np.maximum(ax - Wa, -ax - np.radians(52))) * .015
    deep = (EYE_R - .0035) - np.linalg.norm(q, axis=-1)
    near = np.linalg.norm(q, axis=-1) - .022                           # 只在眼球附近切；内眼角另限 52°，避免切到鼻梁
    return np.maximum(np.maximum(np.maximum(almond, deep), q[..., 1] + .002), near)


def eyelid_sdf(p, c):
    """包住眼球的薄壳，扣除杏仁形眼裂。外眼角略上扬。"""
    q = p - c
    shell = np.abs(np.linalg.norm(q, axis=-1) - (EYE_R + .0021)) - .0014
    x = q[..., 0] * np.sign(c[0]); z = q[..., 2]
    W = .0152
    u = np.clip(x / W, -1, 1)
    up = .0060 * (1 - u * u) ** .7 + .0013 * u           # 上眼睑弧（外侧略高）
    lo = -.0044 * (1 - u * u) ** .9 + .0011 * u
    inside = np.maximum(np.maximum(z - up, lo - z), np.abs(x) - W)
    front = -q[..., 1]                                      # 只在前半球开口
    opening = np.where(front > 0, inside, .01)
    shell = np.maximum(shell, np.abs(x) - (W + .0025))
    return np.maximum(shell, -opening)


def radial_surface(n_lat=420, n_lon=560):
    th = np.linspace(.02, np.pi - .02, n_lat)              # 0=头顶
    ph = np.linspace(0, 2 * np.pi, n_lon, endpoint=False)
    TH, PH = np.meshgrid(th, ph, indexing='ij')
    D = np.stack([np.sin(TH) * np.cos(PH), np.sin(TH) * np.sin(PH), np.cos(TH)], -1)
    # 自外向内搜索第一个进入点，取最外层表面（眼睑边缘形成自然厚度）
    rs = np.linspace(.20, .0, 140)
    r_hit = np.zeros(TH.shape); prev = np.full(TH.shape, .20); found = np.zeros(TH.shape, bool)
    for r in rs:
        dv = head_sdf(D * r)
        newly = (dv < 0) & ~found
        r_hit[newly] = r; found |= newly
    lo = r_hit.copy(); hi = r_hit + (rs[0] - rs[1])
    for _ in range(16):
        mid = (lo + hi) / 2; dv = head_sdf(D * mid[..., None])
        inside = dv < 0
        lo = np.where(inside, mid, lo); hi = np.where(inside, hi, mid)
    P = D * ((lo + hi) / 2)[..., None]
    return P.reshape(-1, 3), n_lat, n_lon


def head_paint(P):
    """顶点色：唇色、腮红、眼线阴影、鼻尖血色。返回 (N,4) 线性 RGB 乘子 & 唇遮罩。"""
    skin = np.array(srgb('#ECC9B6')[:3])
    col = np.tile(skin, (len(P), 1))
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    zm, zu, zl, u = lip_lines(x)
    lip = smoothstep(zu + .0012, zu - .0004, z) * smoothstep(zl - .0012, zl + .0004, z) * np.clip(1 - u ** 6, 0, 1) * smoothstep(-.060, -.068, y)
    col = col * (1 - lip[:, None] * .85) + np.array(srgb('#D0626A')[:3]) * lip[:, None] * .85
    for s in (1, -1):
        blush = np.exp(-((x - s * .040) / .019) ** 2 - ((z + .020) / .015) ** 2) * (y < -.03)
        col = col * (1 - blush[:, None] * .40) + np.array(srgb('#EE9494')[:3]) * blush[:, None] * .40
    for c in EYE_C:
        q = P - c
        shadow = np.exp(-((q[:, 0] * np.sign(c[0]) - .002) / .014) ** 2 - ((q[:, 2] - .010) / .006) ** 2) * (q[:, 1] < 0)
        col = col * (1 - shadow[:, None] * .25) + np.array(srgb('#D8A2A0')[:3]) * shadow[:, None] * .25
    nose = np.exp(-(x / .01) ** 2 - ((z + .033) / .008) ** 2) * (y < -.085)
    col = col * (1 - nose[:, None] * .12) + np.array(srgb('#E8A8A0')[:3]) * nose[:, None] * .12
    # 发区头皮染成发色，避免发丝间露白
    D = P / (np.linalg.norm(P, axis=1, keepdims=True) + 1e-9)
    x2, y2, z2 = D[:, 0], D[:, 1], D[:, 2]
    phi = np.abs(np.arctan2(x2, -y2))
    hl = np.interp(phi, [0, .5, 1.0, 1.35, 1.62, 1.95, 2.4, np.pi], [.43, .34, .14, -.02, .14, -.30, -.52, -.58])
    sc = smoothstep(hl + .005, hl + .07, z2)[:, None] * .85
    col = col * (1 - sc) + np.array(srgb('#2E2324')[:3]) * sc
    # 眼周细眼线（上眼睑边缘）
    for c in EYE_C:
        q = P - c; ax, az = eye_angles(q, c); r = np.linalg.norm(q, axis=1)
        up, lo = lid_angles(ax)
        front = (q[:, 1] < -.003) & (r < .030)
        du = (az - up) * r                                         # 距上睑缘（米）
        dl = (lo - az) * r
        line = np.exp(-((du - .0010) / .0016) ** 2) * (ax < EYE_WA * 1.02) * (ax > -np.radians(54)) * front
        wing = np.exp(-((du - .0007 - .0020 * np.clip((ax - EYE_WA * .85) / .3, 0, 1)) / .0010) ** 2) * (ax > EYE_WA * .8) * (ax < EYE_WA * 1.25) * front
        line = np.maximum(line, wing)
        crease = np.exp(-((du - .0038) / .0006) ** 2) * (np.abs(ax) < EYE_WA * .9) * front * .35
        lower = np.exp(-((dl - .0006) / .0007) ** 2) * (np.abs(ax) < EYE_WA * .95) * front * .30
        line = np.maximum(line, lower)
        col = col * (1 - line[:, None] * .85) + np.array(srgb('#33241F')[:3]) * line[:, None] * .85
        col = col * (1 - crease[:, None]) + np.array(srgb('#B98A80')[:3]) * crease[:, None]
    head_paint.hairmask = sc[:, 0] / .85
    # 发区流向（切线）与横向条纹坐标：中分 → 两侧 → 脑后收束点
    Gd = np.array([0., .98, .2]); Gd /= np.linalg.norm(Gd)
    side = np.stack([np.sign(x2 + 1e-6) * .8, np.full_like(x2, .25), np.full_like(x2, .3)], 1)
    toG = Gd[None] - D * (D @ Gd)[:, None]
    flow = np.where((z2 > .30)[:, None] | ((z2 > .12) & (phi < 1.5))[:, None], side * .5 + toG * .8, np.array([0, .2, -1.])[None])
    flow = flow - D * np.sum(flow * D, 1, keepdims=True); flow /= np.linalg.norm(flow, axis=1, keepdims=True) + 1e-9
    e1 = np.cross(Gd, [0, 0, 1.]); e1 /= np.linalg.norm(e1); e2 = np.cross(Gd, e1)
    head_paint.flow = flow; head_paint.across = np.arctan2(D @ e2, D @ e1) + 3 * z2 * (z2 < .12)
    return np.concatenate([col, np.ones((len(P), 1))], 1), lip


def build_head(mat_skin, mat_eye, mat_iris, coll=None):
    P, nl, nn = radial_surface()
    F = grid_faces(nl, nn)
    V = P + HEAD_C
    # 顶/底极点封口
    top = np.array([0, 0, P[:nn, 2].max()]) + HEAD_C
    bot = P[-nn:].mean(0) + HEAD_C
    V = np.vstack([V, top, bot]); ti, bi = len(V) - 2, len(V) - 1
    k = np.arange(nn)
    tris = np.vstack([np.stack([np.full(nn, ti), (k + 1) % nn, k], 1),
                      np.stack([np.full(nn, bi), (nl - 1) * nn + k, (nl - 1) * nn + (k + 1) % nn], 1)])
    col, lip = head_paint(np.vstack([P, top - HEAD_C, bot - HEAD_C]))
    ob = make_mixed('MM_Head', V, F, tris, mat_skin, coll)
    a = ob.data.color_attributes.new('paint', 'FLOAT_COLOR', 'POINT'); a.data.foreach_set('color', col.astype(np.float32).ravel())
    a = ob.data.attributes.new('lip', 'FLOAT', 'POINT'); a.data.foreach_set('value', lip.astype(np.float32))
    a = ob.data.attributes.new('hairmask', 'FLOAT', 'POINT'); a.data.foreach_set('value', head_paint.hairmask.astype(np.float32))
    a = ob.data.attributes.new('hacross', 'FLOAT', 'POINT'); a.data.foreach_set('value', head_paint.across.astype(np.float32))
    a = ob.data.color_attributes.new('hflow', 'FLOAT_COLOR', 'POINT')
    a.data.foreach_set('color', np.concatenate([head_paint.flow, np.ones((len(V), 1))], 1).astype(np.float32).ravel())
    a = ob.data.attributes.new('tailmask', 'FLOAT', 'POINT'); a.data.foreach_set('value', np.zeros(len(V), np.float32))
    parts = [ob]
    # 眼球（巩膜 + 虹膜/瞳孔着色由 UV 方向决定）
    for i, c in enumerate(EYE_C):
        V2, F2 = sphere(c + HEAD_C, EYE_R, 96, 128)
        e = make_mesh('MM_Eye' + 'LR'[i], V2, F2, mat_eye, coll)
        parts.append(e)
    parts += ears(mat_skin, coll)
    return parts


def sphere(c, r, nl=24, nn=32, scale=(1, 1, 1)):
    th = np.linspace(0, np.pi, nl); ph = np.linspace(0, 2 * np.pi, nn, endpoint=False)
    TH, PH = np.meshgrid(th, ph, indexing='ij')
    # 极轴朝 -y（正前方），使虹膜位于“极点”方向
    D = np.stack([np.sin(TH) * np.cos(PH), -np.cos(TH), np.sin(TH) * np.sin(PH)], -1)
    V = (D * np.asarray(scale) * r).reshape(-1, 3) + c
    F = grid_faces(nl, nn)
    return V, F


def ears(mat, coll):
    out = []
    for s in (1, -1):
        V, F = sphere(np.zeros(3), 1., 24, 32)
        V = V[:, [1, 0, 2]]
        # 外侧面中央内凹成耳甲腔，外缘保留卷边
        r2 = V[:, 1] ** 2 + V[:, 2] ** 2
        V[:, 0] -= s * np.clip(s * V[:, 0], 0, None) * 1.6 * np.clip(1 - r2 / .55, 0, 1)
        V = V * [.0060, .0135, .0255]
        a = np.radians(-12)                                    # 上缘后倾
        R = np.array([[1, 0, 0], [0, np.cos(a), -np.sin(a)], [0, np.sin(a), np.cos(a)]])
        V = V @ R.T + [s * .066, .016, -.010] + HEAD_C
        out.append(make_mesh('MM_Ear' + ('L' if s > 0 else 'R'), V, F, mat, coll))
    return out
