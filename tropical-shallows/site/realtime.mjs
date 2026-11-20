import * as THREE from 'three';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';
import {mergeGeometries} from './vendor/three/BufferGeometryUtils.js';
import {createLivingScene,rippleGLSL} from './living-scene.mjs';
const $=id=>document.getElementById(id), canvas=$('view');
const clamp=THREE.MathUtils.clamp, DIR='assets/realtime/';
let renderer,scene,camera,staticTarget,reflectionTarget,sky,root,uniforms,metadata;
let dirty=true,disposed=false,raf=0,running=!matchMedia('(prefers-reduced-motion: reduce)').matches;
let clock=0,last=performance.now(),frames=0,statsAt=last,yaw=0,pitch=0,zoom=1;
let animations=[],ocean,filmData,failed=false;
const life=createLivingScene();let backdropAt=-100,shadowAt=-100,environment=null,tapStart=null;
const center=new THREE.Vector3(0,1.10,-10), origin=new THREE.Vector3(0,2.15,14);
const base=origin.clone().sub(center), pointers=new Map();let pinch=0;
function updateCamera(){
  const v=base.clone().applyAxisAngle(new THREE.Vector3(1,0,0),pitch).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).multiplyScalar(zoom);
  camera.position.copy(center).add(v);camera.lookAt(center);camera.updateMatrixWorld();dirty=true;
  canvas.dataset.yaw=yaw.toFixed(4);canvas.dataset.zoom=zoom.toFixed(4);
}
function resize(){
  if(!renderer)return;const w=canvas.clientWidth,h=canvas.clientHeight;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  const size=renderer.getDrawingBufferSize(new THREE.Vector2());
  staticTarget.setSize(size.x,size.y);reflectionTarget.setSize(Math.round(size.x*.65),Math.round(size.y*.65));
  if(uniforms)uniforms.screenSize.value.copy(size);dirty=true;
}
const vertex=`varying vec3 vWorld;varying vec4 vClip;varying vec4 vReflect;varying float vEdge;
uniform mat4 reflectionMatrix;attribute float edge;void main(){vEdge=edge;vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;vClip=projectionMatrix*viewMatrix*w;vReflect=reflectionMatrix*w;gl_Position=vClip;}`;
const fragment=`precision highp float;
uniform sampler2D backdrop;uniform sampler2D depths;uniform sampler2D reflected;uniform sampler2D skyMap;
uniform mat4 inverseProjection;uniform mat4 cameraWorld;uniform vec2 screenSize;uniform float time;uniform float film;
${rippleGLSL}
varying vec3 vWorld;varying vec4 vClip;varying vec4 vReflect;varying float vEdge;
vec3 worldFromDepth(vec2 uv,float d){vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return (cameraWorld*vec4(p.xyz/p.w,1.)).xyz;}
void main(){
 vec2 uv=vClip.xy/vClip.w*.5+.5;
 vec2 q=vWorld.xz;float t=time;
 float ripple=sin(q.x*12.+q.y*8.-t*2.8)+.45*sin(q.x*29.-q.y*19.+t*3.7);
 vec3 tapRipple=rippleNormal(q,t);
 vec3 n=normalize(vec3(.035*cos(q.x*12.+q.y*8.-t*2.8)+.012*cos(q.y*37.+t*4.),1.,.025*cos(q.y*17.-q.x*11.-t*2.4))+vec3(tapRipple.x,0.,tapRipple.z));
 vec3 view=normalize(cameraPosition-vWorld);if(dot(n,view)<0.)n=-n;
 float deep=texture2D(depths,uv).x;vec3 bed=worldFromDepth(uv,deep);
 float thickness=clamp(vWorld.y-bed.y,0.,8.);
 vec2 bend=n.xz*.006*min(1.,thickness*2.);vec2 under=clamp(uv+bend,vec2(.001),vec2(.999));
 if(worldFromDepth(under,texture2D(depths,under).x).y>vWorld.y+.02)under=uv;
 vec3 transmitted=texture2D(backdrop,under).rgb;
 vec3 absorb=exp(-thickness*vec3(.72,.18,.10));
 vec3 water=transmitted*absorb+vec3(.025,.36,.42)*(1.-absorb);
 float fresnel=.0204+.9796*pow(1.-max(dot(view,n),0.),5.);
 vec2 ruv=vReflect.xy/vReflect.w*.5+.5+n.xz*.018;
 vec3 reflection=texture2D(reflected,clamp(ruv,vec2(.001),vec2(.999))).rgb;
 float reflectWeight=fresnel*mix(.66,.36,film*vEdge);
 vec3 color=mix(water,reflection,reflectWeight);
 vec3 sun=normalize(vec3(-.80,.38,.45));
 float sparkle=pow(max(dot(n,normalize(view+sun)),0.),210.)*.9;
 color+=vec3(1.,.86,.62)*sparkle*(.65+.35*ripple);
 color+=vec3(.45,.65,.62)*tapRipple.y*6.;
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const foamVertex=`varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`;
const foamFragment=`uniform float amount;uniform float time;varying vec3 wp;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec2 p=wp.xz*46.;float bubble=length(fract(p)-.5);float noise=h(floor(p));float a=smoothstep(.48,.30,bubble)*smoothstep(.2,.7,noise)*amount*.8;if(a<.035)discard;gl_FragColor=vec4(vec3(.88,.94,.91),a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
function strength(keys,frame){for(let i=1;i<keys.length;i++){if(frame<=keys[i][0]){const a=keys[i-1],b=keys[i];return THREE.MathUtils.lerp(a[1],b[1],(frame-a[0])/(b[0]-a[0]));}}return keys.at(-1)[1];}
function updateMotion(t){
 const f=(t%6)/.2,lo=Math.floor(f),hi=Math.min(30,lo+1),a=f-lo;
 for(const item of animations){
  const {definition:d,positions:pos,source:s,mesh}=item;
  if(d.frameCount>1){const stride=d.vertexCount*3;for(let k=0;k<stride;k++)pos[k]=s[lo*stride+k]*(1-a)+s[hi*stride+k]*a;mesh.geometry.attributes.position.needsUpdate=true;}
  if(item.strengthKeys)mesh.material.uniforms.amount.value=strength(item.strengthKeys,(t%6)*30+1);
 }
 if(ocean){
  const p=ocean.geometry.attributes.position.array,film=filmData.positions,cols=filmData.definition.columns;
  for(let j=0;j<ocean.userData.rows.length;j++){
   const y=ocean.userData.rows[j],r=clamp((y+17)/35*500,0,500),r0=Math.floor(r),r1=Math.ceil(r),a=r-r0;
   const rearX=film[r0*cols*3]*(1-a)+film[r1*cols*3]*a, rearH=film[r0*cols*3+1]*(1-a)+film[r1*cols*3+1]*a;
   const xEdge=y>=-17&&y<=18?rearX: y>18?rearX+(y-18)*.55:rearX;
   for(let i=0;i<=128;i++){
    const k=(j*129+i)*3,d=550*Math.pow(1-i/128,3),x=xEdge-d;
    const far=.078+.025*Math.sin(x*.8+y*.3-t*1.5)+.012*Math.sin(x*2.1-y*1.4-t*2.2);
    const mix=1-Math.exp(-d/2.5);
    p[k]=x;p[k+1]=rearH*(1-mix)+far*mix;p[k+2]=-y;
   }
  }ocean.geometry.attributes.position.needsUpdate=true;
 }
 uniforms.time.value=t;
}
function makeOcean(){
 const rows=[];for(let y=-100;y<-17;y+=5)rows.push(y);for(let i=0;i<=500;i+=2)rows.push(-17+i*35/500);for(let y=21;y<600;y+=8)rows.push(y);
 const geometry=new THREE.BufferGeometry(),positions=new Float32Array(rows.length*129*3),index=[];
 for(let j=0;j<rows.length-1;j++)for(let i=0;i<128;i++){const a=j*129+i;index.push(a,a+1,a+130,a,a+130,a+129);}
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('edge',new THREE.BufferAttribute(new Float32Array(rows.length*129),1));geometry.setIndex(index);
 ocean=new THREE.Mesh(geometry,new THREE.ShaderMaterial({uniforms:{...uniforms,film:{value:0}},vertexShader:vertex,fragmentShader:fragment,side:THREE.DoubleSide}));ocean.frustumCulled=false;ocean.userData.rows=rows;scene.add(ocean);
}
function renderBackdrop(){
 const water=animations.map(a=>a.mesh).concat(ocean);water.forEach(o=>o.visible=false);
 renderer.setRenderTarget(staticTarget);renderer.render(scene,camera);
 const reflection=camera.clone();reflection.position.y=.156-camera.position.y;
 const aim=center.clone();aim.y=.156-center.y;reflection.up.set(0,-1,0);reflection.lookAt(aim);reflection.updateMatrixWorld();
 uniforms.reflectionMatrix.value.multiplyMatrices(reflection.projectionMatrix,reflection.matrixWorldInverse);
 renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,1,0),-.078)];
 renderer.setRenderTarget(reflectionTarget);renderer.render(scene,reflection);
 renderer.clippingPlanes=[];renderer.setRenderTarget(null);water.forEach(o=>o.visible=true);
 uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);uniforms.cameraWorld.value.copy(camera.matrixWorld);dirty=false;
}
function loop(now){
 if(disposed)return;const dt=Math.min((now-last)/1000,.05);last=now;
 if(!document.hidden){if(running)clock+=dt;if(uniforms&&(running||dirty)){updateMotion(clock);life.update(clock);
    if(dirty||clock-backdropAt>=.125){if(clock-shadowAt>=.25){renderer.shadowMap.needsUpdate=true;shadowAt=clock;}renderBackdrop();backdropAt=clock;}
    renderer.render(scene,camera);frames++;}
  if(now-statsAt>1000){$('stats').textContent=running?`${Math.round(frames*1000/(now-statsAt))} FPS · 海风与潮汐`:'动态已暂停 · 可继续拖动';$('state').textContent=running?life.status():'已暂停';$('stats').dataset.triangles=renderer.info.render.triangles;canvas.dataset.waveTime=clock.toFixed(3);canvas.dataset.life=JSON.stringify(life.metrics());frames=0;statsAt=now;}}
 raf=requestAnimationFrame(loop);
}
async function init(){
 try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.93;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42.32,1,.06,1000);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  scene.add(new THREE.HemisphereLight(0xdceeff,0xaa9470,1.10));
  const sun=new THREE.DirectionalLight(0xffe4bd,3.65);sun.position.set(-34,22,26);sun.target.position.set(0,0,-4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-23,right:23,top:27,bottom:-23,near:1,far:130});sun.shadow.bias=-.00010;sun.shadow.normalBias=.015;sun.shadow.radius=2;scene.add(sun,sun.target);
  staticTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType)});
  reflectionTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
  const manager=new THREE.LoadingManager();manager.onProgress=(url,done,total)=>{if(!failed)$('loading-text').textContent=`正在加载三维资源 ${done}/${total}`;};
  const [gltf,skyTex,config,motion,bytes,birdRig]=await Promise.all([
   new GLTFLoader(manager).loadAsync(DIR+'shore.glb',e=>{if(e.total)$('loading-text').textContent=`正在加载模型 ${Math.round(e.loaded/e.total*100)}%`;}),
   new THREE.TextureLoader(manager).loadAsync(DIR+'sky.jpg'),fetch(DIR+'scene.json').then(r=>{if(!r.ok)throw Error('场景资源尚未就绪');return r.json();}),
   fetch(DIR+'swash-motion.json').then(r=>r.json()),fetch(DIR+'swash-motion.bin').then(r=>r.arrayBuffer()),fetch(DIR+'bird-rig.json').then(r=>{if(!r.ok)throw Error('鸟头颈权重未就绪');return r.json();})]);
  life.setAnatomy(birdRig);
  metadata=config;camera.fov=config.fovY;camera.updateProjectionMatrix();
  sky=skyTex;sky.mapping=THREE.EquirectangularReflectionMapping;sky.colorSpace=THREE.SRGBColorSpace;scene.background=sky;scene.backgroundRotation.y=-1.65;
  const pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromEquirectangular(sky);scene.environment=environment.texture;scene.environmentRotation.y=-1.65;pmrem.dispose();
  root=gltf.scene;scene.add(root);const materialCache=new Map();
  root.traverse(obj=>{if(!obj.isMesh)return;const source=Array.isArray(obj.material)?obj.material:[obj.material];obj.material=source.map(m=>{
   if(materialCache.has(m.uuid))return materialCache.get(m.uuid);
   const baked=new THREE.MeshStandardMaterial({map:m.map,alphaMap:m.alphaMap,vertexColors:true,side:THREE.DoubleSide,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,roughness:.83,metalness:0});
   if(m.alphaMap||m.alphaTest>0){baked.alphaTest=.4;baked.transparent=false;}
   life.decorate(baked,m.name,config.colorEncoding,config.colorScale);materialCache.set(m.uuid,baked);m.dispose();return baked;});if(!Array.isArray(obj.material)||obj.material.length===1)obj.material=obj.material[0];obj.geometry.computeVertexNormals();obj.castShadow=true;obj.receiveShadow=true;});
  // 同材质静态部分合并绘制；烘焙光照已固定，不需要逐物件更新。
  root.updateMatrixWorld(true);const batches=new Map(),oldGeometry=new Set();
  root.traverse(obj=>{if(!obj.isMesh||Array.isArray(obj.material))return;const signature=Object.entries(obj.geometry.attributes).map(([k,a])=>k+':'+a.itemSize+':'+a.normalized).sort().join(',');const key=obj.material.uuid+signature+Boolean(obj.geometry.index);
   if(!batches.has(key))batches.set(key,{material:obj.material,items:[],sources:[]});const batch=batches.get(key);batch.items.push(obj.geometry.clone().applyMatrix4(obj.matrixWorld));batch.sources.push(obj);});
  for(const batch of batches.values()){const geometry=batch.items.length===1?batch.items[0]:mergeGeometries(batch.items);if(batch.items.length>1)batch.items.forEach(g=>g.dispose());if(!geometry)continue;life.bindGeometry(geometry,batch.material);const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.customDepthMaterial=life.depthFor(batch.material);geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.35;scene.add(mesh);for(const old of batch.sources){old.removeFromParent();oldGeometry.add(old.geometry);}}
  oldGeometry.forEach(g=>g.dispose());
  uniforms={backdrop:{value:staticTarget.texture},depths:{value:staticTarget.depthTexture},reflected:{value:reflectionTarget.texture},skyMap:{value:sky},time:{value:0},lifeRipples:{value:life.ripples},screenSize:{value:new THREE.Vector2()},inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},reflectionMatrix:{value:new THREE.Matrix4()}};
  for(const d of motion.meshes){
   const source=new Float32Array(bytes,d.byteOffset,d.byteLength/4),pos=source.slice(0,d.vertexCount*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(d.indices);
   const edge=new Float32Array(d.vertexCount);for(let i=0;i<edge.length;i++)edge[i]=(i%d.columns)/(d.columns-1);geometry.setAttribute('edge',new THREE.BufferAttribute(edge,1));
   const foam=d.name!=='film',material=foam?new THREE.ShaderMaterial({uniforms:{amount:{value:1},time:uniforms.time},vertexShader:foamVertex,fragmentShader:foamFragment,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}):new THREE.ShaderMaterial({uniforms:{...uniforms,film:{value:1}},vertexShader:vertex,fragmentShader:fragment,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=foam?2:1;scene.add(mesh);
   const item={definition:d,positions:pos,source,mesh,strengthKeys:motion.foamStrengthKeys[d.name]};animations.push(item);if(!foam)filmData=item;
  }
  life.setFilm(filmData);makeOcean();resize();updateCamera();updateMotion(0);life.update(0);renderBackdrop();renderer.render(scene,camera);
  $('loading').hidden=true;$('state').textContent='实时 3D';$('dot').className='playing';canvas.dataset.ready='true';toggleLabel();raf=requestAnimationFrame(loop);
 }catch(error){failed=true;console.error(error);$('loading-text').textContent=`场景加载失败：${error.message}`;$('retry').hidden=false;$('state').textContent='加载失败';}
}
function toggleLabel(){$('waves').textContent=running?'Ⅱ 暂停动态':'▷ 继续动态';$('waves').setAttribute('aria-pressed',String(running));$('dot').classList.toggle('playing',running);$('state').textContent=running?life.status():'已暂停';}
$('retry').onclick=()=>location.reload();$('reset').onclick=()=>{yaw=pitch=0;zoom=1;updateCamera();};$('waves').onclick=()=>{running=!running;if(!running&&renderer){dirty=true;renderer.shadowMap.needsUpdate=true;}toggleLabel();};
canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)tapStart={x:e.clientX,y:e.clientY,id:e.pointerId,moved:false};else if(tapStart)tapStart.moved=true;canvas.setPointerCapture(e.pointerId);if(pointers.size===2){const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!camera)return;if(tapStart&&Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>5)tapStart.moved=true;const prev=pointers.get(e.pointerId);if(pointers.size===1){yaw=clamp(yaw-(e.clientX-prev.x)*.0015,-.175,.175);pitch=clamp(pitch-(e.clientY-prev.y)*.001,-.07,.07);}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=[...pointers.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);zoom=clamp(zoom*pinch/Math.max(distance,1),.85,1.15);pinch=distance;}updateCamera();});
canvas.addEventListener('pointerup',e=>{if(tapStart?.id===e.pointerId&&!tapStart.moved&&pointers.size===1&&running&&uniforms){const box=canvas.getBoundingClientRect();const kind=life.interact(new THREE.Vector2((e.clientX-box.left)/box.width*2-1,1-(e.clientY-box.top)/box.height*2),camera);if(kind){canvas.dataset.interaction=kind;canvas.dataset.interactionAt=clock.toFixed(3);$('state').textContent=life.status();}}tapStart=null;});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>pointers.delete(e.pointerId));
canvas.addEventListener('keydown',e=>{if(e.key==='Enter'&&running&&uniforms){e.preventDefault();const kind=life.interact(new THREE.Vector2(-.58,-.24),camera);if(kind){canvas.dataset.interaction=kind;canvas.dataset.interactionAt=clock.toFixed(3);$('state').textContent=life.status();}}});
canvas.addEventListener('wheel',e=>{e.preventDefault();if(!camera)return;zoom=clamp(zoom*Math.exp(e.deltaY*.0006),.85,1.15);updateCamera();},{passive:false});
canvas.addEventListener('keydown',e=>{if(!camera)return;const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','+','-','='];if(!keys.includes(e.key))return;e.preventDefault();if(e.key==='Home'){yaw=pitch=0;zoom=1;}if(e.key==='ArrowLeft')yaw=clamp(yaw-.025,-.175,.175);if(e.key==='ArrowRight')yaw=clamp(yaw+.025,-.175,.175);if(e.key==='ArrowUp')pitch=clamp(pitch-.015,-.07,.07);if(e.key==='ArrowDown')pitch=clamp(pitch+.015,-.07,.07);if(e.key==='+'||e.key==='=')zoom=clamp(zoom-.025,.85,1.15);if(e.key==='-')zoom=clamp(zoom+.025,.85,1.15);updateCamera();});
addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{last=performance.now();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);$('loading').hidden=false;$('loading-text').textContent='图形上下文已中断，请重新加载';$('retry').hidden=false;});
addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(raf);scene?.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});life.dispose();environment?.dispose();sky?.dispose();staticTarget?.dispose();reflectionTarget?.dispose();renderer?.dispose();},{once:true});
init();
