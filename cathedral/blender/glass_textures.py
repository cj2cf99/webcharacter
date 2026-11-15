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
