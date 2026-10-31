import {readSkeletonJson,Pose,Affine} from '../vendor/rigby2d/src/core/index.js';
import {ease,pointMix,mix} from './rigby-scene.mjs';
const SCALE=.14,FLOOR=490,BASE=276,H=570;
export function makeActor(json,flip,options={}){
  const sk=readSkeletonJson(json,'NILA').skeleton,pose=new Pose(sk);
  const ids=Object.fromEntries(sk.bones.map((b,i)=>[b.name,i]));
  return {sk,pose,ids,flip,x:0,options:{palmOffset:90,gaitScale:1,...options},bone:n=>pose.local[ids[n]],world:n=>pose.world[ids[n]]};
}
function target(a,name,p){const local=a.pose.placement.inverse().apply([p[0],H-p[1]]);Object.assign(a.bone(name),{x:local[0],y:local[1]});}
function worldPoint(a,name,offset=[0,0]){const p=a.world(name).apply(offset);return [p[0],H-p[1]];}
export function poseActor(a,x,s,index){
  const {pose,sk}=a;pose.reset(sk);a.x=x;
  pose.placement=new Affine(SCALE*a.flip,0,0,SCALE,x,H-FLOOR-BASE*SCALE);
  // 让脚底走在同一地面，腿部由 Rigby2D 的两段 IK 求解。
  const phase=(s.t-1)*Math.PI*2/0.75;
  const walk=s.walking?Math.min(1,(s.t-1)*6,(4-s.t)*6):0;
  a.bone('hip').y-=35*walk*a.options.gaitScale;
  for(const [i,side] of ['l','r'].entries()){
    const p=phase+i*Math.PI;
    if(a.options.walkStyle==='pseudo'&&walk>0){
      // 落地段向后匀速运动，抵消人物向前平移；抬脚段用弧线收回。
      const u=(((s.t-1)/.75+i*.5)%1+1)%1,stance=.55,half=83.48;
      const dx=u<stance?mix(half,-half,u/stance):mix(-half,half,ease((u-stance)/(1-stance)));
      const foot=a.bone('ik_foot_'+side);
      foot.x=mix(foot.x,foot.x*.55+dx,walk);
      foot.y+=u<stance?0:Math.sin((u-stance)/(1-stance)*Math.PI)*70*walk;
      pose.ik[sk.ik.findIndex(c=>c.name==='ik_foot_'+side)].bendPositive=false;
    }else{
      a.bone('ik_foot_'+side).x+=Math.cos(p)*135*walk*a.options.gaitScale;
      a.bone('ik_foot_'+side).y+=Math.max(0,Math.sin(p))*100*walk*a.options.gaitScale;
    }
    a.bone('upperarm_'+side).rotation+=Math.sin(p)*7*walk;
  }
  a.bone('head').rotation+=Math.sin(s.t*2)*1.2;
  if(a.options.walkStyle==='pseudo'){
    // 两个实例错开眨眼，时间拖动和重播保持确定性。
    const blink=(s.t+index*.8)%3.6;
    const openness=blink>3.35?1-.92*Math.sin((blink-3.35)/.25*Math.PI):1;
    for(const side of ['l','r'])if(a.ids['eye_'+side]!==undefined)a.bone('eye_'+side).scale_y=openness;
  }
  pose.updateWorld(sk);
  // 手掌的接触点与腕关节相隔 90 个模型单位；手掌水平朝向舞台中心。
  const rest=[x+a.flip*72,345], shared=[500,285];
  let palm=pointMix(rest,shared,s.reach);
  if(index===0) palm=pointMix(palm,rest,ease((s.t-6.1)/1));
  else {const mouth=worldPoint(a,'mouth');palm=pointMix(palm,mouth,s.eat);palm=pointMix(palm,rest,s.lower);}
  target(a,'ik_hand_l',[palm[0]-a.flip*a.options.palmOffset*SCALE,palm[1]]);
  pose.ik[sk.ik.findIndex(c=>c.name==='ik_hand_l')].mix=1;
  pose.updateWorld(sk);
  // 把手的局部旋转设为水平，避免苹果接触点随手腕扭转漂移。
  const parent=pose.applied[a.ids.forearm_l].rotation+pose.applied[a.ids.upperarm_l].rotation+pose.applied[a.ids.chest].rotation+pose.applied[a.ids.hip].rotation;
  a.bone('hand_l').rotation=-parent;
  const mouthSlot=sk.slots.findIndex(z=>z.name==='mouth');
  pose.attachment[mouthSlot]=index===1&&s.t>7.5&&s.t<9.25?'mouth_o':'mouth_smile';
  if(index===1)for(let i=0;i<sk.slots.length;i++)if((a.options.walkStyle==='pseudo'?/^torso$/:/torso|upperarm/).test(sk.slots[i].name))pose.color[i]=[.9,.77,1,1];
  pose.updateWorld(sk);
  a.palm=worldPoint(a,'hand_l',[a.options.palmOffset,0]);a.mouth=worldPoint(a,'mouth');
}
