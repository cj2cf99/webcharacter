# 四类玻璃贴图（numpy 程序化生成，只用于烘焙）。设计原则（用户 2026-11-15）：真实的彩窗是大块色域加黑色铅条，
# 不是细碎的色点；所以每种图案都只用大色块，没有随机碎屑。
# 现实依据（见 docs/PLAN.md I10）：玫瑰窗具象，高侧窗是 1966 年的抽象彩色玻璃，礼拜堂是灰色调玻璃。
# 圣经人物与具体场景不编造，只做色块近似：玫瑰窗保留“中心圆章 + 同心环 + 放射分区”的结构，
# 唱诗区高窗用“菱形底纹 + 圆章”表示叙事窗的版式。
import numpy as np

PAL = {
    'blue': (0.04, 0.14, 0.72), 'deep': (0.02, 0.06, 0.42), 'red': (0.72, 0.05, 0.05),
    'gold': (0.95, 0.68, 0.10), 'green': (0.08, 0.45, 0.18), 'white': (0.90, 0.86, 0.76),
    'purple': (0.35, 0.10, 0.45), 'lead': (0.015, 0.015, 0.02),
}
C = lambda n: np.array(PAL[n], np.float32)

def _smooth_noise(h, w, cell, rng):
    """低频起伏（玻璃厚薄造成的明暗），不是色点。"""
    a = rng.random((h // cell + 2, w // cell + 2)).astype(np.float32)
    ys = np.linspace(0, a.shape[0] - 1.001, h); xs = np.linspace(0, a.shape[1] - 1.001, w)
    y0 = ys.astype(int); x0 = xs.astype(int); fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
    return (a[y0][:, x0] * (1 - fy) * (1 - fx) + a[y0 + 1][:, x0] * fy * (1 - fx)
            + a[y0][:, x0 + 1] * (1 - fy) * fx + a[y0 + 1][:, x0 + 1] * fy * fx)

def _finish(img, lead, rng, shade=0.12):
    h, w = img.shape[:2]
    img = img * (1 - shade / 2 + shade * _smooth_noise(h, w, max(8, h // 8), rng))[..., None]
    img[lead] = C('lead')
    return np.clip(img, 0, 1)

def rose(N=1024):
    """玫瑰窗：中心圆章；内环 12 分区（红蓝相间）；中环 24 分区；外环 24 个圆章；外框深蓝。"""
    rng = np.random.default_rng(1)
    y, x = np.mgrid[-1:1:N * 1j, -1:1:N * 1j].astype(np.float32)
    r = np.hypot(x, y); th = (np.arctan2(y, x) + 2 * np.pi) % (2 * np.pi)
    img = np.zeros((N, N, 3), np.float32) + C('deep')
    lead = np.zeros((N, N), bool)
    def band(r0, r1, n, colors):
        m = (r >= r0) & (r < r1)
        sec = (th / (2 * np.pi) * n).astype(int) % n
        for i in range(n):
            img[m & (sec == i)] = C(colors[i % len(colors)])
        # 分区铅条：到相邻扇形边界的弧长
        ang = (th / (2 * np.pi) * n) % 1.0
        d = np.minimum(ang, 1 - ang) * (2 * np.pi / n) * r
        lead[m & (d < 0.006)] = True
    img[r < 0.15] = C('gold')
    img[(r >= 0.10) & (r < 0.15)] = C('red')
    band(0.15, 0.46, 12, ['red', 'blue'])
    band(0.46, 0.74, 24, ['blue', 'red', 'blue', 'gold', 'blue', 'green'])
    band(0.74, 0.92, 24, ['deep'])
    img[(r >= 0.92) & (r <= 1)] = C('deep')
    # 外环 24 个大圆章，红金绿白轮换
    for i in range(24):
        a = (i + 0.5) / 24 * 2 * np.pi
        d = np.hypot(x - 0.83 * np.cos(a), y - 0.83 * np.sin(a))
        col = ['red', 'gold', 'green', 'white'][i % 4]
        img[d < 0.055] = C(col); lead[(d >= 0.055) & (d < 0.065)] = True
    # 内环 12 个大圆章
    for i in range(12):
        a = (i + 0.5) / 12 * 2 * np.pi
        d = np.hypot(x - 0.31 * np.cos(a), y - 0.31 * np.sin(a))
        img[d < 0.07] = C(['gold', 'white'][i % 2]); lead[(d >= 0.07) & (d < 0.082)] = True
    for rr in (0.10, 0.15, 0.46, 0.74, 0.92):
        lead[np.abs(r - rr) < 0.007] = True
    lead[r >= 0.992] = True
    return _finish(img, lead, rng)

def abstract(W=512, H=1024):
    """中殿高侧窗（Le Chevallier 风格抽象）：大小不一的矩形/三角大色块，蓝为主，夹红、琥珀、绿、少量透明。"""
    rng = np.random.default_rng(7)
    xs = np.sort(rng.uniform(0.18, 0.82, 2)); ys = np.sort(rng.uniform(0.08, 0.92, 5))
    xe = np.concatenate([[0], xs, [1]]); ye = np.concatenate([[0], ys, [1]])
    cols = ['blue', 'blue', 'deep', 'red', 'gold', 'green', 'white', 'blue', 'red', 'gold']
    y, x = np.mgrid[0:1:H * 1j, 0:1:W * 1j].astype(np.float32)
    ci = np.clip(np.searchsorted(xe, x, 'right') - 1, 0, len(xe) - 2); ri = np.clip(np.searchsorted(ye, y, 'right') - 1, 0, len(ye) - 2)
    tab = rng.integers(0, len(cols), (len(ye) - 1, len(xe) - 1)); tab2 = rng.integers(0, len(cols), tab.shape)
    img = np.zeros((H, W, 3), np.float32)
    fx = (x - xe[ci]) / (xe[ci + 1] - xe[ci]); fy = (y - ye[ri]) / (ye[ri + 1] - ye[ri])
    tri = rng.random(tab.shape) < 0.45; flip = rng.random(tab.shape) < 0.5
    a = (fx + fy > 1) ^ flip[ri, ci]
    pick = np.where(tri[ri, ci] & a, tab2[ri, ci], tab[ri, ci])
    pal = np.array([PAL[c] for c in cols], np.float32)
    img[:] = pal[pick]
    lead = np.zeros((H, W), bool)
    px = 0.008
    for v in xe[1:-1]: lead[:, np.abs(x[0] - v) < px] = True
    for v in ye[1:-1]: lead[np.abs(y[:, 0] - v) < px * 0.5, :] = True
    lead |= tri[ri, ci] & (np.abs(fx + fy - 1) * 0.5 < 0.012)        # 三角分界线
    lead[:4, :] = lead[-4:, :] = True; lead[:, :4] = lead[:, -4:] = True
    return _finish(img, lead, rng, 0.10)

def medallion(W=512, H=1024):
    """唱诗区高窗（叙事窗的版式近似）：红蓝菱形底纹，竖排 5 个圆章，圆章内用大色块表示人物，红金方块边框。"""
    rng = np.random.default_rng(3)
    y, x = np.mgrid[0:1:H * 1j, 0:1:W * 1j].astype(np.float32)
    aspect = H / W
    img = np.zeros((H, W, 3), np.float32)
    # 菱形底纹：以 0.5 宽为一格
    gx = x * 2.0; gy = y * aspect
    cell = (np.floor(gx + gy) + np.floor(gx - gy)).astype(int) % 2
    img[:] = np.where(cell[..., None] == 0, C('blue'), C('red'))
    lead = np.zeros((H, W), bool)
    fd = np.abs(((gx + gy) % 1.0) - 0.5); fe = np.abs(((gx - gy) % 1.0) - 0.5)
    lead |= (fd > 0.485) | (fe > 0.485)
    # 边框
    b = 0.07
    border = (x < b) | (x > 1 - b) | (y < b / aspect) | (y > 1 - b / aspect)
    sq = ((np.floor(y * aspect * 14).astype(int)) % 2 == 0)
    img[border] = np.where(sq[..., None], C('gold'), C('red'))[border]
    lead[(np.abs(x - b) < 0.01) | (np.abs(x - (1 - b)) < 0.01)] = True
    # 5 个圆章（半径 0.19，按 x 方向单位；竖向间距 0.2×aspect=0.4，互不重叠）
    for i in range(5):
        cy = (i + 0.5) / 5
        d = np.hypot(x - 0.5, (y - cy) * aspect)
        R = 0.19
        lead[d < R] = False                                   # 圆章内不要底纹铅条
        img[d < R] = C('gold'); lead[(d >= R) & (d < R + 0.014)] = True
        img[d < R * 0.84] = C('white')
        lead[(d >= R * 0.84) & (d < R * 0.84 + 0.01)] = True
        body = (np.abs(x - 0.5) < 0.085) & (y > cy - 0.004) & (y < cy + 0.05) & (d < R * 0.82)
        img[body] = C(['red', 'blue', 'green', 'purple', 'red'][i])
        hd = np.hypot(x - 0.5, (y - (cy - 0.03)) * aspect)
        img[hd < 0.05] = C('gold'); img[hd < 0.036] = (0.93, 0.78, 0.65)
    lead[:4, :] = lead[-4:, :] = True; lead[:, :4] = lead[:, -4:] = True
    return _finish(img, lead, rng, 0.10)

def grisaille(W=512, H=1024):
    """灰色调玻璃：浅灰绿底，细菱形铅条格；窄边框用蓝红交替方块。几乎透明，不抢玫瑰窗的色彩。"""
    rng = np.random.default_rng(5)
    y, x = np.mgrid[0:1:H * 1j, 0:1:W * 1j].astype(np.float32)
    aspect = H / W
    img = np.zeros((H, W, 3), np.float32) + np.array((0.80, 0.86, 0.80), np.float32)
    lead = np.zeros((H, W), bool)
    gx = x * 5.0; gy = y * aspect * 5.0
    lead |= (np.abs(((gx + gy) % 1.0) - 0.5) > 0.47) | (np.abs(((gx - gy) % 1.0) - 0.5) > 0.47)
    b = 0.06
    border = (x < b) | (x > 1 - b) | (y < b / aspect) | (y > 1 - b / aspect)
    sq = ((np.floor(y * aspect * 16).astype(int)) % 2 == 0)
    img[border] = np.where(sq[..., None], C('blue'), C('red'))[border] * 0.85
    lead[(np.abs(x - b) < 0.008) | (np.abs(x - (1 - b)) < 0.008)] = True
    lead[:3, :] = lead[-3:, :] = True; lead[:, :3] = lead[:, -3:] = True
    return _finish(img, lead, rng, 0.08)

ALL = {'rose': rose, 'abs': abstract, 'med': medallion, 'gris': grisaille}

# ---------------------------------------------------------------- 玫瑰窗（2026-11-16 按用户给的实景照片重做）
# 参照：西窗（蓝红，12 瓣，三环圆章）、南窗（蓝红，圆章内是人物）、北窗（紫蓝为主，16 瓣，圆章密集）、
# 以及南玫瑰窗的天使细节（红袍、白粉羽翼、金色光环、蓝底）。人物只画成“天使剪影”的大色块，不编造具体场景。
PAL.update({'violet': (0.30, 0.10, 0.58), 'skin': (0.93, 0.78, 0.65), 'pink': (0.85, 0.55, 0.60), 'stone': (0.05, 0.045, 0.04)})

def _disc(img, lead, x, y, cx, cy, R, col, ring=0.0):
    """在包围盒内画圆盘（避免整幅图逐个运算）。"""
    N = img.shape[0]
    i0 = max(0, int((cy - R - 0.02 + 1) / 2 * N)); i1 = min(N, int((cy + R + 0.02 + 1) / 2 * N) + 1)
    j0 = max(0, int((cx - R - 0.02 + 1) / 2 * N)); j1 = min(N, int((cx + R + 0.02 + 1) / 2 * N) + 1)
    d = np.hypot(x[i0:i1, j0:j1] - cx, y[i0:i1, j0:j1] - cy)
    img[i0:i1, j0:j1][d < R] = C(col) if isinstance(col, str) else np.array(col, np.float32)
    if ring:
        lead[i0:i1, j0:j1][(d >= R) & (d < R + ring)] = True

def _ellipse(img, x, y, cx, cy, a, b, col, rot=0.0):
    N = img.shape[0]; R = max(a, b)
    i0 = max(0, int((cy - R + 1) / 2 * N)); i1 = min(N, int((cy + R + 1) / 2 * N) + 1)
    j0 = max(0, int((cx - R + 1) / 2 * N)); j1 = min(N, int((cx + R + 1) / 2 * N) + 1)
    dx = x[i0:i1, j0:j1] - cx; dy = y[i0:i1, j0:j1] - cy
    c, s_ = np.cos(rot), np.sin(rot)
    u = dx * c + dy * s_; v = -dx * s_ + dy * c
    img[i0:i1, j0:j1][(u / a) ** 2 + (v / b) ** 2 < 1] = C(col)

def _angel(img, lead, x, y, cx, cy, R, ang, rng, field):
    """圆章：外圈红/金边 + 白细圈 + 底色 + 天使剪影（红袍、白粉羽翼、金光环）。ang：身体朝向圆心的方向。"""
    _disc(img, lead, x, y, cx, cy, R, 'lead', 0.0)
    _disc(img, lead, x, y, cx, cy, R * 0.93, 'red' if rng.random() < 0.7 else 'gold')
    _disc(img, lead, x, y, cx, cy, R * 0.80, 'white')
    _disc(img, lead, x, y, cx, cy, R * 0.74, field, R * 0.02)
    ux, uy = np.cos(ang), np.sin(ang)                 # “上”方向（背向圆心）
    rx, ry = -uy, ux
    robe = ['red', 'red', 'green', 'purple', 'gold'][int(rng.integers(0, 5))]
    for sgn in (-1, 1):                                # 翅膀
        _ellipse(img, x, y, cx + rx * sgn * R * 0.36 + ux * R * 0.05, cy + ry * sgn * R * 0.36 + uy * R * 0.05, R * 0.30, R * 0.12, ['white', 'pink'][int(rng.integers(0, 2))], np.arctan2(uy, ux) + sgn * 0.5)
    _ellipse(img, x, y, cx - ux * R * 0.12, cy - uy * R * 0.12, R * 0.34, R * 0.20, robe, np.arctan2(uy, ux) + 1.5708)    # 袍
    _disc(img, lead, x, y, cx + ux * R * 0.30, cy + uy * R * 0.30, R * 0.17, 'gold')                                  # 光环
    _disc(img, lead, x, y, cx + ux * R * 0.30, cy + uy * R * 0.30, R * 0.115, 'skin')                                 # 头

def rose_ref(variant='w', N=1024):
    rng = np.random.default_rng({'w': 11, 's': 12, 'n': 13}[variant])
    y, x = np.mgrid[-1:1:N * 1j, -1:1:N * 1j].astype(np.float32)
    r = np.hypot(x, y); th = (np.arctan2(y, x) + 2 * np.pi) % (2 * np.pi)
    spokes = 16 if variant == 'n' else 12
    bgc = ('violet', 'blue') if variant == 'n' else ('blue', 'red')
    img = np.zeros((N, N, 3), np.float32); lead = np.zeros((N, N), bool)
    # 底纹：极坐标菱格，蓝红（北窗紫蓝）相间，格心一颗小色点（绿/金/白）
    nr = 20; na = spokes * 4
    ri = np.floor(r / (1.0 / nr)).astype(int); ai = np.floor(th / (2 * np.pi) * na).astype(int)
    cell = (ri + ai) % 2
    img[:] = np.where(cell[..., None] == 0, C(bgc[0]), C(bgc[1]))
    rc = (ri + 0.5) / nr; ac = (ai + 0.5) / na * 2 * np.pi
    dd = np.hypot(x - rc * np.cos(ac), y - rc * np.sin(ac))
    pick = ((ri * 7 + ai * 3) % 3)
    dot = dd < 0.010
    for k, nm in enumerate(['gold', 'green', 'white']):
        img[dot & (pick == k)] = C(nm)
    img[(r > 0.93)] = C('deep')
    # 石质窗棂（放射条 + 同心环）
    sector = (th / (2 * np.pi) * spokes) % 1.0
    dsp = np.minimum(sector, 1 - sector) * (2 * np.pi / spokes) * r
    lead[(dsp < 0.013) & (r > 0.14)] = True
    for rr in (0.15, 0.44, 0.70, 0.93):
        lead[np.abs(r - rr) < 0.010] = True
    lead[r >= 0.99] = True
    # 三环圆章，朝向圆心外侧
    rings = [(0.29, spokes, 0.085), (0.565, spokes * 2, 0.062), (0.815, spokes * 2, 0.05)] if variant != 'n' else [(0.29, spokes, 0.08), (0.565, spokes * 2, 0.06), (0.815, spokes * 2, 0.05)]
    for (rr, n, R) in rings:
        for i in range(n):
            a = (i + 0.5) / n * 2 * np.pi
            field = ['blue', 'deep', 'violet' if variant == 'n' else 'blue'][i % 3]
            _angel(img, lead, x, y, rr * np.cos(a), rr * np.sin(a), R, a, rng, field)
    # 中心：八瓣花形圆章（童贞与圣子，用大色块近似）
    for k in range(8):
        a = k / 8 * 2 * np.pi
        _disc(img, lead, x, y, 0.115 * np.cos(a), 0.115 * np.sin(a), 0.032, ['red', 'blue', 'white', 'gold'][k % 4], 0.006)
    _disc(img, lead, x, y, 0, 0, 0.10, 'lead'); _disc(img, lead, x, y, 0, 0, 0.092, 'red'); _disc(img, lead, x, y, 0, 0, 0.075, 'blue', 0.006)
    _ellipse(img, x, y, 0, -0.012, 0.048, 0.062, 'red'); _disc(img, lead, x, y, 0, 0.04, 0.026, 'gold'); _disc(img, lead, x, y, 0, 0.04, 0.017, 'skin')
    img[lead] = C('stone')
    return _finish(img, lead, rng, 0.10)

ALL['rose'] = lambda: rose_ref('w')
ALL['rose_s'] = lambda: rose_ref('s')
ALL['rose_n'] = lambda: rose_ref('n')
