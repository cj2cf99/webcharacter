// 共享Canvas视频渲染层；无Windows API、Agent或网络依赖。
export class CompanionPlayer {
  blend: HTMLCanvasElement | null = null;
  blendStart = 0;
  smooth = false;
  loopBlend = true;
  preserveAspect = false;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  video: HTMLVideoElement | null = null;
  url = '';
  ownsURL = false;
  generation = 0;
  frameId = 0;
  raf = 0;
  frames = 0;
  lastTime = -1;
  onFrame: (time: number, duration: number) => void = () => {};
  onEnded: () => void = () => {};
  onLoop: () => void = () => {};
  onError: (error: Error) => void = () => {};
  loader: (id: string) => Promise<Blob | string>;
  constructor(canvas: HTMLCanvasElement, loader: (id: string) => Promise<Blob | string>, smooth = false) {
    this.smooth=smooth;this.canvas=canvas; this.context=canvas.getContext('2d', {willReadFrequently:true})!; this.loader=loader;
  }
  captureBlend(){if(!this.smooth)return;this.blend=document.createElement('canvas');this.blend.width=this.canvas.width;this.blend.height=this.canvas.height;this.blend.getContext('2d')!.drawImage(this.canvas,0,0);this.blendStart=performance.now();}
  draw(source: CanvasImageSource) {
    // 一次覆盖整帧（含透明像素），不先提交清空画布。
    this.context.globalCompositeOperation='copy';
    const width=this.canvas.width,height=this.canvas.height;
    if(this.preserveAspect&&source instanceof HTMLVideoElement&&source.videoWidth&&source.videoHeight){
      const scale=Math.min(width/source.videoWidth,height/source.videoHeight);
      const w=source.videoWidth*scale,h=source.videoHeight*scale;
      this.context.drawImage(source,(width-w)/2,(height-h)/2,w,h);
    }else this.context.drawImage(source,0,0,width,height);
    this.context.globalCompositeOperation='source-over';
    if(this.blend){const a=1-(performance.now()-this.blendStart)/100;if(a>0){this.context.globalAlpha=a;this.context.drawImage(this.blend,0,0);this.context.globalAlpha=1;}else this.blend=null;}
  }
  hit(x: number,y: number) {
    const rect=this.canvas.getBoundingClientRect();
    const px=Math.floor((x-rect.left)*this.canvas.width/rect.width),py=Math.floor((y-rect.top)*this.canvas.height/rect.height);
    if(px<0||py<0||px>=this.canvas.width||py>=this.canvas.height)return false;
    return this.context.getImageData(px,py,1,1).data[3]>60;
  }
  stopDrawing() {
    if(this.frameId && this.video?.cancelVideoFrameCallback)this.video.cancelVideoFrameCallback(this.frameId);
    cancelAnimationFrame(this.raf);this.frameId=0;this.raf=0;
  }
  watch(token: number) {
    const video=this.video;if(!video||token!==this.generation||video.paused)return;
    if(video.requestVideoFrameCallback){
      this.frameId=video.requestVideoFrameCallback(()=>{
        if(token!==this.generation||this.video!==video)return;
        if(video.currentTime!==this.lastTime){if(video.currentTime<this.lastTime){if(this.loopBlend)this.captureBlend();if(video.loop)this.onLoop();}this.draw(video);this.onFrame(video.currentTime,video.duration);this.frames++;this.lastTime=video.currentTime;}
        this.watch(token);
      });
    }else{
      this.raf=requestAnimationFrame(()=>{
        if(token!==this.generation)return;
        if(video.currentTime!==this.lastTime){if(video.currentTime<this.lastTime){if(this.loopBlend)this.captureBlend();if(video.loop)this.onLoop();}this.draw(video);this.onFrame(video.currentTime,video.duration);this.frames++;this.lastTime=video.currentTime;}
        this.watch(token);
      });
    }
  }
  async load(id: string) {
    const token=++this.generation;
    this.stopDrawing();this.video?.pause();
    const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
    let url='',owned=false;
    try {
      const resource=await this.loader(id);if(token!==this.generation)return;
      owned=typeof resource!=='string';url=owned?URL.createObjectURL(resource as Blob):resource as string;
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>{cleanup();reject(new Error('视频加载超时，可重试'));},10000);
        const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',ready);video.removeEventListener('error',failed);};
        const ready=()=>{cleanup();resolve();};
        const failed=()=>{cleanup();reject(new Error(`视频解码失败（${video.error?.code??'未知'}）`));};
        video.addEventListener('loadeddata',ready);video.addEventListener('error',failed);video.src=url;video.load();
      });
      if(token!==this.generation){video.removeAttribute('src');video.load();if(owned)URL.revokeObjectURL(url);return;}
      const old=this.video,oldURL=this.url,oldOwned=this.ownsURL;
      this.video=video;this.url=url;this.ownsURL=owned;
      if(old){old.removeAttribute('src');old.load();}if(oldURL&&oldOwned)URL.revokeObjectURL(oldURL);
      if(this.smooth){this.blend=document.createElement('canvas');this.blend.width=this.canvas.width;this.blend.height=this.canvas.height;this.blend.getContext('2d')!.drawImage(this.canvas,0,0);this.blendStart=performance.now();}
      this.lastTime=-1;this.draw(video);
      video.addEventListener('ended',()=>{if(token===this.generation){this.stopDrawing();this.onEnded();}});
      video.addEventListener('error',()=>{if(token===this.generation)this.onError(new Error('播放解码错误，可重试'));});
      await video.play();if(token===this.generation)this.watch(token);
    } catch(error) {
      if(video!==this.video){video.removeAttribute('src');video.load();if(url&&owned)URL.revokeObjectURL(url);}
      if(token===this.generation)throw error;
    }
  }
  pause(){this.video?.pause();this.stopDrawing();}
  // 最高优先级中断：取消旧加载/结束回调，同时保留当前Canvas画面。
  hold(){this.generation++;this.pause();}
  async resume(){if(this.video){await this.video.play();this.stopDrawing();this.watch(this.generation);}}
  destroy(){this.generation++;this.pause();this.video?.removeAttribute('src');this.video?.load();if(this.url&&this.ownsURL)URL.revokeObjectURL(this.url);this.url='';this.ownsURL=false;this.video=null;}
}
