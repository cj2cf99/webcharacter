import {isReminderCommand} from './reminder-command.mjs';
const recordCommand = /^(?:(?:请|绯月|帮我|给我|麻烦你|麻烦)[，,\s]*)*(?:(?:新增|添加|创建|写)(?:一[条篇个份])?(?:提醒|日记|随手记)|(?:记下|记一下|记录一下|登记一下|提醒我|记一笔|记一条)|(?:登记|记录|随手记|日记)[：:\s])/;
const recordSuffix = /[，,。\s](?:帮我|请)?(?:记一下|记录一下|登记一下|记下来|登记|记录)[吧。！!]?$/;
const reportedActivity = /^(?:(?:今天|昨天|刚才|刚刚|早上|中午|晚上|早餐|午餐|晚餐|早饭|午饭|晚饭|我|刚|又)\s*)*(?:吃了|喝了|跑了|步行了|运动了|散步了|骑行了|游了泳|跑步了)/;
const searchCommand = /^(?:(?:绯月|请你?|可以|麻烦你?|能不能|能否|帮我|给我|替我)[，,\s]*)*(?:到网上|在网上|上网|联网|网上|网络|用搜索引擎)(?:帮我)?(?:搜索|搜寻|搜|查找|查询|查|寻找|找|看看|看)(?:一(?:下|查|搜|找)|找|查|搜)?[下：:，,\s]*/;
const recordRequest = /^(?:(?:请|绯月|麻烦)[，,\s]*)?(?:帮我|给我|替我)(?:记录|登记|记住|记到|记入)|^(?:记录|登记)(?:一下|一条|今天|昨天|刚才|早餐|午餐|晚餐|吃喝|运动|提醒|日记|随手记)|^(?:明天|今天|后天|明早|明晚|每天|周[一二三四五六日天]).{0,14}提醒我/;
const searchSuffix = /[，,。\s]+(?:请|麻烦)?(?:你)?(?:帮我)?(?:上网|联网|在网上|网上)(?:查查|搜搜|查|搜|找|搜索|查询)(?:一下|一搜|一查)?(?:吧|看看)?[。？！!?]?$/;
const simpleSearch = /^(?:请|帮我|请帮我)?(?:搜一下|搜一搜|搜索一下|搜索)[：:，,\s]*/;
function isSelfRestart(text) {
  const match = /^(.*?)(?:重启|重新启动)(.*)$/u.exec(text.trim().replace(/[，,、\s]/gu,'').replace(/[。！!]+$/u,''));
  if (!match) return false;
  // 称呼和语气词可灵活排列。动词两侧剩余的对象必须都指向桌宠，省略对象也可以。
  const before = match[1].replace(/^(?:麻烦|拜托|请|帮我|给我|替我|现在|马上|立刻|立即|尽快|赶紧|先|再|快点|快|去|来|把|将|让|绯月|桌面精灵|桌宠|你自己|自己|自身|你)+/u,'');
  const after = match[2].replace(/谢谢$/u,'').replace(/(?:好不好|好吗|可以吗)[？?]?$/u,'')
    .replace(/(?:吧|啦|呀|啊|呗|哦)$/u,'').replace(/(?:试试看|试试|看看)$/u,'');
  return before === '' && /^(?:一下|下|一次|一遍)?(?:(?:绯月|桌面精灵|桌宠|你自己|自己|自身|你)(?:一下|下|一次|一遍)?)?$/u.test(after);
}
function requestedSearch(text) {
  const prefix = text.match(searchCommand) ?? text.match(simpleSearch);
  if (prefix) return text.slice(prefix[0].length).trim();
  if (searchSuffix.test(text)) return text.replace(searchSuffix, '').trim();
  return null;
}

export function suppliedSummaryText(text) {
  return /^(?:请\s*)?(?:帮我\s*)?(?:总结(?:一下)?(?:主要内容|重点)?|提炼(?:一下)?重点)\s*[：:]\s*([\s\S]+)$/u.exec(text)?.[1].trim();
}

function requestsRegistration(text) {
  const command = text.replace(/^(?:绯月[，,\s]*)?(?:你)?(?:能不能|能否|可不可以|可以|能)\s*(?=(?:帮我|给我|替我|记|提醒))/u,'');
  if (recordRequest.test(command) || recordCommand.test(command) || recordSuffix.test(text) ||
      /^帮我把[^。！？!?]{1,100}?(?:记到|记进|存到|写进|放进)随手记/u.test(command)) return true;
  return text.split(/[，,。！!？?；;\n]/u).slice(1).some(clause => {
    const request = /^\s*(?:顺便|也|再|另外)\s*(.+)$/u.exec(clause)?.[1];
    return request && (recordRequest.test(request) || recordCommand.test(request));
  });
}

const casualReport = /(?:不用|别|不要|不必|暂不).{0,8}(?:登记|记录|记一下|记下|记入)|(?:就|只)(?:是)?想(?:和|跟)你(?:聊|说说)/u;

export function conversationRoute(text, mode = 'auto', withScreen = false) {
  if (mode === 'registration' || mode === 'supplement') return {kind:'registration'};
  if (mode === 'memory') return {kind:'memory'};
  if (mode === 'web') return {kind:'search',query:requestedSearch(text) ?? text.trim(),summarize:true};
  if (!withScreen && /^(?:(?:绯月|请你?|帮我|替我|麻烦你?)[，,\s]*)*(?:(?:提交|创建|新增|发起|建|生成)(?:一个|一条|个)?\s*)?(?:云端任务|服务器任务)(?=$|有哪些|[：:，,\s。！!])/u.test(text.trim())) return {kind:'serverTask'};
  if(isSelfRestart(text))return {kind:'restart'};
  if (/(?:是什么意思|怎么(?:用|操作)|如何使用)[？?。]?$/.test(text) && !searchCommand.test(text) && !simpleSearch.test(text)) return {kind:'question'};
  if (suppliedSummaryText(text)) return {kind:'question'};
  if (requestsRegistration(text)) return {kind:'registration'};
  const query = requestedSearch(text);
  if (query !== null) return {kind:'search',query};
  if (/(?:怎么|怎样|如何)(?:打开|进入)[呀呢吗？?。！!]*$/u.test(text))return {kind:'question'};
  if(isReminderCommand(text))return {kind:'reminders'};
  if (!withScreen && reportedActivity.test(text) && !casualReport.test(text) && !/[?？]|吗|能不能|为什么|怎么样|如何|怎么办|多少/.test(text)) return {kind:'registration'};
  return {kind:'question'};
}

export function publicQuery(text) {
  return typeof text === 'string' && text.trim().length > 1 && [...text].length <= 160
    && !/^(?:这个|那个|这些|那些|它|他|她|一下|相关内容|这个问题|那个东西)(?:呢|吧|是什么)?[。？?]?$/.test(text.trim())
    && !/https?:\/\/\S*[?@]|[A-Z]:[\\/]|[\w.+-]+@[\w.-]+\.\w+|(?:密码|令牌|密钥|token|secret|api[_-]?key)\s*[:=：]|\b\d{7,}\b/i.test(text);
}

export const registrationTypes = {'hu-shi.food.create':'吃喝记录','hu-shi.exercise.create':'运动记录','hu-shi.event.create':'事件记录','records.create':'随手记','diaries.create':'日记','reminders.create':'提醒'};
const types=registrationTypes;
const receiptTime=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const states = {COMPLETED:'已登记',RUNNING:'待核对',PENDING:'待登记',FAILED:'登记失败',CANCELLED:'已取消'};
export function registrationReply(result) {
  if (!result) return {state:'answer',text:'没有待恢复的登记。'};
  const lines = [];
  for (const {skipped,current_task:task} of result.chain?.nodes ?? []) {
    const params = task.params ?? {};
    const time=task.result?.created_at;
    const stamp=Number.isSafeInteger(time)&&Number.isFinite(new Date(time).getTime())?receiptTime.format(time)+' JST':'';
    lines.push([skipped?'已跳过':states[task.status]??'待确认',types[task.type]??'登记',
      params.title,params.body??params.content,params.reflection,params.deadline?'到期 '+params.deadline+' JST':'',stamp].filter(Boolean).join(' · '));
  }
  for (const item of result.pending ?? []) lines.push((types[item.type]??'登记')+'待补充：'+item.question);
  const actions = [];
  if (result.chain?.status === 'ACTIVE') {
    actions.push('resume');
    if (result.status === 'needs_decision') actions.push('continue','skip');
    actions.push('stop');
  }
  return {state:'answer', text:lines.join('\n') || '本次没有可登记的事项。', actions};
}
