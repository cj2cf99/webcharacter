// 太阳位置测试：node tools/test-sun.mjs
// 1) 天文核对（巴黎夏至的公开已知量）；2) 模型坐标约定；3) 与 blender/sun.py 的结果一致。
import { execFileSync } from 'node:child_process';
import { sunAngles, sunDir, sunriseSunset, AXIS_AZ } from '../site/src/sun.mjs';

let fails = 0;
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!ok) fails++; };
const hhmm = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

// 1. 天文：正午高度 = 90 − 纬度 + 赤纬 ≈ 90 − 48.853 + 23.44 = 64.59°；太阳正午在 13:52 前后（夏令时、经度 2.35°E、时差 −1.8 分）
let best = { h: 0, e: -90 };
for (let h = 12; h <= 16; h += 1 / 120) { const e = sunAngles(h).elevation; if (e > best.e) best = { h, e }; }
check('正午高度约 64.6°', Math.abs(best.e - 64.6) < 0.3, `实际 ${best.e.toFixed(2)}° 于 ${hhmm(best.h)}`);
check('太阳正午在 13:45–13:58', best.h > 13.75 && best.h < 13.97, hhmm(best.h));
check('正午方位朝正南', Math.abs(sunAngles(best.h).azimuth - 180) < 1, `${sunAngles(best.h).azimuth.toFixed(2)}°`);

// 日出日落：巴黎 6 月 21 日约 5:47 / 21:58（夏令时）
const { sunrise, sunset } = sunriseSunset();
check('日出约 5:47（±3 分）', Math.abs(sunrise - (5 + 47 / 60)) < 3 / 60, hhmm(sunrise));
check('日落约 21:58（±3 分）', Math.abs(sunset - (21 + 58 / 60)) < 3 / 60, hhmm(sunset));
const sr = sunAngles(sunrise).azimuth, ss = sunAngles(sunset).azimuth;
check('日出方位在东北（45°–60°）', sr > 45 && sr < 60, `${sr.toFixed(1)}°`);
check('日落方位在西北（300°–315°）', ss > 300 && ss < 315, `${ss.toFixed(1)}°`);
check('午后太阳向西移动（方位角随时间增大）', sunAngles(15).azimuth > sunAngles(13).azimuth);

// 2. 模型坐标：x 向南、y 向东、z 向上。先用 axisAz=90（模型 = 正东西）核对基本约定，再核对真实偏角
const noon = sunDir(best.h, 90), rise = sunDir(sunrise + 0.05, 90), set = sunDir(sunset - 0.05, 90), aft = sunDir(16, 90);
check('[正东西] 正午太阳在南侧（x > 0）、y≈0', noon[0] > 0.4 && Math.abs(noon[1]) < 0.03, noon.map((v) => v.toFixed(3)).join(','));
check('[正东西] 日出在东北（x < 0 北、y > 0 东）', rise[0] < 0 && rise[1] > 0);
check('[正东西] 日落在西北（x < 0 北、y < 0 西）', set[0] < 0 && set[1] < 0);
check('[正东西] 下午 16:00 太阳在西南（x > 0 南、y < 0 西）', aft[0] > 0 && aft[1] < 0, aft.map((v) => v.toFixed(3)).join(','));
for (const h of [6, 10, 14, 18, 21]) check(`单位向量 ${h}:00`, Math.abs(Math.hypot(...sunDir(h)) - 1) < 1e-9);
check('日出后 20 分钟太阳中心高度为正；日落前 20 分钟也为正', sunAngles(sunrise + 1 / 3).elevation > 0 && sunAngles(sunset - 1 / 3).elevation > 0);   // 日出按上缘 −0.833° 算，中心要再等几分钟才过 0°

// 真实偏角：模型向量换回罗盘方位，必须与 sunAngles 一致（任意 AXIS_AZ 都应成立）
const toCompass = (v) => (Math.atan2(v[1], -v[0]) * 180 / Math.PI + (AXIS_AZ - 90) + 720) % 360;
let rt = 0; for (const h of [6, 9, 12, 15, 18, 21]) rt = Math.max(rt, Math.abs(((toCompass(sunDir(h)) - sunAngles(h).azimuth + 540) % 360) - 180));
check(`AXIS_AZ=${AXIS_AZ}：模型向量换回罗盘方位与原值一致（最大差 ${rt.toExponential(1)}°）`, rt < 1e-6);
check('AXIS_AZ 在实测范围 116.6–120.4° 内', AXIS_AZ >= 116.6 && AXIS_AZ <= 120.4);
// 西立面朝 −y（罗盘 AXIS_AZ+180 = 297.5°，西北偏西）：上午背光、傍晚受光
check('西立面（法线 −y）10:00 背光、17:00 受光', sunDir(10)[1] > 0 && sunDir(17)[1] < 0, `y(10:00)=${sunDir(10)[1].toFixed(2)} y(17:00)=${sunDir(17)[1].toFixed(2)}`);
const fl = (() => { let a = null, b = null; for (let h = 5; h <= 22; h += 1 / 60) { const lit = sunDir(h)[1] < 0 && sunAngles(h).elevation > 0; if (lit && a === null) a = h; if (lit) b = h; } return a; })();
check('西立面从约 14:00–15:30 起受直射（太阳方位越过 207.5°）', fl > 14 && fl < 15.6, hhmm(fl));
// 南北侧：夏至正午太阳在南，南侧（法线 +x）受光、北侧不受光
check('夏至正午南侧墙（法线 +x）受光、北侧不受光', sunDir(best.h)[0] > 0);

// 3. 与 Python 版一致（同一时刻的向量，容差 1e-4）
let py = '';
try { py = execFileSync('python', ['-I', new URL('../blender/sun.py', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--table'], { encoding: 'utf8' }); }
catch (e) { check('Python 可运行 blender/sun.py', false, String(e.message).slice(0, 80)); }
if (py) {
  let worst = 0, rows = 0;
  for (const line of py.trim().split('\n')) {
    const [h, x, y, z] = line.split(' ').map(Number); const d = sunDir(h); rows++;
    worst = Math.max(worst, Math.abs(d[0] - x), Math.abs(d[1] - y), Math.abs(d[2] - z));
  }
  check(`JS 与 Python 一致（${rows} 个时刻，最大差 ${worst.toExponential(1)}）`, rows >= 10 && worst < 1e-4);
}
process.exit(fails ? 1 : 0);
