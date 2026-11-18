// 动画完成控制与输入意图分离；声音不参与结束门禁。
export class BehaviorController{
 constructor(config,play){this.config=config;this.play=play;this.current='idle';this.phase='single';this.over=false;this.work=false;this.drag=false;this.clickPending=false;this.specialPending=false;this.stopping=false;}
 start(id){this.current=id;this.phase=this.config.states[id].mode==='single'?'single':'enter';this.stopping=false;this.emit();}
 emit(){this.play(this.current,this.phase);}
 desired(){return this.drag?'drag':this.clickPending?'click':this.work?'work':this.over?'hover':this.specialPending?'special':'idle';}
 next(){const id=this.desired();if(id==='click')this.clickPending=false;if(id==='special')this.specialPending=false;this.start(id);}
 holds(){return this.current==='idle'?this.desired()==='idle':this.current==='hover'?this.over&&!this.work&&!this.drag&&!this.clickPending:this.current==='work'?this.work&&!this.drag&&!this.clickPending:this.current==='drag'?this.drag:false;}
 input(kind,value=true){if(kind==='click')this.clickPending=true;else this[kind]=value;const desired=this.desired();if(desired!==this.current){this.stopping=true;const s=this.config.states[this.current];if(s.force)return;if(this.drag){this.next();return;}if(s.mode==='triple'&&this.phase!=='exit'){this.phase='exit';this.emit();}else if(s.mode==='single')this.next();}}
 ended(){const s=this.config.states[this.current];if(this.phase==='exit'){this.next();return;}if(this.stopping||!this.holds()){
   if(s.mode==='triple'&&this.phase==='enter'&&!this.stopping&&['click','special'].includes(this.current)){this.phase='loop';this.emit();return;}
   if(s.mode==='triple'){this.phase='exit';this.emit();}else this.next();return;
 }
 if(this.phase==='enter'){this.phase='loop';this.emit();}else if(this.phase==='loop'||s.play==='loop')this.emit();
 // 单次持续型节点结束后定格，等待下一意图；事件型会走上面的next。
 }
 canNativeLoop(){const s=this.config.states[this.current];return !this.stopping&&((this.phase==='loop'&&!['click','special'].includes(this.current))||(this.phase==='single'&&s.play==='loop'));}
 reconfigure(config){this.config=config;let id=this.current;if(this.stopping||!this.holds()&&!['click','special'].includes(id))id=this.desired();this.start(id);}
}
