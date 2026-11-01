// 页面内桥接：只接受直接父窗口、同源消息；每个 iframe 拥有独立状态。
export function connectPlayer(api){
 if(window.parent===window||!new URLSearchParams(location.search).has('embed'))return;
 const origin=location.origin,send=(type,detail={})=>parent.postMessage({webcharacter:1,type,...detail},origin);
 const style=document.createElement('style');style.textContent='html,body{margin:0!important;padding:0!important;background:transparent!important;overflow:hidden}main{margin:0!important;padding:0!important;max-width:none!important}header,.controls,.beats,.note,details,#error{display:none!important}.stage{border:0!important;border-radius:0!important;box-shadow:none!important;width:100%;height:100vh;aspect-ratio:auto}.caption{top:10px}';document.head.append(style);
 let disposed=false,last=performance.now(),completion=false,iteration=0,wasPlaying=false;
 const listener=e=>{if(e.source!==parent||e.origin!==origin||e.data?.webcharacter!==1||disposed)return;
  const {command,value}=e.data;
  try{switch(command){
   case 'play':api.play();wasPlaying=true;break;
   case 'pause':api.pause();break;
   case 'seek':api.pause();api.seek(value);last=api.state().time;wasPlaying=false;completion=false;break;
   case 'replay':api.replay();last=0;wasPlaying=true;completion=false;break;
   case 'speed':api.speed(value);break;
   case 'loop':api.loop(value);break;
   case 'resize':api.resize();break;
   case 'destroy':disposed=true;clearInterval(timer);window.removeEventListener('message',listener);api.destroy();return;
   default:return;
  }send('state',{state:api.state()});}catch(error){send('error',{message:error.message});}
 };
 window.addEventListener('message',listener);
 const timer=setInterval(()=>{const state=api.state();if(!document.hidden){if(state.time<last-.5&&state.loop){send('iteration',{iteration:++iteration});}if(state.time>=state.duration&&!state.loop&&!completion&&wasPlaying){completion=true;send('complete');}last=state.time;wasPlaying=state.playing;}send('state',{state});},100);
 last=api.state().time;send('ready',{state:api.state()});
}
export function playerError(error){if(parent!==window)parent.postMessage({webcharacter:1,type:'error',message:error.message},location.origin);}
export function assetURL(name){const base=new URLSearchParams(location.search).get('assets');return new URL(name,base?new URL(base,location.href):new URL('../assets/white/',import.meta.url));}

