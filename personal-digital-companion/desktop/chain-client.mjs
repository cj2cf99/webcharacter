import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// 显式操作的少量本地回执记录；不建立自动调度或重放队列。
export function createChainClient({profile,request,deviceId,executor,executeClaimed,canStart,canAcquire=()=>true,waitForStart=async()=>{}}) {
  const path=join(profile,'chain-requests.json');
  let saved=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
  if(!saved||typeof saved!=='object'||Array.isArray(saved))throw new Error('链式任务本地记录无效');
  const active=new Set();
  function persist(){writeFileSync(`${path}.tmp`,JSON.stringify(saved),'utf8');renameSync(`${path}.tmp`,path);}
  async function call(url,body) {
    if(!request)throw new Error('未配置任务云端连接');
    const response=await request(url,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json();
    if(!response.ok)throw Object.assign(new Error(value?.error?.message||'任务操作未成功'),{status:response.status});
    return value;
  }
  async function resume(id) {
    if(!canStart())throw new Error('退出检查或本机两个任务名额已满，稍后重试');
    if(active.has(id))throw new Error('该操作正在处理');
    const item=saved[id];if(!item)throw new Error('待确认操作不存在');
    if(item.body.action!=='skip'&&!item.url.endsWith('/stop')&&!canAcquire())throw new Error('本机两个任务名额已满');
    active.add(id);
    try {
      let response=item.receipt;
      if(!response) {
        try{response=await call(item.url,item.body);}catch(error){
          // 明确4xx无提交，可刷新状态后重新选择；断网/5xx保留原request_id。
          if(error.status>=400&&error.status<500){delete saved[id];persist();}
          throw error;
        }
        const receipt=response.claimReceipt;
        if(response.acknowledged!==true&&response.claimed!==true)throw new Error('未收到有效操作回执，请重试原操作');
        const acquisition=item.body.action!=='skip'&&!item.url.endsWith('/stop');
        if(acquisition&&!receipt)throw new Error('领取回执缺少任务，保留原操作');
        if(!acquisition&&receipt)throw new Error('决定回执包含意外领取，保留原操作');
        if(!acquisition&&response.operation?.request_id!==id)throw new Error('决定回执标识不一致，保留原操作');
        if(receipt&&(receipt.request_id!==id||receipt.task?.target_device_id!==deviceId
          ||receipt.task?.task_id!==(item.body.new_task_id||item.task_id)))throw new Error('领取回执不一致，保留原操作');
        await waitForStart();
        if(!canStart())throw new Error('应用正在退出，原操作保留待核对');
        if(receipt)executor.prepare(receipt.task);
        item.receipt=response;persist();
      }
      if(response.claimReceipt) {
        const result=await executeClaimed(response.claimReceipt);
        delete saved[id];persist();return result;
      }
      delete saved[id];persist();return response;
    } finally {active.delete(id);}
  }
  function submit(url,body,taskId) {
    if(!canStart())throw new Error('退出检查或本机两个任务名额已满，未接取任务');
    if(body.action!=='skip'&&!url.endsWith('/stop')&&!canAcquire())return Promise.reject(new Error('本机两个任务名额已满'));
    if(Object.values(saved).some(item=>item.task_id===taskId&&taskId))throw new Error('此任务有待确认操作，请重试原操作');
    const request_id=randomUUID();saved[request_id]={url,body:{...body,device_id:deviceId,request_id},task_id:taskId};persist();
    return resume(request_id);
  }
  return {
    list:after=>call(`/api/chains?device_id=${deviceId}${after?`&after=${encodeURIComponent(after)}`:''}`),
    get:id=>call(`/api/chains/${encodeURIComponent(id)}?device_id=${deviceId}`),
    pending:()=>Object.entries(saved).filter(([id])=>!active.has(id)).map(([request_id,item])=>({request_id,task_id:item.task_id,action:item.body.action||(item.url.endsWith('/stop')?'stop':'claim')})),
    activeCount:()=>active.size,
    forgetTask:id=>{for(const [key,item] of Object.entries(saved))if(item.task_id===id||item.receipt?.claimReceipt?.task?.task_id===id)delete saved[key];persist();},
    resume,
    claim:task=>submit(`/api/tasks/${encodeURIComponent(task.task_id)}/claim`,{},task.task_id),
    decide:(chain,node,action)=>{
      const body={action,expected_task_id:node.current_task.task_id};
      if(['force','continue'].includes(action)){
        if(!canStart()||!canAcquire())return Promise.reject(new Error('本机暂不能接取新任务'));
        if(Object.values(saved).some(item=>item.task_id===node.current_task.task_id))throw new Error('此任务有待确认操作，请重试原操作');
        body.new_task_id=randomUUID();
        // 先检查本机已安装处理函数与参数，避免领取后才发现根本无法执行。
        executor.prepare({...node.current_task,task_id:body.new_task_id,target_device_id:deviceId});
      }
      return submit(`/api/chains/${encodeURIComponent(chain)}/nodes/${encodeURIComponent(node.node_id)}/decision`,body,node.current_task.task_id);
    },
    stop:id=>submit(`/api/chains/${encodeURIComponent(id)}/stop`,{},null),
  };
}
