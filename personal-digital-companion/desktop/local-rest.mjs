import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {batchId,inputFields} from './garden-registration.mjs';
import {gardenRepo,loadPackage} from './garden-backend.mjs';
import {firstUse} from './garden-guide.mjs';
import {readSkillDirectory} from './interaction-skills.mjs';
import {normalizeDeadline} from '../agent/tasks/deadline.mjs';
import {CLI_COMMANDS} from './borrow.mjs';

export const host='127.0.0.1',port=8765;
const tokenFile='local-api.token';
const routes=[
  {method:'GET',path:'/',auth:false,summary:'从监听地址发现本实例的调用说明',response:'与 /infoguide 相同'},
  {method:'GET',path:'/infoguide',auth:false,summary:'读取本实例的调用说明',response:'此说明'},
  {method:'GET',path:'/v1/skills',summary:'从绯月总纲读取技能、可做的事、调用方式、示例及当前版本',
    response:'{ router, skills: [{id, name, does, call, examples, version, source, workflow?}], warnings }'},
  {method:'POST',path:'/v1/registration-turns/:id',summary:'按稳定编号排队，队首且上次登记已结束时才定稿；可重复查询，确认前仅传摘要',body:{draftHash:'草案 SHA-256',reviewHash:'可选，队首制单完成后绑定最终清单',poll:'可选，仅查询原排队',continues:'续办填原清单摘要'},response:'{state: waiting|ready|submitted, position?, batch?}'},
  {method:'POST',path:'/v1/registration-turns/:id/cancel',summary:'放弃尚未提交的草案，释放队首或退出等待',body:{draftHash:'原草案摘要',continues:'续办填原清单摘要',unsealedOnly:'制单失败时只释放未定稿位置'},response:'{state:cancelled|retained}'},
  {method:'GET',path:'/v1/batches',summary:'按新到旧查看批次，limit 为 1–100，before 为上页末项 cursor；unacknowledged=1 时只列已完成或暂停、尚未取回回执的批次',response:'{ batches: Batch[] }'},
  {method:'GET',path:'/v1/batches/:id',summary:'查看一个批次及各步回执；未完成时附 queue',response:'Batch'},
  {method:'POST',path:'/v1/batches',summary:'提交已经用户逐项确认、已提交 Git 的花园登记包；本地待处理有名额即入队，不必等绯月空闲，满员返回 429',
    body:{id:'release-20261121',commit:'40 位 Git SHA',reviewHash:'registration.json 的规范化 SHA-256',userConfirmed:true},response:'{ existing: boolean, batch: Batch }'},
  {method:'POST',path:'/v1/batches/:id/ack',summary:'调用方已把 done 批次的最终回执记入纪要后标记取回；无需正文，重复调用返回原回执',response:'Batch'},
  {method:'POST',path:'/v1/batches/:id/retry',summary:'恢复暂停批次；重新读取目标，内容变化时需另行确认',
    body:{reviewHash:'原确认摘要'},response:'Batch'},
  {method:'POST',path:'/v1/batches/:id/revise',summary:'基线变化后，以原批次已核对步骤和重新确认的剩余清单续办。在途步骤须按新确认的当前修订核实终值及归属。制单请求的 continues 填旧 reviewHash，Git 包目录使用原 id',
    body:{id:'原批次编号',commit:'新提交号',reviewHash:'新确认摘要',userConfirmed:true},response:'Batch'},
  {method:'POST',path:'/v1/reminders',summary:'将已获用户授权的一次性提醒放入同一正式工作队列。新建 202，原编号与相同内容重交 200，内容冲突 409，满员 429。',
    body:{id:'稳定编号，同花园批次格式',title:'复盘 PE Band 同步',content:'可选，保留提醒正文原文',deadline:'2026-12-07T09:30+09:00'},response:'{ existing: boolean, reminder: Reminder }'},
  {method:'GET',path:'/v1/reminders/:id',summary:'按原编号查询提醒登记。done 表示取得既有提醒记录编号，找不到返回 404。任何状态都不返回正文。',response:'Reminder'},
  {method:'POST',path:'/v1/reminders/:id/retry',summary:'恢复 blocked 提醒并核对原登记，沿用原编号和正文，无需提交正文。',response:'Reminder'},
  {method:'POST',path:'/v1/borrow',summary:'本机程序借用绯月的 AI、ComfyUI、已登记 CLI 或 agy 文本。与生图同属并行工作，不占正式名额；借用任务之间逐个执行，agy 单独排队并给绯月自身调用让位。新建 202，同编号重交 200 返回原任务。请求体上限 30MB。',
    body:{id:'调用方生成的稳定编号',channel:'ai | comfy | cli | agy',kind:'ai：gemini-image',prompt:'ai、agy：提示词 1～4000 字',images:'ai：可选，最多 4 张 [{mime,base64}]',aspectRatio:'ai：可选，如 2:3',workflow:'comfy：upscale',image:'comfy：{mime,base64}',command:'cli：已登记命令 ID'},
    response:'{ existing: boolean, job: BorrowJob }'},
  {method:'GET',path:'/v1/borrow/:id',summary:'按原编号查询借用任务。结果只留在内存（最近 30 个），重启后返回 404，需按原内容重交。',response:'BorrowJob'},
  {method:'DELETE',path:'/v1/borrow/:id',summary:'取消未完成的 agy 借用；排队的直接移除，执行中的中断并丢弃结果。其他通道返回 409。',response:'{ id, cancelled: true }'},
];
export function infoGuide(address,repo=gardenRepo,channels=['ai','comfy','cli']){
  return {version:9,baseURL:address,firstUse:firstUse(repo,address),auth:'除本说明外均使用 Authorization: Bearer <token>；从已独立核实的 instance.profile 下读取 '+tokenFile+'，勿打印或提交令牌。',
    contentType:'application/json',routes:routes.map(r=>({auth:true,...r})),
    skillDirectory:{method:'GET',path:'/v1/skills',auth:true,usage:'技能描述和调用示例来自总纲。workflow 的 entry、steps、exit 表示当前对话转录流程。按每项 call 说明通过相应入口调用。'},
    prepare:'依次执行 firstUse.commands 中的 sync、inspect、prepare，使用对应 cwd 与 args。制单只在调用侧生成 registration.json、逐步 SQL 和 reviewHash。先向用户展示归属、前后值、版本、实际结果和无需更新项，取得明确确认；内容改变须重新展示。',
    package:'将确认的 registration.json 和 step-001.sql 等原样放入主项目 database/changes/<id>/，先提交 Git。实际发布结果明确后，一批只 POST 一次。桌宠更新交给完成受控重启并验收后的实例。',
    prepareInput:{id:'稳定的发布或批次编号，小写字母、数字、下划线或短横线，最多 80 位',title:'批次名称',kind:'garden | desktop-update',
      release:'none | succeeded | failed，桌宠更新填写实际发布结果',result:'实际结果、版本、时间和必要说明',noChanges:['无需更新的类别'],
      steps:[{label:'将向用户展示的动作',resource:'projects | flowers | seeds | land | improvements | bugs | relations | platforms | features | links | sources | deploy',
        id:'修改或种子落地填写实际编号，新增省略',data:'对应花园模型已有字段；deploy 使用 deployed_at 和 items[{flower_id,note}]'}]},
    example:{method:'POST',path:'/v1/batches',headers:{Authorization:'Bearer <个人令牌>','Content-Type':'application/json'},
      json:{id:'desktop-release-20261121',commit:'<已提交准确 SQL 的完整提交号>',reviewHash:'<制单时展示的 SHA-256>',userConfirmed:true},
      follow:'入队即可结束本轮；下次开工 GET /v1/batches?unacknowledged=1，把 done 回执记入纪要后 POST /v1/batches/desktop-release-20261121/ack'},
    workStates:{formal:'正式工作：花园登记批次、用户的登记、云端派给本机的任务。不被打断；本地待处理合计上限 20（含执行中，暂停批次也占名额），按到达顺序逐个执行。',
      idle:'闲时工作：写日记、补评价、念叨、手记核对、此刻所想等自发整理，正式工作开工时暂停并保存草稿，空闲后续做。问答、生图、各路轮询与正式工作并行，互不等待。'},
    supported:'项目、功能、种子及落地、改善、Bug、项目关联、平台、平台功能、链接、数据源、部署及明细，字段和版本取自花园既有模型。',
    resourceFields:inputFields,fieldNotes:'时间使用带时区的 ISO 8601；外键使用已核对的实际编号。land 的 id 是待落地种子编号。deploy.items 每项包含 flower_id 和 note，版本由既有花园模型计算，先展示给用户。续办在制单请求中附 continues（原摘要）。',
    batch:{id:'稳定批次编号',title:'名称',reviewHash:'确认摘要',commit:'审核包提交',state:['queued','running','verifying','archiving','blocked','done'],steps:'有序 [{ label, state: pending|checking|applying|verified, at?, revision?, commit? }]。checking 表示正在核对基线，写入尚未发送。',created:'UTC ISO',finished:'整批回读确认 UTC ISO 或 null',error:'暂停原因或 null',acknowledged:'调用方取回回执的 UTC ISO 或 null',
      queue:'仅未完成批次：{ position: 1 起，1 为正在执行或下一个, used: 已占名额, limit: 20, running: 当前执行中的正式工作标题或 null }'},
    reminder:{id:'调用方生成并保存的稳定编号',title:'标题',deadline:'东京时间 YYYY-MM-DDTHH:mm+09:00',state:['queued','running','blocked','done'],
      recordId:'done 时为既有提醒记录编号，否则为 null',error:'暂停原因或 null',created:'UTC ISO',finished:'取得登记回执的 UTC ISO 或 null',
      retry:'请求结果未知时先 GET 原编号。404 才按原内容重交。blocked 可调用原编号的 retry，云端回执不明时核对原登记。正文只用于登记，完成后清除本地队列副本。'},
    borrow:{state:['queued','running','done','failed'],job:'{ id, channel, state, created, started, finished, error, result, queue?, waiting? }',
      result:'ai / comfy：{ image: { mime, base64, width?, height? } }；cli：{ stdout }；agy：{ text } 为模型原样回复',commands:Object.keys(CLI_COMMANDS),channels,
      waiting:'agy 排队时：busy 表示绯月正在使用 agy，cooldown 表示额度冷却',
      note:'密钥与模型都留在绯月；调用方只提交输入并按编号轮询。'},
    retry:'202 代表已持久入队，200 为查询、重复提交或恢复回执。超时先按 id 查询。blocked 保留现场；基线变化先查实际状态，只对剩余变更重新制单确认。done 表示最终回读一致，复盘已写入。错误体 {error}；400 参数，401 鉴权，403 来源，404 未找到，409 清单或状态冲突，413 过大，415 正文格式，429 本地待处理已满（稍后按同一编号重交）。',
  };
}
function credential(profile){
  const file=join(profile,tokenFile);
  try{writeFileSync(file,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}
  catch(e){if(e.code!=='EEXIST')throw e;}
  const token=readFileSync(file,'utf8').trim();
  if(!/^[a-f0-9]{64}$/.test(token))throw Error('本机 API 令牌格式异常');
  return Buffer.from('Bearer '+token);
}
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
async function bodyOf(req,limit=8192){
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')fail(415,'请提交 JSON');
  let size=0;const parts=[];
  for await(const chunk of req){size+=chunk.length;if(size>limit)fail(413,'请求体过大');parts.push(chunk);}
  try{const v=JSON.parse(Buffer.concat(parts));if(v&&typeof v==='object'&&!Array.isArray(v))return v;}catch{}
  fail(400,'JSON 请求体无效');
}
function reminderInput(input){
  const {id,title,content='',deadline}=input;
  if(Object.keys(input).some(key=>!['id','title','content','deadline'].includes(key))||typeof id!=='string'||!batchId.test(id)
      ||typeof title!=='string'||!title.trim()||title.trim().length>300||typeof content!=='string'
      ||typeof deadline!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+09:00$/.test(deadline)){
    fail(400,'请提供有效编号、标题、可选正文和带 +09:00 的东京日期及时分');
  }
  try{normalizeDeadline(deadline);}catch{fail(400,'提醒日期或时分无效');}
  return {id,title:title.trim(),content,deadline};
}
export async function openLocalREST({profile,pool,borrow,listenPort=port,repo=gardenRepo,load=input=>loadPackage(input,repo)}){
  const expected=credential(profile);
  const instance={pid:process.pid,started:new Date().toISOString(),profile};
  const server=createServer({requestTimeout:15000,headersTimeout:10000},async(req,res)=>{
    function reply(status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
    try{
      const authority=host+':'+server.address()?.port;
      if(req.headers.host!==authority||req.headers.origin||req.headers['sec-fetch-site']==='cross-site')fail(403,'仅限本机程序调用');
      const url=new URL(req.url,'http://'+authority);
      const parts=url.pathname.split('/');
      const route=routes.find(r=>r.method===req.method&&r.path.split('/').length===parts.length&&r.path.split('/').every((p,i)=>p===':id'?batchId.test(parts[i]):p===parts[i]));
      if(!route)fail(404,'接口不存在');
      if(route.auth===false)return reply(200,{...infoGuide('http://'+authority,repo,borrow?.channels?.()),instance});
      const actual=Buffer.from(req.headers.authorization??'');
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail(401,'需要本机令牌');
      if(route.path==='/v1/skills'){
        const directory=await readSkillDirectory(profile).catch(()=>null);
        if(!directory)fail(503,'技能总纲暂不可读取');
        return reply(200,directory);
      }
      const id=parts[3];
      if(parts[2]==='borrow'){
        if(!borrow)fail(503,'借用接口暂不可用');
        if(!id){const result=borrow.submit(await bodyOf(req,30*1024*1024));return reply(result.existing?200:202,result);}
        if(req.method==='DELETE'){const gone=borrow.cancel(id);if(!gone)fail(404,'借用任务不存在');return reply(200,gone);}
        const job=borrow.get(id);if(!job)fail(404,'借用任务不存在');return reply(200,job);
      }
      if(parts[2]==='registration-turns'){
        const {draftHash,reviewHash,poll,continues,unsealedOnly}=await bodyOf(req);
        if(typeof draftHash!=='string'||!(/^[a-f0-9]{64}$/).test(draftHash)||
          (reviewHash!==undefined&&(typeof reviewHash!=='string'||!(/^[a-f0-9]{64}$/).test(reviewHash))))fail(400,'需要有效草案或清单摘要');
        if(continues!==undefined&&(typeof continues!=='string'||!(/^[a-f0-9]{64}$/).test(continues)))fail(400,'续办摘要无效');
        const turn=parts[4]==='cancel'?pool.cancelTurn(id,draftHash,continues,unsealedOnly===true):pool.claimTurn(id,draftHash,reviewHash,poll===true,continues);
        return reply(turn.state==='waiting'?202:200,turn);
      }
      if(parts[2]==='reminders'){
        if(!id){
          const result=pool.submitReminder(reminderInput(await bodyOf(req)));
          return reply(result.existing?200:202,result);
        }
        const reminder=pool.getReminder(id);
        if(!reminder)fail(404,'提醒登记不存在');
        return reply(200,req.method==='GET'?pool.withQueue(reminder):pool.retryReminder(id));
      }
      if(req.method==='GET'){
        if(id){const batch=pool.get(id);if(!batch)fail(404,'批次不存在');return reply(200,pool.withQueue(batch));}
        if(url.searchParams.get('unacknowledged')==='1')return reply(200,{batches:pool.unacknowledged()});
        const limit=Number(url.searchParams.get('limit')??50),before=Number(url.searchParams.get('before')??Number.MAX_SAFE_INTEGER);
        if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(before)||before<1)fail(400,'分页参数无效');
        return reply(200,{batches:pool.list(limit,before)});
      }
      if(id&&!pool.get(id))fail(404,'批次不存在');
      if(route.path.endsWith('/ack'))return reply(200,pool.ack(id));
      const input=await bodyOf(req);
      if(route.path.endsWith('/retry'))return reply(200,pool.retry(id,input.reviewHash));
      if(input.userConfirmed!==true||typeof input.id!=='string'||!batchId.test(input.id)||!(/^[0-9a-f]{64}$/).test(input.reviewHash)||!(/^[0-9a-f]{40}$/).test(input.commit))fail(400,'提交前须确认准确清单并提供编号、摘要和提交号');
      if(id){
        if(id!==input.id)fail(400,'续办清单须使用原批次编号');
        return reply(200,await pool.revise(await load(input),input.commit,input.reviewHash));
      }
      const old=pool.get(input.id);
      if(old){if(old.reviewHash!==input.reviewHash)fail(409,'批次编号已用于另一份清单');return reply(200,{existing:true,batch:pool.withQueue(old)});}
      const plan=await load(input);
      const result=pool.submit(plan,input.commit,input.reviewHash);
      reply(result.existing?200:202,result);
    }catch(e){reply(e.status??409,{error:e.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(listenPort,host,resolve);});
  return {address:'http://'+host+':'+server.address().port,close:()=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();})};
}
