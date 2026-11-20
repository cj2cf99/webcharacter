# 饰品与胸衣：双扇贝壳胸衣（贴合底座 + 放射肋 + 浅金包边）、颈挂带、胸下珍珠节点、背部系带蝴蝶结、
# 珍珠项链 + 泪滴宝石、珍珠耳饰、上臂贝壳臂饰、双侧珊瑚贝壳发饰 + 飘带、眉心四瓣纹。
import numpy as np, bpy
from mm_common import *
import mm_body as B
import mm_head as Hd
import mm_hair as Hr

RNG = np.random.default_rng(23)


def front_point(x, h, side='front', extra=0.):
    """在高度 h 的前（或后）半周上找横向坐标为 x 的体表点与法线。"""
    if side == 'front': t = np.linspace(np.pi + .02, 2 * np.pi - .02, 400)
    else: t = np.linspace(.02, np.pi - .02, 400)
    P, N = B.surface(np.full(len(t), h), t)
    i = np.argmin(np.abs(P[:, 0] - x))
    p, n = B.surface(np.array([h]), np.array([t[i]]), extra)
    return p[0], N[i]


def ring_points(h, t0, t1, n, extra):
    t = np.linspace(t0, t1, n)
    P, _ = B.surface(np.full(n, h), t, extra)
    return P


def sph(name, c, r, mat, scale=(1, 1, 1), res=(16, 24), coll=None):
    V, F = Hd.sphere(np.asarray(c, float), r, *res, scale=scale)
    return make_mesh(name, V, F, mat, coll)


def spheres(name, cs, rs, mat, res=(12, 18), coll=None, scale=(1, 1, 1)):
    parts = [Hd.sphere(np.asarray(c, float), r, *res, scale=scale) for c, r in zip(cs, np.broadcast_to(rs, (len(cs),)))]
    V, F = merge(parts)
    return make_mesh(name, V, F, mat, coll)


def tubes(name, paths, r, mat, seg=8, coll=None):
    parts = [tube(np.asarray(P, float), r, seg) for P in paths]
    V, F = merge(parts)
    return make_mesh(name, V, F, mat, coll)


def solidify(ob, th):
    m = ob.modifiers.new('Solid', 'SOLIDIFY'); m.thickness = th; m.offset = 1
    with bpy.context.temp_override(object=ob):
        bpy.ops.object.modifier_apply(modifier=m.name)


def scallop_grid(nA=61, nR=22, ribs=12, A=np.radians(68)):
    """扇贝外形参数：返回 (u 横向 −1..1, v 纵向 0..1, rib 高度, 外缘标记, r, a)。"""
    a = np.linspace(-A, A, nA); r = np.linspace(0, 1, nR)
    R, Aa = np.meshgrid(r, a, indexing='ij')
    edge = 1 + .035 * np.cos(ribs * Aa * np.pi / A) ** 2          # 外缘扇形波纹
    rr = R * edge
    u = rr * np.sin(Aa) / np.sin(A)
    v = rr * np.cos(Aa)
    v = (v - v.min()) / (v.max() - v.min())
    rib = (np.abs(np.cos((ribs / 2) * (Aa / A) * np.pi)) ** .6) * smoothstep(.08, .5, R)
    return u, v, rib, R, Aa


def bra_shell(sg, mat, coll=None):
    """贴合胸部体表的单片扇贝（宽 10.5 cm、高 11.5 cm，11–13 条放射肋）。"""
    W, Hh = .105, .115
    cx = sg * .0645; h_bottom = .462
    u, v, rib, R, Aa = scallop_grid(ribs=12)
    # 壳铰（窄端）在下内侧，扇面朝外上方展开；略向外旋
    rot = np.radians(-7) * sg
    lx = u * W / 2; lz = v * Hh
    X = cx + lx * np.cos(rot) - lz * np.sin(rot) * .35
    Hh_ = h_bottom - lz
    P = np.zeros(u.shape + (3,))
    for i in range(u.shape[0]):
        for j in range(u.shape[1]):
            dome = .004 + .010 * np.sin(np.pi * np.clip(R[i, j], 0, 1) ** .8) * (1 - .3 * R[i, j])
            p, n = front_point(X[i, j], Hh_[i, j], extra=dome + .0035 * rib[i, j])
            P[i, j] = p
    V = P.reshape(-1, 3); F = grid_faces(u.shape[0], u.shape[1], wrap=False)
    ob = make_mesh('MM_BraShell' + ('L' if sg > 0 else 'R'), V, F, mat, coll,
                   attrs=dict(shell_r=R.ravel(), shell_rib=rib.ravel()))
    solidify(ob, .0022)
    edge = P[-1]
    return ob, P


def build_bra(M, coll=None):
    out, rims, pearls_c = [], [], []
    shells = {}
    for sg in (1, -1):
        ob, P = bra_shell(sg, M['shell'], coll); out.append(ob); shells[sg] = P
        rims.append(P[-1])                                  # 外缘浅金包边
        rims.append(P[:, 0]); rims.append(P[:, -1])
    out.append(tubes('MM_BraRim', rims, .0013, M['gold'], 8, coll))
    # 颈挂带：贝壳上缘 → 锁骨 → 颈后
    straps = []
    for sg in (1, -1):
        P = shells[sg]
        top = P[-1][len(P[-1]) // 2 + sg * 0 - (8 if sg > 0 else -8)]
        pts = [top]
        for h, x in ((.36, sg * .072), (.31, sg * .060), (.28, sg * .050)):
            p, _ = front_point(x, h, extra=.003); pts.append(p)
        back = B.surface(np.array([.262, .262]), np.array([np.pi / 2 - sg * .55, np.pi / 2 - sg * .12]), .003)[0]
        pts += list(back)
        straps.append(Hr.resample(np.array(pts), 40))
    # 胸下中央连接
    cL = shells[1][2][0]; cR = shells[-1][2][0]
    mid = (cL + cR) / 2 + np.array([0, -.004, 0])
    straps.append(np.array([cL, mid, cR]))
    # 背部固定带：贝壳外侧 → 腋下 → 背后中央
    for sg in (1, -1):
        P = shells[sg]; side = P[len(P) // 3][-1 if sg > 0 else 0]
        t0 = np.pi * 1.5 + sg * .9
        t_back = np.pi / 2 + sg * .05
        t1 = t0 + (np.pi * 2 - t0 + t_back if sg > 0 else -(t0 - t_back))
        ring = ring_points(.432, t0 if sg > 0 else t0, t1 if sg > 0 else t1, 40, .0035)
        straps.append(np.vstack([side, ring]))
    out.append(tubes('MM_BraStraps', straps, .0016, M['gold'], 8, coll))
    # 背后蝴蝶结（可调系带）
    knot = B.surface(np.array([.432]), np.array([np.pi / 2]), .006)[0][0]
    bow = []
    for s in (1, -1):
        t = np.linspace(0, 2 * np.pi, 30)
        bow.append(knot + np.stack([s * (.018 * (1 - np.cos(t)) / 2 + .002), .004 * np.sin(t) * 0 + .003, .009 * np.sin(t)], 1))
        tt = np.linspace(0, 1, 14)
        bow.append(knot + np.stack([s * (.006 + .010 * tt), .003 + .002 * tt, -.045 * tt], 1))
    out.append(tubes('MM_BraBow', bow, .0014, M['gold'], 8, coll))
    # 三颗主要节点珍珠：中央 1 + 两侧各 1；另加系带末端小珠
    pc = [mid + np.array([0, -.004, -.004])]
    for sg in (1, -1):
        P = shells[sg]; pc.append(P[len(P) // 3][-1 if sg > 0 else 0] + np.array([sg * .004, -.002, 0]))
    out.append(spheres('MM_BraPearls', pc, .0062, M['pearl'], coll=coll))
    ends = [knot + np.array([s * .016, .004, -.047]) for s in (1, -1)]
    out.append(spheres('MM_BowPearls', ends, .0038, M['pearl'], coll=coll))
    return out


def build_necklace(M, coll=None):
    out = []
    t = np.linspace(0, 2 * np.pi, 140, endpoint=False)
    # 颈根贴合的环：前方下垂到锁骨下
    front = np.clip(-np.sin(t), 0, 1)
    hs = .262 + .040 * front ** 2
    P, _ = B.surface(hs, t, .0045 + .004 * front)
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    n = int(L[-1] / .0074)
    cs = np.stack([np.interp(np.linspace(0, L[-1], n, endpoint=False), L, P[:, k]) for k in range(3)], 1)
    # 内层短链（贴颈根，无吊坠）
    hs2 = .258 + .018 * front ** 2
    P2, _ = B.surface(hs2, t, .0040 + .002 * front)
    L2 = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P2, axis=0), axis=1))])
    n2 = int(L2[-1] / .0066)
    cs2 = np.stack([np.interp(np.linspace(0, L2[-1], n2, endpoint=False), L2, P2[:, k]) for k in range(3)], 1)
    cs = np.vstack([cs, cs2])
    out.append(spheres('MM_NecklacePearls', cs, .0032, M['pearl'], res=(10, 14), coll=coll))
    # 中央泪滴宝石 + 金托
    i0 = np.argmax(front); c = P[i0] + np.array([0, -.004, -.016])
    out.append(sph('MM_NecklaceGem', c, 1., M['gem'], scale=(.0062, .0040, .0092), res=(24, 32), coll=coll))
    t2 = np.linspace(0, 2 * np.pi, 40)
    setting = c + np.stack([.0068 * np.sin(t2), np.full(40, .0012), .0099 * np.cos(t2)], 1)
    out.append(tubes('MM_NecklaceSetting', [setting, [P[i0], c + np.array([0, 0, .0099])]], .0009, M['gold'], 6, coll))
    return out


def build_earrings(M, coll=None):
    out, hooks, pearls = [], [], []
    for s in (1, -1):
        lobe = Hd.HEAD_C + np.array([s * .068, .008, -.040])
        tt = np.linspace(0, 1, 16)
        hook = lobe + np.stack([s * .0015 * np.sin(tt * np.pi), -.002 * np.sin(tt * np.pi * 2), -.006 * tt], 1)
        hooks.append(hook)
        pearls += [(hook[-1] + np.array([0, 0, dz]), r) for dz, r in ((-.0005, .0022), (.0045 - .0110, .0024), (-.0110 - .0045, .0040))]
    out.append(tubes('MM_EarHooks', hooks, .0006, M['gold'], 6, coll))
    parts = [Hd.sphere(c_, r_, 12, 16) for c_, r_ in pearls]
    V, F = merge(parts); out.append(make_mesh('MM_EarPearls', V, F, M['pearl'], coll))
    return out


def scallop_mesh(name, c, normal, up, W, Hh, depth, mat, ribs=12, coll=None):
    """独立小扇贝（发饰 / 臂饰用），c 为壳铰点。"""
    u, v, rib, R, Aa = scallop_grid(41, 14, ribs)
    n = np.asarray(normal, float); n /= np.linalg.norm(n)
    upv = np.asarray(up, float); upv = upv - n * np.dot(upv, n); upv /= np.linalg.norm(upv)
    side = np.cross(upv, n)
    dome = depth * np.sin(np.pi * np.clip(R, 0, 1) ** .7 / 1.2) + .0012 * rib * W / .035
    P = c + u[..., None] * W / 2 * side + v[..., None] * Hh * upv + dome[..., None] * n
    ob = make_mesh(name, P.reshape(-1, 3), grid_faces(*u.shape, wrap=False), mat, coll)
    solidify(ob, .0012)
    return ob, P


def build_armlets(M, coll=None):
    out, bands, pearls = [], [], []
    for sg in (1, -1):
        S, E, W, d1, d2 = B.arm_rig(sg)
        u = .135; c = S + d1 * u; r = .0415
        F = frame_from(d1)
        t = np.linspace(0, 2 * np.pi, 64)
        ring = c + np.outer(np.cos(t) * r, F[:, 0]) + np.outer(np.sin(t) * r, F[:, 1])
        bands.append(ring)
        # 细金卷纹连接件：两道细环
        # 两道珍珠垂链：一道环绕，一道在贝壳下方下垂
        sag = np.clip(np.cos(t - np.arctan2(np.dot(np.array([sg, -.35, 0]), F[:, 1]), np.dot(np.array([sg, -.35, 0]), F[:, 0]))), 0, 1)
        loop1 = c + np.outer(np.cos(t) * (r + .002), F[:, 0]) + np.outer(np.sin(t) * (r + .002), F[:, 1]) + np.outer(.010 + .0 * t, d1)
        loop2 = c + np.outer(np.cos(t) * (r + .003), F[:, 0]) + np.outer(np.sin(t) * (r + .003), F[:, 1]) + np.outer(.016 + .020 * sag ** 2, d1)
        for lp in (loop1, loop2):
            Lc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(lp, axis=0), axis=1))]); m = int(Lc[-1] / .0072)
            pearls += list(np.stack([np.interp(np.linspace(0, Lc[-1], m, endpoint=False), Lc, lp[:, k]) for k in range(3)], 1))
        out_dir = np.array([sg, -.35, 0]); out_dir /= np.linalg.norm(out_dir)
        out_dir = out_dir - d1 * np.dot(out_dir, d1); out_dir /= np.linalg.norm(out_dir)
        hinge = c + out_dir * (r + .002) + d1 * .011
        sh, _ = scallop_mesh('MM_ArmShell' + ('L' if sg > 0 else 'R'), hinge, out_dir, -d1, .026, .024, .005, M['shell'], 10, coll)
        out.append(sh)
        for k in (-2, -1, 1, 2):
            a = np.arctan2(np.dot(out_dir, F[:, 1]), np.dot(out_dir, F[:, 0])) + k * .32
            pearls.append(c + (np.cos(a) * F[:, 0] + np.sin(a) * F[:, 1]) * (r + .003) + d1 * .001)
    out.append(tubes('MM_ArmBands', bands, .0013, M['gold'], 6, coll))
    out.append(spheres('MM_ArmPearls', pearls, .0033, M['pearl'], res=(10, 14), coll=coll))
    return out


def coral_branches(base, out, up, spread=.060, depth=4, seed=0):
    rng = np.random.default_rng(seed)
    paths, radii = [], []

    def grow(p, d, L, r, k):
        n = 6; pts = [p]
        for i in range(n):
            d = d + rng.normal(scale=.12, size=3); d /= np.linalg.norm(d)
            pts.append(pts[-1] + d * L / n)
        paths.append(np.array(pts)); radii.append(np.linspace(r, r * .7, n + 1))
        if k < depth:
            for s in (-1, 1):
                ax = np.cross(d, out); ax /= np.linalg.norm(ax) + 1e-9
                d2 = B.rot(ax, s * (.45 + .3 * rng.random())) @ d
                grow(pts[-1], d2, L * .68, r * .72, k + 1)
    side = np.cross(out, up)
    for a in np.radians([-80, -45, -15, 15, 45, 80]):              # 珊瑚扇：自贝壳后方放射
        d0 = up * np.cos(a) + side * np.sin(a) + out * .12; d0 /= np.linalg.norm(d0)
        grow(base, d0, spread * .40, .0022, 2)
    return paths, radii


def build_hair_ornaments(M, coll=None):
    out = []
    coral_paths, coral_r, rib_strips, pearls = [], [], [], []
    for sg in (1, -1):
        d = np.array([sg * .78, -.05, .62]); d /= np.linalg.norm(d)
        base = Hd.HEAD_C + d * (Hr.surf_r(d[None])[0] + .016)
        up = np.array([sg * .35, .25, 1.]); up /= np.linalg.norm(up)
        P, R = coral_branches(base, d, up, seed=3 if sg > 0 else 4)
        coral_paths += P; coral_r += R
        # 扇贝 3.5 cm（铰点在下）
        sh, SP = scallop_mesh('MM_HairShell' + ('L' if sg > 0 else 'R'), base - up * .014 + d * .007, d,
                              up, .035, .033, .007, M['shell'], 11, coll)
        out.append(sh)
        pearls.append(base - up * .016 + d * .010)
        pearls += [base - up * .003 + d * .012 + np.cross(d, up) * s * .010 for s in (-1, 1)]
        # 透明浅蓝蝴蝶结：两个环 + 两条垂尾（数量克制）
        knot = base - up * .022 + d * .006
        sd = np.cross(d, up)
        for s2 in (-1, 1):
            tt = np.linspace(0, 2 * np.pi, 40)
            loop = knot + np.outer((1 - np.cos(tt)) / 2 * .020 * s2, sd) + np.outer(np.sin(tt) * .008, up) + np.outer(np.sin(tt) * .003, d)
            rib_strips.append((loop, .0045))
        for k, (L, ph) in enumerate(((.20, 0.), (.16, 1.7))):
            tt = np.linspace(0, 1, 40)
            path = knot + np.stack([sg * (.006 + .018 * tt + .008 * np.sin(tt * 9 + ph)),
                                    .006 + .03 * tt, -L * tt], 1)
            rib_strips.append((path, .0055 - .0015 * k))
    V, F = merge([tube(P, r, 7) for P, r in zip(coral_paths, coral_r)])
    out.append(make_mesh('MM_Coral', V, F, M['coral'], coll))
    out.append(spheres('MM_HairPearls', pearls, .0040, M['pearl'], coll=coll))
    # 飘带：沿路径的扁带（宽 1.3 cm，带轻微扭转）
    parts = []
    for path, w in rib_strips:
        n = len(path); T = np.gradient(path, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True)
        V = []
        for i in range(n):
            a = .9 * np.sin(i / n * 5)
            side = np.cross(T[i], [0, 1, 0]); side /= np.linalg.norm(side)
            nrm = np.cross(T[i], side)
            sd = side * np.cos(a) + nrm * np.sin(a)
            V += [path[i] - sd * w, path[i] + sd * w]
        V = np.array(V); F = grid_faces(n, 2, wrap=False)
        parts.append((V, F))
    V, F = merge(parts)
    out.append(make_mesh('MM_Ribbons', V, F, M['ribbon'], coll, attrs=dict(rib_t=np.tile(np.repeat(np.linspace(0, 1, 40), 2), len(parts)))))
    return out


def build_forehead_mark(M, coll=None):
    d = np.array([0, -1., .30]); d /= np.linalg.norm(d)
    c = Hd.HEAD_C + d * (Hr.surf_r(d[None])[0] + .0004)
    n = d; up = np.array([0, 0, 1.]) - n * n[2]; up /= np.linalg.norm(up); side = np.cross(up, n)
    parts = []
    for k in range(4):
        a = k * np.pi / 2 + np.pi / 4
        dirv = np.cos(a) * side + np.sin(a) * up
        a = k * np.pi / 2                                           # 四角星：尖瓣朝上下左右
        dirv = np.cos(a) * side + np.sin(a) * up
        perp = np.cross(n, dirv)
        u = np.linspace(0, 1, 12)
        half = .0016 * np.sin(np.pi * u) ** 1.4 * (1 - .55 * u)
        pts = np.concatenate([[c], c + np.outer(u * .0050, dirv) + np.outer(half, perp), c + np.outer(u[::-1] * .0050, dirv) - np.outer(half[::-1], perp)])
        tri = [[0, i, i + 1] for i in range(1, len(pts) - 1)]
        parts.append((pts + n * .0002, np.array([[a_, b_, c_, c_] for a_, b_, c_ in tri])))
    V, F = merge(parts)
    deg = F[:, 2] == F[:, 3]
    ob = make_mixed('MM_ForeheadMark', V, F[~deg], F[deg][:, :3], M['coral'], coll)
    solidify(ob, .0004)
    dots = [c + n * .0004 + (np.cos(a) * side + np.sin(a) * up) * .0045 for a in np.arange(4) * np.pi / 2 + np.pi / 4]
    return [ob, spheres('MM_ForeheadDots', dots, .00045, M['coral'], res=(6, 8), coll=coll)]


def build_all(M, coll=None):
    out = []
    for fn in (build_bra, build_necklace, build_earrings, build_armlets, build_hair_ornaments, build_forehead_mark):
        out += fn(M, coll)
    return out
