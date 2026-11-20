# 头发：深棕黑半盘发。顶部与两侧发束扭绳收向脑后小发髻，其余长发自肩背垂落；另含眉毛、睫毛。
# 发丝为细三棱管网格（可直接被骨架蒙皮），属性 hair_t（根 0 → 梢 1）供材质与动画权重使用。
import numpy as np
from mm_common import *
import mm_head as Hd
import mm_body as B

RNG = np.random.default_rng(11)
G_LOCAL = np.array([0., .088, .000])          # 脑后收束点（发髻中心，头部局部坐标）


def surf_r(D):
    """方向 D(...,3) 上头部表面半径（局部坐标）。"""
    lo = np.zeros(D.shape[:-1]); hi = np.full(D.shape[:-1], .16)
    for _ in range(26):
        mid = (lo + hi) / 2; inside = Hd.head_sdf(D * mid[..., None]) < 0
        lo = np.where(inside, mid, lo); hi = np.where(inside, hi, mid)
    return (lo + hi) / 2


def hairline(D):
    """方向是否位于发区（前额发际、鬓角、耳上、后颈）。"""
    x, y, z = D[..., 0], D[..., 1], D[..., 2]
    phi = np.abs(np.arctan2(x, -y))                 # 0=正前，π=正后
    zz = z / np.linalg.norm(D, axis=-1)
    hl = np.interp(phi, [0, .5, 1.0, 1.35, 1.62, 1.95, 2.4, np.pi], [.43, .34, .14, -.02, .14, -.30, -.52, -.58])
    return zz > hl


def sample_roots(n):
    v = RNG.normal(size=(n * 6, 3)); v /= np.linalg.norm(v, axis=1, keepdims=True)
    v = v[hairline(v)]
    # 前额发际与鬓角加密（覆盖头皮边缘）
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    phi = np.abs(np.arctan2(x, -y))
    hl = np.interp(phi, [0, .5, 1.0, 1.35, 1.62, 1.95, 2.4, np.pi], [.43, .34, .14, -.02, .14, -.30, -.52, -.58])
    near = (z - hl < .12) & (phi < 1.6)
    keep = near | (RNG.random(len(v)) < .55)
    return v[keep][:n]


def slerp(a, b, t):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    om = np.arccos(np.clip(np.dot(a, b), -1, 1)) + 1e-9
    return (np.sin((1 - t) * om)[:, None] * a + np.sin(t * om)[:, None] * b) / np.sin(om)


def push_out_body(P, margin=.016):
    """把垂落发丝推出躯干截面（世界坐标）。"""
    h = H_TOTAL - P[:, 2]
    ok = (h > .24) & (h < 1.0)
    if not ok.any(): return P
    hh = np.clip(h, .19, B.H_END)
    a = B.SEC_A(hh) + margin; yc = B.SEC_YC(hh)
    d = np.where(P[:, 1] < yc, B.SEC_F(hh) + .045 * np.exp(-((h - .41) / .06) ** 2) * (np.abs(P[:, 0]) < .15),
                 B.SEC_B(hh) + .03 * np.exp(-((h - .80) / .08) ** 2)) + margin
    ex = P[:, 0] / a; ey = (P[:, 1] - yc) / d
    rr = np.sqrt(ex * ex + ey * ey)
    m = ok & (rr < 1)
    P[m, 0] /= rr[m]; P[m, 1] = yc[m] + (P[m, 1] - yc[m]) / rr[m]
    return P


def hang(start, direction, length, seg, front=False, wave_phase=0., wave_amp=.028):
    """自 start 起受重力垂落的路径（世界坐标），避开躯干。"""
    pts = [start.copy()]; d = direction / np.linalg.norm(direction)
    step = length / seg
    side = np.sign(start[0]) if abs(start[0]) > .005 else RNG.choice([-1, 1])
    g = np.array([0, 0, -1.])
    for i in range(seg):
        d = d * .8 + g * .2; d /= np.linalg.norm(d)
        pts.append(pts[-1] + d * step)
    P = np.array(pts)
    # 柔和波浪（越往发梢越明显），横向与前后两个分量
    t = np.linspace(0, 1, len(P))
    wv = wave_amp * t ** 1.2 * np.sin(t * length / .14 * 2 * np.pi + wave_phase)
    P[:, 0] += wv * .7 * side; P[:, 1] += wv * .5
    for _ in range(3):
        P = push_out_body(P)
    return P


def resample(P, n):
    d = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    t = np.linspace(0, d[-1], n)
    return np.stack([np.interp(t, d, P[:, k]) for k in range(3)], 1)


def chaikin(P, it=3):
    for _ in range(it):
        Q = .75 * P[:-1] + .25 * P[1:]; R = .25 * P[:-1] + .75 * P[1:]
        P = np.vstack([P[:1], np.stack([Q, R], 1).reshape(-1, 3), P[-1:]])
    return P


def scalp_arc(d0, d1, n, lift):
    tt = np.linspace(0, 1, n)
    dirs = slerp(d0, d1, tt)
    return dirs * (surf_r(dirs) + lift)[:, None]


def guide_paths(n_guides=700):
    """中分；顶部与两侧发束先向两侧下方梳、再收向脑后（半盘发）；其余长发经肩前 / 肩后 / 背后垂落。"""
    HC = Hd.HEAD_C
    roots = sample_roots(n_guides)
    r = surf_r(roots)
    guides = []
    Gd = G_LOCAL / np.linalg.norm(G_LOCAL)
    for d, rr in zip(roots, r):
        sx = np.sign(d[0]) if abs(d[0]) > 1e-3 else RNG.choice([-1., 1.])
        phi = abs(np.arctan2(d[0], -d[1]))
        lay = .0012 + .0028 * RNG.random()
        L = .55 + .17 * RNG.random()
        hl0 = np.interp(phi, [0, .5, 1.0, 1.35, 1.62], [.45, .38, .18, .0, .14])
        if .45 < phi < 1.30 and d[2] - hl0 < .10 and RNG.random() < .40:
            # 脸侧修饰发丝：自鬓角沿脸颊外侧垂落至肩前
            out = d * (rr + lay + .004)
            cheek = np.array([sx * .082, -.030, -.050])
            P0 = np.vstack([out, out * .5 + cheek * .5 + np.array([sx * .008, 0, .01]), cheek]) + HC
            wp = np.array([sx * (.105 + .03 * RNG.random()), -.045, z_of(.31)])
            hp = hang(wp, np.array([0, -.05, -1.]), L * .75, 28, wave_phase=RNG.random() * 6)
            P = np.vstack([P0, wp, hp[1:]]); kind = 2
            P = chaikin(P, 2); P = push_out_body(P)
            guides.append((resample(P, 64), kind)); continue
        if d[2] > .30 or (d[2] > .12 and phi < 1.5):
            # 半盘发：中分后向侧下方 → 绕到耳上 → 收至脑后发髻
            side_dir = np.array([sx * .80, .25, .30]); side_dir /= np.linalg.norm(side_dir)
            mid = d * .35 + side_dir * .65; mid /= np.linalg.norm(mid)
            a = scalp_arc(d, mid, 10, lay + .0025 * np.sin(np.linspace(0, np.pi / 2, 10)))
            b = scalp_arc(mid, Gd + np.array([sx * .12, 0, 0]), 12, lay + .0030 + .002 * np.sin(np.linspace(0, np.pi, 12)))[1:]
            scalp = np.vstack([a, b]) + HC
            start = scalp[-1]
            wp = np.array([sx * .03 * RNG.random(), .085 + .02 * RNG.random(), z_of(.30)])
            hp = hang(start, wp - start, L * .85, 30, wave_phase=RNG.random() * 6)
            P = np.vstack([scalp, hp[1:]]); kind = 1 if phi > .9 else 0
        else:
            # 下层：沿头皮向下 → 指定肩部路径点 → 自然垂落
            out = d * (rr + lay)
            below = d.copy(); below[2] -= .35; below /= np.linalg.norm(below)
            scalp = scalp_arc(d, below, 5, lay) + HC
            u = RNG.random()
            if phi < 1.9 and u < .45:
                wp = np.array([sx * (.10 + .05 * RNG.random()), -.030 - .025 * RNG.random(), z_of(.30)]); kind = 2   # 肩前
            elif phi < 2.3:
                wp = np.array([sx * (.08 + .08 * RNG.random()), .075 + .03 * RNG.random(), z_of(.30)]); kind = 3   # 肩后
            else:
                wp = np.array([d[0] * rr * 1.5, .09 + .015 * RNG.random(), z_of(.30)]); kind = 3                       # 背后
            mid = (scalp[-1] + wp) / 2 + np.array([0, 0, .01])
            P0 = np.vstack([scalp, mid, wp])
            hp = hang(wp, np.array([0, .05 if kind == 3 else -.05, -1.]), L * .80, 30, wave_phase=RNG.random() * 6)
            P = np.vstack([P0, hp[1:]])
        P = chaikin(P, 2)
        P = push_out_body(P)
        guides.append((resample(P, 64), kind))
    return guides


def keep_off_scalp(Q, gap):
    """头部附近的发丝点保持在头皮外 gap 处，避免折线穿入头部。"""
    L = Q - Hd.HEAD_C; r = np.linalg.norm(L, axis=1)
    m = (r < .17) & (L[:, 2] > -.035)          # 只处理颅部，耳下 / 颈部交给躯干避让，避免折角
    if m.any():
        D = L[m] / r[m, None]; sr = surf_r(D) + gap[m]
        r2 = np.maximum(r[m], sr); L[m] = D * r2[:, None]
    return L + Hd.HEAD_C


def strands_from_guides(guides, per=10):
    paths, kinds = [], []
    for P, kind in guides:
        n = len(P)
        T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True)
        F = frame_from(T[0])
        e1 = F[:, 0]
        for j in range(per):
            ang0 = RNG.random() * 2 * np.pi; rad0 = .007 * np.sqrt(RNG.random())
            tt = np.linspace(0, 1, n)
            spread = rad0 * (1 - .65 * tt ** 1.5) + .0015 * tt + .006 * np.clip(1 - tt * 8, 0, 1) * RNG.random()   # 根部散开，避免发束起点排成一线
            tw = 1.8 * np.pi * tt if kind == 1 else .3 * tt
            off = []
            ex = e1.copy()
            for i in range(n):
                ex = ex - T[i] * np.dot(ex, T[i]); ex /= np.linalg.norm(ex); ey = np.cross(T[i], ex)
                a = ang0 + tw[i]
                off.append(ex * np.cos(a) * spread[i] + ey * np.sin(a) * spread[i])
            Q = P + np.array(off) + np.cumsum(RNG.normal(scale=.0006, size=P.shape), 0) * tt[:, None] * .5   # 随机游走式细微卷曲
            Q[:3] = P[:3] + np.array(off[:3]) * .4
            Q = push_out_body(Q, .010)
            Q = keep_off_scalp(Q, -.0006 + (.0032 + .0015 * RNG.random()) * np.minimum(tt * 6, 1))
            cut = int(n * (.72 + .28 * RNG.random()))
            paths.append(Q[:cut]); kinds.append(kind)
    return paths, kinds


def bun_strands(n=900):
    """脑后圆发髻（直径约 8 cm）：发束由外向内盘绕成玫瑰状，表面隆起。"""
    HC = Hd.HEAD_C; c = G_LOCAL + HC + np.array([0, .016, -.004])
    out = []
    ax = np.array([0, 1., -.10]); ax /= np.linalg.norm(ax)
    F = frame_from(ax)
    for i in range(n):
        a0 = RNG.random() * 2 * np.pi; ring = RNG.random()
        t = np.linspace(0, 1, 40)
        R = (.040 - .030 * t) * (.85 + .15 * ring)               # 外圈 → 中心
        ang = a0 + t * (2.4 * np.pi)
        h = .024 * np.sqrt(np.clip(1 - (R / .042) ** 2, 0, 1)) + .002 * RNG.random()   # 圆顶
        P = c + np.outer(np.cos(ang) * R, F[:, 0]) + np.outer(np.sin(ang) * R, F[:, 1]) + np.outer(h, F[:, 2])
        out.append(P)
    return out


def brows_lashes():
    HC = Hd.HEAD_C; paths, radii = [], []
    for s in (1, -1):
        for i in range(110):
            u = RNG.random()
            x = s * (.010 + .040 * u)
            z = .019 + .010 * np.sin(np.pi * (u * .85 + .05)) + .003 * (1 - u) - .002 * u
            d = np.array([x, -.08, z]); d /= np.linalg.norm(d)
            root = d * surf_r(d[None])[0]
            dirn = np.array([s * (.5 + .7 * u), -.15, .55 - .9 * u]); dirn /= np.linalg.norm(dirn)
            L = .0065 + .004 * RNG.random()
            P = root[None] + np.outer(np.linspace(0, L, 5), dirn) + np.outer(np.linspace(0, 1, 5) ** 2, -d * .0012)
            paths.append(P + HC + RNG.normal(scale=.0003, size=3)); radii.append(.00013)
        c = Hd.EYE_C[0 if s > 0 else 1]
        for i in range(46):
            u = (i / 45) * 2 - 1
            ax = (u * .5 + .5) * (Hd.EYE_WA * .93 + np.radians(48)) - np.radians(48)
            up, _ = Hd.lid_angles(ax)
            dv = np.array([s * np.tan(ax), -1., np.tan(up)]); dv /= np.linalg.norm(dv)
            rs = np.linspace(Hd.EYE_R + .001, .03, 120)
            inside = Hd.head_sdf(c[None] + rs[:, None] * dv[None]) < 0
            root = c + dv * (rs[np.argmax(inside)] if inside.any() else Hd.EYE_R + .0032)
            L = .0062 + .0028 * (1 - abs(u - .3))
            tt = np.linspace(0, 1, 6)
            P = root + (np.outer(tt, dv) * .55 + np.outer(tt ** 2, [0, 0, 1.]) * .55 + np.outer(tt, [s * .25 * u, 0, 0])) * L
            paths.append(P + HC); radii.append(.00022)
    return paths, radii


def tubes_mesh(name, paths, root_r, mat, coll=None, tip=.25, sides=3, kinds=None):
    Vs, Fs, At, Ak, Ar, UV = [], [], [], [], [], []
    off = 0
    rnd = RNG.random(len(paths))
    for k, P in enumerate(paths):
        n = len(P); r0 = root_r[k] if np.ndim(root_r) else root_r
        tt = np.linspace(0, 1, n)
        rad = r0 * (1 - (1 - tip) * tt ** 2) * np.clip(.25 + tt * 25, 0, 1)
        V, F = tube(P, rad, sides)
        Vs.append(V); Fs.append(F + off); off += len(V)
        At.append(np.repeat(tt, sides)); Ar.append(np.full(len(V), rnd[k]))
        Ak.append(np.full(len(V), kinds[k] if kinds else 0))
    V = np.vstack(Vs); F = np.vstack(Fs)
    ob = make_mesh(name, V, F, mat, coll, attrs=dict(hair_t=np.concatenate(At), hair_rand=np.concatenate(Ar),
                                                    hair_kind=np.concatenate(Ak)))
    # UV：u 沿发丝（供各向异性切线）
    t_all = np.concatenate(At)
    lay = ob.data.uv_layers.new(name='HairUV')
    loops = np.empty(len(ob.data.loops), np.int32); ob.data.loops.foreach_get('vertex_index', loops)
    uv = np.stack([t_all[loops], np.zeros(len(loops))], 1).astype(np.float32)
    lay.data.foreach_set('uv', uv.ravel())
    return ob


def build_hair(mat, coll=None, per=10):
    guides = guide_paths()
    paths, kinds = strands_from_guides(guides, per)
    bun = bun_strands()
    paths += bun; kinds += [4] * len(bun)
    hair = tubes_mesh('MM_Hair', paths, .00038, mat, coll, kinds=kinds)
    bl, br = brows_lashes()
    fine = tubes_mesh('MM_BrowLash', bl, np.array(br), mat, coll, tip=.4)
    hair['strands'] = len(paths)
    return hair, fine
