// 以窗口中心和当前屏幕的DIP边界判断；中间三分之一是保持区。
export function screenPosture(windowBounds,screenBounds,current='right'){
 const x=windowBounds.x+windowBounds.width/2-screenBounds.x;
 if(x<screenBounds.width/3)return 'left';
 if(x>=screenBounds.width*2/3)return 'right';
 return current;
}
// CSS翻转不改变Canvas像素数据；命中位置必须反向映射。
export function postureHit(canvas,context,x,y,side){
 const rect=canvas.getBoundingClientRect();
 let px=Math.floor((x-rect.left)*canvas.width/rect.width);
 const py=Math.floor((y-rect.top)*canvas.height/rect.height);
 if(px<0||py<0||px>=canvas.width||py>=canvas.height)return false;
 if(side==='left')px=canvas.width-1-px;
 return context.getImageData(px,py,1,1).data[3]>60;
}
