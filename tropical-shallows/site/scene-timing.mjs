// 环境共享时间：退水后觅食、周期微风和受惊衰减。暂停时由宿主冻结时间。
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const reaction=(time,start)=>{const age=time-start;return age<0||age>8?0:(1-Math.exp(-age*18))*Math.exp(-age/1.45);};
export function sceneTiming(time,{bird=-100,crab=-100}={}){
  const phase=((time%6)+6)%6,alert=reaction(time,bird),withdraw=reaction(time,crab);
  const feeding=smooth(1.95,2.4,phase)*(1-smooth(4.55,4.95,phase));
  const peck=Math.pow(Math.max(0,Math.sin((phase-2.2)*Math.PI*1.38)),4)*feeding*(1-alert);
  const grooming=time%14,claw=grooming>10&&grooming<13?Math.sin((grooming-10)*Math.PI/3)**2:0;
  return {phase,wind:.68+.22*Math.sin(time*.47)+.10*Math.sin(time*.93+1.4),
    peck:.76*peck,body:.002*Math.sin(time*1.3)-.004*peck,
    birdAlert:alert,crabAlert:withdraw,antenna:.009*Math.sin(time*1.8)+.004*Math.sin(time*3.1),claw:.024*claw};
}
