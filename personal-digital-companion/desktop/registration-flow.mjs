import {existsSync} from 'node:fs';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isSubmissionId } from '../agent/tasks/submissions.mjs';
import {registrationTypes} from './conversation-routing.mjs';
import {calendarDate,datePattern,relativePattern,tokyoDate} from './calendar-date.mjs';
import {registrationDraft} from './registration-draft.mjs';

// “加个提醒，这周日看手顺书，……”只需一个日期、标题和可选正文。
// 有第二个日期、其它指令或额外字段时，交给原有计划器拆解。
const singleReminder=new RegExp('^(?:(?:宝贝|绯月|请|帮我|给我)[，,\\s]*)*(?:加|添加|新增|创建|设|设置)(?:一?[个条项])?提醒[，,：:\\s]+('+relativePattern+')\\s*(.+)$','u');
function datedReminder(match,deadline){
  const subject=match[2];
  if(!/^(?:看|读|写|做|交|提交|检查|复习|确认|联系|完成|推进|整理|准备|还|取|买|去|参加|开会|处理|更新|查看)/u.test(subject)||
     new RegExp(datePattern+'|(?:周|星期)[一二三四五六日天]|\\d{1,2}[月号点时]|\\d{1,2}[:：]\\d{2}|提醒|待办|随手记|日记|登记|另外|然后|同时|顺便|再(?:加|设|建)|取消|不要设|不设日期|改到|改为|推迟|提前|优先级|紧急|重复|循环|每[天周月年]|[；;\\n]','u').test(subject))return null;
  const split=subject.search(/[，,]/u);
  const title=(split<0?subject:subject.slice(0,split)).trim();
  const content=split<0?'':subject.slice(split+1).trim();
  if(!title||title.length>300||content.length>30000)return null;
  const params={title,deadline,...(content?{content}:{})};
  return {pending:[],chain:{name:'临时登记',nodes:[{key:'entry-1',type:'reminders.create',params,target_device_id:null}]}};
}

function chooseNode(chain) {
  const active = chain.nodes.filter(node => !node.skipped);
  const waiting = active.find(node => node.current_task.status === 'RUNNING');
  if (waiting) return { status: 'waiting', node: waiting };
  const failed = active.find(node => node.current_task.status === 'FAILED');
  if (failed) return { status: 'needs_decision', node: failed };
  const byId = new Map(chain.nodes.map(node => [node.node_id, node]));
  const next = active.find(node => {
    if (node.current_task.status !== 'PENDING') return false;
    let prerequisite = node.depends_on;
    while (prerequisite) {
      const required = byId.get(prerequisite);
      if (!required || (!required.skipped && required.current_task.status !== 'COMPLETED')) return false;
      prerequisite = required.depends_on;
    }
    return true;
  });
  return next ? { status: 'ready', node: next } : { status: 'blocked', node: null };
}

export function createRegistrationFlow({ profile, request, canStart = () => true, canEnter=canStart, pauseChain = () => false, log = () => {}, record = () => {}, now=Date.now }) {
  const file = join(profile, 'registration-submission.json');
  let active = null;
  function recordNode(task,stage,action) {
    const p=task.params??{}, result=task.result??{};
    const recordedAt=Number.isSafeInteger(result.created_at)&&Number.isFinite(new Date(result.created_at).getTime())
      ?new Date(result.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo',hour12:false})+' JST':'';
    record({key:'registration:'+task.task_id+':'+stage,taskId:task.task_id,
      title:registrationTypes[task.type]??task.definition?.name??'随口登记',action,
      detail:[p.title,p.body??p.content,p.reflection,p.deadline&&'到期：'+p.deadline,
        recordedAt&&'登记时间：'+recordedAt,result.record_id&&'记录编号：'+result.record_id,task.error].filter(Boolean).join('\n')});
  }

  async function call(path, body, signal) {
    if (!request) throw Error('未配置云端登记连接');
    if (!canStart()) throw Error('精灵暂时不能继续领取，登记请求已保留');
    const response = await request(path, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      ...(signal?{signal}:{}),
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    let result;
    try { result = await response.json(); } catch { throw Error('云端登记回执无法读取，已保留原任务'); }
    if (!response.ok) throw Object.assign(new Error(result?.error?.message || '云端登记操作失败'), { code: result?.error?.code });
    return result;
  }

  async function load() {
    let saved;
    try { saved = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      throw Error('本地登记恢复记录无法读取');
    }
    if (!saved || !isSubmissionId(saved.submissionId) || !Array.isArray(saved.plan?.nodes)
      || !saved.plan.nodes.length || !Array.isArray(saved.pending) || typeof saved.created !== 'boolean') {
      throw Error('本地登记恢复记录无效');
    }
    return saved;
  }

  async function save(saved) {
    const draft = file + '.tmp';
    await writeFile(draft, JSON.stringify(saved), { encoding: 'utf8', mode: 0o600 });
    await rename(draft, file);
  }

  async function run(saved) {
    const path = `/api/chains/${saved.submissionId}`;
    function verify(chain) {
      if (chain?.chain_id !== saved.submissionId || chain.temporary_registration !== true || !Array.isArray(chain.nodes)) {
        throw Error('登记任务链回执无效，原提交号已保留');
      }
      for(const {skipped,current_task:task} of chain.nodes){
        if(task?.status==='COMPLETED')recordNode(task,'completed','已核实登记成功');
        if(task?.status==='FAILED')recordNode(task,'failed','已核实登记失败');
        if(skipped&&task)recordNode(task,'skipped','已跳过该项登记');
      }
      return chain;
    }
    let chain;
    if (!saved.created) {
      if(pauseChain(saved.submissionId))return {status:'paused',pending:saved.pending};
      saved.creating=true;await save(saved);
      if(pauseChain(saved.submissionId)){delete saved.creating;await save(saved);return {status:'paused',pending:saved.pending};}
      chain = verify(await call('/api/chains', {
        ...saved.plan, temporary_registration: true, submission_id: saved.submissionId,
      }));
      saved.created = true;
      delete saved.creating;
      await save(saved);
    } else {
      chain = verify(await call(path));
      const pendingReceipt = chooseNode(chain);
      if (chain.status === 'ACTIVE' && pendingReceipt.status === 'waiting') {
        const taskId = pendingReceipt.node.current_task.task_id;
        await call(`/api/tasks/${encodeURIComponent(taskId)}/receipt`, {});
        chain = verify(await call(path));
      }
    }
    if (saved.decision) {
      const { path: decisionPath, body } = saved.decision;
      try {
        const receipt = await call(decisionPath, body);
        if (receipt?.acknowledged !== true || receipt.operation?.request_id !== body.request_id) {
          throw Error('操作回执无效，已保留原请求');
        }
        record({key:'decision:'+body.request_id,taskId:body.expected_task_id??saved.submissionId,title:'随口登记链',
          action:({continue:'已确认继续登记',skip:'已确认跳过当前登记'})[body.action]??'已确认停止后续登记'});
      } catch (error) {
        const rejected = ['OLD_ROUND', 'REGISTRATION_BLOCKED', 'CLAIM_BLOCKED', 'OPERATION_CONFLICT', 'INVALID_DECISION'];
        if (!rejected.includes(error.code)) throw error;
        delete saved.decision;
        await save(saved);
        throw error;
      }
      delete saved.decision;
      await save(saved);
      chain = verify(await call(path));
    }
    while (canStart()) {
      if (chain.status === 'COMPLETED' || chain.status === 'STOPPED') {
        await unlink(file);
        return { status: chain.status === 'COMPLETED' ? 'completed' : 'stopped', chain, pending: saved.pending };
      }
      const next = chooseNode(chain);
      // 恢复阶段只查询原链。正在执行或回执不明的节点由服务器保留，客户端不会重新发起写入。
      if (next.status !== 'ready') return { ...next, chain, pending: saved.pending };
      if(pauseChain(saved.submissionId))return {status:'paused',chain,pending:saved.pending};
      const taskId = next.node.current_task.task_id;
      saved.sentTask=taskId;await save(saved);
      if(pauseChain(saved.submissionId)){
        delete saved.sentTask;await save(saved);
        return {status:'paused',chain,pending:saved.pending};
      }
      recordNode(next.node.current_task,'start','发起云端登记');
      try {
        const receipt = await call(`/api/tasks/${encodeURIComponent(taskId)}/execute`, {});
        if (receipt?.task_id !== taskId) throw Error('登记节点回执无效，原任务已保留');
      } catch (error) {
        recordNode(next.node.current_task,'unconfirmed','此次请求未取得完成回执，结果待核对');
        if (error?.code !== 'REGISTRATION_BLOCKED') throw error;
        chain = verify(await call(path));
        return { status: 'waiting', chain, pending: saved.pending };
      }
      chain = verify(await call(path));
      if(chain.nodes.some(node=>node.current_task.task_id===taskId&&['COMPLETED','FAILED'].includes(node.current_task.status))){
        delete saved.sentTask;await save(saved);
      }
    }
    return { status: 'paused', chain, pending: saved.pending };
  }

  function once(text, action, reviewed) {
    if(!canEnter())return Promise.reject(Error('正在准备重启或退出，暂缓新的登记。'));
    if (active) {
      if (action === undefined && (active.text === text || text === undefined)) return active.promise;
      return Promise.reject(Error('已有登记正在进行'));
    }
    const promise = (async () => {
      const saved = await load();
      if (saved) {
        if (text !== undefined) throw Error('已有登记链待处理，请先恢复原链');
        if (action !== undefined && !saved.decision) {
          if (!saved.created) throw Error('请先恢复原登记链');
          const path = `/api/chains/${saved.submissionId}`;
          const chain = await call(path);
          if (chain.chain_id !== saved.submissionId || chain.temporary_registration !== true) throw Error('登记任务链回执无效');
          const { status, node } = chooseNode(chain);
          if (chain.status !== 'ACTIVE' || (action !== 'stop' && status !== 'needs_decision')) {
            throw Error('任务链状态已改变，请先恢复原链');
          }
          const requestId = crypto.randomUUID();
          saved.decision = action === 'stop' ? {
            path: `${path}/stop`, body: { request_id: requestId },
          } : {
            path: `${path}/nodes/${node.node_id}/decision`,
            body: { action, expected_task_id: node.current_task.task_id, request_id: requestId,
              ...(action === 'continue' ? { new_task_id: crypto.randomUUID() } : {}) },
          };
          await save(saved);
        }
        return run(saved);
      }
      if (text === undefined) {
        if (action !== undefined) throw Error('没有待处理的登记链');
        return null;
      }
      const planned = reviewed ?? await preview(text);
      if (!Array.isArray(planned?.pending)) throw Error('AI 登记计划回执无效');
      if (planned.chain === null) return { status: 'needs_input', chain: null, pending: planned.pending };
      if (!Array.isArray(planned.chain?.nodes) || !planned.chain.nodes.length) throw Error('AI 登记计划回执无效');
      const issued = await call('/api/task-submissions', {});
      if (!isSubmissionId(issued?.submission_id)) throw Error('登记提交号回执无效');
      const next = { submissionId: issued.submission_id, plan: planned.chain, pending: planned.pending, created: false };
      await save(next);
      const traceId = planned.ai?.trace_id;
      void log({direction: 'local', event: 'registration_prepared', chain_id: next.submissionId,
        ...(isSubmissionId(traceId) ? {ai_trace_id: traceId} : {})});
      return run(next);
    })();
    active = { text, promise };
    void promise.finally(() => { active = null; }).catch(() => {});
    return promise;
  }

  async function preview(text,{work,signal,onProgress,submittedAt=now(),localOnly=false,diaryBody=false}={}){
    if(!canStart())throw Error('精灵暂时不能继续领取，登记请求已保留');
    if(work&&[...text].length>6000)throw Object.assign(Error('登记文字超过 6000 字符，请缩短后重试。'),{code:'MESSAGE_TOO_LARGE'});
    const match=singleReminder.exec(text.trim());
    if(match){
      const deadline=calendarDate(match[1],tokyoDate(submittedAt));
      const plan=datedReminder(match,deadline);
      if(plan)return plan;
      // 复杂事项仍走原登记技能，仅将指令日期位置换算为东京日期。
      if(!work)text=text.replace(match[1],deadline);
    }
    return work?registrationDraft(text,{call,work,signal,onProgress,submittedAt,localOnly,diaryBody}):call('/api/assistant/recording-plan',{text},signal);
  }
  return {
    preview,
    submitReviewed:(text,plan)=>once(text,undefined,plan),
    submit(text) {
      if (typeof text !== 'string' || !text.trim()) return Promise.reject(Error('请输入登记内容'));
      return once(text);
    },
    hasSaved: () => existsSync(file),
    savedId:async()=>(await load())?.submissionId,
    current:()=>active?.promise,
    async verifyForRestart(){
      const saved=await load();if(!saved)return;
      if(saved.decision)throw Error('登记决定仍待核对，请先恢复原链。');
      if(!saved.created&&!saved.sentTask&&!saved.creating)return;
      const path='/api/chains/'+saved.submissionId;
      async function readChain(){
        const chain=await call(path);
        if(chain?.chain_id!==saved.submissionId||chain.temporary_registration!==true||!Array.isArray(chain.nodes))
          throw Error('原登记链尚未取得有效回执。');
        return chain;
      }
      let chain=await readChain();
      const pending=chain.nodes.filter(node=>node.current_task.status==='RUNNING');
      if(pending.length){
        for(const node of pending){
          const id=node.current_task.task_id;
          // 服务端只查原节点的业务回执，期间已完成也由下一次读取确认。
          await call('/api/tasks/'+encodeURIComponent(id)+'/receipt',{}).catch(()=>{});
        }
        chain=await readChain();
      }
      if(chain.nodes.some(node=>node.current_task.status==='RUNNING')||
        saved.sentTask&&!chain.nodes.some(node=>node.current_task.task_id===saved.sentTask&&['COMPLETED','FAILED'].includes(node.current_task.status)))
        throw Error('登记指令仍待云端核对，请恢复原链后再重启。');
    },
    resume: () => once(),
    decide(action) {
      if (!['continue', 'skip', 'stop'].includes(action)) return Promise.reject(Error('登记操作无效'));
      return once(undefined, action);
    },
    activeCount: () => active ? 1 : 0,
    waitForStop: () => active?.promise.catch(()=>{}),
  };
}
