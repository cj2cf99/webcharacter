import {requestsResource,resourceCategoryNames} from '../agent/assistant/resource-registration.mjs';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {conversationRoute,registrationTypes} from './conversation-routing.mjs';
import {warnLiveUpdate} from './live-files.mjs';
import menu from './menu-layout.json' with {type:'json'};

const execute=promisify(execFile);
const catalog=fileURLToPath(new URL('../skills/catalog.py',import.meta.url));
let skillProfile;
export function setInteractionSkillProfile(profile){skillProfile=profile;}

async function readCatalog(args){
  const {stdout}=await execute('python',['-B',catalog,...args],{
    windowsHide:true,encoding:'utf8',timeout:5000,maxBuffer:4*1024*1024
  });
  const selected=JSON.parse(stdout);
  for(const warning of selected.warnings??[])warnLiveUpdate('绯月技能',warning);
  return selected;
}

export async function readInteractionSkill(hint,group='hints'){
  return readCatalog([hint,group,...(skillProfile?['--profile',skillProfile]:[])]);
}

export function isSkillDirectoryQuestion(text){
  return /^(?:(?:绯月|你)[，,\s]*)?(?:(?:查看|列出|显示)?(?:绯月的?)?技能(?:目录|列表)|(?:现在)?能做哪些事|(?:现在)?能做什么)[。？！?!]*$/u.test(text.trim());
}

export function readSkillDirectory(profile){
  return readCatalog(['external','--profile',profile,'directory']);
}

export async function listInteractionSkills(profile){
  const {skills}=await readSkillDirectory(profile);
  const stepNames={organize:'整理',classify:'按模板拟稿',review:'按条件复核'};
  const active=skills.filter(skill=>skill.source==='external').map(({name,version})=>name+' · '+version);
  const transcription=skills.find(skill=>skill.id==='conversation-transcription');
  return '已登记技能：'+skills.map(skill=>skill.name).join('、')+'。\n'+transcription.name+'：'+
    transcription.workflow.steps.map(step=>stepNames[step.run]).join(' → ')+' → 交回待确认。'+
    (active.length?'\n外置版本：'+active.join('、')+'。':'');
}
const menuPaths=new Map();
function index(items,path=[]){
  for(const item of items){
    if(typeof item!=='object')continue;
    const label=item.label??({work:'开始或结束工作',attachment:'窗口依附',visibility:'隐藏或显示',notices:'未读提醒'})[item.action];
    const next=label?[...path,label]:path;
    if(item.action&&label)menuPaths.set(label,{action:item.action,path:next.join(' → ')});
    if(item.items)index(item.items,next);
  }
}
index(menu);
const quickLinksPath=menuPaths.get('常用链接')?.path;
if(quickLinksPath)menuPaths.set('应用链接设置',{action:'quickLinks',path:`${quickLinksPath} → 应用链接设置`});
const sortedMenuPaths=[...menuPaths.entries()].sort((a,b)=>b[0].length-a[0].length);
export function menuEntry(text){
  if(!/(在哪|怎么打开|如何打开|怎么进入|菜单|打开|进入|查看)/u.test(text))return null;
  for(const [label,item] of sortedMenuPaths)if(text.includes(label))return item;
  return null;
}
export function menuGuidance(text){
  const purpose=/(?:怎么|怎样|如何)(?:才能|才可以|可以)?(?:登记|记录|写)(?:一(?:篇|条))?(日记|随手记)(?:[呀呢吗？?。！!]|\s)*$/u.exec(text)?.[1];
  if(purpose){
    const input=purpose==='日记'?'帮我登记日记：……':'帮我把……记到随手记';
    return '托盘右键绯月，打开「问绯月」，输入「'+input+'」。';
  }
  const entry=menuEntry(text);
  if(entry?.action==='notices')return '有未读提醒时，托盘右键绯月，选择「提醒（N 条未读）」。';
  if(entry?.action==='pendingCheck')return '有待执行的检查时，托盘右键绯月，选择「'+entry.path+'」。';
  if(entry)return '托盘右键绯月，选择「'+entry.path+'」。';
  return '';
}

const targets={
  'resources.create':/资源/u,'hu-shi.food.create':/吃喝|饮食|餐食|用餐|(?:早餐|午餐|晚餐|早饭|午饭|晚饭)\s*(?:吃|喝)/u,'hu-shi.exercise.create':/运动|锻炼/u,
  'hu-shi.event.create':/一键事件/u,'records.create':/随手记|笔记/u,'diaries.create':/日记/u,'reminders.create':/提醒|待办/u
};
export function attachmentRegistration(text){
  return typeof text==='string'&&conversationRoute(text).kind==='registration';
}
export function validatePreview(planned,text){
  const nodes=planned?.chain?.nodes;
  if(planned?.pending?.length)throw Error(planned.pending.map(p=>p.question).join('\n'));
  if(!Array.isArray(nodes)||!nodes.length)throw Error('没有提取到可登记的内容，请说明事项和登记类型。');
  const requested=Object.keys(targets).filter(type=>targets[type].test(text));
  if(requestsResource(text)&&!nodes.some(n=>n.type==='resources.create'))throw Error('没有取得鱼与熊掌资源草案，请重新准备。');
  const fields={url:'网址',title:'标题',content:'内容',body:'正文',category_id:'分类编号',deadline:'到期日',level:'等级',
    reflection:'感想',photos:'图片',tag_ids:'标签'};
  return nodes.map((n,i)=>{
    if(!Object.hasOwn(registrationTypes,n.type)||n.target_device_id!==null||!n.params||typeof n.params!=='object'||
       (requested.length&&!requested.includes(n.type)))throw Error('提取结果与指定登记类型不符，请说明要登记的内容。');
    return [String(i+1)+'. '+registrationTypes[n.type],...Object.entries(n.params).map(([k,v])=>
      (n.type==='resources.create'&&k==='category_id'?'分类':fields[k]??k)+'：'+(n.type==='resources.create'&&k==='category_id'?(resourceCategoryNames[v]??v):typeof v==='string'?v:JSON.stringify(v))),...(n.type==='reminders.create'&&!n.params.deadline?['到期日：不设日期']:[]),...(n.depends_on?['前置事项：'+n.depends_on]:[])].join('\n');
  }).join('\n\n');
}
