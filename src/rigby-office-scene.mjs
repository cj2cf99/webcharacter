import {poseMagic} from './rigby-magic-scene.mjs';
import {ease,mix,pointMix} from './rigby-scene.mjs';
export const DURATION=28;
export const BEATS=[[0,'① 上班入场'],[5.5,'② 拉开椅子'],[7.5,'③ 坐下'],[11,'④ 开始写代码'],[15,'⑤ 又报错了'],[19,'⑥ 怀疑人生'],[24,'⑦ 修好了？']];
const ramp=(t,a,b)=>ease((t-a)/(b-a));
export function sceneAt(t){t=Math.max(0,Math.min(DURATION,t));const pull=ramp(t,4.4,6),sit=ramp(t,6.4,8),slide=ramp(t,8.3,9.5);return{t,pull,sit,slide,x:mix(-90,510,ramp(t,0,4))+mix(0,20,ramp(t,6,6.4))+90*slide,chair:600-70*pull+90*slide,typing:t>=10&&t<14||t>=21&&t<24||t>=26,stress:ramp(t,14,15)*(1-ramp(t,20,21)),beat:BEATS.findLastIndex(([at])=>t>=at)};}
function point(a,n,o=[0,0]){const p=a.world(n).apply(o);return[p[0],570-p[1]];}
function hand(a,side,p){const q=a.pose.placement.inverse().apply([p[0]-9.1,570-p[1]]);Object.assign(a.bone('ik_hand_'+side),{x:q[0],y:q[1]});a.pose.ik[a.sk.ik.findIndex(k=>k.name==='ik_hand_'+side)].mix=1;}
export function poseOffice(a,s){const {t,x,sit}=s;
 const base={t:t<4?4+t/2:17.5,x,y:0,crouch:0,ride:sit,flight:0,bonk:0,store:0,draw:0};poseMagic(a,base);
 a.bone('head').rotation+=s.stress*13;
 if(s.stress>.5)for(const side of ['l','r'])a.bone('eye_'+side).scale_y=.35;
 let left=[x+65,345],right=[x-55,340];
 if(t>=4&&t<6.4)left=pointMix(left,[s.chair-38,327],ramp(t,4,4.4)*(1-ramp(t,6,6.4)));
 const reach=ramp(t,9.5,10),tap=s.typing?Math.sin(t*31)*2:0;
 left=pointMix(left,[x+52,373+tap],reach);right=pointMix(right,[x+18,373-tap],reach);
 if(t>=16&&t<20.5)right=pointMix(right,[x-5,245],ramp(t,16,17)*(1-ramp(t,19.5,20.5)));
 hand(a,'l',left);hand(a,'r',right);a.pose.updateWorld(a.sk);
 for(const side of ['l','r'])a.bone('hand_'+side).rotation=-a.world('forearm_'+side).rotation();a.pose.updateWorld(a.sk);
 return {left:point(a,'hand_l',[65,0]),right:point(a,'hand_r',[65,0])};
}
