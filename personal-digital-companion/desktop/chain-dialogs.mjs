const stamp=value=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'medium'}).format(new Date(value));
export function chainDetail(chain) {
  const names=new Map(chain.nodes.map(n=>[n.node_id,n.key]));
  const lines=chain.nodes.map(n=>{
    const t=n.current_task,device=t.target_device?.alias||t.target_device?.computer_name||t.target_device_id||'云端';
    return `${n.key} · ${t.definition?.name||t.type} · ${n.skipped?'已跳过':t.status}\n终端：${device}；前置：${names.get(n.depends_on)||'无'}\n${(n.reasons?.claim||[]).map(r=>r.message).join('；')}`;
  });
  const notes=(chain.history||[]).filter(h=>['force','continue'].includes(h.action)).map(h=>
    `${stamp(h.created_at)} JST · ${h.action==='force'?'强制重做':'继续重做'} · ${h.from_device_id||'无'} → ${h.to_device_id||'无'}`);
  return [`本机已接取 ${chain.held_count}/2；任务组：${chain.status}`,...lines,...notes].join('\n\n');
}

// 沿用原生对话框提供可操作的验收入口；管理页面由界面线接同一接口。
export function createChainDialogs({dialog,client,runTask,request,deviceId,canShow,supports}) {
  let showing=null;
  const tell=(message,detail='')=>dialog.showMessageBox({type:'info',title:'任务管理',message,detail,buttons:['确定']});
  async function inspect(id) {
    while(canShow()) {
      const chain=await client.get(id);
      const labels=chain.nodes.map(n=>`${n.key} · ${n.current_task.definition?.name||n.current_task.type}`);
      const choice=await dialog.showMessageBox({type:'info',title:'完整任务链',message:`${chain.name||'任务链'}${chain.status==='ACTIVE'&&chain.blocked_reasons?.length?'：当前无可接取节点':''}`,detail:chainDetail(chain),
        buttons:['返回',...labels,'停止本组'],defaultId:0,cancelId:0});
      if(!canShow()||choice.response===0)return;
      if(choice.response===labels.length+1){
        const confirm=await dialog.showMessageBox({type:'warning',message:'停止本组的新领取？已执行任务仍可完成。',buttons:['取消','停止'],defaultId:0,cancelId:0});
        if(canShow()&&confirm.response===1)await client.stop(id);
        continue;
      }
      const node=chain.nodes[choice.response-1];if(!node)return;
      const actions=[['claim','接取'],['continue','继续重做'],['skip','跳过'],['force','强制接取并重做']]
        .filter(([action])=>node.eligibility[action]&&(action==='skip'||supports(node.current_task)));
      const selected=await dialog.showMessageBox({type:'info',title:'确认任务操作',message:node.current_task.definition?.name||node.current_task.type,
        detail:`${JSON.stringify(node.current_task.params)}\n${node.current_task.definition?.procedure||''}\n${!supports(node.current_task)?'本机尚未安装此任务处理函数。':''}\n${chainDetail(chain)}`,
        buttons:['返回',...actions.map(([,label])=>label)],defaultId:0,cancelId:0});
      if(!canShow()||selected.response===0)continue;
      const action=actions[selected.response-1]?.[0];if(!action)continue;
      // 启动后不等待执行结束，允许用户显式接取第二个；云端原子限制名额。
      const work=action==='claim'?runTask(node.current_task.task_id):client.decide(id,node,action);
      void work.catch(error=>canShow()?tell(error.message):undefined);
      return;
    }
  }
  async function show() {
    if(showing)return showing;
    showing=(async()=>{
      if(!canShow())return;
      const pending=client.pending();
      if(pending.length){
        const pick=await dialog.showMessageBox({type:'warning',message:'有操作等待核对原回执',
          detail:'不会另建一轮。结果未知的执行请使用“中断任务与补传”。',buttons:['查看任务',...pending.map(p=>`${p.action} · ${p.task_id||'任务组'}`)],defaultId:0,cancelId:0});
        if(!canShow())return;
        if(pick.response>0){void client.resume(pending[pick.response-1].request_id).catch(error=>canShow()?tell(error.message):undefined);return;}
      }
      let after=null;
      do{
        const page=await client.list(after);if(!canShow())return;
        const pick=await dialog.showMessageBox({type:'info',title:'主动接取任务',message:'选择任务组查看完整链',
          buttons:['关闭','本机待领取单任务',...page.chains.map(c=>c.name||c.chain_id),...(page.next_after?['下一页']:[])],defaultId:0,cancelId:0});
        if(!canShow()||pick.response===0)return;
        if(pick.response===1){await singles();return;}
        const chain=page.chains[pick.response-2];if(chain){await inspect(chain.chain_id);return;}
        after=page.next_after;
      }while(after&&canShow());
    })();
    try{return await showing;}finally{showing=null;}
  }
  async function singles(){
    const response=await request(`/api/devices/${deviceId}/pending`,{method:'GET',cache:'no-store'});
    if(!response.ok)throw new Error('获取任务清单失败');
    const page=await response.json();
    const tasks=page.tasks.filter(supports);
    if(!canShow())return;
    if(!tasks.length){await tell('当前没有本机可接取且已安装处理函数的任务','链式任务的阻塞原因请在完整任务链中查看。');return;}
    const choice=await dialog.showMessageBox({type:'info',message:'显式接取一个任务',detail:'接取后会立即执行；本机最多同时接取两个。',
      buttons:['返回',...tasks.map(t=>`${t.type} · ${t.task_id}`)],defaultId:0,cancelId:0});
    if(canShow()&&choice.response>0)void runTask(tasks[choice.response-1].task_id).catch(error=>canShow()?tell(error.message):undefined);
  }
  return {show,inspect};
}
