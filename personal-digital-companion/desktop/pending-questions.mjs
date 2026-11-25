export const pendingLimit=20;
export const isPendingQuestion=n=>['提问中','等待回应','意外中断'].includes(n.status);
export const answeredQuestion=n=>['已解释','回合结束'].includes(n.status)&&n.talk?.some(t=>t.who==='你'&&t.text?.trim());
export const questionTarget=n=>n.source+'/'+(n.source==='diary'||n.source==='audit'?n.source_id.replace(/\.0+(?=\d)/u,'.'):n.source_id);
export const emptyFollowUp=text=>typeof text==='string'&&
  /^(?:无|無|无追问|没有追问|无需追问|none|null|n\/a)?$/iu.test(text.trim().replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu,''));
const questionBody=text=>text.trim().replace(/[。？！!?]+$/u,'');
export const sameQuestion=(a,b)=>typeof a==='string'&&questionBody(a).trimEnd()===questionBody(b).trimEnd();
export const questionText=value=>{
  const text=typeof value==='string'?value.trim():'';
  const body=questionBody(text);
  if(!body||emptyFollowUp(text)||/[\r\n]/u.test(body))return '';
  return text;
};

export function questionReminder(count,added=false){
  if(added)return '我有一个新质问，放在「待确认」了。有空来回答我吧。';
  if(count>=pendingLimit)return '待确认已经有 '+count+' 个质问了，有空先回答一个吧。';
  return count?'我还有想确认的事。有空来「待确认」回答我吧。':'';
}
