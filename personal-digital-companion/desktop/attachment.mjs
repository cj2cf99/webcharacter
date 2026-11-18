import {HUMAN_PROFILES} from './attachment-human.mjs';
import elevator from '../assets/elevator-20261118/manifest.json' with {type:'json'};

const elevatorAssets = {enter:'elevator-enter', run:'elevator-run', exit:'elevator-exit'};
const [sourceWidth, sourceHeight] = elevator.canvas;
const [left, top, rightEdge, bottomEdge] = elevator.occupancyPixels;
const elevatorProfile = {
 label:'电梯上行', asset:elevatorAssets.enter, width:243, height:360,
 anchor:{x:elevator.anchorPixels[0]/sourceWidth,y:elevator.anchorPixels[1]/sourceHeight},
 occupancy:{x:left/sourceWidth,y:top/sourceHeight,width:(rightEdge-left)/sourceWidth,height:(bottomEdge-top)/sourceHeight}
};
export const ATTACHMENT_MODES={
 climb:elevatorProfile,
 sit:HUMAN_PROFILES['sit-idle'],
 lie:HUMAN_PROFILES['lie-idle']
};
const right=r=>r.x+r.width,bottom=r=>r.y+r.height;
const topAbove=Math.max(...Object.values(HUMAN_PROFILES).map(p=>(p.anchor.y-p.occupancy.y)*p.height));
const topLeft=Math.max(...Object.values(HUMAN_PROFILES).map(p=>(p.anchor.x-p.occupancy.x)*p.width));
const topRight=Math.max(...Object.values(HUMAN_PROFILES).map(p=>(p.occupancy.x+p.occupancy.width-p.anchor.x)*p.width));
const topBelow=Math.max(...Object.values(HUMAN_PROFILES).map(p=>(p.occupancy.y+p.occupancy.height-p.anchor.y)*p.height));
const epsilon=1e-6;
const topDropDistance=96; // DIP
const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
function covers(r,p){return p.x>=r.x&&p.x<right(r)&&p.y>=r.y&&p.y<bottom(r);}
export function attachmentPlacement(target,mode,edge,side,area,progress=0,profile=ATTACHMENT_MODES[mode],along=.5){
 const {width,height,occupancy:o}=profile,r=target.rect,anchor=side==='inside'&&profile.insideAnchor?profile.insideAnchor:profile.anchor;
 let posture='right',ax=anchor.x,ay=anchor.y,contact,travel=0;
 if(mode==='climb'){
  posture=edge==='left'?'left':'right';
  if(side==='inside')ax=edge==='left'?1-o.x-o.width:o.x+o.width;
  else if(edge==='left')ax=1-ax;
  const above=(ay-o.y)*height, below=(o.y+o.height-ay)*height;
  const endY=Math.max(r.y,area.y+above);
  const startY=Math.min(bottom(r),bottom(area))-below;
  travel=startY-endY;
  if(travel<=0)return null;
  const edgeX=edge==='left'?r.x:right(r);
  const visibleX=Math.max(area.x,Math.min(edgeX,right(area)));
  // Windows 的物理像素矩形转成逻辑像素时，贴屏边缘可能多出一格。
  if(Math.abs(edgeX-visibleX)>1)return null;
  contact={x:visibleX,y:startY-travel*progress};
 }else{
  // 顶部动作共享垂直活动范围，切换待机、特殊或过渡时不改变支撑位置。
  const edgeY=side==='outside'?r.y:Math.max(r.y,area.y)+topAbove;
  if(edgeY-topAbove<area.y-epsilon||edgeY+topBelow>bottom(area)+epsilon)return null;
  if(side==='inside'&&edgeY+topBelow>bottom(r)+epsilon)return null;
  const visibleLeft=Math.max(r.x,area.x),visibleRight=Math.min(right(r),right(area));
  const fitsAll=visibleRight-visibleLeft>=topLeft+topRight;
  const minX=visibleLeft+(fitsAll?topLeft:(ax-o.x)*width);
  const maxX=visibleRight-(fitsAll?topRight:(o.x+o.width-ax)*width);
  if(minX>maxX+epsilon)return null;
  contact={x:clamp(r.x+r.width*along,minX,maxX),y:edgeY};
 }
 const x=contact.x-ax*width,y=contact.y-ay*height;
 const ox=posture==='left'?1-o.x-o.width:o.x;
 const occupied={x:x+ox*width,y:y+o.y*height,width:o.width*width,height:o.height*height};
 if(occupied.x<area.x-epsilon||occupied.y<area.y-epsilon||right(occupied)>right(area)+epsilon||bottom(occupied)>bottom(area)+epsilon)return null;
 // 窗口侧的主体必须装得下；自然越界肢体由锚点/占用范围表达。
 if(mode!=='climb'&&(occupied.x<r.x-epsilon||right(occupied)>right(r)+epsilon))return null;
 if(side==='inside'&&(mode==='climb'?width>r.width:bottom(occupied)>bottom(r)))return null;
 return {x:Math.round(x),y:Math.round(y),width,height,posture,contact,side,mode,edge,asset:profile.asset,placeholder:profile.placeholder,label:profile.label,travel};
}
export class AttachmentController{
 constructor({areaFor,onPlace,onDetach,profiles=ATTACHMENT_MODES,transitions=HUMAN_PROFILES}){Object.assign(this,{areaFor,onPlace,onDetach,profiles,transitions});this.history=[];this.snapshot={windows:[],foreground:null};this.active=null;this.last=0;this.continuous=false;this.elevatorSequence=0;}
 update(snapshot,time){this.snapshot=snapshot;const activeWindow=snapshot.windows.find(w=>w.id===snapshot.foreground&&w.eligible);if(activeWindow){this.history=[activeWindow.id,...this.history.filter(id=>id!==activeWindow.id)].slice(0,64);}
  this.last=time;
  if(!this.active)return;
  this.refreshPlacement();
 }
 refreshPlacement(){
  if(!this.active)return;
  const target=this.snapshot.windows.find(w=>w.id===this.active.id),p=target&&this.place(target,this.active);
  if(p){
   if(!target.maximized)this.active.allowMaximized=false;
   this.active.side=p.side;this.onPlace(p,this.active);return;
  }
  this.acquire(this.active.mode,this.active.edge,this.active.id);
 }
 place(target,state,checkOcclusion=true){if(!target.eligible||target.minimized||target.maximized&&!state.allowMaximized)return null;
  const area=this.areaFor(target.rect),occluders=this.snapshot.windows.slice(0,this.snapshot.windows.findIndex(w=>w.id===target.id)).filter(w=>!w.minimized);
  // 已在内侧则保持，避免空间刚恢复时内外抖动。
  for(const side of state.side==='inside'?['inside']:['outside','inside']){
   const profile=state.transition?this.transitions[state.transition]:state.special?this.transitions[state.mode]:this.profiles[state.mode];
   const p=attachmentPlacement(target,state.mode,state.edge,side,area,state.progress,profile,state.along);if(p){p.transition=state.transition||null;p.special=!!state.special;}
   if(p&&state.elevator){
    p.asset=elevatorAssets[state.elevator.phase];
    p.elevator={id:state.elevator.id,phase:state.elevator.phase};
   }
   if(!p)continue;
   const contact={x:p.contact.x+(state.edge==='left'?1:state.edge==='right'?-1:0),y:p.contact.y+(state.mode==='climb'?0:1)};
   return checkOcclusion&&occluders.some(w=>covers(w.rect,contact))?null:p;
  }return null;
 }
 topDragAnchor(){
  const state=this.active;
  if(state?.edge!=='top')return null;
  const target=this.snapshot.windows.find(w=>w.id===state.id);
  const p=target&&this.place(target,state);
  return p?{id:state.id,x:p.contact.x-p.x,y:p.contact.y-p.y}:null;
 }
 releaseTopDrag(anchor,bounds){
  const state=this.active;
  if(state?.edge!=='top'||state.id!==anchor.id)return false;
  const target=this.snapshot.windows.find(w=>w.id===anchor.id);
  const current=target&&this.place(target,state);
  if(current){
   const r=target.rect;
   const x=bounds.x+anchor.x,y=bounds.y+anchor.y;
   const edgeX=clamp(x,r.x,right(r));
   // 内侧姿势使用现有的支撑线，避免原地释放也被判为拖远。
   if(Math.hypot(x-edgeX,y-current.contact.y)<=topDropDistance){
    const next={...state,along:(edgeX-r.x)/r.width};
    const p=this.place(target,next);
    if(p){next.side=p.side;this.active=next;this.onPlace(p,next);return true;}
   }
  }
  this.detach('drag-far');
  return false;
 }
 request(mode,edge='top'){
  // 菜单打开期间前台可能短暂变成系统菜单，使用最近观察到的应用窗口。
  const windows=this.snapshot.windows;
  const usable=w=>w?.eligible&&!w.minimized;
  const focused=windows.find(w=>w.id===this.snapshot.foreground&&usable(w));
  const target=focused??this.history.map(id=>windows.find(w=>w.id===id)).find(usable);
  this.requestFailure=null;
  if(!target&&!(this.active&&this.active.mode!=='climb'&&mode!=='climb')){
   this.requestFailure='no-window';
   return false;
  }
  if(this.acquire(mode,edge,null,false,target))return true;
  const placement=target&&this.place(target,{
   mode,edge,side:'outside',progress:0,allowMaximized:target.maximized
  },false);
  this.requestFailure=placement?'covered':'no-space';
  return false;
 }
 acquire(mode,edge='top',exclude=null,atBoundary=false,requestedTarget=null){if(!this.profiles[mode]||!(mode==='climb'?['left','right']:['top']).includes(edge))return false;
  if(!atBoundary&&exclude===null&&this.active&&['sit','lie'].includes(mode)&&['sit','lie'].includes(this.active.mode)){
   this.active.pending=this.active.mode===mode?null:mode;return true;
  }
  if(this.active&&['sit','lie'].includes(mode)&&['sit','lie'].includes(this.active.mode)&&this.active.mode!==mode&&exclude===null){
   const target=this.snapshot.windows.find(w=>w.id===this.active.id),state={...this.active,mode,edge,transition:this.active.mode+'-to-'+mode};
   if(target){const p=this.place(target,state);if(p){delete state.pending;delete state.special;state.side=p.side;this.active=state;this.onPlace(p,state);return true;}this.active.pending=null;return false;}
  }
  const order=requestedTarget?[requestedTarget.id]:[...new Set([...this.history,...this.snapshot.windows.filter(w=>w.eligible).map(w=>w.id)])];
  for(const id of order){
   if(id===exclude)continue;
   const target=this.snapshot.windows.find(w=>w.id===id);
   if(!target)continue;
   const state={id,mode,edge,side:'outside',progress:0,allowMaximized:!!(requestedTarget&&target.maximized)};
   if(mode==='climb')state.elevator={id:++this.elevatorSequence,phase:'enter',laps:0,cycles:0};
   const p=this.place(target,state);
   if(!p)continue;
   state.side=p.side;this.active=state;this.onPlace(p,state);return true;
  }
  if(!requestedTarget)this.detach('unavailable');
  return false;
 }
 elevatorPlayback(event){
  const state=this.active, ride=state?.elevator;
  if(!ride||event?.id!==ride.id||event.phase!==ride.phase)return;
  if(event.kind==='failed'){this.detach('unavailable');return;}
  if(ride.phase==='enter'&&event.kind==='ended'){
   const target=this.snapshot.windows.find(w=>w.id===state.id);
   const placement=target&&this.place(target,state);
   if(!placement){this.refreshPlacement();return;}
   ride.cycles=Math.max(1,Math.round(placement.travel/(80*elevator.clips.run.seconds)));
   ride.phase='run';
  }else if(ride.phase==='run'&&event.kind==='loop'){
   ride.laps++;
   state.progress=ride.laps/ride.cycles;
   if(ride.laps===ride.cycles)ride.phase='exit';
  }else if(ride.phase==='run'&&event.kind==='frame'&&Number.isFinite(event.progress)){
   const fraction=Math.max(0,Math.min(1,event.progress));
   state.progress=Math.max(state.progress,(ride.laps+fraction)/ride.cycles);
  }else if(ride.phase==='exit'&&event.kind==='ended'){
   const target=this.snapshot.windows.find(w=>w.id===state.id);
   if(target&&this.acquire('lie','top',null,false,target))return;
   this.detach('no-landing');return;
  }else return;
  this.refreshPlacement();
 }
 completeCycle(asset){if(!this.active||this.active.transition||this.active.special||this.profiles[this.active.mode]?.asset!==asset)return;const mode=this.active.pending;if(mode)this.acquire(mode,'top',null,true);}
 startSpecial(asset){if(!this.active||!this.transitions[this.active.mode]||this.active.transition||this.active.special||this.active.pending||this.profiles[this.active.mode]?.asset!==asset)return;
  const target=this.snapshot.windows.find(w=>w.id===this.active.id),state={...this.active,special:true};if(target){const p=this.place(target,state);if(p){this.active=state;this.onPlace(p,state);}}
 }
 finishSpecial(asset){if(!this.active?.special||this.transitions[this.active.mode]?.asset!==asset)return;delete this.active.special;const next=this.active.pending||(this.continuous?(this.active.mode==='lie'?'sit':'lie'):null);if(next){const mode=next;this.acquire(mode,'top',null,true);if(this.active?.transition)return;}this.update(this.snapshot,this.last);}
 finishTransition(asset){if(!this.active?.transition||this.transitions[this.active.transition]?.asset!==asset)return;delete this.active.transition;this.update(this.snapshot,this.last);}
 detach(reason='manual'){this.continuous=false;this.active=null;this.onDetach(reason);}
}
