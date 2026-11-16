// 天空与日光（天候系统 W4/W5）：解析晴空 + 太阳方向光（带阴影）+ 半球天光。
// 全部是“按观感调的近似”，不是物理精确的大气模型。输入只有一个：巴黎当地时钟时间（小时）。
// 坐标：sun.mjs 用模型坐标（x 南、y 东、z 上），three.js 世界是 (x, z, −y)，这里统一转换。
import * as THREE from 'three';
import { sunAngles, sunDir } from './sun.mjs';

const rad = (d) => d * Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const toThree = ([x, y, z]) => [x, z, -y];

/** 某一时刻的光照参数。强度为“辐亮度系数”：白色朝阳面（反照率 1）的亮度 = sunI × N·L。 */
export function lightingAt(hours) {
  const E = sunAngles(hours).elevation;
  const sinE = Math.max(Math.sin(rad(E)), 0);
  const m = E > 0 ? 1 / (sinE + 0.15 * Math.pow(E + 3.885, -1.253)) : 40;       // 大气质量（Kasten–Young）
  const T = [0.095, 0.145, 0.27].map((t) => Math.exp(-t * m));                    // 红、绿、蓝透过率：低太阳变橙红
  const tmax = Math.max(...T);
  const sunColor = T.map((v) => v / tmax);
  const sunI = 1.7 * (tmax / 0.91) * sstep(-0.5, 3, E);
  const skyBright = E >= 0 ? 0.15 + 0.85 * Math.pow(sinE, 0.6) : 0.15 * Math.exp(E / 3.5);   // 晨昏蒙影里天光慢慢暗下去
  const warm = (1 - sstep(0, 14, E)) * 0.6;
  const skyColor = mix([0.55, 0.72, 1.0], [1.0, 0.80, 0.65], warm);
  const skyI = 0.75 * skyBright;
  const lumRef = sunI * sinE * 0.45 + skyI * 0.6;                                // 平均受光面的照度，用来定室外曝光
  const exposureOut = clamp(0.9 / (lumRef + 0.04), 0.9, 5);                      // 上限 5：晨昏要“暗下去”，不能让自动曝光把夜空提成白天
  return { E, sinE, sunColor, sunI, skyColor, skyI, skyBright, exposureOut, sunDirThree: toThree(sunDir(hours)) };
}

const SKY_VS = `varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`;
const SKY_FS = `varying vec3 vDir;
uniform vec3 uSun, uSunColor, uZenith, uHorizon;
uniform float uExp, uSunE, uSunVis;
float ch(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float cn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
float cfbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * cn(p); p = p * 2.07 + 3.3; a *= .5; } return s; }
void main() {
  vec3 v = normalize(vDir);
  float hz = pow(1.0 - max(v.y, 0.0), 3.5);
  vec3 col = mix(uZenith, uHorizon, hz);
  col = mix(col, uHorizon * 0.7, smoothstep(0.0, -0.2, v.y));
  if (v.y > 0.0) {                                                              // 积云 + 卷云（静态）
    vec2 cp = v.xz / (v.y + 0.12) * 0.55;
    float d = cfbm(cp + vec2(4.0, 1.0));
    float cov = smoothstep(0.50, 0.78, d) * smoothstep(0.0, 0.18, v.y);
    float thin = smoothstep(0.45, 0.75, cfbm(cp * vec2(2.2, 5.0) + 9.0)) * 0.35 * smoothstep(0.1, 0.5, v.y);
    float lit = 0.62 + 0.38 * clamp(dot(normalize(vec3(uSun.x, 0.0, uSun.z) + 1e-4), normalize(vec3(v.x, 0.0, v.z) + 1e-4)) * 0.5 + 0.5, 0.0, 1.0) * uSunVis;
    float shade = mix(0.78, 1.0, smoothstep(0.50, 0.9, d));                   // 云心偏灰
    vec3 cc = mix(uHorizon, vec3(1.0) * min(1.2, length(uHorizon) * 1.35), 0.75) * lit * mix(shade, 1.0, 0.0);
    cc = mix(cc, uSunColor * length(uHorizon) * 1.05, (1.0 - shade) * 0.0);
    col = mix(col, cc, clamp(cov + thin, 0.0, 1.0) * 0.92);
  }
  float mu = max(dot(v, uSun), 0.0);
  float g = 0.78;
  float ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) / 12.566;
  col += uSunColor * ph * 0.9 * uSunVis;                                       // 光晕
  col += uSunColor * 40.0 * smoothstep(0.99983, 0.99996, mu) * uSunVis;        // 日盘
  float warm = (1.0 - smoothstep(0.0, 0.35, uSunE)) * pow(mu, 3.0) * hz;        // 低太阳时，地平线朝太阳一侧变暖
  col = mix(col, uSunColor * 0.9, warm * 0.7);
  gl_FragColor = vec4(col * uExp, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSkyAndLights(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const uniforms = {
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Vector3(1, 1, 1) },
    uZenith: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() },
    uExp: { value: 1 }, uSunE: { value: 1 }, uSunVis: { value: 1 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24),
    new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // 环境反射：把解析天空烘进 PMREM，供玻璃、铅皮、湿石面的高光反射（时间变化超过 0.25 小时才重做）
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uExp: { value: 1 } }, vertexShader: SKY_VS,
    fragmentShader: SKY_FS.replace('#include <tonemapping_fragment>', '').replace('#include <colorspace_fragment>', ''),
    side: THREE.BackSide, depthWrite: false, depthTest: false })));
  const envMats = [];                                   // 使用环境反射的材质
  let envTarget = null, envHours = -99;
  function refreshEnv(hours) {
    if (Math.abs(hours - envHours) < 0.25) return;
    envHours = hours;
    const old = envTarget;
    envTarget = pm.fromScene(envScene, 0, 1, 100);
    for (const m of envMats) { if (!m.envMap) m.needsUpdate = true; m.envMap = envTarget.texture; }
    if (old) old.dispose();
  }
  function useEnv(m) { envMats.push(m); if (envTarget) m.envMap = envTarget.texture; }

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a4540, 1);
  scene.add(sun, sun.target, hemi);

  // 阴影相机覆盖整座教堂加前广场（three 坐标：x ±45，y 0–100，z −140–90）
  const BOX = [];
  for (const x of [-45, 45]) for (const y of [0, 100]) for (const z of [-140, 90]) BOX.push(new THREE.Vector3(x, y, z));
  const tmpCam = new THREE.OrthographicCamera();
  const center = new THREE.Vector3(0, 40, -25);

  function apply(hours, exposure) {
    const L = lightingAt(hours);
    const d = new THREE.Vector3(...L.sunDirThree);
    // 灯光（强度乘曝光；three 的 Lambert 辐亮度 = 反照率 × 强度 × N·L / π，所以乘 π）
    sun.color.setRGB(...L.sunColor);
    sun.intensity = Math.PI * L.sunI * exposure;
    sun.visible = L.sunI > 0.01;
    hemi.color.setRGB(...L.skyColor); hemi.groundColor.setRGB(0.30, 0.28, 0.25).multiplyScalar(L.skyBright);
    hemi.intensity = Math.PI * L.skyI * exposure;
    sun.position.copy(center).addScaledVector(d, 300);
    sun.target.position.copy(center);
    // 阴影相机范围
    tmpCam.position.copy(sun.position); tmpCam.lookAt(center); tmpCam.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of BOX) {
      const q = p.clone().applyMatrix4(tmpCam.matrixWorldInverse);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
    }
    const c = sun.shadow.camera;
    c.left = x0 - 4; c.right = x1 + 4; c.bottom = y0 - 4; c.top = y1 + 4; c.near = Math.max(1, -z1 - 20); c.far = -z0 + 20;
    c.updateProjectionMatrix();
    // 天空
    uniforms.uSun.value.copy(d); uniforms.uSunColor.value.set(...L.sunColor).multiplyScalar(Math.min(1, L.sunI / 0.6 + 0.2));
    const b = L.skyBright;
    uniforms.uZenith.value.set(0.10, 0.26, 0.80).multiplyScalar(0.02 + 0.98 * b);
    uniforms.uHorizon.value.set(0.62, 0.74, 0.92).multiplyScalar(0.04 + 0.96 * b);
    uniforms.uSunE.value = L.sinE; uniforms.uSunVis.value = sstep(-3, 0.5, L.E);
    uniforms.uExp.value = exposure;
    refreshEnv(hours);
    for (const m of envMats) m.envMapIntensity = exposure * (m.userData.envK ?? 1);
    return L;
  }
  return { sky, sun, hemi, apply, uniforms, useEnv };
}
