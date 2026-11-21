import {requestsResource,resourceParams} from '../agent/assistant/resource-registration.mjs';
import {serverTaskSteps,explicitRegistration,businessDate} from './server-registration-plan.mjs';
import {datePattern} from './calendar-date.mjs';
import {readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateParameters} from '../agent/tasks/parameters.mjs';
import {normalizeDeadline} from '../agent/tasks/deadline.mjs';
import {isSubmissionId} from '../agent/tasks/submissions.mjs';
import {encodeJson} from '../agent/execution/json.mjs';
import {readInteractionSkill} from './interaction-skills.mjs';
import {PC_IMAGE_GENERATE} from '../agent/tasks/pc-types.mjs';

const resumeHint='输入“服务器任务：恢复上次提交”可按原提交号核对。';

function imagePrompt(text){
  const explicit=/^(?:文字生图|文生图|生图)(?:[：:,，\s]+|$)([\s\S]*)$/u.exec(text.trim());
  if(explicit)return explicit[1].trim();
  return /^(?:(?:请|帮我)\s*)*(?:画一[张幅]|生成一[张幅]|绘制一[张幅])/u.test(text.trim())?text.trim():null;
}

function planSchema(templates,exerciseBody) {
  const plans=templates.map(({type,parameter_spec})=>{
    const properties=Object.fromEntries(Object.entries(parameter_spec).map(([key,rule])=>[
      key,type==='pc.exercise.create'&&key==='body'&&exerciseBody!==undefined?{const:exerciseBody}:rule.type==='string_array'?{type:'array',items:{type:'string'}}:{type:rule.type}
    ]));
    const required=Object.keys(parameter_spec).filter(key=>parameter_spec[key].required);
    return {type:'object',properties:{type:{const:type},params:{type:'object',properties,required,additionalProperties:false}},
      required:['type','params'],additionalProperties:false};
  });
  return {oneOf:[...plans,{type:'object',properties:{question:{type:'string'}},required:['question'],additionalProperties:false}]};
}

export function createServerTaskCommand({profile,tasks,localModel,interactionWork,dialog,readSkill=readInteractionSkill}) {
  const file=join(profile,'server-task-submission.json');
  let active=false;
  async function call(path,body,signal) {
    const response=await tasks.weatherRequest(path,{method:body?'POST':'GET',cache:'no-store',signal,
      ...(body?{headers:{'Content-Type':'application/json'},body:encodeJson(body)}:{})});
    const data=await response.json();
    if(!response.ok)throw Object.assign(Error('任务接口返回 HTTP '+response.status),{status:response.status,code:data?.error?.code});
    return data;
  }
  async function savedSubmission(){
    try{return JSON.parse(await readFile(file,'utf8'));}
    catch(error){if(error.code==='ENOENT')return null;throw Error('原提交记录无法读取，请先核对本地记录。');}
  }
  async function submit(saved) {
    const {body}=saved;
    if(body?.serial_pc){
      if(!isSubmissionId(body.submission_id)||!body.nodes?.length||
        body.nodes.some(n=>!['all',tasks.identity.device_id].includes(n.target_device_id)))throw Error('串行提交记录无效。');
      const chain=await call('/api/chains',body).catch(async e=>{
        if([400,404].includes(e.status)){await unlink(file);throw Error('服务器拒绝任务链，请核对模板。');}
        throw Error('链创建回执待核对。'+resumeHint);
      });
      if(chain.chain_id!==body.submission_id||!chain.serial_pc||chain.nodes?.length!==body.nodes.length||
        chain.nodes.some((n,i)=>n.key!==body.nodes[i].key||n.depends_on!==(chain.nodes[i-1]?.node_id??null)||
          n.current_task.type!==body.nodes[i].type||(n.current_task.dispatch_target??n.current_task.target_device_id)!==body.nodes[i].target_device_id||encodeJson(n.current_task.params)!==encodeJson(body.nodes[i].params)))
        throw Error('任务链回执不匹配。'+resumeHint);
      await unlink(file);
      return '串行任务链 '+chain.chain_id+' · '+body.nodes.length+' 项 · 目标 '+body.nodes[0].target_device_id+' · '+chain.status;
    }
    if(!isSubmissionId(body?.submission_id)||(body.target_device_id!=='all'&&body.target_device_id!==tasks.identity?.device_id))
      throw Error('原提交与本机身份不匹配。');
    let task;
    try {
      task=await call('/api/tasks',body);
      if(!task?.task_id||task.type!==body.type||task.submission_id!==body.submission_id||
        (task.dispatch_target??task.target_device_id)!==body.target_device_id||task.definition?.executor!=='pc'||
        encodeJson(task.params)!==encodeJson(body.params)||(task.deadline_at??null)!==(body.deadline_at??null))
        throw Error('创建回执不匹配');
    }catch(error){
      if([400,404].includes(error.status)){
        await unlink(file);
        throw Error('服务器拒绝当前模板或参数，请核对后重新发起。');
      }
      throw Error('创建回执待核对。'+resumeHint);
    }
    const id=task.task_id;
    if(body.type===PC_IMAGE_GENERATE&&body.target_device_id!=='all'){
      await unlink(file);
      if(task.status==='PENDING'){
        void tasks.runTask(id).catch(()=>tasks.traffic?.write({direction:'local',route:'服务器生图',task_id:id,error:'领取或回执待核对'})).catch(()=>{});
        return '服务器生图任务 '+id+' 已创建，已交给本机后台处理。结果可在本地复盘查看。';
      }
      const state={RUNNING:'执行中',COMPLETED:'已完成',FAILED:'执行失败',CANCELLED:'已取消'};
      return '服务器生图任务 '+id+' · '+(state[task.status]??task.status);
    }
    if(body.target_device_id==='all'){
      await unlink(file);
      const state={PENDING:'等待空闲电脑自动领取',RUNNING:'已被领取',COMPLETED:'已执行完成',FAILED:'执行失败',CANCELLED:'已取消'};
      return '服务器任务 '+id+' · 目标 all · '+(state[task.status]??task.status);
    }
    let result=task;
    if(task.status==='PENDING'||task.status==='RUNNING'){
      try{
        const pending=tasks.chainClient.pending().find(item=>item.task_id===id);
        const receipt=pending?await tasks.chainClient.resume(pending.request_id):await tasks.runTask(id);
        if(!receipt?.acknowledged||receipt.task?.task_id!==id)
          throw Error('尚无最终回执');
        result=receipt.task;
      }catch(error){throw Error('服务器任务 '+id+' 已创建，本机领取或执行回执待核对（'+error.message+'）。'+resumeHint);}
    }
    await unlink(file);
    const status={COMPLETED:'已执行完成',FAILED:'执行失败',CANCELLED:'已取消'}[result.status]??result.status;
    return '服务器任务 '+id+' · '+status+(result.error?' · '+result.error:'');
  }
  return async function run(text,signal,progress=()=>{},work=interactionWork) {
    if(active)throw Error('上一条服务器任务指令仍在处理中。');
    active=true;
    try{
      if(!tasks.weatherRequest||!tasks.identity?.device_id)throw Error('本机任务连接尚未就绪。');
      const saved=await savedSubmission();
      const payload=text.replace(/^.*?(?:服务器任务|云端任务)[：:，,\s]*/u,'').trim();
      if(/^恢复上次提交[。！!]?$/u.test(payload))return saved?await submit(saved):'没有待恢复的服务器任务。';
      if(saved)return '上一条服务器任务仍待核对。'+resumeHint;
      const catalog=await call('/api/tasklist',undefined,signal);
      if(!Array.isArray(catalog?.tasklist))throw Error('服务器模板清单无法读取。');
      // 仅解析委托开头的派发目标，保持正文中的 all（例如回显内容）原样。
      const pool=/^(?:(?:派给|发给|交给|目标(?:为|是)?)[：:\s]*)?(?:all\b|任意(?:一台)?电脑)[，,：:。\s]*/iu.exec(payload);
      const target=pool?'all':tasks.identity.device_id;
      const instruction=pool?payload.slice(pool[0].length):payload;
      const templates=catalog.tasklist.filter(t=>t.executor==='pc'&&(pool||tasks.supportsTask?.(t.type)))
        .map(({type,name,description,parameter_spec})=>({type,name,description,parameter_spec}));
      if(!templates.length)return '当前没有本机可领取的 PC 任务模板。服务器需有 PC 模板，本机也需安装同类型处理器。';
      if(!instruction||/^(?:列表|有哪些|查看模板|有哪些模板|[。！!])(?:[？?。！!])?$/u.test(instruction))
        return (pool?'可派给任意电脑的模板：':'本机可领取的模板：')+templates.map(t=>t.name+'（'+t.type+'）').join('、');
      // 任务领取截止属于宿主参数；只取指令中明示的时间，避免小模型自行补日期。
      const cutoff=/(?:^|[，,；;。\s])(?:任务截止(?:时间)?|领取截止(?:时间)?|截止时间|截止)[为到是：:\s]*(.+?)[。！!]?\s*$/u.exec(instruction);
      let deadline;
      if(cutoff){
        const stamp=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:\d{2})?$/u.exec(cutoff[1].trim());
        if(!stamp)return '请在指令末尾写明任务截止日期和时间，例如“，任务截止 2026-12-01 18:00”（默认东京时间）。';
        deadline=normalizeDeadline(stamp[1]+'T'+stamp[2]+(stamp[3]??'+09:00'));
      }
      const skill=await readSkill('serverTask');
      progress('正在本机按任务模板解析…');
      const command=cutoff?instruction.slice(0,cutoff.index):instruction;
      const now=new Date();
      async function planStep(command){
        const prompt=imagePrompt(command);
        if(prompt!==null){
          const template=templates.find(t=>t.type===PC_IMAGE_GENERATE);
          if(!template)throw Error('当前服务器或目标电脑尚未提供文字生图模板。');
          if(!prompt||!validateParameters(template.parameter_spec,{prompt}).valid)throw Error('请在“生图：”后写 1 至 2000 字的图片描述。');
          return {type:PC_IMAGE_GENERATE,params:{prompt},target_device_id:target};
        }
        const exact=explicitRegistration(command,now);
        if(exact){
          const t=templates.find(t=>t.type===exact.type);
          if(!t||!validateParameters(t.parameter_spec,exact.params).valid)throw Error('服务器缺少该模板或参数无效。');
          return {...exact,target_device_id:target};
        }
        const exercise=/^(?:请|帮我)?(?:登记|登录|记录|新增|添加)(?:一(?:条|个))?(?:当前时间的?)?运动记录[，,：:\s]*(?:内容(?:是|为)?[：:\s]*)?「([^「」]+)」[。！!]?$/u.exec(command.trim());
        const subject=command.replace(/[「“][^「」“”]*[」”]/gu,'');
        const hints=[[/回显/u,'pc.echo'],[/日记/u,'pc.diaries.create'],[/随手记/u,'pc.records.create'],
          [/吃喝|饮食/u,'pc.food.create'],[/运动记录/u,'pc.exercise.create'],[/撸管/u,'pc.event.create'],
          [/长期(?:计划|任务)/u,'pc.planner.hours'],[/提醒/u,/移到|移动|挪到|调整到|改到|改为/u.test(subject)?'pc.reminders.move':'pc.reminders.create']];
        const matches=hints.filter(([pattern])=>pattern.test(subject));
        const resource=requestsResource(command);
        if(resource&&!templates.some(t=>t.type==='pc.resources.create'))throw Error('当前服务器或目标电脑尚未提供鱼与熊掌资源登记模板。');
        const type=resource?'pc.resources.create':exercise?'pc.exercise.create':matches.length===1?matches[0][1]:null;
        // 旧服务器只有自定义模板时，继续使用其真实清单。
        const candidates=type&&templates.some(t=>t.type===type)?templates.filter(t=>t.type===type):templates;
        if(!candidates.length)throw Error('当前服务器没有运动登记模板。');
        const context={指令:command,派发目标:target,模板:candidates};
        const schema=planSchema(candidates,exercise?.[1]);
        function normalize(plan){
          if(typeof plan?.question==='string'&&plan.question.trim())return {question:plan.question.trim()};
          if(plan?.target_device_id!=null&&plan.target_device_id!==target)return null;
          const template=candidates.find(item=>item.type===plan?.type);
          if(!template||!plan.params||typeof plan.params!=='object')return null;
          const params={...plan.params};
          if(['pc.reminders.move','pc.reminders.create'].includes(plan.type)&&params.deadline){
            const dates=[...new Set(subject.match(new RegExp(datePattern,'gu'))??[])];
            if(dates.length!==1)return {question:'请明确提醒的目标日期。'};
            params.deadline=businessDate(dates[0],now);
          }
          if(plan.type==='pc.resources.create')Object.assign(params,resourceParams(command,params,true));
          if(plan.type===PC_IMAGE_GENERATE)params.prompt=command.trim();
          if(!validateParameters(template.parameter_spec,params).valid||(exercise&&params.body!==exercise[1]))return null;
          return {type:template.type,params,target_device_id:target};
        }
        const instruction=[skill.content,skill.localAi?.work].filter(Boolean).join('\n');
        if(work)return work({purpose:'服务器任务参数',context,instruction,schema,signal,onProgress:progress,redraft:skill.workRedrafts,
          skill:{name:skill.skill,version:skill.version},normalize(raw){const value=normalize(raw);return value&&{value};},
          async cloud(activeSignal,feedback){
            const messages=[...(feedback?[{role:'user',content:'上轮复审反馈：'+feedback.slice(0,600)}]:[]),
              {role:'user',content:'只根据以下请求准备 PC 任务建议，并限定在这些可用模板：'+JSON.stringify(context)}];
            const result=await call('/api/assistant/message',{messages,target_device_id:target},activeSignal);
            return result.proposal??(/[？?]$/u.test(result.reply?.trim())?{question:result.reply}:null);
          }});
        const plan=await localModel?.analyze(JSON.stringify(context),{hint:'serverTask',signal,
          skillInstruction:{name:skill.skill,version:skill.version,instruction,schema}});
        signal?.throwIfAborted();
        if(!plan||plan.error)throw Error('本地模型未能生成任务方案，请稍后再试。');
        const value=normalize(plan);
        if(!value)throw Error('任务方案与已有 PC 模板不匹配，请补充任务名称和所需参数。');
        return value;
      }
      const steps=imagePrompt(command)!==null?[command]:serverTaskSteps(command),proposals=[];
      if(!steps.length)throw Error('请列出任务链的事项。');
      for(const step of steps){
        const item=await planStep(step);
        if(item.question)return item.question;
        if(deadline)item.deadline_at=deadline;
        proposals.push(item);
      }
      const proposal=proposals[0],serial=proposals.length>1;
      const template=templates.find(t=>t.type===proposal.type);
      const choice=await dialog.showMessageBox({type:'question',title:'服务器任务',message:serial?'按以下顺序提交 '+proposals.length+' 项任务？':(pool?'派给任意一台电脑执行「':'提交并由本机领取「')+template.name+'」？',
        detail:serial?['目标 PC：'+target,...proposals.map((p,i)=>(i+1)+'. '+templates.find(t=>t.type===p.type).name+' '+JSON.stringify(p.params))].join('\n'):[proposal.type,'目标 PC：'+(pool?'all（任意一台空闲电脑）':target),JSON.stringify(proposal.params,null,2),
          proposal.deadline_at&&'截止：'+new Date(proposal.deadline_at).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'})+' JST'].filter(Boolean).join('\n'),
        buttons:['取消',serial?'提交串行任务链':pool?'提交到 all':'提交并领取'],defaultId:0,cancelId:0});
      signal?.throwIfAborted();
      if(choice.response!==1)return '已取消服务器任务。';
      const {submission_id}=await call('/api/task-submissions',{},signal);
      if(!isSubmissionId(submission_id))throw Error('服务器未返回有效提交号。');
      const record={body:serial?{submission_id,serial_pc:true,name:'绯月串行任务',nodes:proposals.map((p,i)=>({...p,key:'step-'+(i+1)}))}:{...proposal,submission_id}};
      await writeFile(file+'.tmp',JSON.stringify(record),{mode:0o600});
      await rename(file+'.tmp',file);
      return await submit(record);
    }finally{active=false;}
  };
}
