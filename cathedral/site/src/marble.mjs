// 大理石地面的镜面反射层（用户 2026-11-16：“能反射比较清晰影子的大理石效果，不需要符合现实”）。
// 一块贴着地面的平面反射器（three 的 Reflector），把整个场景镜像渲染一遍，再按菲涅尔叠在地面上：
// 广场和室内地板（两者都在 y≈0）共用同一层。远处淡出，避免浪费；反射图分辨率约为屏幕的 0.7 倍。
import * as THREE from 'three';
import { Reflector } from '../../vendor/three/Reflector.js';

const SHADER = {
  name: 'MarbleMirror',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uStrength: { value: 0.42 } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
    void main() { vUv = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; varying vec4 vUv; varying vec3 vW;
    void main() {
      vec4 r = texture2DProj(tDiffuse, vUv);
      vec3 V = normalize(cameraPosition - vW);
      float f = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
      float a = clamp(uStrength * (0.35 + 0.65 * f), 0.0, 0.85) * (1.0 - smoothstep(70.0, 230.0, distance(vW, cameraPosition)));
      gl_FragColor = vec4(r.rgb, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function createMarbleMirror(scene) {
  const geo = new THREE.PlaneGeometry(480, 480);
  const w = Math.round(innerWidth * 0.7), h = Math.round(innerHeight * 0.7);
  const mir = new Reflector(geo, { shader: SHADER, textureWidth: w, textureHeight: h, clipBias: 0.003, multisample: 0 });
  mir.rotation.x = -Math.PI / 2;
  mir.position.set(0, 0.02, -40);
  mir.material.transparent = true; mir.material.depthWrite = false;
  mir.renderOrder = 5;
  scene.add(mir);
  return mir;
}
