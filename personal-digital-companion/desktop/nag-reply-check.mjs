export const nagReplyKey=text=>String(text??'').normalize('NFKC').toLowerCase()
  .replace(/^(?:夫君|老公|亲爱的|绯月)[,:、\s]+/u,'').replace(/[\p{P}\s]/gu,'');

const sentences=text=>text.replace(/「[^」]*」|『[^』]*』|“[^”]*”|‘[^’]*’|"[^"]*"/gu,' ')
  .split(/[。！？!?；;\n]+/u);
const narration='(?:讲|说)[^，,。！？；\n]{0,14}(?:童话|故事)';
const narrators=[
  new RegExp('(?<!给)([我你])(?:来|会|要|想|再|给[我你]|继续){0,3}'+narration,'gu'),
  new RegExp('给([我你])'+narration,'gu'),
];
const recording=/记录|记下|记入|记住|记着|(?:能|会|要)记(?!得)/u;
const actor=/([我你])(?:自己|平时|每天|所|都){0,2}(?:干|做|完成|负责)(?:过的事|的每[一件个]*事|的事|的工作|了什么|过什么)/gu;
const skipClaim=/不是|不用|别让|不让|还没|没有|要不|不如|改成|换成|如果|假如|假设|万一|是否|要是|也可以|另外也/u;

function replyRoles(text){
  const stories=new Set(),records=new Set();
  for(const sentence of sentences(text)){
    if(skipClaim.test(sentence))continue;
    for(const [index,rule] of narrators.entries()){
      for(const match of sentence.matchAll(rule))stories.add(index===0?match[1]:match[1]==='我'?'你':'我');
    }
    if(recording.test(sentence))for(const match of sentence.matchAll(actor))records.add(match[1]);
  }
  return [stories,records];
}

export function explicitRoleCorrection(answer,reply){
  const roles=replyRoles(answer),draftRoles=replyRoles(reply);
  // 只核对两边都明确写出的同一动作。多人参与、否定、引文和未提到角色的简短回应不判反转。
  const same=index=>roles[index].size===1&&draftRoles[index].size===1&&
    [...roles[index]][0]===[...draftRoles[index]][0];
  if(same(0))return roles[0].has('我')?'好呀，我听你讲故事。':'好呀，我讲给你听。';
  if(same(1))return roles[1].has('你')?'这样也能记下我做过的事。':'这样也能记下你做过的事。';
  return '';
}

export function reusedLongReply(key,answer,archive,lineId){
  if(key.length<45)return false;
  const answerKey=nagReplyKey(answer);
  return archive.some(n=>n.id!==lineId&&n.talk?.some((turn,index)=>turn.who==='绯月'&&
    n.talk[index-1]?.who==='你'&&nagReplyKey(n.talk[index-1].text)!==answerKey&&
    nagReplyKey(turn.text).includes(key)));
}

export const deferredNagReply='这句我先记下，之后我会按你的原话再核对。';

export function nagCorrectionAfterword(record,clean){
  const talk=record.talk??[];
  const seen=new Map();
  const repeats=new Set();
  for(const [index,{who,text}] of talk.entries()){
    const key=nagReplyKey(text);
    if(who!=='绯月'||key.length<12)continue;
    const previous=talk[index-1];
    const context=previous?.who==='你'?nagReplyKey(previous.text):'';
    if(context&&seen.has(key)&&seen.get(key)!==context)repeats.add(key);
    if(!seen.has(key))seen.set(key,context);
  }
  const previousEvaluation=record.afterEvaluation??'';
  const notes=new Set();
  for(const [index,turn] of talk.entries()){
    const previous=talk[index-1];
    if(turn.who!=='绯月'||previous?.who!=='你')continue;
    const text=clean(previous.text);
    if(!text)continue;
    const role=explicitRoleCorrection(text,turn.text);
    const chars=Array.from(text);
    const excerpt='「'+chars.slice(0,90).join('')+(chars.length>90?'…':'')+'」';
    let note='';
    if(role)note='绯月后记：那次我把人物归属说反了。你当时说'+excerpt+'，我该接的是「'+role+'」';
    else if(turn.text===deferredNagReply)note='绯月后记：重新核对这轮，你当时说的是'+excerpt;
    else if(repeats.has(nagReplyKey(turn.text)))note='绯月后记：重新核对这轮，我当时重复了旧话。你说的是'+excerpt;
    if(note&&!previousEvaluation.includes(note))notes.add(note);
  }
  return [...notes].join('\n');
}
