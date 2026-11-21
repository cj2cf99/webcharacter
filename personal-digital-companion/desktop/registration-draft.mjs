import {normalizeRegistration,registrationContext,registrationInstructions} from '../agent/assistant/registration-plan.mjs';
import {prepareMainSiteTask} from '../agent/host/main-site-task-adapter.mjs';
import {requestsResource} from '../agent/assistant/resource-registration.mjs';
import {readInteractionSkill,validatePreview} from './interaction-skills.mjs';
import {calendarDate,datePattern} from './calendar-date.mjs';
import {singleDiaryRequest} from './conversation-routing.mjs';

const datedReminder=new RegExp('^提醒我\\s*('+datePattern+')\\s*(.+)$','u');
const listOpening=/^(?:(?:请|绯月|帮我|替我)[，,\s]*)*(?:登记|记录)(?:下面|以下)?(?:(\d+|[一两二三四五六七八九十])(?:件|条|项))?[：:]\s*/u;
function explicitEntries(text,context,opening){
  if(!opening||/先.+再|然后|(?:完成|结束|登记)后/u.test(text))return [];
  const parts=text.slice(opening[0].length).split(/[。；;，,\n]\s*(?:另外|顺便|同时)(?:再|请|帮我)?\s*/u);
  if(parts.length<2)return [];
  const actions=[];
  for(const part of parts){
    const phrase=part.trim().replace(/[。！!]+$/u,'');
    // 尚有独立分句时，保留完整模板交给模型拆解。
    if(/[。！？!?；;，,\n]|另外|顺便|同时|并且/u.test(phrase))return [];
    const reminder=datedReminder.exec(phrase);
    if(reminder&&!/\d{1,2}[:：点时]|(?:上午|下午|晚上|每天|每周|提前)/u.test(reminder[2])){
      try{actions.push({type:'reminders.create',params:{content:reminder[2].trim(),deadline:calendarDate(reminder[1],context.dates.today)}});}
      catch{return [];}
    }else if(/^(?:今天|今日)?\s*(?:早餐|午餐|晚餐|早饭|午饭|晚饭)\s*(?:吃|喝)了?.+/u.test(phrase)){
      actions.push({type:'hu-shi.food.create',params:{body:phrase}});
    }else return [];
  }
  return actions.every(action=>context.tasklist.some(template=>template.type===action.type))?actions:[];
}

function actionSchema(type,properties,required,ordered=false){
  return {type:'object',additionalProperties:false,properties:{type:{const:type},...(ordered?{after:{type:'integer'}}:{}),
    params:{type:'object',additionalProperties:false,properties,required}},required:['type','params']};
}

function schema(tasklist,explicit,ordered){
  const actions=tasklist.map(({type,parameter_spec})=>actionSchema(type,
    Object.fromEntries(Object.entries(parameter_spec).filter(([name])=>name!=='photos').map(([name,rule])=>
      [name,name==='level'?{enum:['高','中','低']}:rule.type==='string_array'?{type:'array',items:{type:'string'}}:{type:rule.type}])),
    Object.keys(parameter_spec).filter(name=>parameter_spec[name].required&&name!=='photos'),ordered));
  const fixed=explicit.map(({type,params})=>actionSchema(type,
    Object.fromEntries(Object.entries(params).map(([key,value])=>[key,{const:value}])),Object.keys(params)));
  return {type:'object',additionalProperties:false,required:['actions','pending'],properties:{
    actions:fixed.length?{type:'array',prefixItems:fixed,minItems:fixed.length,maxItems:fixed.length}:
      {type:'array',items:actions.length===1?actions[0]:{oneOf:actions}},
    pending:{type:'array',...(fixed.length?{maxItems:0}:{}),items:{type:'object',additionalProperties:false,
      properties:{type:{enum:tasklist.map(item=>item.type)},question:{type:'string',maxLength:160}},required:['type','question']}}}};
}

export async function registrationDraft(text,{call,work,signal,onProgress,submittedAt,localOnly=false,diaryBody=false}){
  const path='/api/assistant/recording-plan';
  const [metadata,skill]=await Promise.all([call(path,undefined,signal),
    readInteractionSkill(requestsResource(text)?'resourceRegistration':'registration')]);
  signal?.throwIfAborted();
  if(!Array.isArray(metadata.catalog)||!metadata.catalog.length||!Array.isArray(metadata.categories))
    throw Object.assign(Error('登记模板和分类的回执无效，请更新服务连接。'),{code:'REGISTRATION_CATALOG_UNAVAILABLE'});
  const context=registrationContext({...metadata,text,submittedAt});
  const diaryTemplates=context.tasklist.filter(item=>item.type==='diaries.create');
  if(diaryBody&&!diaryTemplates.length)throw Object.assign(Error('登记目录暂未提供日记模板。'),{code:'REGISTRATION_NOT_CONFIGURED'});
  const singleDiary=(diaryBody||singleDiaryRequest(text))&&diaryTemplates.length===1;
  const opening=listOpening.exec(text);
  const quantity=opening?.[1]?.replace('两','二');
  const count=quantity&&(/^\d+$/u.test(quantity)?Number(quantity):'零一二三四五六七八九十'.indexOf(quantity));
  let explicit=singleDiary?[{type:'diaries.create',params:{}}]:explicitEntries(text,context,opening);
  if(count&&explicit.length!==count)explicit=[];
  let expected;
  if(explicit.length)try{expected=normalizeRegistration({actions:explicit,pending:[]},context).chain?.nodes;}
  catch{explicit=[];}
  const templates=explicit.length?context.tasklist.filter(template=>explicit.some(action=>action.type===template.type)):context.tasklist;
  const ordered=/先.+再|然后|之后再|完成后|结束后/u.test(text);
  function normalize(raw,stage){
    const plan=stage==='cloud'?raw:normalizeRegistration(raw,context);
    if(!Array.isArray(plan?.pending)||!plan.pending.length&&!plan.chain?.nodes?.length)return null;
    const nodes=plan.chain?.nodes??[];
    if(count&&!plan.pending.length&&nodes.length!==count)
      return {error:'REGISTRATION_COUNT_MISMATCH'};
    if(expected&&(nodes.length!==expected.length||plan.pending.length||nodes.some((node,index)=>node.type!==expected[index].type||
      ['body','content','deadline'].some(key=>node.params[key]!==expected[index].params[key]))))return null;
    if(!ordered&&nodes.some(node=>node.depends_on))return null;
    for(const node of nodes){
      const definition=context.catalog.find(item=>item.type===node.type);
      if(!definition)return null;
      prepareMainSiteTask({task_id:node.key,type:node.type,params:node.params,target_device_id:node.target_device_id,
        definition:{...definition,executor:'cloud'}});
    }
    if(nodes.length)validatePreview({...plan,pending:[]},text);
    const cited=nodes.map(node=>node.type==='diaries.create'?{...node,params:{...node.params,content:'正文由宿主按本轮原文保存'}}:node);
    return {value:plan,review:{nodes:cited,pending:plan.pending}};
  }
  const instruction=singleDiary&&explicit.length?'用户明确委托登记一篇日记，正文由宿主完整保留。只返回一项 diaries.create，params 为空，pending 为空。':explicit.length?
    '按原文顺序准备明确列出的登记草案。保留这些原文字段和已换算的日期。返回 actions 和空 pending。':
    [registrationInstructions,skill.localAi?.work].filter(Boolean).join('\n');
  const tasklist=templates.map(({type,description,parameter_spec})=>({type,description,fields:Object.keys(parameter_spec)}));
  return work({purpose:'登记草案',context:{text,dates:context.dates,tasklist,明确事项:explicit.length?explicit:undefined,categories:explicit.length?[]:context.categories,
    categoriesAvailable:context.categoriesAvailable},instruction,schema:schema(templates,explicit,ordered),normalize,maxTokens:singleDiary?128:768,
    signal,onProgress,localOnly,redraft:skill.workRedrafts,skill:{name:skill.skill,version:skill.version},cloud:(cloudSignal,feedback)=>call(path,{text,submittedAt,
      ...(feedback?{reviewFeedback:feedback.slice(0,2000)}:{})},cloudSignal)});
}
