import {prepareSeatedDress,deformSeatedDress} from './rigby-seated-dress.mjs';
import {Affine} from '../vendor/rigby2d/src/core/index.js';
import {ease,mix,pointMix} from './rigby-scene.mjs';
export const DURATION=24;
export const BEATS=[[0,'准备'],[1.9,'① 书砸脑袋'],[3.5,'② 掉在旁边'],[5.4,'③ 走过去'],[8,'④ 蹲下捡书'],[11,'⑤ 收到身后'],[14.4,'⑥ 取出扫帚'],[17.5,'⑦ 淑女侧坐'],[19.5,'⑧ 飞走']];
const ramp=(t,a,b)=>ease((t-a)/(b-a));
export function sceneAt(t){
 t=Math.max(0,Math.min(DURATION,t));
 const crouch=ramp(t,6,7.8)*(1-ramp(t,8.7,10.2));
 const ride=ramp(t,15.5,17.5),flight=Math.max(0,Math.min(1,(t-18)/5))**2;
 return {t,crouch,ride,flight,x:mix(360,535,ramp(t,4,6))+850*flight,y:-400*flight,
 bonk: t>=1.8&&t<2.6?Math.sin((t-1.8)/.8*Math.PI):0,
 store:ramp(t,10.3,11.5),draw:ramp(t,12.5,14.5),
 beat:BEATS.findLastIndex(([at])=>t>=at),bookVisible:t<11.5,broomVisible:t>=13};
}
function point(a,n,o=[0,0]){const p=a.world(n).apply(o);return[p[0],570-p[1]];}
function target(a,n,p){const q=a.pose.placement.inverse().apply([p[0],570-p[1]]);Object.assign(a.bone(n),{x:q[0],y:q[1]});}
export function poseMagic(a,s){
 const {pose,sk}=a,{t,x,y,crouch:c,ride:r}=s;prepareSeatedDress(a);pose.reset(sk);
 pose.placement=new Affine(.14,0,0,.14,x,570-490-276*.14-y);
 a.bone('hip').y-=(100*c+35*r+9*s.bonk)/.14;
 a.bone('hip').rotation-=32*c+3*r;
 a.bone('head').rotation+=23*c+8*s.bonk+Math.sin(t*1.6)*1.3*(1-c);
 const walk=ramp(t,4,4.2)*(1-ramp(t,5.8,6));
 const blink=(t+.6)%4; const squint=blink>3.78?1-.9*Math.sin((blink-3.78)/.22*Math.PI):1;
 for(const [i,side] of ['l','r'].entries()){
  const foot=a.bone('ik_foot_'+side);

  foot.x+=c*55;
  pose.ik[sk.ik.findIndex(k=>k.name==='ik_foot_'+side)].bendPositive=false;
  pose.ik[sk.ik.findIndex(k=>k.name==='ik_foot_'+side)].mix=(1-r)*(1-walk);
  const swing=Math.sin((t-4)*Math.PI*3+i*Math.PI);
  a.bone('thigh_'+side).rotation+=swing*8*walk;
  a.bone('shin_'+side).rotation-=Math.max(0,swing)*7*walk;
  const thigh=a.bone('thigh_'+side);thigh.x+=170*r;thigh.y=mix(thigh.y,i?-15:-65,r);
  a.bone('eye_'+side).scale_y=s.bonk>.1?.12:squint;
 }
 pose.updateWorld(sk);
 // 步行脚掌保持原来的世界朝向，不随膝盖旋转而踢腿。
 if(walk>0){for(const side of ['l','r']){const n='foot_'+side;const delta=((-86-a.world(n).rotation()+540)%360)-180;a.bone(n).rotation+=delta*walk;}pose.updateWorld(sk);}
 // 双腿同侧：大腿向右放平、小腿并拢垂下；按顺序校正世界角度。
 for(const [i,side] of ['l','r'].entries())for(const [part,angle] of [['thigh',-19-i*3],['shin',-101-i*2+(a.seatControls?.legTilt??0)],['foot',-78]]){
  const n=part+'_'+side,delta=((angle-a.world(n).rotation()+540)%360)-180;
  a.bone(n).rotation+=delta*r;pose.updateWorld(sk);
 }
 deformSeatedDress(a,r,c,t);
 const rest=[x+65,345+y],ground=[625,469];
 let hand=pointMix(rest,ground,ramp(t,6.2,7.8));
 hand=pointMix(hand,[x+65,310+y],ramp(t,8.5,10.2));
 hand=pointMix(hand,[x-30,340+y],s.store);
 hand=pointMix(hand,[x+82,308+y],s.draw);
 hand=pointMix(hand,[x+65,367+y],r);
 if(t<6.2)hand=rest;
 target(a,'ik_hand_l',[hand[0]-9.1,hand[1]]);
 pose.ik[sk.ik.findIndex(k=>k.name==='ik_hand_l')].mix=1;
 if(r>0){target(a,'ik_hand_r',pointMix([x-56,340+y],[x+30,355+y],r));pose.ik[sk.ik.findIndex(k=>k.name==='ik_hand_r')].mix=r;pose.ik[sk.ik.findIndex(k=>k.name==='ik_hand_r')].bendPositive=true;}
 pose.updateWorld(sk);
 a.bone('hand_l').rotation=-a.world('forearm_l').rotation();
 if(r>0)a.bone('hand_r').rotation=mix(a.bone('hand_r').rotation,-a.world('forearm_r').rotation(),r);
 // 收纳时前臂和手切到躯干后面，避免穿过身体。
 if(t>10.8&&t<13.6){const back=pose.drawOrder.filter(i=>/upperarm_l|hand_l/.test(sk.slots[i].name));pose.drawOrder=[...back,...pose.drawOrder.filter(i=>!back.includes(i))];}
 pose.updateWorld(sk);
 a.palm=point(a,'hand_l',[65,0]);a.head=point(a,'head',[390,0]);
 let book;
 if(t<1.8){const u=Math.max(0,(t-.7)/1.1);book=[360,mix(-65,133,u*u)];}
 else if(t<3.4){const u=(t-1.8)/1.6;book=[mix(360,625,u),133-80*u+424*u*u];}
 else if(t<8)book=[625,477-(t<4?48*((t-3.4)/.6)*(1-(t-3.4)/.6):0)];
 else book=[a.palm[0],a.palm[1]+8];
 return {book,bookAngle:t<1.8?-.08:t<3.4?(t-1.8)*4:.08*(1-s.store),bookScale:1-ramp(t,11,11.5),bookBehind:t>10.8,
 broom:pointMix([a.palm[0]-75,a.palm[1]+6],[x+5,390+y],r),broomScale:ramp(t,13,14.2),broomAngle:mix(-.85,-.08,ramp(t,14,16)),handTarget:hand};
}
