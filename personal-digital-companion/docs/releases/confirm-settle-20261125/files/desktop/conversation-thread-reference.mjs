import {calendarDate,datePattern} from './calendar-date.mjs';
import {mentionsReminder,refersToPrevious} from './conversation-routing.mjs';
import {tokyoDay} from './conversation-history.mjs';

const dateToken=new RegExp(datePattern+'|昨晚|昨早|昨夜|今早|今晚|明早|明晚','u');
const dateAliases={昨晚:'昨天',昨早:'昨天',昨夜:'昨天',今早:'今天',今晚:'今天',明早:'明天',明晚:'明天'};
const dateFrom=(text,at)=>{
  const token=dateToken.exec(text)?.[0];
  return token?calendarDate(dateAliases[token]??token,tokyoDay(at)):'';
};
const revise=/^(?:时间)?(?:改(?:期)?(?:成|为|到|至)|换到|推迟到|提前到)\s*/u;
export const requestsReference=text=>mentionsReminder(text)&&(refersToPrevious(text)||/^(?:(?:请|帮我|把|将)\s*)*上(?:一回|次)(?:说的|提过的|那件事|那条)?/u.test(text));
const queryText=text=>text.replace(dateToken,'').replace(/(?:大概|就是|之前|提到的|说过的|说的|聊过的|(?:的)?那(?:一句|件事|次|条|句|天)|这个|这件事|时候|关于|上午|下午|晚上|早上)/gu,'')
  .replace(/[\p{P}\p{Z}]/gu,'').replace(/^(?:我)?(?:提到|提过|聊过|说过|说|聊)|的$/gu,'');
const reply=text=>({reply:text,next:'追问'});

export function createThreadReference({store,archive,transcription}){
  return async function resolveReference(id,pending,signal){
    if(!transcription?.referencedReminder)return null;
    let state=store.readReference(id);
    const latest=pending.at(-1);
    const request=pending.find(message=>requestsReference(message.text));
    if(request&&(!state||state.request!==request.id)){
      state={request:request.id,before:request.seq};
      store.saveReference(id,state);
      if(request===latest)return reply('你说的是哪一次？给我一个时间、主题或关键词，我再去找。');
    }
    if(!state||state.request===latest.id)return null;
    if(state.matched&&!revise.test(latest.text))return null;
    let {matched}=state;
    let deadline;
    if(revise.test(latest.text)){
      deadline=dateFrom(latest.text.replace(revise,''),latest.at);
      if(!deadline)return reply('想改到哪一天？');
    }
    if(!matched){
      const day=dateFrom(latest.text,latest.at)||state.day;
      const term=queryText(latest.text)||state.term;
      store.saveReference(id,{...state,day,term});
      const sameLine=message=>message.who==='你'&&message.seq<state.before&&!message.reference&&
        (!day||tokyoDay(message.at)===day)&&(!term||queryText(message.text).includes(term));
      let matches=store.detail(id).messages.filter(sameLine);
      if(!matches.length){
        if(!day)return reply('大概是哪天聊的？我按那天找。');
        const legacy=await archive?.read?.(day)??[];
        signal.throwIfAborted();
        matches=legacy.filter(row=>row.threadId===id&&typeof row.question==='string'&&
          (!term||queryText(row.question).includes(term))).map(row=>({id:row.id,at:row.at,text:row.question}));
      }
      if(matches.length!==1)return reply(matches.length?'找到了几条。能再给我一个关键词或更具体的时间吗？':'这条线还没找到对应的话。你记得原话里的关键词吗？');
      matched=matches[0];
    }
    deadline||=dateFrom(matched.text,matched.at);
    if(!deadline){
      store.saveReference(id,{...state,matched});
      return reply('找到了「'+matched.text.slice(0,130)+'」。你想设在哪一天？可以说「改成明天」。');
    }
    const title=matched.text.replace(dateToken,'').replace(/^(?:我(?:要|打算|准备|想)|记得|还要|需要)\s*/u,'').replace(/[，。！!\s]+$/u,'').trim()||'原话提醒';
    const jobId='reference-'+state.request;
    await transcription.referencedReminder({id:jobId,at:matched.at,text:matched.text,title,deadline,revise:revise.test(latest.text),messageId:latest.id,thread:id});
    store.saveReference(id,{...state,matched});
    return {reply:'找到「'+matched.text.slice(0,130)+'」。提醒日期为 '+deadline+'（JST）。请打开待确认卡核对后登记。',
      next:'回应',extra:{transcriptId:jobId}};
  };
}
