import {referenceTurns} from './reference-turns.mjs';
// 同一组参数连续变形；任意切换从当前姿态开始，不替换整张图片。
export const poses = [
  {fan:0,raise:0,shield:0,front:0,dance:0},
  {fan:.65,raise:0,shield:1,front:1,dance:0},
  {fan:.82,raise:1,shield:.95,front:1,dance:.12},
  {fan:1,raise:.55,shield:1,front:1,dance:1},
];
export const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10)};
export function bodyMotion(p,t){
  // 双拍短跳，中间停顿；落地之后脚位置保持，避免正弦漂移。
  const phase=((t%.72)+.72)%.72,half=phase<.36?0:1,q=(phase-half*.36)/.36;
  const side=half===0?1:-1,flight=q<.32?Math.sin(q/.32*Math.PI):0,turn=smooth(q/.32);
  const x=(-side*7+side*14*turn)*p.dance,land=q>=.32&&q<.47?Math.sin((q-.32)/.15*Math.PI):0;
  const step=Math.floor(Math.max(0,t)/.36),path=[0,45,85,45,0,-45,-85,-45],group=Math.floor(step/4),old=group===0?path[0]:path[(group+path.length-1)%path.length],next=path[group%path.length];
  const travel=(step%4===0?old+(next-old)*turn:next)*(p.stride||0)*p.dance;
  const trackTime=((t%5.4)+5.4)%5.4;
  let a,b,s;if(trackTime<4.8){const i=Math.min(47,Math.floor(trackTime*10));a=referenceTurns[i];b=referenceTurns[i+1];s=smooth(trackTime*10-i);}else{a=referenceTurns.at(-1);b=referenceTurns[0];s=smooth((trackTime-4.8)/.6);}
  const roll=a[0]+(b[0]-a[0])*s,yaw=a[1]+(b[1]-a[1])*s;
  return {x:x+travel,y:(-flight*22+land*3)*p.dance+Math.sin((p.breathTime??t)*Math.PI*2/3.2)*.7*(1-p.dance)+(p.crouch||0)*6,roll:roll*p.dance,yaw:1+(yaw-1)*p.dance,
    feet:[{x:x+travel,y:-flight*17*p.dance},{x:x+travel,y:-flight*17*p.dance}],ruffle:flight*p.dance};
}
