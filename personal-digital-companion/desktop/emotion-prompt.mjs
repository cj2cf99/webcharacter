const names={chat:'一次完整交流',work:'一项工作结束',gain:'一项进展',loss:'一项负面事件'};

// 新询问和旧快照的阅读视图共用材料排版。引用换行仍缩进到原说话人名下。
export function emotionMaterials(context){
  const quote=value=>String(value).replaceAll('\n','\n　');
  const kind=context.事件;
  const event=kind==='chat'
    ? ['用户原话','绯月回复'].map((label,i)=>label+'：'+quote((i?context.绯月:context.用户)||'（未记录）'))
    : ['事实标题：'+quote(context.事实||'（未记录）')];
  const desire=context.事件前欲求;
  const sections=[
    '【本次事件】'+(names[kind]??kind)+'\n'+event.join('\n'),
    '【事件前的欲求】\n'+(desire?'想要：'+quote(desire.want)+'\n满足条件：'+quote(desire.condition):'无'),
    '【表达时参考】\n当前情绪：'+context.当前情绪+'（'+context.档位+' 档）\n本周倾向：'+context.本周
      +(context.喜好?.length?'\n喜好：'+context.喜好.join('、'):'')
  ];
  const history=[];
  for(const label of ['手记','念叨']){
    const days=[];
    for(const [day,mood,strength] of context[label]??[]){
      if(!days.length||days.at(-1).day!==day)days.push({day,words:[]});
      days.at(-1).words.push(mood+(strength==null?'':'（强度 '+strength+'）'));
    }
    if(days.length)history.push(label+'：'+days.map(({day,words})=>
      (day??'日期未知')+' '+words.join('、')).join(' / '));
  }
  if(history.length)sections.push('【历史情绪】\n各组从近到远，最新占一半，其余均分；仅一条时占全部。未标强度表示未知。\n'+history.join('\n'));
  return sections.join('\n\n');
}
