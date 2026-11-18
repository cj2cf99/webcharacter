// 节点目录与动画状态同名；新增动作时在这里登记，不建立额外调度系统。
export const SOUND_NODES=Object.freeze([
  {id:'idle',label:'基础待机',enabled:false,text:'原语音（已关闭）',file:'unified-zh.wav'},{id:'idle-special',label:'特殊待机',enabled:false,text:'原语音（已关闭）',file:'unified-zh.wav'},
  {id:'hover',label:'悬停进入',enabled:true,text:'诶呀',file:'nodes-20261118/hover.wav'},{id:'hover-loop',label:'悬停循环',enabled:true,text:'轻快笑声',file:'nodes-20261118/hover-loop.wav'},{id:'hover-exit',label:'悬停退出',enabled:true,text:'嗯',file:'nodes-20261118/hover-exit.wav'},
  {id:'click',label:'点击',enabled:true,text:'嗨，我在哦',file:'nodes-20261118/click.wav'},
  {id:'work-enter',label:'工作进入',enabled:true,text:'看我的',file:'nodes-20261118/work-enter.wav'},{id:'work-loop',label:'工作循环',enabled:false,text:'不说话',file:null},{id:'work-exit',label:'工作退出',enabled:true,text:'搞定，不愧是我',file:'nodes-20261118/work-exit.wav'},
  {id:'drag-enter',label:'拖拽进入',enabled:true,text:'诶，慢一点嘛',file:'nodes-20261118/drag-enter.wav'},{id:'drag-loop',label:'拖拽循环',enabled:false,text:'不说话',file:null},{id:'drag-exit',label:'拖拽退出',enabled:true,text:'呼，站稳啦',file:'nodes-20261118/drag-exit.wav'},
]);
export const DEFAULT_SOUND=Object.freeze({enabled:true,volume:50});
const validLevel=value=>value&&typeof value.enabled==='boolean'&&Number.isInteger(value.volume)&&value.volume>=0&&value.volume<=100;
export function validSound(value){return Boolean(validLevel(value)&&(value.nodes===undefined||(value.nodes&&typeof value.nodes==='object'&&!Array.isArray(value.nodes)&&Object.keys(value.nodes).every(id=>SOUND_NODES.some(node=>node.id===id)&&validLevel(value.nodes[id])))));}
// 兼容旧总开关/音量，缺少的节点按目录补齐；不改变旧版声音触发范围。
export function normalizeSound(value=DEFAULT_SOUND){
  const base=validSound(value)?value:DEFAULT_SOUND;
  return {enabled:base.enabled,volume:base.volume,nodes:Object.fromEntries(SOUND_NODES.map(node=>{const saved=base.nodes?.[node.id];return [node.id,{enabled:saved?.enabled??node.enabled,volume:saved?.volume??100}];}))};
}
export class CompanionSound{
  constructor(audio,resolveAudio=file=>'./voice/'+file){this.audio=audio;this.resolveAudio=resolveAudio;this.settings=normalizeSound();this.visible=true;this.lastState=null;this.activeNode=null;this.apply(this.settings);}
  stop(){this.audio.pause();this.audio.loop=false;this.audio.currentTime=0;this.activeNode=null;}
  level(id){const node=this.settings.nodes[id];return this.settings.enabled&&node?.enabled?this.settings.volume*node.volume/10000:0;}
  apply(value){if(!validSound(value))return;this.settings=normalizeSound(value);const level=this.activeNode?this.level(this.activeNode):this.settings.volume/100;this.audio.volume=level;if(!level)this.stop();}
  setVisible(value){this.visible=value;if(!value)this.stop();}
  async play(id='click'){
    const node=SOUND_NODES.find(node=>node.id===id);
    if(!this.visible||!node?.file||!this.level(id))return;
    this.stop();this.activeNode=id;this.audio.src=this.resolveAudio(node.file);this.audio.loop=false;this.audio.volume=this.level(id);
    try{await this.audio.play();}catch(error){if(error.name!=='AbortError')throw error;}
  }
  state(value,newCycle=false){const changed=value!==this.lastState;this.lastState=value;if(changed||newCycle)return this.play(value);}
}
