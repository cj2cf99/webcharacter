// A short malformed JSON/Markdown fragment can loop at the end of a free-text turn.
// Preserve code samples, quoted examples, punctuation and regular Markdown emphasis.
const brokenTail = /(?:["”]?[}\]]\*{1,3}){3,}(?:["”}]|\*)*\s*$/u;
const completedWrite = /^(?:嗯[，,]\s*|好[的啦呀]?[，,]\s*)?(?:我(?:已经|刚刚|已)?(?:帮你|给你|替你)?|已经(?:帮你|替你)?)(?:登记好|记录好|记好|记录下来|登记完|记下来|记下了|记在(?:了)?(?:小本本|本子|日记)|记到(?:了)?(?:小本本|本子|日记)|登记了|记录了)/u;

const repeatRequest = /复述|转述|重述|逐字|原样|重复一遍|再(?:说|讲|念|读|发)(?:一遍|一次|一下)|(?:上一轮|上轮|上次|刚才|刚刚).{0,12}(?:说了什么|怎么说)/u;
const chatText = text=>text.replace(/[\p{P}\s]/gu,'');

export function repeatsPreviousChatReply(reply,input,previous) {
  if(!previous?.绯月||repeatRequest.test(input))return false;
  const prior=chatText(previous.绯月),current=chatText(input),answer=chatText(reply);
  const passageLength=40;
  // 只拦截长段复用，允许沿用称呼、主题词及用户本轮引用的原话。
  for(let start=0;start+passageLength<=prior.length;start++){
    const passage=prior.slice(start,start+passageLength);
    if(answer.includes(passage)&&!current.includes(passage))return true;
  }
  return false;
}

export function cleanChatOutput(reply, input='') {
  if(typeof reply!=='string')return '';
  const value=reply.trim();
  if (/```/u.test(value)||/(?:代码|正则|原样|逐字|复述|翻译|重复输出|输出符号|写.{0,3}(?:小说|对白|台词))/u.test(input))return value;
  const text=value.replace(brokenTail,'').trim();
  if(!text)return '';
  const clauses=text.match(/[^，,。！？!?；;\n]+[，,。！？!?；;\n]*|[，,。！？!?；;\n]+/gu)??[];
  const kept=clauses.filter(clause=>!completedWrite.test(clause.trim()));
  if(kept.length===clauses.length)return text;
  return kept.join('').trim().replace(/[，,；;]$/u,'。')||'这轮只是在聊天，没有提交登记。';
}
