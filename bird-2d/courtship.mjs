// 连续求偶编排；形态参数是羽毛结构控制，不是四个固定动作的轮播。
import {poses,smooth} from './motion.mjs';
export const duration=32;
const rest={...poses[0],front:.85,bow:0,crouch:0,stride:0};
const keys=[
 [0,rest],[1.2,{...rest,front:1}],[2.8,{...rest,front:1}],
 [3.5,{...rest,front:1,crouch:.75,bow:-.19}],
 [4.4,{...rest,front:1,crouch:.25,shield:.15}],
 [6,{...rest,front:1,crouch:.25,shield:.15}],
 [6.5,{...poses[1],bow:-.07,crouch:0,stride:0}],
 [6.8,{...poses[2],bow:-.15,crouch:0,stride:0}],
 [7.15,{...poses[3],bow:0,crouch:0,stride:1}],
 [25.4,{...poses[3],bow:0,crouch:0,stride:1}],
 [26.3,{...poses[1],bow:0,crouch:0,stride:0}],
 [27.5,rest],[duration,rest],
];
export function sampleCourtship(seconds){
 const t=Math.max(0,Math.min(duration,seconds));let a=keys[0],b=keys[1];
 for(let i=0;i<keys.length-1;i++)if(t>=keys[i][0]){a=keys[i];b=keys[i+1];}
 const s=smooth((t-a[0])/(b[0]-a[0]));
 const p=Object.fromEntries(Object.keys(rest).map(k=>[k,(a[1][k]||0)+((b[1][k]||0)-(a[1][k]||0))*s]));
 let phase='观察 · 朝向镜头',clock=t<18.5?t-7.15:t<19.5?11.35:t-8.15;
 p.breathTime=t;
 if(t>=2.8&&t<4.4)phase='俯身 · 冠羽示意';
 else if(t>=4.4&&t<6){const u=(t-4.4)/1.6,flash=Math.sin(u*Math.PI*2)**2;p.shield=.15+.75*flash;p.fan=.13*flash;p.bow=-flash*.12;phase='亮胸 · 两次试探';}
 else if(t>=6&&t<6.5)phase='胸盾前推 · 披肩下垂';
 else if(t>=6.5&&t<6.8)phase='掀起披肩';
 else if(t>=6.8&&t<7.15)phase='扣合 · 藏头';
 else if(t>=7.15&&t<25.4){
   // 停拍安排在已落地的支撑段，避免把起跳中途变成悬浮慢动作。
   clock=t<18.5?t-7.15:t<19.5?11.35:t-8.15;
   if(t<12.6)phase='转向 · 短跳展示';
   else if(t<13.1){const u=(t-12.6)/.5;p.fan=1-.006*Math.sin(u*Math.PI);p.shield=1-.045*Math.sin(u*Math.PI);phase='披肩顿挫 · 再次亮胸';}
   else if(t<18.5)phase='双拍跳 · 沿树干挪步';
   else if(t<19.5)phase='停拍 · 注视镜头';
   else{const envelope=smooth((t-19.5)/.2)*smooth((25.4-t)/.2);p.shield=1-.025*envelope*Math.sin((t-19.5)*Math.PI/.36)**2;phase='转向追随 · 连续展示';}
 }
 else if(t>=25.4&&t<26.3)phase='松开披肩 · 回落';
 else if(t>=26.3&&t<27.5)phase='收羽 · 回望镜头';
 else if(t>=27.5)phase='停歇 · 呼吸';
 return{pose:p,clock,phase,time:t};
}
