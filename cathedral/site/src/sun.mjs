// 太阳位置：巴黎，夏至（6 月 21 日）。公式取 NOAA 常用的 Spencer 近似（赤纬、时差），精度约 0.1° / 1 分钟。
// 同一套公式在 blender/sun.py 里有 Python 版，tools/test-sun.mjs 会核对两者一致。
//
// 坐标约定（与 blender/dims.py 一致）：模型 x 向南（北为负）、y 向东（西立面 y=0，向东为正）、z 向上。
// 罗盘方位角 A：从正北顺时针，北 0°、东 90°、南 180°、西 270°。
//   指向太阳的单位向量：x = −cosA·cosE（北分量 cosA·cosE 取负），y = sinA·cosE（东分量），z = sinE。
// 教堂真实轴线相对正东西有偏角：官方资料写“正立面朝西北偏西、后殿朝东南偏东”，没有度数。
// 度数取自开放地图（OpenStreetMap，way 201611261）上的建筑平面轮廓，2026-11-15 实测：
//   面积主轴 120.4°、最小外接矩形 116.6°、两端（立面端→后殿端）连线 117.6°，采用 117.5°，不确定度约 ±3°。
// AXIS_AZ = 模型 +y 轴（立面→后殿，向东为正）的罗盘方位；西立面法线（朝 −y）因此指向罗盘 297.5°（西北偏西）。

export const LAT = 48.8530;          // 巴黎圣母院，北纬（度）
export const LON = 2.3499;           // 东经（度）
export const TZ = 2;                 // 夏令时 UTC+2（小时）
export const DAY_OF_YEAR = 172;      // 6 月 21 日（非闰年）
export const AXIS_AZ = 117.5;        // 模型 +y 轴的罗盘方位（度）；正东西 = 90

const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;

/** hours：巴黎当地时钟时间（小时，可带小数，如 16.5 = 16:30）。返回 { elevation, azimuth }（度）。 */
export function sunAngles(hours, n = DAY_OF_YEAR) {
  const g = 2 * Math.PI / 365 * (n - 1 + (hours - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));                    // 分钟
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);                      // 弧度
  const tst = hours * 60 + eqtime + 4 * LON - 60 * TZ;                             // 真太阳时（分钟）
  const H = rad(tst / 4 - 180);                                                    // 时角：正午 0，午后为正
  const lat = rad(LAT);
  const sinE = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const E = Math.asin(Math.max(-1, Math.min(1, sinE)));
  const A = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  return { elevation: deg(E), azimuth: (deg(A) + 360) % 360 };
}

/** 指向太阳的单位向量（模型坐标，已按 AXIS_AZ 旋转）。axisAz=90 时模型就是正东西。 */
export function sunDir(hours, axisAz = AXIS_AZ) {
  const { elevation, azimuth } = sunAngles(hours);
  const E = rad(elevation), A = rad(azimuth - (axisAz - 90));
  return [-Math.cos(A) * Math.cos(E), Math.sin(A) * Math.cos(E), Math.sin(E)];
}

/** 日出日落（太阳上缘与地平线相切，含大气折射，高度 −0.833°），单位小时；用二分法求。 */
export function sunriseSunset() {
  const f = (h) => sunAngles(h).elevation + 0.833;
  const solve = (a, b) => { for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if ((f(a) < 0) === (f(m) < 0)) a = m; else b = m; } return (a + b) / 2; };
  return { sunrise: solve(0, 13.8), sunset: solve(13.8, 24) };
}
