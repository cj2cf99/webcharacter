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

// 圆心和半径均为素材归一化坐标。过渡片的轨迹按实际播放进度插值。
const standing=[.52,.19,.23,.16], working=[.50,.32,.22,.19], carried=[.59,.33,.22,.16];
const sitting=[.50,.245,.062,.083], lying=[.815,.365,.072,.085], riding=[.51,.49,.16,.115];
const headTracks={
 workLoop:[working],workIn:[standing,standing,working,working,working],workOut:[working,working,standing,standing,standing],
 dragLoop:[carried],dragIn:[standing,carried],dragOut:[carried,standing],
 'attachment-sit-idle':[sitting],'attachment-sit':[sitting,sitting,[.55,.255,.07,.09],sitting,sitting],
 'attachment-lie':[lying],'attachment-lie-idle':[lying],
 'attachment-lie-to-sit':[lying,[.72,.29,.07,.085],[.54,.21,.07,.085],sitting,sitting],
 'attachment-sit-to-lie':[sitting,sitting,[.68,.25,.07,.085],[.79,.32,.07,.085],lying],
 'elevator-run':[riding],'elevator-enter':[standing,standing,[.49,.14,.18,.125],riding,riding],
 'elevator-exit':[riding,riding,[.49,.14,.18,.125],[.45,.20,.22,.16],[.32,.20,.22,.16]]
};
export function isHeadPoint(rect,x,y,side,asset,progress=0,aspect=0){
 const w=aspect?Math.min(rect.width,rect.height*aspect):rect.width;
 const h=aspect?w/aspect:rect.height;
 if(w<=0||h<=0)return false;
 let u=(x-rect.left-(rect.width-w)/2)/w;
 const v=(y-rect.top-(rect.height-h)/2)/h;
 if(side==='left')u=1-u;
 const track=headTracks[asset];
 let region=standing;
 if(track){
   const t=Math.min(1,Math.max(0,Number.isFinite(progress)?progress:0))*(track.length-1);
   const i=Math.floor(t),next=track[Math.min(i+1,track.length-1)];
   region=track[i].map((value,k)=>value+(next[k]-value)*(t-i));
 }
 const [cx,cy,rx,ry]=region;
 return ((u-cx)/rx)**2+((v-cy)/ry)**2<=1;
}
