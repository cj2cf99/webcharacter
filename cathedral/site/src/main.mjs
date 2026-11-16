// 场景装配、加载、外部实时光照（天候）、室内烘焙着色、第一人称行走、开门、曝光适应。
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/three/meshopt_decoder.module.js';
import { createWorld, createDoor, stepDoor, doorAngleRad, move, nearDoor, isInside } from './collide.mjs';
import { createSkyAndLights } from './sky.mjs';
import { stoneMaterial, GLSL_FUNCS } from './stone.mjs';
import { createMarbleMirror } from './marble.mjs';

const $ = (id) => document.getElementById(id);
const EYE = 1.65, WALK = 6.4, RUN = 16.0;      // 米/秒；2026-11-15 用户要求行进速度提高 4 倍（原 1.6 / 4.0）
const EXPOSURE_OUT = 0.7, EXPOSURE_IN = 26.0, ADAPT = 1.2;    // 室内曝光、适应时间常数（秒）；室外曝光随时间，见 sky.mjs 的 exposureOut
const EXT_DIR = 'assets_next';                                 // 外部资源（颜色+遮蔽+实时光照）；室内仍用 assets（旧烘焙光照，W6 改关键帧）
let hours = parseFloat(new URLSearchParams(location.search).get('t') || '16');   // 巴黎当地时钟时间
let autoTime = new URLSearchParams(location.search).has('cycle');                   // ?cycle：一打开就自动走；也可按 P
const DAY_SPEED = 1 / 60;                                                              // 小时/秒：1 分钟 = 1 小时，18 分钟走完 5:00–23:00

const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.25, 600)      // 远裁剪 600 m：超出就不画（教堂全长约 130 m，最远观景点也在范围内），省显存与填充;
camera.rotation.order = 'YXZ';
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- 贴图解码（与 blender/bake.py 的编码一致）
let ENC;
// 曝光自己乘（uExp），再做“保持色相”的高光软压缩，最后交给 ACES。
// 直射阳光斑比环境光亮约 100 倍；直接 ACES 会把它们不分颜色地压成白色，彩窗光斑就看不出色了。
const uExp = { value: EXPOSURE_OUT };
let paveTex = null;       // 铺石细节贴图（boot 里加载）
function logMaterial(map, extra = {}, pave = false) {
  map.colorSpace = THREE.NoColorSpace; map.anisotropy = 8; map.needsUpdate = true;
  const m = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, ...extra });     // 双面：镜像墙段的玻璃等面朝向可能反
  m.customProgramCacheKey = () => (pave ? 'log-pave' : 'log');      // 否则两种材质共用同一份程序（缓存键默认是函数源码）
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uExp = uExp;
    const NL = String.fromCharCode(10);
    if (pave) sh.uniforms.tPave = { value: paveTex };
    // 地面：用世界坐标做铺石细节（每 6 m 重复一次），远处渐隐，避免远景闪烁
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec3 vWPos;' + NL + 'void main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + NL + 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform float uExp;' + NL + 'varying vec3 vWPos;' + NL + (pave ? 'uniform sampler2D tPave;' + NL : '') + GLSL_FUNCS + NL + 'void main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb = (exp(diffuseColor.rgb * ${Math.log1p(ENC.A * ENC.XMAX).toFixed(6)}) - 1.0) / ${ENC.A.toFixed(1)};
      diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.0065, 0.0062, 0.0056));      // 暗部底值（在叠加石块纹理之前），烘焙接缝/遮蔽泄漏处不再死黑，暗部仍保留砌缝
      ${pave ? `{ vec3 pv = texture2D(tPave, vWPos.xz / 6.0).rgb * 2.15;
        diffuseColor.rgb *= mix(vec3(1.0), pv, 1.0 - smoothstep(25.0, 90.0, distance(vWPos, cameraPosition))); }` : ''}
      float dkv = 1.0;
      {   // 室内石面细节（烘焙贴图只有约 9.6 cm/像素，看起来糊）：按世界坐标叠加石块砌缝、颗粒，地面叠加大块石板，并把偏青灰的烘焙色调向暖石色拉回
        vec3 gp = vWPos, gdx = dFdx(gp), gdy = dFdy(gp);
        vec3 gn = normalize(cross(gdx, gdy)), an = abs(gn);
        bool floorF = an.y > 0.85 && gp.y < 0.3;
        bool wallX = an.x >= an.z && an.x > an.y, wallZ = an.z > an.x && an.z > an.y;
        vec2 uv = wallX ? gp.zy : (wallZ ? gp.xy : gp.xz);
        float fw = length(fwidth(uv));
        float fadeD = 1.0 - smoothstep(0.03, 0.12, fw);
        vec3 b = floorF ? ashlarP(uv, fw, 0.9, 1.1, 1.1) : ashlarP(uv, fw, 0.40, 0.55, 0.75);
        float dk = 1.0 - 0.5 * b.z + (b.y - 0.5) * (floorF ? 0.35 : 0.22) + (fbm(uv * (floorF ? 4.0 : 9.0)) - 0.5) * 0.28 * fadeD;
        if (floorF) {   // 室内地板：大理石（云纹 + 缝 + 中轴磨损带），并整体提亮（原烘焙地面太暗）；镜面反射由 marble.mjs 的反射层叠加
          vec2 wv = uv * 0.22 + vec2(fbm(uv * 0.35) * 2.2, fbm(uv * 0.31 + 7.0) * 2.2) + b.y * 9.0;
          float vein = pow(1.0 - abs(sin(wv.x * 3.0 + wv.y * 1.7 + fbm(wv * 2.0) * 3.0)), 14.0);
          float path = exp(-pow(abs(gp.x) / 7.0, 2.0));
          dk = (0.95 + (fbm(uv * 0.5 + b.y * 5.0) - 0.5) * 0.3) * (1.0 - 0.45 * vein * fadeD) * (1.0 - 0.35 * b.z) * (1.0 - 0.10 * path) * 2.2;
        }
        diffuseColor.rgb *= dk; dkv = dk;
        float lm = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(vec3(lm), diffuseColor.rgb, 0.60) * vec3(1.13, 0.99, 0.86);
      }
      diffuseColor.rgb *= uExp;
      float pk = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
      { float lq = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lq), 0.6 * smoothstep(0.7, 3.5, pk)); }      // 很亮的彩色光斑（透过彩窗的日光）降低饱和，避免地面一片荧光蓝
      pk = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
      float sp = pk < 0.5 ? pk : 0.5 + (1.0 - exp(-(pk - 0.5) * 0.28)) * 0.40;     // 0.5 以下不变；以上渐近到约 0.92（原 1.5，亮斑被压成白色）
      diffuseColor.rgb *= sp / max(pk, 1e-5);
      diffuseColor.rgb *= mix(1.0, clamp(dkv, 0.45, 1.25), smoothstep(0.5, 1.6, pk) * 0.85);      // 亮斑里把石块纹理再叠回来（先压缩后叠加），避免一片白`);
  };
  return m;
}
// 外部材质：颜色贴图 × （太阳直射 × 阴影 + 天光 × 遮蔽）。Lambert 自带灯光与阴影；aoMap 只影响天光（indirect），不影响阳光，正是想要的。
const AO_KEY = { B_ext_a: 'ext_a', B_ext_b: 'ext_b', B_ground: 'ground', B_door_l: 'door_l', B_door_r: 'door_r' };
function exteriorMaterial(map, ao, pave) {
  const m = new THREE.MeshLambertMaterial({ map, aoMap: ao || null, aoMapIntensity: 1.0, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => (pave ? 'ext-pave' : 'ext');
  if (pave) m.onBeforeCompile = (sh) => {
    const NL = String.fromCharCode(10);
    sh.uniforms.tPave = { value: paveTex };
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vWPos;' + NL + 'void main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + NL + 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D tPave;' + NL + 'varying vec3 vWPos;' + NL + 'void main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 pv = texture2D(tPave, vWPos.xz / 6.0).rgb * 2.15;
        diffuseColor.rgb *= mix(vec3(1.0), pv, 1.0 - smoothstep(25.0, 90.0, distance(vWPos, cameraPosition))); }`);
  };
  return m;
}
const glassMats = [];     // 玻璃材质：室内看时改为“自发光彩色”（见 frame），否则被曝光 22 的灯光冲成白色
async function prepareExterior(root) {
  const jobs = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const map = o.material.map;
    if (/glass/i.test(o.name) || /glass/i.test(o.material.name)) {
      map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.needsUpdate = true;
      // 外部看玻璃：深色、带天空反射；透出一点内部彩光（自发光取贴图的 18%）
      const gm = new THREE.MeshStandardMaterial({ map, color: 0x8a9098, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.04, metalness: 0.0, side: THREE.DoubleSide });
      gm.userData.envK = 3.2; lights.useEnv(gm); o.material = gm; glassMats.push(gm);
      return;
    }
    const key = AO_KEY[o.name];
    jobs.push(tex(`${EXT_DIR}/tex_${key}_ao.webp`).then((ao) => {
      ao.flipY = false; ao.colorSpace = THREE.NoColorSpace; ao.anisotropy = 4;      // glTF 的 UV 不翻转
      o.material = (o.name === 'B_ext_a' || o.name === 'B_ext_b' || o.name === 'B_ground') && !location.search.includes('flat') ? (() => { const sm = stoneMaterial(map, ao, o.name === 'B_ground'); sm.userData.envK = 0.7; lights.useEnv(sm); return sm; })() : exteriorMaterial(map, ao, o.name === 'B_ground');
      o.castShadow = o.name !== 'B_ground'; o.receiveShadow = true;
    }));
  });
  await Promise.all(jobs);
  return root;
}
// 室内：旧的烘焙光照（对数编码），W6 之前保持不变
function prepare(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const map = o.material.map;
    if (/glass/i.test(o.material.name)) {
      map.colorSpace = THREE.SRGBColorSpace;
      o.material = new THREE.MeshBasicMaterial({ map, toneMapped: false, side: THREE.DoubleSide });
    } else {
      o.material = logMaterial(map, {}, false);
    }
  });
  return root;
}

// ---------------------------------------------------------------- 加载
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const progress = {};
function showProgress() {
  const v = Object.values(progress), done = v.reduce((a, p) => a + p[0], 0), all = v.reduce((a, p) => a + p[1], 0);
  $('bar').style.width = (all ? 100 * done / all : 0).toFixed(1) + '%';
}
function loadGlb(name, dir = 'assets') {
  return new Promise((ok, fail) => loader.load(`${dir}/${name}.glb`, (g) => ok(g.scene), (e) => {
    progress[name] = [e.loaded, e.total || e.loaded]; showProgress();
  }, fail));
}
const tex = (url) => new Promise((ok, fail) => new THREE.TextureLoader().load(url, ok, undefined, fail));
let L = null, lights = null, mirror = null;        // L：当前时刻的光照参数

let spawnPos = [0, -60];
let world, door, doorL, doorR, interiorReady = false, interiorLoading = false;
async function boot() {
  ENC = await (await fetch('assets/encoding.json')).json();
  const [meta, bin] = await Promise.all([
    fetch('assets/collision.json').then((r) => r.json()),
    fetch('assets/collision.bin').then((r) => r.arrayBuffer()),
  ]);
  world = createWorld(new Uint8Array(bin), meta);
  door = createDoor(meta);
  pos = [...meta.spawn]; spawnPos = [...meta.spawn];

  paveTex = await tex('assets/tex_paving.webp');
  paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping; paveTex.colorSpace = THREE.NoColorSpace; paveTex.anisotropy = 8;
  lights = createSkyAndLights(scene, renderer);
  mirror = createMarbleMirror(scene);
  const [ext, doors] = await Promise.all([loadGlb('exterior', EXT_DIR), loadGlb('door', EXT_DIR)]);
  await Promise.all([prepareExterior(ext), prepareExterior(doors)]);
  scene.add(ext, doors);
  // 远处地面：把广场铺石一直延伸到地平线（只为避免“悬空的方块”），远处铺石细节会按像素大小自动淡出
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), stoneMaterial(null, null, true, 0xffffff));
  far.position.set(0, -0.07, -40); far.material.userData.envK = 0.2; lights.useEnv(far.material); far.receiveShadow = true;
  scene.add(far);
  // 室外地面（顶面 y=0）与室内地板（y=0.004）几乎共面，深度精度不够时两层逐像素争抢（z-fighting），表现为地面颜色/条纹随视角乱闪：把室外地面整体下沉 3 cm
  const gnd = ext.getObjectByName('B_ground'); if (gnd) gnd.position.y = -0.03;
  doorL = doors.getObjectByName('B_door_l'); doorR = doors.getObjectByName('B_door_r');
  $('loading').classList.add('done');
  $('start').classList.add('show');
}

async function loadInterior() {
  if (interiorLoading) return;
  interiorLoading = true;
  const int = await loadGlb('interior');
  scene.add(prepare(int));
  interiorReady = true;
}

// ---------------------------------------------------------------- 输入
let pos = [0, -60], yaw = 0, pitch = 0.12;       // yaw=0 面向东（教堂内部方向）
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyE' && locked()) { if (ride) return; if (nearDoor(pos, forward())) toggleDoor(); else stairAction(); }
  if (e.code === 'KeyH') $('help').classList.toggle('hide');
  // 临时时间控制（W8 的面板做好前）：P 自动走完一天，, 和 . 手动拨 ±0.5 小时
  if (e.code === 'KeyP') autoTime = !autoTime;
  if (e.code === 'Comma') hours = ((hours - 0.5 - 5 + 18) % 18) + 5;
  if (e.code === 'Period') hours = ((hours + 0.5 - 5) % 18) + 5;
});
addEventListener('keyup', (e) => keys.delete(e.code));
const locked = () => document.pointerLockElement === renderer.domElement;
$('start').addEventListener('click', () => renderer.domElement.requestPointerLock());
renderer.domElement.addEventListener('click', () => { if (!locked() && world) renderer.domElement.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => {
  $('start').classList.toggle('show', !locked());
  if (locked()) {
    loadInterior();
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => $('help').classList.add('hide'), 10000);
  }
});
let helpTimer;
// 望远镜：右键开关，滚轮（中键轴）调倍率 1.5–24×；放大时视角灵敏度同比降低，便于精细对准
let zoomOn = false, zoomT = 5, zoomCur = 1;
addEventListener('mousemove', (e) => {
  if (!locked()) return;
  const k = 0.0022 / zoomCur;
  yaw -= e.movementX * k;
  pitch = Math.max(-1.3, Math.min(1.3, pitch - e.movementY * k));
});
addEventListener('mousedown', (e) => { if (e.button === 2 && locked()) { zoomOn = !zoomOn; e.preventDefault(); } });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (!locked()) return;
  e.preventDefault();
  if (!zoomOn) { zoomOn = true; }                                   // 直接滚轮也能进入望远镜
  zoomT = Math.max(1.5, Math.min(24, zoomT * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });

function toggleDoor() {
  if (!nearDoor(pos, forward())) return;
  if (!interiorReady) return;
  door.target = door.target ? 0 : 1;
}
const forward = () => [-Math.sin(yaw), Math.cos(yaw)];



// ---------------------------------------------------------------- 楼梯（用户 2026-11-16）：塔内螺旋楼梯（到钟楼）、内侧廊直跑楼梯（到二楼楼廊）
// 与 blender/stairs.py、facade.py 的 STAIR_X / STAIR_Y 一致：井中心 |x| = 9.9、y = 12.8；每圈 22 级、级高 0.18；直跑楼梯 x = ±9.9、y 17→34.6、63 级。
// 走近楼梯底部按 E：镜头沿楼梯平滑上行（不做自由攀爬/碰撞）；到顶后进入“观景点”范围，可小范围走动；在楼梯顶部附近再按 E 下楼。
const SP = { x: 9.9, y: 12.8, r: 1.25, per: 22, rise: 0.18, top: 47.6 };
const TR = { x: 9.9, y0: 17.0, y1: 34.8, steps: 63, rise: 0.18 };
let ride = null;
const spiralPt = (s, i) => { const a = 2 * Math.PI * i / SP.per * s; return [s * SP.x + SP.r * Math.cos(a), SP.y + SP.r * Math.sin(a), a]; };
const spiralN = Math.ceil(SP.top / SP.rise);
function nearStair() {
  const info = { kind: null };
  if (ride) return info;
  const d2 = (x, y) => Math.hypot(pos[0] - x, pos[1] - y);
  for (const s of [-1, 1]) {
    const [bx, by] = spiralPt(s, 0), [tx, ty] = spiralPt(s, spiralN);
    if (!vp && !spin && level === 0 && eyeY < 5 && d2(bx, by) < 3.2) return { kind: 'up', type: 'spiral', s };
    if (vp && vp.tower === s && eyeY > 40 && d2(tx, ty) < 4.2) return { kind: 'down', type: 'spiral', s };
    if (!vp && !spin && level === 0 && eyeY < 5 && d2(s * TR.x, TR.y0 - 0.8) < 2.6) return { kind: 'up', type: 'tribune', s };
    if ((vp && vp.trib === s || level === 1 && trib === s) && eyeY > 8 && eyeY < 20 && d2(s * TR.x, TR.y1 + 0.8) < 3.2) return { kind: 'down', type: 'tribune', s };
  }
  return info;
}
function stairAction() {
  if (!world) return;
  const n = nearStair();
  if (!n.kind) return;
  const s = n.s;
  if (n.type === 'spiral') {
    ride = { type: 'spiral', s, dir: n.kind === 'up' ? 1 : -1, t: 0, dur: n.kind === 'up' ? 16 : 11, tower: true };
  } else {
    ride = { type: 'tribune', s, dir: n.kind === 'up' ? 1 : -1, t: 0, dur: 7 };
  }
  vp = null;
}

// ---- 直接走上楼梯（用户 2026-11-16：“楼梯没有实体，上不去”）：楼梯区域内眼高随位置抬升；二楼楼廊上限制在楼廊范围内；螺旋梯按累计转角抬升
let level = 0, trib = 0, spin = null;
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const inShaft = () => !!(spin || (ride && ride.tower));                 // 在螺旋梯井里（井内壁和踏步用室内烘焙光照）
const towerOutdoor = () => !!((vp && vp.tower) || (inShaft() && eyeY >= 47));       // 钟楼室内（通百叶）按室外光照
function walkStairs() {
  if (ride || vp) return;
  const x = pos[0], y = pos[1];
  // 螺旋楼梯
  const mid = [...[-1, 1]].find((s) => Math.hypot(x - s * SP.x, y - SP.y) < 2.2);
  if (!spin && level === 0 && mid) {
    const [bx, by] = spiralPt(mid, 0);
    if (Math.hypot(x - bx, y - by) < 0.8 && eyeY < 3) spin = { s: mid, u: 0, a: Math.atan2(y - SP.y, x - mid * SP.x) };
  }
  if (spin) {
    const cx = spin.s * SP.x, cy = SP.y, dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy) || 1e-6, a = Math.atan2(dy, dx);
    let da = a - spin.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    spin.a = a; spin.u = clampN(spin.u + da * spin.s * SP.per / (2 * Math.PI), 0, spiralN);
    if (spin.u < 0.4 && r > 1.95) { spin = null; eyeT = EYE; return; }                    // 在底部走出螺旋梯
    const rr = clampN(r, 0.55, 1.85); pos = [cx + dx / r * rr, cy + dy / r * rr];
    eyeY = eyeT = (spin.u + 1) * SP.rise + EYE;
    if (spin.u >= spiralN - 0.4) { vp = { cx: spin.s * 13.7, cy: 8.8, r: 6.5, tower: spin.s }; eyeT = SP.top + EYE; spin = null; }
    return;
  }
  // 直跑楼梯 + 二楼楼廊
  for (const s of [-1, 1]) {
    const xr = s * TR.x, inRect = Math.abs(x - xr) <= 1.0 && y >= TR.y0 - 0.3 && y <= TR.y1 + 0.4;
    const zOf = (yy) => clampN((yy - TR.y0) / 0.28, 0, TR.steps) * TR.rise;
    if (level === 0 && inRect) {
      pos = [clampN(x, xr - 0.95, xr + 0.95), y];
      eyeY = eyeT = EYE + zOf(y);
      if (y > TR.y1 && zOf(y) >= TR.steps * TR.rise - 0.05) { level = 1; trib = s; }
      return;
    }
    if (level === 1 && trib === s) {
      if (inRect && y <= TR.y1 + 0.05) {
        pos = [clampN(x, xr - 0.95, xr + 0.95), y];
        eyeY = eyeT = EYE + zOf(y);
        if (y < TR.y0) level = 0;
        return;
      }
      const ax = clampN(Math.abs(x), 7.6, 12.0), yy = clampN(y, TR.y1 + 0.1, 56.5);       // 楼廊范围
      pos = [s * ax, yy]; eyeT = 11.34 + EYE; eyeY = eyeT;
      return;
    }
  }
  if (level === 1) level = 0;
}

function stepRide(dt) {
  ride.t += dt / ride.dur;
  const u = Math.min(1, ride.t), k = ride.dir > 0 ? u : 1 - u;     // 0 = 底，1 = 顶
  const e = k * k * (3 - 2 * k) * 0.35 + k * 0.65;                  // 起止略缓
  const s = ride.s;
  if (ride.type === 'spiral') {
    const i = e * spiralN, [x, y, a] = spiralPt(s, i);
    pos = [x, y]; eyeY = eyeT = (i + 1) * SP.rise + EYE;
    const tx = -Math.sin(a) * s * ride.dir, ty = Math.cos(a) * s * ride.dir;
    if (!ride.init) { yaw = Math.atan2(-tx, ty); pitch = 0.0; ride.init = true; }       // 只在起步时转向前进方向，之后可自由环顾
  } else {
    const y = TR.y0 + (TR.y1 - TR.y0) * e, i = e * TR.steps;
    pos = [s * TR.x, y]; eyeY = eyeT = (i + 1) * TR.rise + EYE;
    if (!ride.init) { yaw = ride.dir > 0 ? 0.0 : Math.PI; pitch = 0.05; ride.init = true; }
  }
  if (u >= 1) {
    if (ride.dir > 0) {
      if (ride.type === 'spiral') { vp = { cx: s * 13.7, cy: 8.8, r: 6.5, tower: s }; eyeT = SP.top + EYE; }
      else { level = 1; trib = s; pos = [s * TR.x, TR.y1 + 0.6]; eyeT = 11.34 + EYE; }
    } else { vp = null; level = 0; trib = 0; eyeT = EYE; }
    ride = null;
  }
}

// ---------------------------------------------------------------- 观景点（正常走不到的位置；数字键传送，B 回地面，V 显示列表）
// 坐标：模型 x 南、y 东；眼高 = 站立面 + 1.7。位置按 dims.py 的高度取，视角朝向目视选取（不是测绘点）。
const VIEWPOINTS = [
  { k: 'Digit1', name: '南塔顶平台', x: 13.7, y: 8.8, z: 70.7, yaw: 0.0, pitch: -0.18, r: 4 },
  { k: 'Digit2', name: '北塔顶平台', x: -13.7, y: 8.8, z: 70.7, yaw: 0.0, pitch: -0.18, r: 4 },
  { k: 'Digit3', name: '两塔之间廊台', x: 0, y: 4.0, z: 46.7, yaw: 0.0, pitch: -0.12, r: 5 },
  { k: 'Digit4', name: '国王廊前', x: 0, y: -4.0, z: 25.5, yaw: 0.0, pitch: 0.12, r: 5 },
  { k: 'Digit5', name: '中殿屋脊', x: 0, y: 36, z: 45.0, yaw: 0.0, pitch: -0.1, r: 6 },
  { k: 'Digit6', name: '飞扶壁上方', x: 21.5, y: 34, z: 32.0, yaw: -0.35, pitch: -0.08, r: 4 },
  { k: 'Digit7', name: '尖塔基座旁', x: 4.5, y: 66.65, z: 47.0, yaw: 0.6, pitch: 0.55, r: 3 },
  { k: 'Digit8', name: '后殿上空', x: 0, y: 128, z: 32.0, yaw: Math.PI, pitch: -0.1, r: 6 },
  { k: 'Digit9', name: '二楼楼廊（室内）', x: 10, y: 36, z: 13.0, yaw: 0.0, pitch: 0.05, r: 2, inside: true },
  { k: 'Digit0', name: '广场上空俯瞰', x: 0, y: -90, z: 90, yaw: 0.0, pitch: -0.42, r: 15 },
];
async function gotoViewpoint(v) {
  ride = null;
  if (!world || !locked() && !window.__dbg) return;
  if (v.inside) { await loadInterior(); while (!interiorReady) await new Promise((r) => setTimeout(r, 100)); }
  pos = [v.x, v.y]; yaw = v.yaw; pitch = v.pitch; eyeT = v.z; vp = { cx: v.x, cy: v.y, r: v.r };
  $('vpname').textContent = '📍 ' + v.name; $('vpname').classList.add('show');
  clearTimeout(vpTimer); vpTimer = setTimeout(() => $('vpname').classList.remove('show'), 3500);
}
let vpTimer;
function backToGround() {
  ride = null;
  if (!vp) return;
  vp = null; eyeT = EYE; pos = [...spawnPos]; yaw = 0; pitch = 0.12;
  $('vpname').classList.remove('show');
}
const vpList = VIEWPOINTS.map((v, i) => `<div><kbd>${(i + 1) % 10}</kbd>${v.name}</div>`).join('') + '<div><kbd>B</kbd>回到地面</div>';
$('vplist').innerHTML = vpList;
addEventListener('keydown', (e) => {
  const v = VIEWPOINTS.find((q) => q.k === e.code);
  if (v) gotoViewpoint(v);
  if (e.code === 'KeyB') backToGround();
  if (e.code === 'KeyV') $('vplist').classList.toggle('show');
});
if (typeof window !== 'undefined') window.__vp = (i) => gotoViewpoint(VIEWPOINTS[i]);

// ---------------------------------------------------------------- 循环
let last = performance.now(), exposure = EXPOSURE_OUT;
let eyeY = EYE, eyeT = EYE, vp = null, lightK = 1;      // 眼高（平滑）与目标；vp：观景点 {cx, cy, r}，非空时在观景点范围内自由走动、不做碰撞
function frame(now, manual = false) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (world) {
    if (ride) stepRide(dt);
    if (locked() && !ride) {
      const f = forward(), r = [Math.cos(yaw), Math.sin(yaw)];
      let mx = 0, my = 0;
      if (keys.has('KeyW')) { mx += f[0]; my += f[1]; }
      if (keys.has('KeyS')) { mx -= f[0]; my -= f[1]; }
      if (keys.has('KeyD')) { mx += r[0]; my += r[1]; }
      if (keys.has('KeyA')) { mx -= r[0]; my -= r[1]; }
      const l = Math.hypot(mx, my);
      if (l) {
        const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK) * dt / l;
        if (vp) {
          const nx = pos[0] + mx * sp, ny = pos[1] + my * sp, dx = nx - vp.cx, dy = ny - vp.cy, d = Math.hypot(dx, dy);
          pos = d > vp.r ? [vp.cx + dx / d * vp.r, vp.cy + dy / d * vp.r] : [nx, ny];
        } else pos = move(world, door, pos, mx * sp, my * sp);
      }
    }
    if (!ride) walkStairs();
    stepDoor(door, dt);
    const a = doorAngleRad(door);
    if (doorL) { doorL.rotation.y = a; doorR.rotation.y = -a; }
    {   // 楼梯提示
      const n = nearStair(); const el = $('stairp');
      el.classList.toggle('show', !!n.kind && locked());
      el.textContent = n.kind === 'up' ? (n.type === 'spiral' ? 'E 登上钟楼' : 'E 登上二楼楼廊') : n.kind === 'down' ? 'E 下楼' : '';
    }
    // 门前提示
    const near = nearDoor(pos, forward());
    const badge = $('door');
    badge.classList.toggle('show', near && locked());
    badge.dataset.state = !interiorReady ? 'wait' : door.target ? 'close' : 'open';
    if (autoTime) hours = ((hours + DAY_SPEED * dt - 5) % 18) + 5;
    const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60);
    $('clock').textContent = `🕒 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} 巴黎` + (autoTime ? ' ▶' : '');
    // 灯光与曝光：室外曝光随时间；进入室内后适应到 EXPOSURE_IN（室内烘焙材质用 uExp，外部灯光和天空同样乘它）
    if (lights) {
      const insideNow = isInside(pos) && (eyeY < 22 || inShaft() && eyeY < 47) && !towerOutdoor();
      lightK += ((insideNow ? 0.045 : 1) - lightK) * (1 - Math.exp(-dt / ADAPT));      // 站在室内时，外部材质（窗棂等）按室外亮度受光，不吃室内的高曝光
      L = lights.apply(hours, exposure, lightK);
      const target = window.__expOverride || (isInside(pos) && (eyeY < 22 || inShaft() && eyeY < 47) && !towerOutdoor() ? EXPOSURE_IN : L.exposureOut);      // __expOverride：仅调试
      exposure += (target - exposure) * (1 - Math.exp(-dt / ADAPT));
      uExp.value = exposure;
      lights.sky.position.copy(camera.position);
    }
    // 玻璃：室外是深色带反射；站在室内时不吃灯光（室内曝光很高会冲白），改成按白天亮度发光的宝石色
    {
      const inside = isInside(pos) && (eyeY < 22 || inShaft() && eyeY < 47) && !towerOutdoor();
      const day = L ? Math.min(1, L.skyBright * 1.1) : 1;
      for (const g of glassMats) {
        if (inside) { g.color.setRGB(0.02, 0.02, 0.02); g.emissiveIntensity = 0.35 + 1.0 * day; g.userData.envK = 0; }
        else { g.color.setHex(0x8a9098); g.emissiveIntensity = 0.1; g.userData.envK = 3.2; }
      }
    }
    // 望远镜视角：平滑过渡到目标倍率；基础视角 70°
    zoomCur += ((zoomOn ? zoomT : 1) - zoomCur) * (1 - Math.exp(-dt * 10));
    const fov = 2 * Math.atan(Math.tan(35 * Math.PI / 180) / zoomCur) * 180 / Math.PI;
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    $('zoom').classList.toggle('show', zoomOn);
    $('zoom').textContent = '🔭 ×' + zoomT.toFixed(1);
    eyeY += (eyeT - eyeY) * (1 - Math.exp(-dt * 4));
    if (mirror) mirror.visible = (window.__eyeH || eyeY) < 60 && !location.search.includes('nomirror');      // 高处俯瞰时不画反射；?nomirror 可关闭
    camera.position.set(pos[0], window.__eyeH || eyeY, -pos[1]);      // __eyeH：仅调试用，抬高相机看阴影
    camera.rotation.set(pitch, yaw, 0);
    // 调试/测试用：暴露状态
    window.__cathedral = { pos, yaw, door: door.t, interiorReady, exposure, hours, info: renderer.info.render };
  }
  renderer.render(scene, camera);
  if (!manual) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// 仅 ?debug：供自动化测试直接设定位置、开门（浏览器自动化无法真正锁定鼠标）
if (new URLSearchParams(location.search).has('debug')) {
  window.__go = (x, y, yw = yaw, pt = pitch) => { pos = [x, y]; yaw = yw; pitch = pt; };
  window.__zoom = (on, z) => { zoomOn = on; if (z) zoomT = z; };
  window.__stair = () => stairAction();
  window.__ride = () => ride && { t: ride.t, type: ride.type, eyeY, pos };
  window.__dbg = { scene, camera, THREE, renderer, lights: () => lights };
  window.__setTime = (h) => { hours = h; exposure = L ? L.exposureOut : exposure; };       // 调试：设时间并让曝光立即适应室外
  window.__walk = (dx, dy) => { pos = move(world, door, pos, dx, dy); return pos; };
  window.__openDoor = async () => { await loadInterior(); while (!interiorReady) await new Promise((r) => setTimeout(r, 100)); door.target = 1; };
  setInterval(() => { if (performance.now() - last > 200) frame(performance.now(), true); }, 100);   // rAF 停摆时（面板隐藏）用定时器补帧
}
boot().catch((e) => { $('loading').querySelector('p').textContent = '加载失败：' + e.message; console.error(e); });
