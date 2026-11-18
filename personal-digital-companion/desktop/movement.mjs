// 当前显示器工作区中的目标位置，使用 Electron DIP 坐标。
// 源24fps：进入[7,27)的第3帧开始迈腿；退出[83,99)的第8帧站稳。
export const WALK_START_TIME=3/24;
export const WALK_SETTLE_TIME=8/24;
export const WALK_BRAKE_DISTANCE=180*WALK_SETTLE_TIME/2;
export function settlePosition(from,to,time,duration=WALK_SETTLE_TIME){const u=Math.max(0,Math.min(1,time/duration)),t=1-(1-u)**2;return {x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,done:u>=1};}
export const MOVE_TARGETS=[['top-left','左上'],['bottom-left','左下'],['top-right','右上'],['bottom-right','右下'],['center','正中间']];
export function movementTarget(area,b,id){
 if(!MOVE_TARGETS.some(([key])=>key===id))throw Error('未知移动目标');
 const right=area.x+Math.max(0,area.width-b.width),bottom=area.y+Math.max(0,area.height-b.height);
 const x=id==='center'?area.x+(area.width-b.width)/2:id.endsWith('left')?area.x+16:right-16;
 const y=id==='center'?area.y+(area.height-b.height)/2:id.startsWith('top')?area.y+12:bottom-12;
 return {x:Math.round(Math.max(area.x,Math.min(right,x))),y:Math.round(Math.max(area.y,Math.min(bottom,y)))};
}
export function movementStep(from,to,seconds){
 const distance=Math.hypot(to.x-from.x,to.y-from.y),step=180*Math.max(0,Math.min(.1,seconds));
 if(distance<=step)return {...to,done:true};
 return {x:from.x+(to.x-from.x)*step/distance,y:from.y+(to.y-from.y)*step/distance,done:false};
}

// 使整数DIP坐标落在整数物理像素上，避免125%/150%等缩放下边缘舍入抖动。
export function movementGrid(scale=1){for(let n=1;n<=16;n++)if(Math.abs(n*scale-Math.round(n*scale))<1e-6)return n;return 1;}
export function snapMovement(value,grid){return Math.round(value/grid)*grid;}
