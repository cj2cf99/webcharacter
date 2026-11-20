# 鱼鳞（独立交叠几何）与三层尾鳍（主鳍 / 中层过渡鳍 / 基部衔接鳍）、鳍缘金线、鳍根珍珠花饰。
import numpy as np
from mm_common import *
import mm_body as B

RNG = np.random.default_rng(7)


def scale_len(s):
    """鳞片纵向长度（m）：臀根较大，向尾柄渐小。设定只锁定“渐小”，数值为推定。"""
    return pchip([-.06, 0, .35, .80, 1.15, 1.40], [.020, .040, .036, .027, .019, .014])(s)


def scale_start(x, y):
    """与 mm_body.tail_fraction 相同的鳞片起始高度（h）：臀后/侧早，腹侧晚。"""
    ang_front = np.clip(-y / (np.abs(x) + np.abs(y) + 1e-6), 0, 1)
    return .785 + .075 * ang_front ** 1.5 + .010 * np.sin(x * 60)


def build_scales(mat, coll=None):
    rows = []
    s = -.045
    k = 0
    while s < 1.405:
        rows.append((s, k)); s += scale_len(max(s, -.05)) * .52; k += 1
    V_all, F_all, A_r, A_tone, A_s = [], [], [], [], []
    nr, nseg = 4, 14
    # 单片模板（极坐标盘）：u 径向，φ 环向
    u = np.linspace(0, 1, nr + 1)[1:]; ph = np.linspace(0, 2 * np.pi, nseg, endpoint=False)
    Uu, PH = np.meshgrid(u, ph, indexing='ij')
    tmpl = np.stack([Uu * np.cos(PH), Uu * np.sin(PH)], -1).reshape(-1, 2)   # x 沿尾向，y 横向
    tu = np.concatenate([[0], Uu.ravel()])
    tmpl = np.vstack([[0, 0], tmpl])
    # 面：中心扇 + 环带
    fs = [[0, 1 + (j + 1) % nseg, 1 + j, 1 + j] for j in range(nseg)]
    for i in range(nr - 1):
        for j in range(nseg):
            a = 1 + i * nseg + j; b = 1 + i * nseg + (j + 1) % nseg
            fs.append([a, b, b + nseg, a + nseg])
    fs = np.array(fs)
    nv = len(tmpl); count = 0; phase = 0.
    for s, k in rows:
        h = .82 + s; L = scale_len(s)
        # 环向数量：按周长 / 鳞宽
        tt = np.linspace(0, 2 * np.pi, 200, endpoint=False)
        P, _ = B.surface(np.full(200, h), tt)
        per = np.sum(np.linalg.norm(np.roll(P, -1, 0) - P, axis=1))
        n = max(10, int(round(per / (L * .82))))
        phase += np.pi / n                                   # 逐行错开半片，避免固定接缝
        for j in range(n):
            t = phase + 2 * np.pi * j / n
            p0, nrm2 = B.surface(np.array([h]), np.array([t]))
            p0 = p0[0]; x, y = p0[0], p0[1]
            st = scale_start(x, y)
            if h < st - .01: continue
            grow = smoothstep(st - .01, st + .08, h)            # 过渡带：小而薄 → 正常
            # 局部标架：T 沿尾向（世界 -z 方向沿表面），N 外法线，Bv 环向
            pa, _ = B.surface(np.array([h - .004, h + .004]), np.array([t, t]))
            T = pa[1] - pa[0]; T /= np.linalg.norm(T)
            pb, _ = B.surface(np.array([h, h]), np.array([t - .01, t + .01]))
            Bv = pb[1] - pb[0]; Bv /= np.linalg.norm(Bv)
            N = np.cross(Bv, T); N /= np.linalg.norm(N)
            if np.dot(N, np.array([x, y - B.SEC_YC(h), 0])) < 0: N = -N
            lx = L * .62 * (.65 + .35 * grow); ly = per / n * .62
            lift = .0003 + .0018 * grow
            X = tmpl[:, 0] * lx; Y = tmpl[:, 1] * ly
            # 鳞片自中心向尾侧翘起（形成片层叠压）；横向随体表弯曲
            hgt = lift * (1 - tu ** 2) * .3 + .0026 * grow ** 2 * (X / lx) * .55 + .0010 - .0045 * (1 - grow) * np.clip(-X / lx + .2, 0, 1)
            curv = -(Y ** 2) / (2 * np.linalg.norm([x, y]) + 1e-3)
            pts = p0[None] + X[:, None] * T[None] + Y[:, None] * Bv[None] + (hgt + curv)[:, None] * N[None]
            V_all.append(pts); F_all.append(fs + count * nv); count += 1
            A_r.append(tu); A_tone.append(np.full(nv, RNG.random())); A_s.append(np.full(nv, s / 1.4))
    V = np.vstack(V_all); F = np.vstack(F_all)
    deg = F[:, 2] == F[:, 3]
    ob = make_mixed('MM_Scales', V, F[~deg], F[deg][:, :3], mat, coll,
                    attrs=dict(sc_r=np.concatenate(A_r), sc_tone=np.concatenate(A_tone), sc_s=np.concatenate(A_s)))
    ob['scale_count'] = count
    return ob


# ---------------- 尾鳍 ----------------
FIN_ROOT_Z = z_of(.82 + 1.40)       # 尾鳍主根（s=140 cm）
# (角度°, 长度 m, 外侧最大半宽, 内侧最大半宽, 末梢外卷 rad, 根部 x 偏移, y 层偏移, 根部 z 偏移)
MAIN = [(9, .80, .135, .092, .18, .008, .000, .000, -1.0), (27, .83, .152, .100, .36, .014, -.004, .004, 1.6),
        (46, .74, .145, .095, .62, .020, -.008, .008, 2.3), (64, .60, .120, .080, .95, .024, -.012, .012, 3.0)]
MID = [(4, .55, .090, .060, .12, .006, .012, .010), (19, .60, .100, .070, .28, .010, .010, .012),
       (37, .56, .095, .065, .50, .016, .008, .016), (55, .46, .085, .058, .75, .020, .006, .020)]
BASE = [(4, .20, .050, .036, .06, .004, -.016, .032), (24, .23, .055, .038, .20, .010, -.017, .036),
        (45, .21, .050, .034, .36, .014, -.016, .042), (64, .17, .044, .030, .50, .018, -.014, .050)]


def lobe(side, spec, layer, nt=72, nv=17):
    ang, L, wo, wi, curl, rx, ry, rz = spec[:8]
    tipc = spec[8] if len(spec) > 8 else 0.
    t = np.linspace(0, 1, nt)
    # 自 -z 起算，外展为正；主鳍末梢收细并卷成细须（外侧鳍叶向外上方卷）
    th = np.radians(ang) + curl * t ** 2.2 + tipc * smoothstep(.78, 1., t) ** 1.6
    dt = L / (nt - 1)
    dx = np.sin(th) * dt; dz = -np.cos(th) * dt
    cx = np.concatenate([[0], np.cumsum(dx[:-1])]); cz = np.concatenate([[0], np.cumsum(dz[:-1])])
    nx_, nz_ = np.cos(th), np.sin(th)                           # 平面内法线（外侧为正）
    prof = np.sin(np.pi * np.clip(t, 0, 1) ** .45) ** .7 * (1 - .10 * t)
    prof = np.maximum(prof, .30 * (1 - t) * (t < .2))            # 根部保留宽度，与尾柄连续
    if tipc: prof = prof * (1 - .93 * smoothstep(.70, .96, t))
    v = np.linspace(-1, 1, nv)
    T, Vv = np.meshgrid(t, v, indexing='ij')
    W = np.where(Vv > 0, wo, wi) * prof[:, None]
    X = cx[:, None] + nx_[:, None] * W * Vv
    Z = cz[:, None] + nz_[:, None] * W * Vv
    # 立体：向后掠、膜面杯形与轻微波褶
    Y = (.05 * L * T ** 2 + .010 * (1 - Vv ** 2) * T + .004 * np.sin(Vv * 5 + T * 7) * T * np.abs(Vv))
    P = np.stack([side * (X + rx), Y + ry, FIN_ROOT_Z + rz + Z], -1)
    attrs = dict(fin_t=T, fin_v=Vv, fin_layer=np.full_like(T, layer))
    return P.reshape(-1, 3), grid_faces(nt, nv, wrap=False), {k: v.ravel() for k, v in attrs.items()}, P


def fin_scale_to_width(target=.55):
    """标准展开最大宽度 110 cm：按主鳍外包络求比例（只缩横向）。"""
    xs = [np.abs(lobe(1, s, 0)[3][..., 0]).max() for s in MAIN + MID + BASE]
    return target / max(xs)


def build_fins(mat, gold_mat, coll=None, pearl_mat=None):
    k = fin_scale_to_width()
    parts, attrs, rims = [], {'fin_t': [], 'fin_v': [], 'fin_layer': []}, []
    mains = {1: [], -1: []}
    for layer, specs in ((1, MID), (0, MAIN), (2, BASE)):
        for side in (1, -1):
            for sp in specs:
                V, F, A, P = lobe(side, sp, layer)
                V[:, 0] *= k
                P = P.copy(); P[..., 0] *= k
                parts.append((V, F))
                for key in attrs: attrs[key].append(A[key])
                if layer == 0:
                    rims.append(P[4:, -1])                       # 只描主鳍外缘（含末梢细须）
                    rims.append(P[int(len(P) * .55):, 0])
                    mains[side].append(P)
    V, F = merge(parts)
    fin = make_mesh('MM_Fins', V, F, mat, coll, attrs={k2: np.concatenate(v) for k2, v in attrs.items()})
    # 金色鳍缘
    gparts = []
    for r in rims:
        n = len(r); rad = np.linspace(.0016, .0007, n)
        V2, F2 = tube(r, rad, 6)
        gparts.append((V2, F2))
    V, F = merge(gparts)
    gold = make_mesh('MM_FinRim', V, F, gold_mat, coll)
    extra = []
    if pearl_mat:
        import mm_head as Hd
        drops, chain = [], []
        for side in (1, -1):
            Ps = mains[side]
            for P in Ps[1:]:
                tip = P[-1, P.shape[1] // 2]
                drops.append(tip + np.array([0, 0, -.009]))
            for A_, B_ in zip(Ps[:-1], Ps[1:]):
                i = int(len(A_) * .74); a = A_[i, A_.shape[1] // 2]; b = B_[i, B_.shape[1] // 2]
                n = max(6, int(np.linalg.norm(b - a) / .0085))
                u = np.linspace(0, 1, n)
                chain += list(a + np.outer(u, b - a) + np.outer(-4 * u * (1 - u) * .045, [0, 0, 1]) + np.outer(u * 0, [0, 1, 0]) + [0, .004, 0])
        parts = [Hd.sphere(c, .0058, 12, 16) for c in drops] + [Hd.sphere(c, .0028, 8, 10) for c in chain]
        V, F = merge(parts)
        extra.append(make_mesh('MM_FinPearls', V, F, pearl_mat, coll))
    return fin, gold, k, extra


def tail_ornament(gold_mat, pearl_mat, blue_mat, coll=None):
    """鳍根花饰：金托 8 瓣 + 浅蓝内瓣 + 中心珍珠（位于尾柄正面）。"""
    import mm_head as Hd
    c = np.array([0, -.028, FIN_ROOT_Z + .030])
    out = []
    parts_g, parts_b = [], []
    for i in range(8):
        a = i / 8 * 2 * np.pi + np.pi / 8
        d = np.array([np.cos(a), 0, np.sin(a)])
        L = .022 if i % 2 else .028                                     # 长短交错的星形金托
        V, F = Hd.sphere(c + d * (L * .9) + [0, .004, 0], 1, 10, 14, scale=(L * .75, .0045, .0068))
        V = rot_about(V, c + d * (L * .9), np.array([0, 1., 0]), -a)
        parts_g.append((V, F))
        V, F = Hd.sphere(c + d * .017 + [0, -.002, 0], 1, 10, 14, scale=(.012, .0035, .0055))
        V = rot_about(V, c + d * .017, np.array([0, 1., 0]), -a)
        parts_b.append((V, F))
    V, F = merge(parts_g); out.append(make_mesh('MM_TailFlowerGold', V, F, gold_mat, coll))
    V, F = merge(parts_b); out.append(make_mesh('MM_TailFlowerBlue', V, F, blue_mat, coll))
    V, F = Hd.sphere(c + [0, -.008, 0], .0155, 24, 32); out.append(make_mesh('MM_TailPearl', V, F, pearl_mat, coll))
    # 鳍面中央吊坠：细珍珠链 + 浅蓝水滴
    top = c + np.array([0, .004, -.030]); n = 30
    chain = [top + np.array([0, .006 * np.sin(np.pi * u), -.25 * u]) for u in np.linspace(0, 1, n)]
    parts = [Hd.sphere(p, .0026, 8, 10) for p in chain]
    V, F = merge(parts); out.append(make_mesh('MM_TailChain', V, F, pearl_mat, coll))
    V, F = Hd.sphere(chain[-1] + [0, 0, -.012], 1., 16, 24, scale=(.0065, .0065, .011))
    out.append(make_mesh('MM_TailDrop', V, F, blue_mat, coll))
    return out


def build_side_fins(mat, coll=None):
    """鱼尾两侧半透明飘鳍（五视图所示），每侧 3 片，沿尾向下、略外展。"""
    parts, A_t, A_v = [], [], []
    for sg in (1, -1):
        for k, (s0, L, w, ang) in enumerate(((.46, .34, .060, 5), (.64, .32, .055, 4), (.82, .28, .050, 3))):
            h = .82 + s0
            p0, _ = B.surface(np.array([h]), np.array([0. if sg > 0 else np.pi]))
            p0 = p0[0] + np.array([-sg * .010, 0, 0])
            nt, nv = 40, 9
            t = np.linspace(0, 1, nt); v = np.linspace(0, 1, nv)
            th = np.radians(ang) + .22 * np.sin(t * np.pi * 1.3)            # 柔和 S 形，贴尾下垂
            dz = -np.cos(th) * L / nt; dx = np.sin(th) * L / nt
            cx = np.cumsum(dx); cz = np.cumsum(dz)
            T_, V_ = np.meshgrid(t, v, indexing='ij')
            width = w * np.sin(np.pi * np.clip(t, 0, 1) ** .55)[:, None] * (1 - .6 * t[:, None])
            X = sg * (cx[:, None] + V_ * width * np.cos(th)[:, None])
            Z = cz[:, None] - V_ * width * np.sin(th)[:, None] * .3 + V_ * width * .2
            Y = .006 * np.sin(T_ * 9 + V_ * 2) * V_
            P = np.stack([p0[0] + X, p0[1] + Y, p0[2] + Z], -1)
            parts.append((P.reshape(-1, 3), grid_faces(nt, nv, wrap=False)))
            A_t.append((T_ * .7 + .3).ravel()); A_v.append((V_ * 2 - 1).ravel())
    V, F = merge(parts)
    return make_mesh('MM_SideFins', V, F, mat, coll, attrs=dict(fin_t=np.concatenate(A_t), fin_v=np.concatenate(A_v),
                                                                 fin_layer=np.zeros(len(V))))


def rot_about(V, c, axis, ang):
    R = B.rot(axis, ang)
    return (V - c) @ R.T + c
