// 场景装配、加载、外部实时光照（天候）、室内烘焙着色、第一人称行走、开门、曝光适应。
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { MeshoptDecoder } from '../../vendor/three/meshopt_decoder.module.js';
import { createWorld, createDoor, stepDoor, doorAngleRad, move, nearDoor, isInside } from './collide.mjs';
import { createSkyAndLights } from './sky.mjs';
import { stoneMaterial } from './stone.mjs';

const $ = (id) => document.getElementById(id);
const EYE = 1.65, WALK = 6.4, RUN = 16.0;      // 米/秒；2026-11-15 用户要求行进速度提高 4 倍（原 1.6 / 4.0）
const EXPOSURE_OUT = 0.7, EXPOSURE_IN = 22.0, ADAPT = 1.2;    // 室内曝光、适应时间常数（秒）；室外曝光随时间，见 sky.mjs 的 exposureOut
const EXT_DIR = 'assets_next';                                 // 外部资源（颜色+遮蔽+实时光照）；室内仍用 assets（旧烘焙光照，W6 改关键帧）
let hours = parseFloat(new URLSearchParams(location.search).get('t') || '16');   // 巴黎当地时钟时间
let autoTime = new URLSearchParams(location.search).has('cycle');                   // ?cycle：一打开就自动走；也可按 P
const DAY_SPEED = 1 / 60;                                                              // 小时/秒：1 分钟 = 1 小时，18 分钟走完 5:00–23:00

const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2500);
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
      .replace('void main() {', (pave ? 'varying vec3 vWPos;' + NL : '') + 'void main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + NL + (pave ? 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;' : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform float uExp;' + NL + (pave ? 'uniform sampler2D tPave;' + NL + 'varying vec3 vWPos;' + NL : '') + 'void main() {')
      .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb = (exp(diffuseColor.rgb * ${Math.log1p(ENC.A * ENC.XMAX).toFixed(6)}) - 1.0) / ${ENC.A.toFixed(1)};
      ${pave ? `{ vec3 pv = texture2D(tPave, vWPos.xz / 6.0).rgb * 2.15;
        diffuseColor.rgb *= mix(vec3(1.0), pv, 1.0 - smoothstep(25.0, 90.0, distance(vWPos, cameraPosition))); }` : ''}
      diffuseColor.rgb *= uExp;
      float pk = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
      float sp = pk < 0.6 ? pk : 0.6 + (1.0 - exp(-(pk - 0.6) * 0.8)) * 0.9;     // 0.6 以下不变；以上渐近到 1.5
      diffuseColor.rgb *= sp / max(pk, 1e-5);`);
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
async function prepareExterior(root) {
  const jobs = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const map = o.material.map;
    if (/glass/i.test(o.name) || /glass/i.test(o.material.name)) {
      map.colorSpace = THREE.SRGBColorSpace;
      // 外部看玻璃：深色、带天空反射；透出一点内部彩光（自发光取贴图的 18%）
      const gm = new THREE.MeshStandardMaterial({ map, color: 0x8a9098, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.04, metalness: 0.0, side: THREE.DoubleSide });
      gm.userData.envK = 3.2; lights.useEnv(gm); o.material = gm;
      return;
    }
    const key = AO_KEY[o.name];
    jobs.push(tex(`${EXT_DIR}/tex_${key}_ao.webp`).then((ao) => {
      ao.flipY = false; ao.colorSpace = THREE.NoColorSpace; ao.anisotropy = 4;      // glTF 的 UV 不翻转
      o.material = (o.name === 'B_ext_a' || o.name === 'B_ext_b' || o.name === 'B_ground') && !location.search.includes('flat') ? (() => { const sm = stoneMaterial(map, ao, o.name === 'B_ground'); sm.userData.envK = 0.25; lights.useEnv(sm); return sm; })() : exteriorMaterial(map, ao, o.name === 'B_ground');
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
let L = null, lights = null;        // L：当前时刻的光照参数

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
  const [ext, doors] = await Promise.all([loadGlb('exterior', EXT_DIR), loadGlb('door', EXT_DIR)]);
  await Promise.all([prepareExterior(ext), prepareExterior(doors)]);
  scene.add(ext, doors);
  // 远处地面：把广场铺石一直延伸到地平线（只为避免“悬空的方块”），远处铺石细节会按像素大小自动淡出
  const far = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), stoneMaterial(null, null, true, 0xffffff));
  far.position.set(0, -0.03, -40); far.material.userData.envK = 0.2; lights.useEnv(far.material); far.receiveShadow = true;
  scene.add(far);
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
  if (e.code === 'KeyE' && locked()) toggleDoor();
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
  if (!world || !locked() && !window.__dbg) return;
  if (v.inside) { await loadInterior(); while (!interiorReady) await new Promise((r) => setTimeout(r, 100)); }
  pos = [v.x, v.y]; yaw = v.yaw; pitch = v.pitch; eyeT = v.z; vp = { cx: v.x, cy: v.y, r: v.r };
  $('vpname').textContent = '📍 ' + v.name; $('vpname').classList.add('show');
  clearTimeout(vpTimer); vpTimer = setTimeout(() => $('vpname').classList.remove('show'), 3500);
}
let vpTimer;
function backToGround() {
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
let eyeY = EYE, eyeT = EYE, vp = null;      // 眼高（平滑）与目标；vp：观景点 {cx, cy, r}，非空时在观景点范围内自由走动、不做碰撞
function frame(now, manual = false) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (world) {
    if (locked()) {
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
    stepDoor(door, dt);
    const a = doorAngleRad(door);
    if (doorL) { doorL.rotation.y = a; doorR.rotation.y = -a; }
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
      L = lights.apply(hours, exposure);
      const target = window.__expOverride || (isInside(pos) && eyeY < 22 ? EXPOSURE_IN : L.exposureOut);      // __expOverride：仅调试
      exposure += (target - exposure) * (1 - Math.exp(-dt / ADAPT));
      uExp.value = exposure;
      lights.sky.position.copy(camera.position);
    }
    // 望远镜视角：平滑过渡到目标倍率；基础视角 70°
    zoomCur += ((zoomOn ? zoomT : 1) - zoomCur) * (1 - Math.exp(-dt * 10));
    const fov = 2 * Math.atan(Math.tan(35 * Math.PI / 180) / zoomCur) * 180 / Math.PI;
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    $('zoom').classList.toggle('show', zoomOn);
    $('zoom').textContent = '🔭 ×' + zoomT.toFixed(1);
    eyeY += (eyeT - eyeY) * (1 - Math.exp(-dt * 4));
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
  window.__dbg = { scene, camera, THREE, renderer, lights: () => lights };
  window.__setTime = (h) => { hours = h; exposure = L ? L.exposureOut : exposure; };       // 调试：设时间并让曝光立即适应室外
  window.__walk = (dx, dy) => { pos = move(world, door, pos, dx, dy); return pos; };
  window.__openDoor = async () => { await loadInterior(); while (!interiorReady) await new Promise((r) => setTimeout(r, 100)); door.target = 1; };
  setInterval(() => { if (performance.now() - last > 200) frame(performance.now(), true); }, 100);   // rAF 停摆时（面板隐藏）用定时器补帧
}
boot().catch((e) => { $('loading').querySelector('p').textContent = '加载失败：' + e.message; console.error(e); });
