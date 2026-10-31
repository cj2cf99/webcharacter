// 独立时间轴：任意跳转、重播都得到同一状态，不依赖上一次播放。
export const DURATION = 12;
export const clamp = x => Math.max(0, Math.min(1, x));
export const ease = x => { x=clamp(x); return x*x*(3-2*x); };
export const mix = (a,b,t) => a+(b-a)*t;
export const pointMix = (a,b,t) => a.map((v,i)=>mix(v,b[i],t));
export function sceneAt(t){
  t=Math.max(0,Math.min(DURATION,t));
  const approach=clamp((t-1)/3), reach=ease((t-4.1)/1.6), eat=ease((t-7)/2), lower=ease((t-9.3)/1.2);
  return {t,ax:mix(235,405,approach),bx:mix(765,595,approach),walking:t>1&&t<4,reach,eat,lower,
    owner:t<6?'A':t<9?'B':null,
    phase:t<1?'准备见面':t<4?'① 两个人走近':t<6?'② A：请你吃苹果！':t<7?'③ B：谢谢，我接住啦。':t<9?'④ 张圆嘴巴，送到面前':t<10.5?'⑤ 啊呜！苹果吃掉了。':'完成 · 可以重播或拖动进度',
    beat:t<4?0:t<6?1:t<7?2:t<9?3:4};
}
