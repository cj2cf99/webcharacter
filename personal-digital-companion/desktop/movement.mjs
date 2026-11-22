// 行走使用 Electron DIP；跨屏时用同一物理坐标系判断两个工作区是否连通。
// 源24fps：进入[7,27)的第3帧开始迈腿；退出[83,99)的第8帧站稳。
export const WALK_START_TIME=3/24;
export const WALK_SETTLE_TIME=8/24;
export const WALK_BRAKE_DISTANCE=180*WALK_SETTLE_TIME/2;
export function settlePosition(from,to,time,duration=WALK_SETTLE_TIME){const u=Math.max(0,Math.min(1,time/duration)),t=1-(1-u)**2;return {x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,done:u>=1};}
export const CORNER_TARGETS=[['top-left','左上'],['bottom-left','左下'],['top-right','右上'],['bottom-right','右下']];
export const MOVE_TARGETS=[...CORNER_TARGETS,['center','正中间']];
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

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Win32 按 Z 顺序给出可见窗口的物理像素边界。小浮窗不遮掉后面的全屏状态；
// 若上层普通最大化窗口已盖住工作区，则不把藏在它后面的全屏窗口计入。
export function fullscreenDisplays(displays,windows){
  const occupied=new Set();
  function covers(window,area){
    return window.x<=area.x+1 && window.y<=area.y+1 &&
      window.x+window.width>=area.x+area.width-1 && window.y+window.height>=area.y+area.height-1;
  }
  for(const display of displays){
    if(!display.physicalBounds)continue;
    const top=windows.find(window=>!window.minimized && covers(window,display.physicalArea));
    if(top && covers(top,display.physicalBounds))occupied.add(display.id);
  }
  return occupied;
}

export function displaySize(display,nominal){
  const grid=movementGrid(display.scaleFactor);
  return {
    width:snapMovement(nominal.width,grid),
    height:snapMovement(nominal.height,grid)
  };
}

export function displayPosition(point,display,size,contain=true){
  const area=display.workArea, origin=display.bounds||area, grid=movementGrid(display.scaleFactor);
  function aligned(value,start,span,length,base){
    const snapped=base+snapMovement(value-base,grid);
    if(!contain)return snapped;
    const end=start+span-length;
    const low=base+Math.ceil((start-base)/grid)*grid,high=base+Math.floor((end-base)/grid)*grid;
    return low<=high?clamp(snapped,low,high):clamp(snapped,start,end);
  }
  return {
    x:aligned(point.x,area.x,area.width,size.width,origin.x),
    y:aligned(point.y,area.y,area.height,size.height,origin.y)
  };
}

// 接缝两侧共享一个物理通道。窗口可以跨缝，但通道须容纳两屏中较大的物理窗口。
function crossing(from,to,nominal){
  const a=from.physicalArea||from.workArea,b=to.physicalArea||to.workArea;
  const fromSize=displaySize(from,nominal),toSize=displaySize(to,nominal);
  for(const [axis,along,across,span] of [['x','width','y','height'],['y','height','x','width']]){
    const forward=Math.abs(a[axis]+a[along]-b[axis])<=1;
    const backward=Math.abs(b[axis]+b[along]-a[axis])<=1;
    if(!forward&&!backward)continue;
    const low=Math.max(a[across],b[across]),high=Math.min(a[across]+a[span],b[across]+b[span]);
    const aScale=a[span]/from.workArea[span],bScale=b[span]/to.workArea[span];
    const reserve=Math.max(movementGrid(from.scaleFactor)*aScale,movementGrid(to.scaleFactor)*bScale);
    if(high-low<Math.max(fromSize[span]*aScale,toSize[span]*bScale)+2*reserve)continue;
    const middle=(low+high)/2;
    function point(display,physical,size,atEnd){
      const area=display.workArea,grid=movementGrid(display.scaleFactor);
      const center={
        [axis]:atEnd?area[axis]+area[along]-grid:area[axis]+grid,
        [across]:area[across]+(middle-physical[across])*area[span]/physical[span]
      };
      // 屏缝附近窗口有意跨在两屏之间，不能各自夹回到区内。
      return displayPosition({x:center.x-size.width/2,y:center.y-size.height/2},display,size,false);
    }
    return {from,to,exit:point(from,a,fromSize,forward),entry:point(to,b,toSize,!forward)};
  }
  return null;
}

export function displayRoutes(displays,start,nominal){
  const routes=new Map([[start.id,[]]]);
  const queue=[start];
  for(const from of queue){
    for(const to of displays){
      if(routes.has(to.id))continue;
      const edge=crossing(from,to,nominal);
      if(!edge)continue;
      routes.set(to.id,[...routes.get(from.id),edge]);
      queue.push(to);
    }
  }
  return routes;
}
