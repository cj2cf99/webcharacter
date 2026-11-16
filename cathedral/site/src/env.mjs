// 周边环境（程序化）：塞纳河与石砌河岸、奥斯曼式街区、行道树与花园树、远岸。
// 位置按航拍图的大致关系摆放，不是测绘数据（待核实）。three 坐标：x 南、y 上、z = −东；教堂在 x∈±25、z∈[−127,−1.6]。
import * as THREE from 'three';
import { stoneMaterial } from './stone.mjs';

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const NL = String.fromCharCode(10);

// ---- 奥斯曼街区立面：米色石墙 + 窗格 + 铁艺阳台带 + 底层商铺带
function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  m.customProgramCacheKey = () => 'facade-v1';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vWPos;' + NL + 'varying vec3 vWN;' + NL + 'void main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + NL + 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;' + NL + 'vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying vec3 vWPos;
varying vec3 vWN;
float fh(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float roughS;
void main() {`)
    .replace('#include <map_fragment>', `
    {
      vec3 n = vWN; bool wall = abs(n.y) < 0.5; bool alongX = abs(n.x) > abs(n.z);
      float u = alongX ? vWPos.z : vWPos.x, y = vWPos.y;
      vec3 stone = vec3(0.58, 0.51, 0.40) * (0.9 + 0.2 * fh(floor(vec2(u * 1.2, y * 2.4))));
      float course = abs(fract(y / 0.35) - 0.5);
      stone *= 1.0 - 0.10 * smoothstep(0.46, 0.5, course);
      vec2 g = vec2(u / 2.4, y / 3.3); vec2 f = fract(g); float fl = floor(g.y); vec2 cell = floor(g);
      float shop = step(y, 3.6);
      bool win = wall && fl >= 1.0 && f.x > 0.28 && f.x < 0.72 && f.y > 0.16 && f.y < 0.80;
      bool sill = wall && fl >= 1.0 && f.x > 0.24 && f.x < 0.76 && f.y > 0.12 && f.y <= 0.16;
      bool iron = wall && (fl == 2.0 || fl == 5.0) && f.y < 0.10;
      float r = fh(cell);
      vec3 glass = mix(vec3(0.05, 0.07, 0.10), vec3(0.16, 0.2, 0.26), r * r);
      if (r > 0.82) glass = vec3(0.30, 0.27, 0.22);          // 拉着窗帘
      vec3 c = stone;
      if (sill) c = stone * 1.25;
      if (win) { vec2 q = abs(f - vec2(0.5, 0.48)); c = (q.x > 0.19 || q.y > 0.30 || abs(f.x - 0.5) < 0.012 || abs(f.y - 0.5) < 0.012) ? vec3(0.8) : glass; }
      if (iron) c = vec3(0.04);
      if (wall && shop > 0.5) c = mix(stone * 0.55, vec3(0.07, 0.07, 0.08), step(0.3, f.x) * step(f.x, 0.8) * step(0.1, f.y));
      float soot = smoothstep(0.3, 0.9, fh(floor(vec2(u * 0.6, y * 0.3))));
      c *= 1.0 - 0.18 * soot * smoothstep(20.0, 0.0, y);
      diffuseColor.rgb = wall ? c : vec3(0.5, 0.5, 0.52);
      roughS = (win && !(r > 0.82)) ? 0.08 : 0.88;
    }`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + NL + 'roughnessFactor = roughS;');
  };
  return m;
}

// ---- 水面：深绿，细小涟漪法线随时间流动，天空反射
function waterMaterial(timeU) {
  const m = new THREE.MeshStandardMaterial({ color: 0x14302e, roughness: 0.07, metalness: 0.0 });
  m.customProgramCacheKey = () => 'water-v1';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = timeU;
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vWPos;' + NL + 'void main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + NL + 'vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying vec3 vWPos;
uniform float uT;
float wh(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
float wave(vec2 p){ return wn(p * 0.9 + vec2(uT * 0.25, uT * 0.1)) * 0.6 + wn(p * 2.3 - vec2(uT * 0.3, 0.0)) * 0.3 + wn(p * 5.1 + vec2(0.0, uT * 0.5)) * 0.1; }
void main() {`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    {
      vec2 p = vWPos.xz; float e = 0.35;
      float h0 = wave(p), hx = wave(p + vec2(e, 0.0)), hz = wave(p + vec2(0.0, e));
      vec3 wn3 = normalize(vec3(-(hx - h0) * 0.5, 1.0, -(hz - h0) * 0.5));
      normal = normalize((viewMatrix * vec4(wn3, 0.0)).xyz);
    }`);
  };
  return m;
}

export function createEnvironment(scene, lights) {
  const group = new THREE.Group(); group.name = 'Env';
  const timeU = { value: 0 };

  // 水面（河面低于路面 5.5 m）
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), waterMaterial(timeU));
  water.position.set(0, -5.5, -150); water.userData.envK = 1.4; lights.useEnv(water.material); water.material.userData.envK = 1.4;
  group.add(water);

  // 岛上地面（教堂四周）：沿用广场铺石的程序化材质，但无遮蔽图
  const isle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), stoneMaterial(null, null, true));
  isle.material.userData.envK = 0.25; lights.useEnv(isle.material);
  const X0 = -88, X1 = 80, Z0 = -176, Z1 = 100;                      // 岛的范围（北岸 x=-88，南岸 x=80，东端 z=-176，西侧延到 z=100）
  isle.scale.set(X1 - X0, 1, Z1 - Z0); isle.position.set((X0 + X1) / 2, -0.32, (Z0 + Z1) / 2);
  group.add(isle);

  // 河岸石墙
  const wallMat = stoneMaterial(null, null, false, 0x9b9486); wallMat.userData.envK = 0.2; lights.useEnv(wallMat);
  const addWall = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 5.9, d), wallMat); m.position.set(x, -2.95 - 0.3, z); group.add(m); };
  addWall(X0 - 0.6, (Z0 + Z1) / 2, 1.2, Z1 - Z0 + 2);
  addWall(X1 + 0.6, (Z0 + Z1) / 2, 1.2, Z1 - Z0 + 2);
  addWall((X0 + X1) / 2, Z0 - 0.6, X1 - X0 + 2.4, 1.2);
  addWall((X0 + X1) / 2, Z1 + 0.6, X1 - X0 + 2.4, 1.2);

  // 街区建筑
  const fac = facadeMaterial(); fac.userData.envK = 0.3; lights.useEnv(fac);
  const zinc = new THREE.MeshStandardMaterial({ color: 0x59606a, roughness: 0.5 }); zinc.userData.envK = 0.6; lights.useEnv(zinc);
  function block(x0, x1, z0, z1, floors, ridgeZ = false) {
    const w = x1 - x0, d = z1 - z0, h = floors * 3.3 + 0.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fac); body.position.set((x0 + x1) / 2, h / 2 - 0.3, (z0 + z1) / 2);
    const rh = 5.2, inset = Math.min(w, d) * 0.12 + 1.5;                                // 孟莎屋顶：下陡上缓，用截锥近似
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.72, rh, 4, 1).rotateY(Math.PI / 4), zinc);
    roof.scale.set(w - 0.2, 1, d - 0.2); roof.geometry.scale(1, 1, 1);
    roof.position.set(body.position.x, h - 0.3 + rh / 2, body.position.z);
    group.add(body, roof);
    for (let i = 0; i < Math.max(2, Math.floor((w + d) / 22)); i++) {                    // 烟囱
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 1.6), fac);
      ch.position.set(x0 + rnd() * w, h + rh * 0.55, z0 + rnd() * d); group.add(ch);
    }
  }
  // 西北街区（照片 1 的左侧楼群）
  block(-80, -62, 20, 46, 6); block(-80, -58, 46, 78, 6); block(-62, -40, 40, 66, 5);
  // 正西侧远处（市政厅一侧）
  block(-60, -5, 84, 100, 5); block(6, 70, 84, 100, 5);
  // 北侧一排（修士院街一带）：隔一条街在北墙外
  for (let z = -138; z < 0; z += 26) block(-74, -52 - rnd() * 6, z, z + 24 + rnd() * 2, 5 + Math.floor(rnd() * 2));
  // 南侧教堂事务所等低矮房屋
  block(34, 52, -88, -62, 3); block(40, 62, -120, -92, 3); block(60, 78, -60, -30, 4);
  // 西南角的小宅邸（照片 1 右侧）
  const house = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 11), fac); house.position.set(40, 4.2, 4);
  const hr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.75, 6.5, 4, 1).rotateY(Math.PI / 4), zinc); hr.scale.set(14, 1, 11); hr.position.set(40, 12.5, 4);
  group.add(house, hr);
  // 远岸（跨河）
  for (let z = -240; z < 140; z += 28) {
    block(-236, -204 + rnd() * 8, z, z + 26, 5 + Math.floor(rnd() * 2));
    block(186 + rnd() * 6, 226, z, z + 26, 5 + Math.floor(rnd() * 2));
  }
  for (let x = -230; x < 230; x += 30) block(x, x + 28, -250, -226, 5);

  // 树：行道树沿北南岸、东端花园、南侧园地
  const tGeo = new THREE.IcosahedronGeometry(1, 2);
  const pos = tGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + (Math.sin(pos.getX(i) * 5.1) * Math.cos(pos.getY(i) * 4.3 + pos.getZ(i) * 3.7)) * 0.16;
    pos.setXYZ(i, pos.getX(i) * k * 1.05, pos.getY(i) * k * 0.9, pos.getZ(i) * k * 1.05);
  }
  tGeo.computeVertexNormals();
  const spots = [];
  for (let z = -170; z < 96; z += 11) { spots.push([X0 + 3.5, z + rnd() * 3]); spots.push([X1 - 3.5, z + rnd() * 3]); }
  for (let i = 0; i < 70; i++) spots.push([-40 + rnd() * 110, -135 - rnd() * 36 + (rnd() - 0.5) * 6]);     // 东端园
  for (let i = 0; i < 30; i++) spots.push([30 + rnd() * 45, -135 + rnd() * 70]);                          // 南侧园
  const trees = new THREE.InstancedMesh(tGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 1, 6), new THREE.MeshLambertMaterial({ color: 0x4a3b2c }), spots.length);
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  spots.forEach(([x, z], i) => {
    const s = 3.6 + rnd() * 2.4, th = 3.2 + rnd() * 2;
    mtx.compose(new THREE.Vector3(x, th + s * 0.8, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(s, s, s)); trees.setMatrixAt(i, mtx);
    mtx.compose(new THREE.Vector3(x, th / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, th + 1, 1)); trunks.setMatrixAt(i, mtx);
    const g = 0.5 + rnd() * 0.5;
    trees.setColorAt(i, col.setRGB(0.10 + 0.10 * g, 0.26 + 0.18 * g, 0.06 + 0.05 * g));
  });
  group.add(trees, trunks);
  scene.add(group);
  return { update: (t) => { timeU.value = t; } };
}
