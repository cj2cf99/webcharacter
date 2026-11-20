import * as THREE from './vendor/three/three.module.min.js';
import {sceneTiming} from './scene-timing.mjs';

// 连续空间风场：同一点的叶片、叶柄和枝干得到同一位移，根部固定。
const deformGLSL=`
uniform float lifeTime;uniform vec4 lifeSpecies;uniform vec4 lifeWind;
uniform vec4 lifeTouch;
attribute float lifeFlora;
attribute float lifeHead;uniform vec3 lifeBirdPivot;
uniform vec4 lifeBird;uniform vec4 lifeCrab;
float lifeCoast(float y){return y<=3.?1.127+.447*y-.1396*y*y:1.212+.55*(y-3.);}
float lifeBed(vec3 p){float d=p.x-lifeCoast(-p.z);return .025+.069*clamp(d,0.,7.)+.092*min(d,0.);}
vec3 lifeDeform(vec3 p){
 vec3 q=p;
 if(lifeFlora>.5){
  float h=max(0.,p.y-max(.65,lifeBed(p)));
  float gust=lifeWind.x+.13*sin(lifeTime*.65-dot(p.xz,vec2(.055,.085)));
  float bend=min(.28,.014*h+.0015*h*h);
  q.x+=gust*bend;q.z+=gust*bend*.32;
  q.x+=.0015*sin(lifeTime*2.7+p.x*3.+p.z*2.)*smoothstep(.7,2.,h);
  float touchAge=lifeTime-lifeTouch.w;if(touchAge>0.&&touchAge<3.){vec3 d=p-lifeTouch.xyz;if(dot(d,d)<2.){float falloff=exp(-dot(d,d)/.40);float spring=.045*sin(touchAge*9.)*exp(-touchAge*2.0)*falloff*smoothstep(.1,1.,h);vec3 direction=d+vec3(.04,.13,.03);q+=direction/max(length(direction),.001)*spring;}}
 }
 if(lifeSpecies.y>.5&&p.x> -3.8&&p.x< -2.8&&p.z>4.4&&p.z<5.1&&p.y<.75){
  float angle=(lifeBird.x-.15*lifeBird.z)*lifeHead;vec2 d=p.xy-lifeBirdPivot.xy;
  q.xy=lifeBirdPivot.xy+mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*d;
  float planted=max(lifeHead,smoothstep(.095,.29,p.y));q.y+=(lifeBird.y+.008*lifeBird.z)*planted;
 }
 if(lifeSpecies.z>.5&&p.x>.95&&p.x<1.8&&p.z>8.15&&p.z<9.1){
  float upper=smoothstep(.53,.68,p.y);q.x+=.055*lifeCrab.z*upper;q.z-=.020*lifeCrab.z*upper;
  float antenna=smoothstep(.735,.94,p.y)*(1.-smoothstep(1.30,1.4,p.x));
  q.z+=lifeCrab.x*antenna;q.x+=lifeCrab.x*.4*antenna;
  float claw=(1.-smoothstep(1.25,1.32,p.x))*(1.-smoothstep(.65,.69,p.y))*smoothstep(8.60,8.68,p.z);
  q.y+=lifeCrab.y*claw;
 }
 return q;
}`;
const rotateNormal=`
if(lifeFlora>.5){float h=max(0.,position.y-max(.65,lifeBed(position)));float angle=lifeWind.x*min(.025,h*.003)+lifeSpecies.w*.022*sin(lifeTime*2.2+position.x*3.+position.z*2.);objectNormal.xy=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*objectNormal.xy;}
if(lifeHead>0.){float angle=(lifeBird.x-.15*lifeBird.z)*lifeHead;objectNormal.xy=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*objectNormal.xy;}
`;
const surfaceGLSL=`
uniform float lifeTime;uniform sampler2D lifeShore;varying vec3 lifeWorld;
float fineHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
`;

export function createLivingScene(){
  const events={bird:-100,crab:-100},ripples=Array.from({length:6},()=>new THREE.Vector4(0,0,-100,0));
  const profile=new Float32Array(501*4),shoreTexture=new THREE.DataTexture(profile,501,1,THREE.RGBAFormat,THREE.FloatType);
  shoreTexture.minFilter=shoreTexture.magFilter=THREE.NearestFilter;shoreTexture.needsUpdate=true;
  const shared={lifeTime:{value:0},lifeWind:{value:new THREE.Vector4()},lifeTouch:{value:new THREE.Vector4(0,0,0,-100)},lifeBird:{value:new THREE.Vector4()},lifeBirdPivot:{value:new THREE.Vector3(-3.41,.2844,4.7)},lifeCrab:{value:new THREE.Vector4()},lifeShore:{value:shoreTexture}};
  let index=0,film=null,maxFront=null,lastWet=false,lastBeak=0,labelUntil=-1,label='',now=0,sample=sceneTiming(0),pecks=0,footWashes=0;
  const depthCache=new Map();let windVertices=0,headVertices=0,anatomy={weights:{},beakTip:[-3.65,.2324,4.708]};
  function setAnatomy(data){anatomy=data;shared.lifeBirdPivot.value.fromArray(data.pivot);}
  function species(name){return new THREE.Vector4(
    /叶|椰干|island_tree|anthurium|鸡蛋花|花心金黄/.test(name)?1:0,
    /涉禽|黑眼|茅草0/.test(name)?1:0,
    /朱红寄居蟹|黑眼/.test(name)?1:0,
    /叶绿|leaves|近景照片叶面|anthurium/.test(name)?1:0);}
  function installVertex(shader,mask){
    Object.assign(shader.uniforms,shared,{lifeSpecies:{value:mask}});
    shader.vertexShader=deformGLSL+'\nvarying vec3 lifeWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=lifeDeform(transformed);lifeWorld=transformed;');
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n'+rotateNormal);
  }
  function decorate(material,name,colorEncoding,colorScale){
    const mask=species(name),sand=/浅奶油色珊瑚砂|近沙碎粒/.test(name),leaf=mask.w>.5;
    material.name=name;material.roughness=leaf?.52:/螺壳|朱红/.test(name)?.53:/玻璃/.test(name)?.23:.86;
    material.envMapIntensity=leaf?.25:.12;
    material.userData.lifeMask=mask;
    material.onBeforeCompile=shader=>{
      installVertex(shader,mask);
      shader.fragmentShader=surfaceGLSL+shader.fragmentShader;
      const decode=colorEncoding==='log8'?'diffuseColor.rgb=(exp(diffuseColor.rgb*4.17438727)-1.)/8.;':`diffuseColor.rgb*=${colorScale.toFixed(1)};`;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+decode+(sand?`
        float lum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(lum*1.12,lum*.98,lum*.78),.12)*1.05;
        float grain=fineHash(floor(lifeWorld.xz*460.))-.5;float detail=1.-smoothstep(.02,.08,length(fwidth(lifeWorld.xz)));diffuseColor.rgb*=1.+grain*.075*detail;
        vec4 shore=texture2D(lifeShore,vec2(clamp(((-lifeWorld.z+17.)/35.*500.+.5)/501.,.001,.999),.5));
        float wet=1.-smoothstep(shore.g-.04,shore.g+.08,lifeWorld.x);float submerged=(1.-smoothstep(.08,.18,lifeWorld.y))*wet;
        float a=sin(lifeWorld.x*15.+lifeWorld.z*11.+lifeTime*.9)+sin(lifeWorld.x*9.-lifeWorld.z*17.-lifeTime*.7);
        float caustic=pow(max(0.,1.-abs(a)*1.5),9.);diffuseColor.rgb*=1.+.12*caustic*submerged;
      `:''));
      if(sand)shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        vec4 wetProfile=texture2D(lifeShore,vec2(clamp(((-lifeWorld.z+17.)/35.*500.+.5)/501.,.001,.999),.5));
        float damp=(1.-smoothstep(wetProfile.a-.05,wetProfile.a+.12,lifeWorld.x));
        float currentWet=1.-smoothstep(wetProfile.g-.04,wetProfile.g+.08,lifeWorld.x);
        roughnessFactor=mix(roughnessFactor,.47,damp*.35+currentWet*.45);
      `);
      if(leaf)shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`outgoingLight+=diffuseColor.rgb*vec3(.055,.065,.025)*(1.-abs(normal.y))*.38;\n#include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>`living-4-${sand}-${leaf}`;
    return material;
  }
  function bindGeometry(geometry,material){
    const position=geometry.attributes.position,flags=new Uint8Array(position.count),head=new Uint8Array(position.count),all=material.userData.lifeMask.x>.5,sharedThatch=/茅草[01]/.test(material.name),bird=material.userData.lifeMask.y>.5;
    const palms=[[2.7,12,.2,10,-1.7,-.3],[6,17,.22,11,-1,.2],[11,15,.637,11,1,0],[0,18,.2,9,.7,-.3],[-1,22,.2,10,-1,-1],[13,22,.62,13,-1,0],[17,27,.825,13,0,1],[5,25,.2,11,1,1]];
    for(let i=0;i<position.count;i++){
      let flora=all;
      if(!flora&&sharedThatch){const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
        flora=z>1.6&&z<6.3&&y>3.8&&y<6.3&&x> -5.4&&x<1;
        if(!flora)for(let j=0;j<palms.length;j++){const [bx,by,bz,h,lx,ly]=palms[j],t=(y-bz)/h;if(t<0||t>1.06)continue;const cx=bx+lx*t*t-(j===0?.016*y*y:0),cz=-by-ly*t*t;if((x-cx)**2+(z-cz)**2<.40**2){flora=true;break;}}
      }
      flags[i]=flora?1:0;if(flora)windVertices++;
      if(bird&&position.getX(i)> -3.8&&position.getX(i)< -3.2&&position.getZ(i)>4.4&&position.getZ(i)<5.1){const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Math.round(v*10000)).join(',');head[i]=Math.round((anatomy.weights[key]||0)*255);if(head[i])headVertices++;}
    }
    geometry.setAttribute('lifeFlora',new THREE.BufferAttribute(flags,1));
    geometry.setAttribute('lifeHead',new THREE.BufferAttribute(head,1,true));
  }
  function depthFor(material){
    if(depthCache.has(material.uuid))return depthCache.get(material.uuid);
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:material.map,alphaMap:material.alphaMap,alphaTest:material.alphaTest,side:THREE.DoubleSide});
    depth.onBeforeCompile=shader=>installVertex(shader,material.userData.lifeMask||new THREE.Vector4());depth.customProgramCacheKey=()=> 'living-depth-4';depthCache.set(material.uuid,depth);return depth;
  }
  function setFilm(item){
    film=item;maxFront=new Float32Array(501);maxFront.fill(-Infinity);
    const d=item.definition,stride=d.vertexCount*3;
    for(let frame=0;frame<d.frameCount;frame++)for(let row=0;row<501;row++)maxFront[row]=Math.max(maxFront[row],item.source[frame*stride+(row*d.columns+d.columns-1)*3]);
  }
  function shoreAt(x,z){
    if(!film)return null;const {positions:p,definition:d}=film,row=THREE.MathUtils.clamp(Math.round((-z+17)/35*500),0,500),base=row*d.columns*3;
    const rear=p[base],front=p[base+(d.columns-1)*3];if(x<rear||x>front)return null;
    for(let c=1;c<d.columns;c++){const k=base+c*3;if(x<=p[k]){const a=(x-p[k-3])/Math.max(.00001,p[k]-p[k-3]);return {height:p[k-2]*(1-a)+p[k+1]*a,front};}}return null;
  }
  function ripple(x,z,strength=.65,delay=0){ripples[index%ripples.length].set(x,z,now+delay,strength);index++;}
  function update(t){
    now=t;sample=sceneTiming(t,events);shared.lifeTime.value=t;
    shared.lifeWind.value.set(sample.wind,0,0,0);shared.lifeBird.value.set(sample.peck,sample.body,sample.birdAlert,0);shared.lifeCrab.value.set(sample.antenna,sample.claw,sample.crabAlert,0);
    if(film){const p=film.positions,cols=film.definition.columns;for(let r=0;r<501;r++){const k=(r*cols+cols-1)*3;profile[r*4]=p[r*cols*3];profile[r*4+1]=p[k];profile[r*4+2]=p[k+1];profile[r*4+3]=maxFront[r];}shoreTexture.needsUpdate=true;
      const water=shoreAt(-3.25,4.7),wet=water&&water.height>.085;
      if(wet&&!lastWet){ripple(-3.25,4.7,.25);footWashes++;}lastWet=Boolean(wet);
      if(sample.peck>.68&&lastBeak<=.68){pecks++;const angle=sample.peck,pivot=shared.lifeBirdPivot.value,dx=anatomy.beakTip[0]-pivot.x,dy=anatomy.beakTip[1]-pivot.y,x=pivot.x+Math.cos(angle)*dx-Math.sin(angle)*dy,y=pivot.y+Math.sin(angle)*dx+Math.cos(angle)*dy;const at=shoreAt(x,anatomy.beakTip[2]);if(at&&y<at.height+.025)ripple(x,anatomy.beakTip[2],.22);}lastBeak=sample.peck;
    }
    return sample;
  }
  const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.078),hit=new THREE.Vector3();
  function interact(ndc,camera){
    for(const [kind,p] of [['crab',new THREE.Vector3(1.43,.73,8.6)],['bird',new THREE.Vector3(-3.35,.34,4.7)]]){
      const projected=p.project(camera);if(Math.hypot((projected.x-ndc.x)*camera.aspect,projected.y-ndc.y)<.105){events[kind]=now;label=kind==='crab'?'寄居蟹缩回壳口':'滨鹬抬头观察';labelUntil=now+2.5;return kind;}
    }
    ray.setFromCamera(ndc,camera);
    let leafHit=null;for(const c of [[1.008,1.646,11.936],[1.296,2.126,11.504],[1.056,2.654,11.12],[1.584,3.182,10.544],[.96,2.942,10.544]]){const p=ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(...c),.36),new THREE.Vector3());if(p&&(!leafHit||p.distanceTo(camera.position)<leafHit.distanceTo(camera.position)))leafHit=p;}
    if(leafHit){shared.lifeTouch.value.set(leafHit.x,leafHit.y,leafHit.z,now);label='花叶轻轻回弹';labelUntil=now+2.5;return 'foliage';}
    if(!ray.ray.intersectPlane(plane,hit))return null;
    const sy=-hit.z,coast=sy<=3?1.127+.447*sy-.1396*sy*sy:1.212+.55*(sy-3),at=shoreAt(hit.x,hit.z);
    if(hit.x<coast-1.2||at){ripple(hit.x,hit.z,.85);ripple(hit.x,hit.z,.40,.18);if(hit.distanceTo(new THREE.Vector3(-3.25,.078,4.7))<1.6)events.bird=now;label='水面泛起涟漪';labelUntil=now+2;return 'water';}return null;
  }
  return {decorate,bindGeometry,depthFor,setFilm,setAnatomy,update,interact,shoreAt,ripples,shared,
    status:()=>now<labelUntil?label:'实时 3D',
    metrics:()=>({wind:sample.wind,peck:sample.peck,crabAlert:sample.crabAlert,ripples:ripples.filter(r=>now-r.z<3&&r.z<=now).length,windVertices,headVertices,leafTouch:now-shared.lifeTouch.value.w<3,pecks,footWashes}),
    dispose:()=>{shoreTexture.dispose();depthCache.forEach(m=>m.dispose());}};
}

export const rippleGLSL=`uniform vec4 lifeRipples[6];
vec3 rippleNormal(vec2 p,float time){vec3 n=vec3(0.);for(int i=0;i<6;i++){float age=time-lifeRipples[i].z;if(age>0.&&age<3.){vec2 delta=p-lifeRipples[i].xy;float d=length(delta);float ring=exp(-pow((d-age*.48)/.032,2.))*exp(-age*.95)*lifeRipples[i].w;vec2 direction=delta/max(d,.001);n.xz+=direction*ring*.10;n.y+=ring*.06;}}return n;}`;
