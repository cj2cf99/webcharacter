import {readFileSync,writeFileSync,renameSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,extname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {SOUND_NODES,normalizeSound} from './sound.mjs';
import {WINDOW_NODES} from './window-nodes.mjs';
const ordinaryStates=['idle','special','hover','click','work','drag','walk'];
export const STATE_IDS=[...ordinaryStates,...Object.keys(WINDOW_NODES)];
export const PHASES=['single','enter','loop','exit'];
const mapping={idle:'idle',special:'idle-special',hoverIn:'hover',hoverLoop:'hover-loop',hoverOut:'hover-exit',click:'click',workIn:'work-enter',workLoop:'work-loop',workOut:'work-exit',dragIn:'drag-enter',dragLoop:'drag-loop',dragOut:'drag-exit'};
const names={idle:'基础待机',special:'特殊待机',hoverIn:'悬停 · 进入',hoverLoop:'悬停 · 循环',hoverOut:'悬停 · 退出',click:'点击',workIn:'工作 · 进入',workLoop:'工作 · 循环',workOut:'工作 · 退出',dragIn:'拖拽 · 进入',dragLoop:'拖拽 · 循环',dragOut:'拖拽 · 退出'};
export function defaults(old){
  const sound=normalizeSound(old);
  const states=Object.fromEntries(ordinaryStates.map(id=>[id,{mode:['hover','work','drag'].includes(id)?'triple':'single',force:false,play:id==='idle'?'loop':'once',slots:{single:({hover:'hoverIn',work:'workIn',drag:'dragIn'})[id]||id,enter:id+'In',loop:id+'Loop',exit:id+'Out'},sound:Object.fromEntries(PHASES.map(p=>{
    const node=id==='special'?'idle-special':p==='single'?({hover:'hover',work:'work-enter',drag:'drag-enter'})[id]||id:p==='enter'&&id==='hover'?'hover':id+'-'+p;
    const v=SOUND_NODES.find(n=>n.id===node),saved=sound.nodes[node];
    return [p,{on:saved?.enabled??false,volume:saved?.volume??100,voice:v?.file?'voice:'+node:'',delay:0}];
  }))}]));
  states.walk={mode:'triple',force:true,play:'loop',slots:{single:'walk-loop',enter:'walk-enter',loop:'walk-loop',exit:'walk-exit'},sound:Object.fromEntries(PHASES.map(p=>[p,{on:['enter','exit'].includes(p),volume:100,voice:['enter','exit'].includes(p)?'voice:walk-'+p:'',delay:0}]))};
  for(const [id,node] of Object.entries(WINDOW_NODES)){
    states[id]={mode:node.mode,force:true,play:node.play,slots:{...node.slots},
      sound:Object.fromEntries(PHASES.map(phase=>[phase,{on:false,volume:100,voice:'',delay:0}]))};
  }
  return {version:1,target:'pc',idleSpecialDelaySeconds:60,confineToScreen:false,master:{enabled:sound.enabled,volume:sound.volume},states};
}
export class SettingsStore{
  constructor(profile,bundle,old){
    this.profile=profile;this.bundle=bundle;this.file=resolve(profile,'pc-behavior-settings.json');mkdirSync(profile,{recursive:true});
    const clips=JSON.parse(readFileSync(resolve(bundle,'clip-catalog.json'),'utf8'));
    this.builtins=Object.entries(mapping).map(([id,key])=>({id,name:names[id],kind:'video',url:pathToFileURL(resolve(bundle,clips[key].normal)).href,compact:clips[key].compact?pathToFileURL(resolve(bundle,clips[key].compact)).href:null}));
    this.builtins.push(...SOUND_NODES.filter(n=>n.file).map(n=>({id:'voice:'+n.id,name:n.label+' · '+n.text,kind:'audio',url:pathToFileURL(resolve(bundle,'voice',n.file)).href})));
    this.builtins.push(...[
      ['laugh-soft','✓ 已认可 · 停顿轻笑'],
      ['greeting-dear','✓ 已认可 · 亲爱的，我在哦'],
      ['laugh-bell-v3','✓ 已认可 · 轻笑 A（原版）'],
    ].map(([id,name])=>({id:'voice:'+id,name,kind:'audio',url:pathToFileURL(resolve(bundle,'voice/nodes-20261118',id+'.wav')).href})));
    this.builtins.push(...['enter','loop','exit'].map((p,i)=>({id:'walk-'+p,name:'行走 · '+['进入','循环','退出'][i],kind:'video',url:pathToFileURL(resolve(bundle,'walk/walk-'+p+'.webm')).href,compact:pathToFileURL(resolve(bundle,'walk/compact/walk-'+p+'.webm')).href})));
    this.builtins.push(...[['enter','我要出发咯～'],['exit','到啦']].map(([p,text])=>({id:'voice:walk-'+p,name:'行走 · '+text,kind:'audio',url:pathToFileURL(resolve(bundle,'walk/walk-'+p+'.wav')).href})));
    this.builtins.push(...[['lie-idle','上沿 · 真人卧姿待机循环'],['sit-idle','上沿 · 真人坐姿待机循环'],['lie','上沿 · 真人卧姿特殊动作'],['sit','上沿 · 真人坐姿特殊动作'],['lie-to-sit','上沿 · 侧卧 → 坐姿'],['sit-to-lie','上沿 · 坐姿 → 侧卧']].map(([id,name])=>({id:'attachment-'+id,name,kind:'video',url:pathToFileURL(resolve(bundle,'attachment-human',id+'.webm')).href})));
    this.builtins.push(...[['enter','进入电梯'],['run','电梯运行中'],['exit','离开电梯']].map(([phase,name])=>({id:'elevator-'+phase,name,kind:'video',url:pathToFileURL(resolve(bundle,'elevator',phase+'.webm')).href})));
    this.data={idleTimingVersion:2,config:defaults(old),custom:[],names:{}};
    if(existsSync(this.file)){
      const saved=JSON.parse(readFileSync(this.file,'utf8'));
      const missing=STATE_IDS.filter(id=>!saved.config.states[id]&&(id==='walk'||WINDOW_NODES[id]));
      const migrateIdle=saved.idleTimingVersion!==2;
      if(migrateIdle){saved.config.idleSpecialDelaySeconds=this.data.config.idleSpecialDelaySeconds;saved.idleTimingVersion=2;}
      const missingScreenLock=saved.config.confineToScreen===undefined;
      if(missingScreenLock)saved.config.confineToScreen=false;
      for(const id of missing)saved.config.states[id]=this.data.config.states[id];
      this.data=saved;
      this.validate(saved.config);
      if(migrateIdle||missing.length||missingScreenLock)this.persist(saved);
    }else this.persist(this.data);
  }
  catalog(data=this.data){return [...this.builtins,...data.custom.map(a=>({...a,url:pathToFileURL(resolve(this.profile,'media',a.file)).href}))].map(a=>({...a,name:data.names[a.id]||a.name}));}
  reload(){
    const next=JSON.parse(readFileSync(this.file,'utf8').replace(/^\uFEFF/,''));
    if(isDeepStrictEqual(next,this.data))return null;
    if(!Array.isArray(next.custom)||!next.names||typeof next.names!=='object'||Array.isArray(next.names)
      ||Object.values(next.names).some(name=>typeof name!=='string'))throw Error('资源清单无效');
    for(const asset of next.custom){
      if(typeof asset?.id!=='string'||typeof asset.name!=='string'||!['video','audio'].includes(asset.kind)
        ||typeof asset.file!=='string'||!asset.file||/[\\/:]/.test(asset.file)||['.','..'].includes(asset.file))throw Error('本地媒体资源无效');
    }
    this.validate(next.config,next);
    const prior=this.data.config;
    const animationChanged=prior.idleSpecialDelaySeconds!==next.config.idleSpecialDelaySeconds||STATE_IDS.some(id=>{
      const {sound:oldSound,...before}=prior.states[id],{sound:newSound,...after}=next.config.states[id];
      return !isDeepStrictEqual(before,after);
    });
    this.data=next;
    return animationChanged?'animation':'settings';
  }
  snapshot(){return {target:'pc',config:structuredClone(this.data.config),assets:this.catalog()};}
  validate(c,data=this.data){
    const finite=(x,min,max)=>Number.isFinite(x)&&x>=min&&x<=max;
    if(c?.target!=='pc'||c.version!==1||!finite(c.idleSpecialDelaySeconds,1,3600)||typeof c.confineToScreen!=='boolean'||typeof c.master?.enabled!=='boolean'||!finite(c.master.volume,0,100))throw Error('仅支持本地 PC；设置数据无效');
    const assets=this.catalog(data),has=(id,kind)=>assets.some(a=>a.id===id&&a.kind===kind);
    for(const id of STATE_IDS){const s=c.states?.[id];if(!s||!['single','triple'].includes(s.mode)||typeof s.force!=='boolean'||!['once','loop'].includes(s.play))throw Error('状态配置无效：'+id);
      const windowNode=WINDOW_NODES[id];
      if(windowNode&&(s.mode!==windowNode.mode||s.play!==windowNode.play||!s.force))throw Error('窗口互动的播放规则固定：'+id);
      for(const phase of s.mode==='single'?['single']:['enter','loop','exit'])if(!has(s.slots?.[phase],'video'))throw Error('缺少动画资源：'+id+'/'+phase);
      for(const phase of PHASES){const v=s.sound?.[phase];if(!v||typeof v.on!=='boolean'||!finite(v.volume,0,100)||!finite(v.delay,0,60)||typeof v.voice!=='string'||(v.voice&&!has(v.voice,'audio')))throw Error('语音配置无效：'+id+'/'+phase);}
    }
  }
  persist(data){writeFileSync(this.file+'.tmp',JSON.stringify(data,null,2));renameSync(this.file+'.tmp',this.file);}
  save(input,domain){
    const c=structuredClone(this.data.config);
    if(domain==='animation'){c.idleSpecialDelaySeconds=input.idleSpecialDelaySeconds;for(const id of STATE_IDS){const s=input.states?.[id];if(!s)throw Error('缺少状态');Object.assign(c.states[id],{mode:s.mode,force:s.force,play:s.play,slots:s.slots});}}
    else if(domain==='sound'){c.master=input.master;for(const id of STATE_IDS)c.states[id].sound=input.states?.[id]?.sound;}
    else if(domain==='display'){if(typeof input.confineToScreen!=='boolean')throw Error('屏幕锁定设置无效');c.confineToScreen=input.confineToScreen;}
    else throw Error('设置域无效');
    if(input.target!=='pc')throw Error('禁止写入非本地 PC 目标');this.validate(c);const next={...this.data,config:c};this.persist(next);this.data=next;return this.snapshot();
  }
  importFile(file,kind){
    const ext=extname(file).toLowerCase();if(!(kind==='video'?['.webm']:['.wav','.mp3','.ogg','.m4a','.flac']).includes(ext))throw Error('不支持的文件类型');
    const id=randomUUID(),name=basename(file),target=id+ext;mkdirSync(resolve(this.profile,'media'),{recursive:true});copyFileSync(file,resolve(this.profile,'media',target));
    const next={...this.data,custom:[...this.data.custom,{id,name,kind,file:target}]};this.persist(next);this.data=next;return this.snapshot();
  }
  rename(id,name){if(typeof name!=='string'||!name.trim()||name.length>80||!this.catalog().some(a=>a.id===id))throw Error('名称或资源无效');const next={...this.data,names:{...this.data.names,[id]:name.trim()}};this.persist(next);this.data=next;return this.snapshot();}
}
