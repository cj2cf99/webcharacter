import {CompanionPlayer} from './companion-player.mjs';
import {BehaviorController} from './behavior-controller.mjs';
import {WINDOW_NODES} from './window-nodes.mjs';
// 使用与桌宠相同的动画控制器和画布播放器；仅预览，不写配置。
export class EffectPreview{
 constructor({canvas,label,getDraft,beforePlay}){this.canvas=canvas;this.label=label;this.getDraft=getDraft;this.beforePlay=beforePlay;this.audio=new Audio();this.audio.preload='none';this.token=0;this.running=false;this.timer=null;this.active=null;
 this.player=new CompanionPlayer(canvas,async id=>{const a=this.draft.assets.find(a=>a.id===id&&a.kind==='video');if(!a)throw Error('请选择有效动画');return a.url;},true);
 this.player.onEnded=()=>{this.clearTimer();if(!this.running)return;const c=this.draft.config.states[this.id];if(this.controller.phase==='exit'||(this.controller.phase==='single'&&(this.controller.stopping||c.play==='once'))){this.complete();return;}this.controller.ended();};
 this.player.onLoop=()=>{if(this.running){this.round++;this.show();this.speak();}};
 this.player.onError=e=>this.fail(e);
 }
 clearTimer(){clearTimeout(this.timer);this.timer=null;}
 silence(){this.clearTimer();this.audio.pause();this.audio.currentTime=0;this.active=null;}
 stop(text='已停止'){this.running=false;this.token++;this.player.hold();this.silence();this.label.textContent=text;}
 start(){this.stop();this.beforePlay();this.draft=this.getDraft();this.id=this.draft.selected;this.round=1;this.running=true;
 this.controller=new BehaviorController(this.draft.config,(id,phase)=>{if(id!==this.id){this.complete();return;}this.load(phase);});
 if(this.id==='hover')this.controller.over=true;if(this.id==='work')this.controller.work=true;if(this.id==='drag')this.controller.drag=true;if(this.id==='walk')this.controller.walk=true;
 if(WINDOW_NODES[this.id])this.controller.holds=()=>!this.controller.stopping;
 this.player.preserveAspect=true;
 this.controller.start(this.id);
 }
 show(){const names={single:'单段',enter:'进入',loop:'循环',exit:'退出'};this.label.textContent=names[this.controller.phase]+(this.controller.phase==='loop'?' · 第 '+this.round+' 轮':'');}
 async load(phase){const token=++this.token;this.clearTimer();this.label.textContent='加载中…';try{await this.player.load(this.draft.config.states[this.id].slots[phase]);if(token!==this.token||!this.running)return;this.player.loopBlend=!['hoverLoop','walk-loop'].includes(this.draft.config.states[this.id].slots[phase]);this.player.video.loop=this.controller.canNativeLoop();this.show();this.speak();}catch(e){if(token===this.token)this.fail(e);}}
 currentSound(){return this.getDraft().config.states[this.id]?.sound[this.controller.phase];}
 level(active=this.active){if(!active)return 0;const c=this.getDraft().config,s=c.states[active.id]?.sound[active.phase];return c.master.enabled&&s?.on?c.master.volume*s.volume/10000:0;}
 updateSound(){if(this.active){this.audio.volume=this.level();if(!this.audio.volume)this.silence();}}
 speak(){this.clearTimer();const s=this.currentSound(),resource=this.getDraft().assets.find(a=>a.kind==='audio'&&a.id===s?.voice),active={id:this.id,phase:this.controller.phase};if(!resource||!this.level(active))return;
 const start=()=>{this.timer=null;if(!this.running||!this.level(active))return;this.audio.pause();this.audio.src=resource.url;this.audio.loop=false;this.active=active;this.audio.volume=this.level();this.audio.play().catch(e=>{if(e.name!=='AbortError')this.label.textContent='声音失败，请检查资源';});};if(s.delay)this.timer=setTimeout(start,s.delay*1000);else start();}
 finish(){if(!this.running)return;this.controller.stopping=true;if(this.player.video)this.player.video.loop=false;const c=this.draft.config.states[this.id];if(c.force){this.label.textContent='等待当前段播完后结束';return;}if(c.mode==='triple'&&this.controller.phase!=='exit'){this.controller.phase='exit';this.controller.emit();}else if(c.mode==='single')this.complete();}
 complete(){this.running=false;this.token++;this.clearTimer();this.player.hold();this.label.textContent='播放完成';/* 无下一个声音时保留尾音 */}
 fail(e){this.stop('播放失败：'+e.message+'；可重新播放');}
 destroy(){this.stop();this.player.destroy();}
}
