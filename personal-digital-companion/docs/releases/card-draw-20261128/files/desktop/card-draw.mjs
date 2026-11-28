// 抽卡核心（docs/CARD_DRAW_DESIGN.md）：状态、提示词、调度、请求、错误、花费、清理。
// 不引用 Electron；时钟、fetch、目录、密钥存取与回收站由调用方提供。
import {existsSync,mkdirSync,readFileSync,readdirSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const SLOTS=['who','wear','act'];
export const CYCLE=60_000,UNDO=5000,PAGE=20,TIMEOUT=300_000;
const API='https://api.openai.com/v1';
const DRAW={model:'gpt-image-2.6-flare',size:'1024x1024',quality:'low',n:1};
const HD={model:'gpt-image-2.6-sunburst',size:'2048x2048',quality:'high',n:1};
export const HD_PROMPT='按参考图原样重绘为高清版本：保持构图、人物、服装、姿势、配色和画风不变，只提高清晰度与细节。';
// 每百万 token 美元（2026-11-28 官方价目页，两个模型相同）
const PRICE={text:5,image:8,output:30};
const NAME=/^\d{8}-\d{6}-\d{3}\.png$/;
const QUOTA=new Set(['credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded']);
const REF_LINE={who:'是人物，保持其外貌特征。',wear:'是服装，让人物穿这套服装。',act:'是动作，参考其姿势。'};
const LABEL={who:'人物',wear:'服装',act:'动作',style:'画风',frame:'构图',light:'光影'};
const PNG=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);

export function buildPrompt({refs,prompt,words,random=Math.random}){
  const pick=key=>{
    const list=words?.[key];
    if(!Array.isArray(list)||!list.length)throw Error('词库缺少 '+key);
    return String(list[Math.min(list.length-1,Math.floor(random()*list.length))]);
  };
  const lines=refs.map((slot,i)=>'第'+(i+1)+'张参考图'+REF_LINE[slot]);
  // 空着的图片项只有在没有提示词时才用词库补，避免和用户描述打架。
  if(!prompt)for(const slot of SLOTS)if(!refs.includes(slot))lines.push(LABEL[slot]+'：'+pick(slot));
  if(prompt)lines.push('补充要求：'+prompt);
  lines.push(['style','frame','light'].map(key=>LABEL[key]+'：'+pick(key)).join('；')+'。与参考图或补充要求冲突时，以参考图和补充要求为准。');
  return lines.join('\n');
}

export function usageCost(usage){
  if(!usage)return 0;
  const input=Number(usage.input_tokens)||0,detail=usage.input_tokens_details;
  const text=detail?Number(detail.text_tokens)||0:0;
  const image=detail&&detail.image_tokens!==undefined?Number(detail.image_tokens)||0:Math.max(0,input-text);
  return (text*PRICE.text+image*PRICE.image+(Number(usage.output_tokens)||0)*PRICE.output)/1e6;
}

export function classify(status,error){
  if(status===401)return 'auth';
  if(status===403)return 'forbidden';
  if(status===429&&(error?.type==='insufficient_quota'||QUOTA.has(error?.code)))return 'quota';
  return 'other';
}

export const fileName=time=>new Date(time+9*3600_000).toISOString().replace(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)\.(\d{3})Z$/,'$1$2$3-$4$5$6-$7.png');
const fileTime=name=>name.replace(/^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d).*$/,'$1-$2-$3T$4:$5:$6+09:00');

function writeAtomic(file,data){
  const temp=file+'.'+process.pid+'.tmp';
  try{writeFileSync(temp,data);renameSync(temp,file);}
  finally{rmSync(temp,{force:true});}
}

export function createCardDraw({dataDir,pictureRoot,wordsFile,keyStore,trash,fetcher=fetch,now=Date.now,random=Math.random,
  onChange=()=>{},onNotice=()=>{},log=()=>{}}){
  const stateFile=join(dataDir,'state.json'),refDir=join(dataDir,'refs');
  const dirs=()=>{const base=typeof pictureRoot==='function'?pictureRoot():pictureRoot;return {cards:join(base,'抽卡'),hd:join(base,'高清')};};
  const state={on:false,paused:'',resumeOn:false,prompt:'',totalUsd:0,marks:{}};
  let notice='',key=keyStore.load()||'',saved=Boolean(key),session=0,fails=0,busy=null,job=null,timer=null,nextAt=now()+CYCLE,ready=0;
  const closing=new AbortController();

  function load(){
    if(!existsSync(stateFile))return;
    try{
      const data=JSON.parse(readFileSync(stateFile,'utf8'));
      if(!data||typeof data!=='object'||!data.marks||typeof data.marks!=='object')throw Error('格式无效');
      state.on=data.on===true;state.paused=String(data.paused??'');state.resumeOn=data.resumeOn===true;
      state.prompt=String(data.prompt??'');state.totalUsd=Number(data.totalUsd)||0;
      for(const [name,mark] of Object.entries(data.marks)){
        if(!NAME.test(name)||!['queued','running','done','fail'].includes(mark?.st))continue;
        // 上次退出时在途的请求不自动重发。
        state.marks[name]={sel:mark.sel!==false,st:mark.st==='running'?'fail':mark.st,after:Number(mark.after)||0};
      }
    }catch{
      renameSync(stateFile,stateFile+'.bad-'+now());
      notice='状态文件损坏，已按默认设置启动；清理前请先核对勾选。';
    }
  }
  function save(){mkdirSync(dataDir,{recursive:true});writeAtomic(stateFile,JSON.stringify(state));}
  function changed(){save();onChange();}

  function files(kind){
    try{return readdirSync(dirs()[kind]).filter(name=>NAME.test(name)).sort().reverse();}
    catch(error){if(error.code==='ENOENT')return [];throw error;}
  }
  const cardPath=name=>join(dirs().cards,name);
  function prune(){
    // 目录整个读不到时保留标记，避免之后清理把勾选过的卡当成未勾选。
    if(!Object.keys(state.marks).length||!existsSync(dirs().cards))return;
    for(const [name,mark] of Object.entries(state.marks))if(mark.st!=='running'&&!existsSync(cardPath(name)))delete state.marks[name];
  }
  const readyList=()=>Object.entries(state.marks).filter(([,m])=>m.st==='queued'&&m.after<=now())
    .sort(([a,x],[b,y])=>x.after-y.after||a.localeCompare(b)).map(([name])=>name);
  const nextKind=()=>state.paused||!key?null:readyList().length?'hd':state.on?'draw':null;

  function refInfo(slot){
    const file=join(refDir,slot+'.png');
    try{return {file,url:pathToFileURL(file).href+'?v='+Math.round(statSync(file).mtimeMs)};}
    catch{return null;}
  }
  function snapshot(){
    const cards=files('cards');
    return {on:state.on,paused:state.paused,prompt:state.prompt,notice,
      key:!key?'none':saved?'saved':'pending',busy,next:nextKind(),wait:Math.max(0,nextAt-now()),cycle:CYCLE,
      queued:readyList().length+(busy==='hd'?1:0),session,total:state.totalUsd,
      refs:Object.fromEntries(SLOTS.map(slot=>[slot,refInfo(slot)?.url??null])),
      cards:cards.length,hd:files('hd').length,unchecked:cards.filter(name=>!state.marks[name]?.sel).length};
  }

  function clearPause(){state.paused='';state.resumeOn=false;fails=0;}
  function resume(){state.on=state.on||state.resumeOn;clearPause();}
  function pause(reason){
    state.resumeOn=state.on||state.resumeOn;state.on=false;state.paused=reason;
    onNotice('已暂停：'+reason);
  }
  const need=name=>{
    if(typeof name!=='string'||!NAME.test(name))throw Error('文件名无效');
    return name;
  };

  const actions={
    state:()=>snapshot(),
    setPrompt(text){
      if(typeof text!=='string')throw Error('提示词无效');
      state.prompt=text.trim().slice(0,8000);changed();
    },
    setRef({slot,data}={}){
      if(!SLOTS.includes(slot))throw Error('图片槽无效');
      const file=join(refDir,slot+'.png');
      if(!data){rmSync(file,{force:true});onChange();return;}
      const head='data:image/png;base64,';
      if(typeof data!=='string'||!data.startsWith(head)||data.length>8*1024*1024)throw Error('图片无效或过大');
      const bytes=Buffer.from(data.slice(head.length),'base64');
      if(!bytes.subarray(0,8).equals(PNG))throw Error('图片无效');
      mkdirSync(refDir,{recursive:true});writeAtomic(file,bytes);onChange();
    },
    setKey(value){
      const next=typeof value==='string'?value.trim():'';
      if(!/^[\x21-\x7e]{1,512}$/.test(next))throw Error('API Key 格式无效');
      key=next;saved=false;onChange();
    },
    power(on){
      if(typeof on!=='boolean')throw Error('开关值无效');
      state.on=on;if(on)clearPause();else state.resumeOn=false;
      changed();
    },
    resume(){resume();changed();},
    pick({name,on}={}){
      need(name);
      const mark=state.marks[name];
      if(on){
        if(mark)mark.sel=true;
        else{
          if(!existsSync(cardPath(name)))throw Error('这张卡已经不在了');
          state.marks[name]={sel:true,st:'queued',after:now()+UNDO};
        }
      }else if(mark&&mark.st!=='running'){
        if(mark.st==='done')mark.sel=false;else delete state.marks[name];
      }
      changed();
    },
    retry(name){
      const mark=state.marks[need(name)];
      if(mark?.st!=='fail')return;
      Object.assign(mark,{sel:true,st:'queued',after:now()});
      if(state.paused)resume();
      changed();
    },
    list({kind,page=0,top=''}={}){
      if(kind!=='cards'&&kind!=='hd')throw Error('列表类型无效');
      const all=files(kind),upper=top&&NAME.test(top)?top:all[0]??'';
      // 浏览期间新增的图不插进当前列表。
      const shown=all.filter(name=>name<=upper),pages=Math.max(1,Math.ceil(shown.length/PAGE));
      const current=Math.min(pages-1,Math.max(0,Math.floor(Number(page))||0)),dir=dirs()[kind];
      return {top:upper,page:current,pages,fresh:all.length-shown.length,
        items:shown.slice(current*PAGE,(current+1)*PAGE).map(name=>{
          const mark=kind==='cards'?state.marks[name]:undefined;
          return {name,time:fileTime(name),url:pathToFileURL(join(dir,name)).href,sel:Boolean(mark?.sel),st:mark?.st??'',
            undo:mark?.st==='queued'?Math.max(0,mark.after-now()):0};
        })};
    },
    unchecked:()=>files('cards').filter(name=>!state.marks[name]?.sel),
    async clean(names){
      if(!Array.isArray(names))throw Error('清理清单无效');
      let moved=0,failed=0;
      for(const name of names.map(need)){
        if(state.marks[name]?.sel||!existsSync(cardPath(name)))continue; // 只动仍未勾选的
        try{await trash(cardPath(name));delete state.marks[name];moved++;}
        catch(error){failed++;log({direction:'local',route:'抽卡清理',error:String(error?.message??error)});}
      }
      changed();
      return {moved,failed};
    },
  };

  async function request(path,body){
    const used=key;
    const response=await fetcher(API+path,{method:'POST',redirect:'error',
      headers:{Authorization:'Bearer '+used,'Content-Type':'application/json'},body:JSON.stringify(body),
      signal:AbortSignal.any([closing.signal,AbortSignal.timeout(TIMEOUT)])});
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      const error=data?.error;
      // 认证类报错会回带部分密钥，进日志和界面前打码。
      const message=String(error?.message??error?.code??'HTTP '+response.status).split(used).join('***').replace(/sk-[^\s'"]+/g,'sk-***');
      throw Object.assign(Error(message.slice(0,300)),{kind:classify(response.status,error),status:response.status,code:error?.code,used});
    }
    return {data,used};
  }
  const dataURL=file=>'data:image/png;base64,'+readFileSync(file).toString('base64');
  async function execute(kind,name){
    let path,body;
    if(kind==='hd'){
      path='/images/edits';body={...HD,images:[{image_url:dataURL(cardPath(name))}],prompt:HD_PROMPT};
    }else{
      const refs=SLOTS.filter(slot=>refInfo(slot));
      const prompt=buildPrompt({refs,prompt:state.prompt,words:JSON.parse(readFileSync(wordsFile,'utf8').replace(/^﻿/,'')),random});
      path=refs.length?'/images/edits':'/images/generations';
      body={...DRAW,prompt,...(refs.length?{images:refs.map(slot=>({image_url:dataURL(refInfo(slot).file)}))}:{})};
    }
    const {data,used}=await request(path,body);
    const cost=usageCost(data?.usage);session+=cost;state.totalUsd+=cost; // 已经计费，写盘失败也要计入
    const encoded=data?.data?.[0]?.b64_json;
    if(typeof encoded!=='string'||!encoded)throw Error('接口没有返回图片');
    const dir=dirs()[kind==='hd'?'hd':'cards'];
    mkdirSync(dir,{recursive:true});
    let time=now();while(existsSync(join(dir,fileName(time))))time++;
    writeAtomic(join(dir,fileName(time)),Buffer.from(encoded,'base64'));
    // 第一次成功后才把密钥落盘。
    if(!saved&&key===used)saved=keyStore.save(used)===true;
  }
  async function perform(kind,name){
    try{
      await execute(kind,name);
      fails=0;
      if(kind==='hd'){state.marks[name].st='done';onNotice('高清完成');}
    }catch(error){
      if(closing.signal.aborted)return; // 标记保持 running，下次启动改为失败
      if(name&&state.marks[name])state.marks[name].st='fail';
      const reason=String(error?.message??error).slice(0,300);
      log({direction:'local',route:'抽卡 '+(kind==='hd'?'高清':'出图'),status:error?.status,code:error?.code,error:reason});
      if(error?.kind==='auth'){
        if(key===error.used){key='';saved=false;keyStore.clear();pause('密钥无效，请重新填写');}
      }else if(error?.kind==='forbidden')pause('无权限（可能需要组织验证）：'+reason);
      else if(error?.kind==='quota')pause('额度不足或超出上限');
      else if(++fails>=3)pause('连续失败 3 次：'+reason);
    }finally{
      busy=null;
      if(!closing.signal.aborted){
        try{changed();}catch(error){log({direction:'local',route:'抽卡状态保存',error:String(error?.message??error)});}
      }
    }
  }
  // 每轮最多一个请求；返回本轮任务，便于测试等待。
  function tick(){
    if(closing.signal.aborted)return null;
    const count=readyList().length;
    if(count!==ready){ready=count;onChange();}
    if(busy||state.paused||!key||now()<nextAt)return null;
    prune();
    const name=readyList()[0],kind=name?'hd':state.on?'draw':null;
    if(!kind)return null;
    if(name)state.marks[name].st='running';
    busy=kind;nextAt=now()+CYCLE;
    try{changed();}
    catch(error){
      // 状态存不下就不发请求。
      busy=null;if(name)state.marks[name].st='queued';
      log({direction:'local',route:'抽卡状态保存',error:String(error?.message??error)});return null;
    }
    job=perform(kind,name);
    return job;
  }

  load();prune();
  return {
    action(type,args){
      if(!Object.hasOwn(actions,type))throw Error('未知操作');
      return actions[type](args);
    },
    tick,
    start(){timer??=setInterval(()=>{try{tick();}catch(error){log({direction:'local',route:'抽卡调度',error:String(error?.message??error)});}},1000);timer.unref?.();},
    close(){clearInterval(timer);timer=null;closing.abort();},
    get busy(){return busy;},
    get idle(){return job??Promise.resolve();},
  };
}
