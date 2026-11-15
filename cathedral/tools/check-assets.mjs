// 资源检查：文件齐全、体积预算（设计文档第 7 节）。node tools/check-assets.mjs
import { statSync, existsSync } from 'node:fs';
const A = new URL('../site/assets/', import.meta.url);
const size = (f) => statSync(new URL(f, A)).size;
// 外部（颜色+遮蔽，实时光照）在 assets_next；室内（旧烘焙光照，W6 改关键帧）和碰撞、编码参数在 assets。
const EXT = ['assets_next/exterior.glb', 'assets_next/door.glb', ...['ext_a', 'ext_b', 'ground', 'door_l', 'door_r'].map((n) => `assets_next/tex_${n}_ao.webp`)];
const need = [...EXT, 'interior.glb', 'collision.json', 'collision.bin', 'encoding.json', 'tex_paving.webp'];
let fails = 0;
for (const f of need) { const ok = existsSync(new URL(f.replace(/^assets_next\//, '../assets_next/'), A)); console.log((ok ? 'PASS ' : 'FAIL ') + '存在 ' + f); if (!ok) fails++; }
const VENDOR = ['three.module.min.js', 'GLTFLoader.js', 'BufferGeometryUtils.js'].map((n) => `../../vendor/three/${n}`);
for (const f of VENDOR) { const ok = existsSync(new URL(f, A)); console.log((ok ? 'PASS ' : 'FAIL ') + '存在 ' + f.slice(6)); if (!ok) fails++; }
const sz = (f) => statSync(new URL(f.replace(/^assets_next\//, '../assets_next/'), A)).size;
const MB = (b) => (b / 1048576).toFixed(2) + ' MB';
const first = [...EXT, 'collision.bin', 'collision.json', 'encoding.json', 'tex_paving.webp', ...VENDOR].reduce((a, f) => a + sz(f), 0);
const all = first + sz('interior.glb');
console.log((first <= 40 * 1048576 ? 'PASS ' : 'FAIL ') + '首屏下载 ' + MB(first) + '（预算 40 MB）');
console.log((all <= 90 * 1048576 ? 'PASS ' : 'FAIL ') + '全部下载 ' + MB(all) + '（预算 90 MB）');
if (first > 40 * 1048576 || all > 90 * 1048576) fails++;
process.exit(fails ? 1 : 0);
