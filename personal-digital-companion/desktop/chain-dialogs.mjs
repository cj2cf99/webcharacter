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

export function createChainDialogs({dialog,client,runTask,canShow,supports}) {
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
  return {inspect};
}
