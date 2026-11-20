import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {conversationRoute,registrationTypes} from './conversation-routing.mjs';
import menu from './menu-layout.json' with {type:'json'};

const execute=promisify(execFile);
const catalog=fileURLToPath(new URL('../skills/catalog.py',import.meta.url));
export async function readInteractionSkill(hint,group='hints'){
  const {stdout}=await execute('python',['-B',catalog,hint,group],{windowsHide:true,encoding:'utf8',timeout:5000});
  return JSON.parse(stdout);
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
export function menuEntry(text){
  if(!/(在哪|怎么打开|如何打开|怎么进入|菜单|打开|进入|查看)/u.test(text))return null;
  for(const [label,item] of menuPaths)if(text.includes(label))return item;
  return null;
}
export function menuGuidance(text){
  const purpose=/(?:怎么|怎样|如何)(?:才能|才可以|可以)?(?:登记|记录|写)(?:一(?:篇|条))?(日记|随手记)(?:[呀呢吗？?。！!]|\s)*$/u.exec(text)?.[1];
  if(purpose){
    const input=purpose==='日记'?'帮我写日记：……':'帮我把……记到随手记';
    return '托盘右键绯月，打开「问绯月」，输入「'+input+'」。';
  }
  const entry=menuEntry(text);
  if(entry?.action==='notices')return '有未读提醒时，托盘右键绯月，选择「提醒（N 条未读）」。';
  if(entry?.action==='pendingCheck')return '有待执行的检查时，托盘右键绯月，选择「'+entry.path+'」。';
  if(entry)return '托盘右键绯月，选择「'+entry.path+'」。';
  return '';
}

const targets={
  'hu-shi.food.create':/吃喝|饮食|餐食|用餐/u,'hu-shi.exercise.create':/运动|锻炼/u,
  'hu-shi.event.create':/一键事件/u,'records.create':/随手记|笔记/u,'diaries.create':/日记/u,'reminders.create':/提醒|待办/u
};
export function attachmentRegistration(text){
  if(!text||/^(?:请)?(?:不要|不用|先别|别)|(?:如何|怎么).{0,12}(?:登记|记录)|(?:是什么|什么意思)[？?]?$/u.test(text.trim()))return false;
  if(/(?:记录|登记)(?:了|的)?(?:什么|哪些)|(?:有没有|是否已经)(?:记录|登记)/u.test(text))return false;
  const explicit=/(?:登记|记录|记下|记一下|记一笔|记一条|提醒我|记入|记到|记成|写.{0,4}日记|新增|创建|添加)/u.test(text);
  return explicit&&conversationRoute(text).kind==='registration'||/(?:帮我|请|把|将|给我|根据|从).{0,100}(?:登记|记录|记成|记作|记入|记到|存为|创建.{0,5}提醒|设为.{0,3}提醒)/u.test(text);
}
export function validatePreview(planned,text){
  const nodes=planned?.chain?.nodes;
  if(planned?.pending?.length)throw Error(planned.pending.map(p=>p.question).join('\n'));
  if(!Array.isArray(nodes)||!nodes.length)throw Error('没有提取到可登记的内容，请说明事项和登记类型。');
  const requested=Object.keys(targets).filter(type=>targets[type].test(text));
  const fields={title:'标题',content:'内容',body:'正文',category_id:'分类编号',deadline:'到期日',level:'等级',
    reflection:'感想',photos:'图片',tag_ids:'标签'};
  return nodes.map((n,i)=>{
    if(!Object.hasOwn(registrationTypes,n.type)||n.target_device_id!==null||!n.params||typeof n.params!=='object'||
       (requested.length&&!requested.includes(n.type)))throw Error('提取结果与指定登记类型不符，请说明要登记的内容。');
    return [String(i+1)+'. '+registrationTypes[n.type],...Object.entries(n.params).map(([k,v])=>
      (fields[k]??k)+'：'+(typeof v==='string'?v:JSON.stringify(v))),...(n.depends_on?['前置事项：'+n.depends_on]:[])].join('\n');
  }).join('\n\n');
}
