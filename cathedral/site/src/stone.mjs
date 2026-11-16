// 外部写实材质：在烘焙的“颜色+遮蔽”之上，按世界坐标实时叠加石块砌缝、颗粒、法线凹凸、雨水冲痕、积灰，
// 以及铅皮屋面（竖向咬合缝）。无需额外贴图文件：全部由着色器程序化生成，细节不受贴图分辨率限制。
import * as THREE from 'three';

const GLSL_PARS = `
varying vec3 vWPos;
varying vec3 vWN;
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

  // ---- 铅皮
  vec2 tn = normalize(vec2(-vWN.z, vWN.x) + 1e-5);
  float s = dot(gp.xz, tn);                                          // 垂直于坡向的横坐标
  float seam = abs(fract(s / 0.52) - 0.5) * 0.52;                    // 咬合缝（约 52 cm 一条）
  float rib = 1.0 - smoothstep(0.0, 0.022 + fw, seam);
  float sheet = h21(vec2(floor(s / 0.52), floor(gp.y * 0.6)));
  vec3 lead = vec3(0.26, 0.285, 0.31) * (0.78 + 0.45 * sheet) * (0.85 + 0.3 * fbm(uv * 3.0));
  lead = mix(lead, lead * vec3(0.9, 1.05, 1.0), step(0.5, vn(uv * 0.9)) * 0.4);
  lead *= 1.0 - 0.35 * smoothstep(0.55, 0.9, fbm(vec2(s * 3.0, gp.y * 0.3 + 9.0)));   // 雨痕
  lead = mix(lead, lead * 1.5, rib * 0.5);

  diffuseColor.rgb = mix(limestone, lead, isLead);
  stoneH = mix(b.x, rib * 0.012 + (sheet - 0.5) * 0.002, isLead);
  stoneRough = mix(0.92 - b.z * 0.0 + (fbm(uv * 9.0) - 0.5) * 0.12, 0.42 + 0.2 * sheet, isLead);
}
`;

export const hazeU = { value: new THREE.Color(0.55, 0.6, 0.68) };      // 远景雾色（线性，已含色调映射），由 sky.mjs 每帧更新

export function stoneMaterial(map, ao, ground = false, color = null) {
  const m = new THREE.MeshStandardMaterial({ map: map || null, color: color ?? 0xffffff, aoMap: ao || null, aoMapIntensity: 1.0, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => ground ? 'ground-v1' : 'stone-v1';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec3 vWPos;\nvarying vec3 vWN;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.uniforms.uHaze = hazeU;
    const HAZE = 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, smoothstep(180.0, 1400.0, distance(vWPos, cameraPosition)));' + String.fromCharCode(10) + '#include <colorspace_fragment>';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <colorspace_fragment>', ground ? HAZE : '#include <colorspace_fragment>')
      .replace('void main() {', 'uniform vec3 uHaze;' + String.fromCharCode(10) + GLSL_PARS + String.fromCharCode(10) + 'float stoneH, stoneRough;' + String.fromCharCode(10) + 'void main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + (ground ? GLSL_GROUND : GLSL_ALBEDO))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = stoneRough;')
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
  float fade = 1.0 - smoothstep(0.05, 0.25, fw);
  vec3 b = ashlarP(uv, fw, 0.9, 1.1, 1.1);
  #ifdef USE_AOMAP
  float aoV = texture2D(aoMap, vAoMapUv).r;
#else
  float aoV = 1.0;
#endif
  vec3 c = vec3(0.26, 0.255, 0.245) * (0.82 + 0.35 * (b.y - 0.5) * 2.0 * 0.5);
  c *= 1.0 + (fbm(uv * 1.3) - 0.5) * 0.28;                           // 大块明暗
  c *= 1.0 + (fbm(uv * 9.0) - 0.5) * 0.22 * fade;                    // 颗粒
  c = mix(c, c * 0.48, b.z * 0.9);                                   // 灰缝
  float dirt = smoothstep(0.50, 0.80, fbm(uv * 0.55 + 11.0));        // 大片污渍
  c = mix(c, c * vec3(0.62, 0.60, 0.56), dirt * 0.7);
  float wear = smoothstep(0.55, 0.9, fbm(uv * 0.23 + 3.0));          // 潮湿暗斑
  c *= 1.0 - 0.22 * wear;
  c *= mix(0.5, 1.0, smoothstep(0.1, 0.8, aoV));                     // 墙脚遮蔽
  diffuseColor.rgb = c;
  stoneH = b.x * 1.3;
  stoneRough = mix(0.92, 0.55, wear) - b.z * 0.0;
}
`;
