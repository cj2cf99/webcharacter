const SCENES={apple:'rigby-validation.html',magic:'rigby-magic.html',office:'rigby-office.html'};
/** 同源可嵌入播放器。load 完成后调用播放接口，destroy 可重复调用。 */
export class CharacterPlayer extends EventTarget{
 constructor(container,{scene='office',baseURL=new URL('../',import.meta.url),assetBase,loop=false,speed=1}={}){
  super();if(!Number.isFinite(speed)||speed<.1||speed>4)throw RangeError('速度范围为 0.1–4');if(!SCENES[scene])throw Error('未知剧场');if(!(container instanceof HTMLElement))throw TypeError('需要 DOM 容器');
  this.container=container;this.url=new URL(SCENES[scene],baseURL);if(this.url.origin!==location.origin)throw Error('当前仅支持同源嵌入');this.url.searchParams.set('embed','1');if(assetBase)this.url.searchParams.set('assets',new URL(assetBase,this.url).href);
  this.options={loop,speed};this.frame=null;this.loaded=false;this.destroyed=false;this.status={time:0,playing:false};
  this.receive=e=>{if(e.source!==this.frame?.contentWindow||e.origin!==this.url.origin||e.data?.webcharacter!==1)return;const m=e.data;if(m.state)this.status=m.state;
   if(m.type==='ready'){this.loaded=true;clearTimeout(this.timeout);this.command('pause');this.setSpeed(this.options.speed);this.setLoop(this.options.loop);this.resolve?.(this);this.dispatchEvent(new Event('ready'));}
   else if(m.type==='error'){clearTimeout(this.timeout);this.reject?.(Error(m.message));this.dispatchEvent(new CustomEvent('error',{detail:m.message}));}
   else this.dispatchEvent(new CustomEvent(m.type,{detail:m}));
  };window.addEventListener('message',this.receive);
  this.observer=new ResizeObserver(()=>{if(this.loaded)this.command('resize');});this.observer.observe(container);
 }
 load(){if(this.destroyed)return Promise.reject(Error('播放器已销毁'));if(this.loaded)return Promise.resolve(this);if(this.pending)return this.pending;
  this.pending=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;this.frame=document.createElement('iframe');this.frame.title='网页角色动画';this.frame.style.cssText='display:block;width:100%;height:100%;border:0';this.frame.src=this.url.href;this.container.append(this.frame);this.timeout=setTimeout(()=>{this.pending=null;this.frame?.remove();this.frame=null;reject(Error('角色加载超时'));},15000);});
  this.pending.catch(()=>{this.pending=null;this.loaded=false;this.frame?.remove();this.frame=null;});return this.pending;
 }
 command(command,value){if(this.destroyed)throw Error('播放器已销毁');if(!this.loaded)throw Error('请先 await load()');this.frame.contentWindow.postMessage({webcharacter:1,command,value},this.url.origin);}
 play(){this.command('play');}pause(){this.command('pause');}replay(){this.command('replay');}
 seek(time){if(!Number.isFinite(time))throw TypeError('无效时间');this.command('seek',Math.max(0,time));}
 setSpeed(value){if(!Number.isFinite(value)||value<.1||value>4)throw RangeError('速度范围为 0.1–4');this.options.speed=value;this.command('speed',value);}
 setLoop(value){this.options.loop=Boolean(value);this.command('loop',Boolean(value));}
 resize(){this.command('resize');}
 destroy(){if(this.destroyed)return;if(this.loaded)this.command('destroy');this.destroyed=true;this.loaded=false;clearTimeout(this.timeout);this.observer.disconnect();window.removeEventListener('message',this.receive);this.frame?.remove();this.frame=null;this.reject?.(new DOMException('播放器已销毁','AbortError'));}
}
