import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// 参数是独立 argv 元素。调用方替换整项占位符，无需拼接命令行。
export function firstUse(repo){
  const appRoot=fileURLToPath(new URL('../',import.meta.url));
  const tool=join(appRoot,'tools','prepare-garden-registration.mjs');
  const repoRoot=resolve(repo);
  const cli=[tool,'--repo',repoRoot];
  return {
    appRoot,repoRoot,packageRoot:join(repoRoot,'database','changes'),
    prerequisites:'Windows 本机，Node.js 24、npm.cmd、Git、已安装依赖的主项目及其对 stockanalysis D1 的 Wrangler 授权。缺少依赖、授权或用户登记意愿时停止。',
    verifyInstance:'先通过桌面快捷方式及运行进程独立确认实际安装目录。用 Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort <实际端口> 核对 OwningProcess 与 instance.pid，再用 Get-CimInstance Win32_Process 核对该进程的 CommandLine、CreationDate、实际应用目录及资料目录。instance.started 是监听启动时间。核实后才运行下列命令并从 instance.profile 读取 local-api.token；只把令牌发往已核实的本机实例。',
    authentication:{fileRelativeToVerifiedProfile:'local-api.token',encoding:'utf8',trim:true,header:'Authorization',scheme:'Bearer',transport:'同一回环地址的本机 HTTP 客户端；禁用跨源浏览器调用。'},
    commands:{
      sync:{cwd:repoRoot,command:'npm.cmd',args:['run','db:sync-schema']},
      inspect:{cwd:appRoot,command:'node',args:[...cli,'inspect','{catalogFile}']},
      prepare:{cwd:appRoot,command:'node',args:[...cli,'prepare','{requestFile}','{draftDir}']},
      stage:{cwd:repoRoot,command:'git',args:['add','--','database/changes/{id}']},
      commit:{cwd:repoRoot,command:'git',args:['commit','--only','-m','花园登记 {id}','--','database/changes/{id}']},
      readCommit:{cwd:repoRoot,command:'git',args:['log','-1','--format=%H','--','database/changes/{id}']},
    },
    sequence:[
      '确认本次登记意愿和实际结果，核实实例。取得生产读取授权后，先在指定 cwd 执行 sync，成功退出才继续。',
      '在调用方私有临时目录选取新的绝对路径。执行 inspect，一次只读取得当前花园目录。catalogFile 是新文件，requestFile 是调用方编写的 UTF-8 JSON，draftDir 是尚不存在的目录。目录快照含业务数据，留在本机，不提交 Git。',
      '目录 JSON 含 baseline 和 resources。按 catalog 中的条件精确匹配全部候选，同时核对所属项目、功能和历史；多于一条要消除歧义，找不到既有目标须停止澄清。新增前也要查重。不得使用示例编号或猜下一条记录的编号。',
      '按 prepareInput 编写有序请求，原样带入目录的 baseline。制单命令返回一行 JSON {id,file,reviewHash}。file 指向完整清单；用返回的 reviewHash，避免自行哈希格式化文件。基线变化或制单失败时重新查询、检查原因。',
      '先给用户看 file 的整批实际内容：每步序号与 label、scope 中项目和功能的编号与名称、changes 中表及主键、before 和 after 全字段、新增或修改、版本前后值、真实发布结果和时间、noChanges。留存对这份清单及摘要的明确确认。未确认在此停止。',
      '获确认后将 draftDir 的 registration.json 和所有 step-NNN.sql 原样复制到 packageRoot 下以 id 命名的新目录；已有同名目录先查原批次，不覆盖。用 stage、commit、readCommit 取得仅含该包的 40 位 Git 提交号。按项目规则同步 Git。续办须核对替换原目录的文件集。',
      '使用认证和 routes 中 POST /v1/batches 请求，id、reviewHash 来自 prepare，commit 来自 readCommit，userConfirmed 仅在已留存此次确认后为 true。保存编号、提交和摘要。遇超时或重启先 GET /v1/batches/:id，404 且原确认仍有效才重送同一份。',
      '按原编号轮询至 done 或 blocked，核对所有步骤、finished 和摘要，保存最终回执。blocked 按 retry 说明处理。服务不可达时保留原包与编号等待恢复。',
    ],
    catalog:{
      project:'resources.projects 按 name 筛选，重名再按 path 或 repo_url 区分，保留实际 id。',
      flower:'resources.flowers 同时按 project_id 和 name 筛选，含当前 version 及部署次数。桌宠项目名为 网页角色组件，功能名为 绯月（桌面精灵）。',
      history:'resources.deploy 为部署头及完整 items 数组；按 items[].project_id、flower_id 核对归属，查看 deployed_at、note、version_before 和 version_after，并检查有无本批发布标记。',
      other:'其余集合键同 resource。seeds 按 project_id/title，land 使用 seeds 中 todo 的 id；improvements、bugs 按 flower_id/title；relations 按两个项目；platforms 按名称；features 按 platform_id/name；links 按 flower_id/feature_id；sources 按 name 和抓取方，含展示功能 flower_ids。',
    },
    createRules:{
      projects:'必填 name。kind 为 normal 或 hybrid。repo_url/site_url 非空时为 HTTP(S)。',
      flowers:'必填 project_id、name、type。type 为 page/service/lotus，lotus 需要 hybrid 项目。stage 按 design/proto/dev/test 前进；部署后锁定。',
      seeds:'必填 project_id、title，新增为 todo。落地走 land。',
      land:'步骤 id 为 todo 种子的 id，data 可为空对象。可传 name 和功能 type，默认沿用种子标题，类型为 page。',
      improvements:'必填已部署的 flower_id、title。status 为 open/done，可填 note。',
      bugs:'必填已部署的 flower_id、title。status 为 open/fixed。severe 为整数 -1/0/1/2。',
      relations:'必填不同的 project_a、project_b、type。type 为 dep/rel/ind。home_data 为布尔值或 0/1。',
      platforms:'必填 name，可填 abbr。',features:'必填 platform_id、name。sort_order 为非负整数。',
      links:'必填 flower_id、feature_id。status 为 ok/ng。',
      sources:'必填 name，runner_platform_id 与 runner_project_id 恰选一个。status 为 ok/ng，relay 为文本数组，flower_ids 为功能编号数组。',
      deploy:'必填带时区的 deployed_at 和非空 items。各项含唯一 flower_id 和非空 note。修改部署需传完整明细；若保留已删除功能的明细，使用其原 item_id、flower_id:null 和 note。',
    },
    releaseRules:'桌宠更新先核实安装、受控重启和验收。成功发布按现行口径在 note 写 [发布成功:批次编号]。失败发布保留实际失败原因，在改善或 Bug 的 note 写 [发布中:批次编号]，不生成成功部署及版本。发布中记录也需要展示并取得确认。',
    requestTemplate:{id:'{stableBatchId}',title:'{title}',kind:'desktop-update',release:'succeeded',result:'{verifiedResultWithTime}',noChanges:['{确实无需更新的类别}'],baseline:'{复制目录中的 baseline 对象}',steps:[
      {label:'登记本次实际部署',resource:'deploy',data:{deployed_at:'{实际带时区时间}',items:[{flower_id:'{唯一匹配的功能 id，填整数}',note:'[发布成功:{stableBatchId}] {实际更新内容}'}]}},
    ]},
  };
}
