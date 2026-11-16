// 外部写实材质：在烘焙的“颜色+遮蔽”之上，按世界坐标实时叠加石块砌缝、颗粒、法线凹凸、雨水冲痕、积灰，
// 以及铅皮屋面（竖向咬合缝）。无需额外贴图文件：全部由着色器程序化生成，细节不受贴图分辨率限制。
import * as THREE from 'three';

export const GLSL_FUNCS = `
float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 7.1; a *= .5; } return s; }

vec3 ashlarP(vec2 uv, float fw, float RH, float Lmin, float Lvar);
// 石块：返回 (高度[米], 石块随机值, 缝宽遮罩)
vec3 ashlar(vec2 uv, float fw){ return ashlarP(uv, fw, 0.40, 0.55, 0.75); }
vec3 ashlarP(vec2 uv, float fw, float RH, float Lmin, float Lvar){      // RH 层高；块长 Lmin..Lmin+Lvar
  float row = floor(uv.y / RH), rr = h11(row + 3.7);
  float L = Lmin + rr * Lvar;
  float u = uv.x + rr * 17.3;
  float col = floor(u / L);
  vec2 f = vec2(fract(u / L) * L, fract(uv.y / RH) * RH);
  float e = min(min(f.x, L - f.x), min(f.y, RH - f.y));    // 到石块边缘的距离
  float id = h21(vec2(col, row));
  float fade = 1.0 - smoothstep(0.02, 0.09, fw);           // 远处淡出细节，避免摩尔纹
  float joint = (1.0 - smoothstep(0.003, 0.012 + fw, e)) * fade;
  float bevel = smoothstep(0.0, 0.035, e);
  float grain = (fbm(uv * 11.0 + id * 40.0) - 0.5) * 0.010 * fade + (vn(uv * 55.0) - 0.5) * 0.003 * fade;
  float h = -0.014 * joint + 0.004 * bevel + grain + (id - 0.5) * 0.004;   // 每块略有进出
  return vec3(h, id, joint);
}
`;
const GLSL_PARS = `varying vec3 vWPos;
varying vec3 vWN;
` + GLSL_FUNCS;

const GLSL_ALBEDO = `
{
  vec3 gp = vWPos;
  vec3 dx = dFdx(gp), dy = dFdy(gp);
  vec3 gn = normalize(cross(dx, dy));
  vec3 an = abs(gn);
  bool wallX = an.x >= an.z && an.x > an.y, wallZ = an.z > an.x && an.z > an.y;
  vec2 uv = wallX ? gp.zy : (wallZ ? gp.xy : gp.xz);        // 按主导轴选投影（墙与教堂轴向对齐）
  float fw = length(fwidth(uv));
  #ifdef USE_AOMAP
  float aoV = texture2D(aoMap, vAoMapUv).r;
#else
  float aoV = 1.0;
#endif
  float lumB = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  float isLead = step(0.12, abs(vWN.y)) * step(14.0, gp.y) * (1.0 - smoothstep(0.34, 0.46, lumB));   // 只有烘焙底色偏暗的（屋面材质）才是铅皮，小尖塔等石构件保持石面   // 高处的上倾面：铅皮屋面

  // ---- 石面
  vec3 b = ashlar(uv, fw);
  float fade = 1.0 - smoothstep(0.02, 0.09, fw);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  vec3 limestone = vec3(0.92, 0.72, 0.46) * (0.58 + 0.5 * lum);     // 巴黎石灰岩：暖奶油到蜜黄；沿用烘焙的明暗结构
  float blockTint = (b.y - 0.5);
  limestone *= 1.0 + blockTint * 0.34;
  limestone = mix(limestone, limestone * vec3(1.06, 0.96, 0.82), vn(uv * 1.7 + 3.0) * 0.8);   // 大块暖冷色斑
  limestone *= 1.0 + (fbm(uv * 6.0) - 0.5) * 0.30 * fade;
  limestone = mix(limestone, limestone * 0.55, b.z);                // 灰缝暗
  // 雨水冲痕：竖向拉长的噪声，集中在上部
  float st = smoothstep(0.42, 0.80, fbm(vec2(uv.x * 4.5, uv.y * 0.22 + 5.0)));
  float yy = gp.y;
  float streak = st * (0.35 + 0.65 * smoothstep(3.0, 30.0, yy)) * (wallX || wallZ ? 1.0 : 0.0);
  limestone = mix(limestone, limestone * vec3(0.52, 0.50, 0.47), streak * 1.0);
  // 积灰：凹处（遮蔽低）、近地面更脏；底部偶有潮绿
  limestone *= mix(0.35, 1.0, smoothstep(0.2, 0.9, aoV));
  limestone *= mix(0.80, 1.0, smoothstep(0.0, 6.0, yy));
  float damp = (1.0 - smoothstep(0.0, 1.6, yy)) * smoothstep(0.45, 0.75, fbm(uv * 3.0));
  limestone = mix(limestone, vec3(0.20, 0.25, 0.14), damp * 0.5);
  // 使用十数年、但一直有人维护的痕迹（用户 2026-11-16）：
  //  - 约 8% 的石块是后来换的新石：更浅更干净、灰缝也是新勾的（偏亮）；
  //  - 人手够得到的下部（约 3 m 以下）常年擦洗：雨痕和积灰明显减弱，近地潮绿被清掉；
  //  - 少数老石块有细裂缝；
  float cleanZone = 1.0 - smoothstep(2.5, 6.5, yy);
  float repl = step(0.92, fract(b.y * 7.13 + 0.31));
  limestone = mix(limestone, limestone * 1.0 + (vec3(0.95, 0.82, 0.62) * (0.55 + 0.5 * lum) - limestone) * 0.85, repl * 0.9);
  limestone = mix(limestone, vec3(0.90, 0.78, 0.60) * (0.62 + 0.4 * lum), repl * b.z * 0.8);
  limestone = mix(limestone, mix(limestone, vec3(0.88, 0.76, 0.58) * (0.6 + 0.45 * lum), 0.45), cleanZone * 0.6);
  float crack = (1.0 - smoothstep(0.0, 0.010 + fw * 0.8, abs(fbm(uv * 2.7 + b.y * 13.0) - 0.5) * 0.07)) * step(0.82, fract(b.y * 3.7)) * (1.0 - repl) * fade;
  limestone *= 1.0 - 0.5 * crack;

  // ---- 铅皮：竖向咬合缝（约 52 cm 一条）+ 横向搭接缝（约 2.1 m 一段，各条错位）+ 每块板微小的深浅差 + 顺坡细纹 + 雨痕
  vec2 tn = normalize(vec2(-vWN.z, vWN.x) + 1e-5);
  float s = dot(gp.xz, tn);                                          // 垂直于坡向的横坐标
  float si = floor(s / 0.52);
  float seam = abs(fract(s / 0.52) - 0.5) * 0.52;
  float rib = 1.0 - smoothstep(0.0, 0.020 + fw, seam);
  float ribHi = 1.0 - smoothstep(0.015, 0.045 + fw, seam);           // 咬合缝两侧的亮边
  float lsl = gp.y * 1.35 + h11(si * 1.7) * 2.1;                     // 沿坡距离（坡度约 45°）
  float sid = floor(lsl / 2.1);
  float lapP = fract(lsl / 2.1);
  float lap = (1.0 - smoothstep(0.0, 0.010 + fw * 0.7, lapP * 2.1)) ;
  float sheet = h21(vec2(si, sid));
  vec3 lead = vec3(0.30, 0.33, 0.355) * (0.94 + 0.12 * sheet);
  lead *= 1.0 + (fbm(vec2(s * 16.0, lsl * 0.35)) - 0.5) * 0.10 * fade;        // 顺坡的细纹
  lead = mix(lead, lead * vec3(0.92, 1.03, 1.02), smoothstep(0.55, 0.85, fbm(vec2(s * 0.8, lsl * 0.25))) * 0.6);   // 局部偏青的氧化
  lead *= 1.0 - 0.28 * smoothstep(0.58, 0.9, fbm(vec2(s * 3.0, gp.y * 0.3 + 9.0)));      // 雨痕
  lead *= 1.0 + 0.30 * step(0.94, h21(vec2(si * 3.1, sid + 7.0)));              // 偶有新换的铅板，更亮
  lead *= 1.0 - 0.35 * lap * fade;                                    // 搭接缝的暗线
  lead = mix(lead, lead * 1.35, ribHi * 0.45);
  lead = mix(lead, lead * 0.7, rib * 0.35);

  diffuseColor.rgb = mix(limestone, lead, isLead);
  stoneH = mix(b.x, rib * 0.018 + ribHi * 0.004 - lap * 0.004, isLead);
  stoneRough = mix(0.92 - b.z * 0.0 + (fbm(uv * 9.0) - 0.5) * 0.12, 0.40 + 0.2 * sheet, isLead);
  // 黄铜（钟）：烘焙底色里橙黄、偏亮的部分按金属处理
  float isBrass = step(0.30, lumB) * step(1.5, diffuseColor.r / max(diffuseColor.g, 1e-3)) * step(4.0, diffuseColor.g / max(diffuseColor.b, 1e-3));
  if (isBrass > 0.5) { diffuseColor.rgb = vec3(0.95, 0.62, 0.17) * (0.85 + 0.3 * fbm(uv * 6.0)); stoneRough = 0.26; }
  stoneMetal = mix(0.0, 0.9, isBrass);
}
`;

export const hazeU = { value: new THREE.Color(0.55, 0.6, 0.68) };      // 远景雾色（线性，已含色调映射），由 sky.mjs 每帧更新

export function stoneMaterial(map, ao, ground = false, color = null) {
  const m = new THREE.MeshStandardMaterial({ map: map || null, color: color ?? 0xffffff, aoMap: ao || null, aoMapIntensity: 1.35, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => ground ? 'ground-v1' : 'stone-v1';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec3 vWPos;\nvarying vec3 vWN;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.uniforms.uHaze = hazeU;
    const HAZE = 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, smoothstep(160.0, 540.0, distance(vWPos, cameraPosition)));' + String.fromCharCode(10) + '#include <colorspace_fragment>';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <colorspace_fragment>', ground ? HAZE : '#include <colorspace_fragment>')
      .replace('void main() {', 'uniform vec3 uHaze;' + String.fromCharCode(10) + GLSL_PARS + String.fromCharCode(10) + 'float stoneH, stoneRough, stoneMetal;' + String.fromCharCode(10) + 'void main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + (ground ? GLSL_GROUND : GLSL_ALBEDO))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = stoneRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>' + String.fromCharCode(10) + 'metalnessFactor = stoneMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
        vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
        float det = dot(sx, r1) * faceDirection;
        vec3 grad = sign(det) * (dFdx(stoneH) * r1 + dFdy(stoneH) * r2);
        normal = normalize(abs(det) * normal - grad);
      }`);
  };
  return m;
}

// 广场铺石：大块石板（层高 0.9 m，长 1.1–2.2 m），宽缝、磨损、污渍、局部潮湿
const GLSL_GROUND = `
{
  vec2 uv = vWPos.xz;
  float fw = length(fwidth(uv));
  float fade = 1.0 - smoothstep(0.08, 0.5, fw);
  vec3 b = ashlarP(uv, fw, 1.8, 1.8, 0.9);                           // 大块石板（1.8 m 层高，长 1.8–2.7 m）
  float id = b.y;
  vec2 w = uv * 0.22 + vec2(fbm(uv * 0.35) * 2.2, fbm(uv * 0.31 + 7.0) * 2.2) + id * 9.0;   // 每块石板各有一套云纹
  float vein = pow(1.0 - abs(sin(w.x * 3.0 + w.y * 1.7 + fbm(w * 2.0) * 3.0)), 14.0);
  float vein2 = pow(1.0 - abs(sin(w.y * 4.3 - w.x * 1.1 + fbm(w * 3.1 + 3.0) * 2.5)), 22.0);
  vec3 c = mix(vec3(0.50, 0.49, 0.47), vec3(0.40, 0.40, 0.41), fbm(uv * 0.5 + id * 5.0));   // 米白到灰白
  c = mix(c, vec3(0.38, 0.40, 0.43), (vein * 0.55 + vein2 * 0.35) * fade);                    // 灰色纹路
  c *= 1.0 + (id - 0.5) * 0.12;
  // 使用痕迹但常年维护：人流走出的深色磨损带、偶尔换过的新石板（更白、纹路浅）、擦洗不到的接缝里的积灰
  float rep = step(0.88, fract(id * 5.37 + 0.2));
  c = mix(c, vec3(0.86, 0.85, 0.82), rep * 0.75);
  float path = exp(-pow(abs(vWPos.x) / 7.0, 2.0)) * smoothstep(-60.0, 0.0, vWPos.z) * 0.5;          // 中轴的人流磨损带
  c *= 1.0 - 0.12 * path;
  c *= 1.0 - 0.22 * b.z;                                                                        // 缝
  c *= 1.0 - 0.12 * smoothstep(0.55, 0.9, fbm(uv * 1.7 + 4.0)) * (1.0 - rep) * fade;             // 局部污渍
  float aoV = 1.0;
#ifdef USE_AOMAP
  aoV = texture2D(aoMap, vAoMapUv).r;
#endif
  c *= mix(0.55, 1.0, smoothstep(0.1, 0.8, aoV));
  diffuseColor.rgb = c;
  stoneH = -0.0012 * b.z * fade;       // 只有缝有一点凹，随像素大小淡出：原来带颗粒的高度图 + 抛光（粗糙度 0.1）的高光，随视角移动会逐像素闪烁
  stoneRough = mix(0.10, 0.22, smoothstep(0.4, 0.9, fbm(uv * 0.9)) * 0.7 + path * 0.8);                // 抛光，使用多的地方略钝
  stoneMetal = 0.0;
}
`;
