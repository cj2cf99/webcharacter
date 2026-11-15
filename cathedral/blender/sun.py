# 太阳位置：巴黎，夏至。与 site/src/sun.mjs 同一套公式（tools/test-sun.mjs 会核对两者一致）。
# 纯 Python，不依赖 bpy，所以既能在 Blender 里 exec，也能在命令行跑：python blender/sun.py --table
#
# 坐标约定（与 dims.py 一致）：模型 x 向南（北为负）、y 向东、z 向上。
# 罗盘方位角 A：从正北顺时针。指向太阳的单位向量 = (−cosA·cosE, sinA·cosE, sinE)。
# Blender 的 Nishita 天空：sun_rotation = atan2(x, y)（2026-11-15 实测，相机朝太阳灯方向拍天空，光晕居中），sun_elevation = E。
import math, sys

LAT, LON, TZ, DAY_OF_YEAR = 48.8530, 2.3499, 2, 172
AXIS_AZ = 117.5         # 模型 +y 轴（立面→后殿）的罗盘方位；2026-11-15 由开放地图建筑轮廓实测 116.6–120.4°，采用 117.5°（±3°），见 sun.mjs 头部

def sun_angles(hours, n=DAY_OF_YEAR):
    g = 2 * math.pi / 365 * (n - 1 + (hours - 12) / 24)
    eqtime = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                       - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g)
            - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g)
            - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    tst = hours * 60 + eqtime + 4 * LON - 60 * TZ
    H = math.radians(tst / 4 - 180)
    lat = math.radians(LAT)
    sinE = math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(H)
    E = math.asin(max(-1.0, min(1.0, sinE)))
    A = math.atan2(math.sin(H), math.cos(H) * math.sin(lat) - math.tan(decl) * math.cos(lat)) + math.pi
    return math.degrees(E), (math.degrees(A) + 360) % 360

def sun_dir(hours, axis_az=None):
    e, a = sun_angles(hours)
    axis_az = AXIS_AZ if axis_az is None else axis_az
    E, A = math.radians(e), math.radians(a - (axis_az - 90))
    return (-math.cos(A) * math.cos(E), math.sin(A) * math.cos(E), math.sin(E))

def sky_params(hours):
    """Blender Nishita 天空参数（弧度）：(sun_elevation, sun_rotation)。"""
    x, y, z = sun_dir(hours)
    return math.asin(z), math.atan2(x, y)

if __name__ == '__main__':
    if '--table' in sys.argv:
        for h in (5.0, 6.0, 8.0, 10.0, 12.0, 13.8667, 16.0, 18.0, 20.0, 21.5):
            x, y, z = sun_dir(h)
            print(f"{h:.4f} {x:.5f} {y:.5f} {z:.5f}")
