# 广场铺石细节贴图（可无缝平铺）。网页里按世界坐标每 6 m 重复一次，与地面的光照贴图相乘。
# 在 Blender 中 exec（需要 bake.py 里的 save_webp，先 exec bake.py）。输出 site/assets/tex_paving.webp。
# 平均亮度约 0.5：网页里乘 2 后平均为 1，不改变光照贴图的整体亮度。
import numpy as np

def paving(N=512, tile_m=6.0, slab_w=1.2, slab_h=0.6, joint_m=0.025, seed=11):
    rng = np.random.default_rng(seed)
    cols, rows = int(round(tile_m / slab_w)), int(round(tile_m / slab_h))       # 5 × 10，错缝砌法，整数个所以能无缝平铺
    y, x = np.mgrid[0:N, 0:N].astype(np.float32) / N * tile_m
    row = np.floor(y / slab_h).astype(int)
    xs = x + (row % 2) * slab_w / 2                                         # 奇数行错开半块
    col = np.floor(xs / slab_w).astype(int) % cols
    tone = (0.5 + (rng.random((rows, cols)) - 0.5) * 0.22)[row % rows, col]   # 每块石板的明暗差（大块，不是碎屑）
    fx = (xs / slab_w) % 1.0; fy = (y / slab_h) % 1.0
    # 石板内的缓变（用低频噪声）
    g = rng.random((9, 9)).astype(np.float32)
    ii = (np.arange(N) / N * 8)
    i0 = ii.astype(int); f = (ii - i0)
    def samp(py, px):
        a = g[py][:, px]; return a
    low = (g[i0][:, i0] * (1 - f)[:, None] * (1 - f)[None, :] + g[i0 + 1][:, i0] * f[:, None] * (1 - f)[None, :]
           + g[i0][:, i0 + 1] * (1 - f)[:, None] * f[None, :] + g[i0 + 1][:, i0 + 1] * f[:, None] * f[None, :])
    tone = tone * (0.94 + 0.12 * low)
    # 缝：到石板边缘的距离（米）
    dx = np.minimum(fx, 1 - fx) * slab_w; dy = np.minimum(fy, 1 - fy) * slab_h
    joint = np.minimum(dx, dy) < joint_m / 2
    img = np.where(joint, 0.5 * 0.45, tone)
    # 缝边略微压暗，模拟磨损圆角
    edge = np.clip(np.minimum(dx, dy) / 0.04, 0, 1)
    img = np.where(joint, img, tone * (0.88 + 0.12 * edge))
    out = np.stack([img * 1.04, img, img * 0.94], axis=2).astype(np.float32)        # 略偏暖
    return np.clip(out, 0, 1)

arr = paving()
save_webp(arr, arr.shape[1], arr.shape[0], r"G:/selftool/Cathedral/site/assets/tex_paving.webp", 88)
print('paving mean', float(arr.mean()))
