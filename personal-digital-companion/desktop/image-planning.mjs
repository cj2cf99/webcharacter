const patterns = {
  generate: /(?:(?<!图)生图|文生图|画(?:一?[张幅个只朵条头座]|出|个|一)|(?<!重新)绘制|(?:生成|做|来|给我).{0,8}(?:图片|图像|插画|照片|海报|头像|壁纸)|生成一?[张幅]|生成(?=.{0,35}(?:女孩|男孩|人物|风景|猫|狗)))/u,
  img2img: /(?:图生图|重绘|重画|重新绘制|(?:转|变|改|换)成.{0,12}(?:画风|风格|水彩|油画|动漫|素描))/u,
  edit: /(?:改图|修图|(?:修改|编辑).{0,4}图|换(?:上|成|装|人|衣|背景|服装|姿势|动作)|(?:背景|衣服|服装|姿势|人物|颜色).{0,8}(?:替换|换|改)|(?:把|将).{0,32}(?:换成|改成|改为|替换)|让.{0,8}(?:举手|转身|坐下))/u,
  upscale: /(?:高清(?:化|放大|处理)|超分(?:辨率)?|放大)/u
};
const inquiry = /(?:怎么|如何|教程|为什么|是否支持|支持.{0,8}吗|有(?:什么|哪些)区别|什么意思|有哪些(?:功能|模型)|(?:是什么|有什么用)[？?]?$)/u;
export const previousImage = /(?:刚才|上次|上一张|刚生成|刚画|刚做|刚改|前一张)/u;
const imageContext = /(?:图|照片|海报|头像|壁纸|插画|画面|画作|封面|背景|换装|姿势|换人)/u;
export function tourDestination(text){
  const match=/^(?:(?:请)?(?:开启|开始|启动)\s*)?绯月环球之旅(?:[：:，,\s]+(?:目的地[：:]?|去)?\s*(.+?))?[。！!]?$/u.exec(text.trim());
  if(!match||inquiry.test(text)||/[？?]/u.test(text))return null;
  return (match[1]??'').trim();
}
export function imageRequest(text,count=0){
  if(!text||inquiry.test(text)||/^(?:请|帮我|请帮我)?(?:解释|介绍|分析|讨论|翻译|总结|记下|提醒我)|(?:生成|写).{0,5}(?:生图)?(?:提示词|教程|说明文档)|^(?:你|绯月)?(?:能|可以|会)(?:生图|画图|修图|放大图片)吗[？?。]?$/u.test(text.trim()))return false;
  return tourDestination(text)!==null||activeClauses(text).some(part=>patterns.generate.test(part)||patterns.img2img.test(part)||
    ((count>0||imageContext.test(text)||previousImage.test(text))&&(patterns.edit.test(part)||patterns.upscale.test(part))));
}
function activeClauses(text){
  return text.split(/[；;。\n]|[，,、]?\s*(?:然后|接着|最后|之后再|(?:并且|并|再)(?=换|放大|改|重绘|高清))|[，,](?=\s*(?:高清放大|放大|(?:也)?(?:不用|不要|无需|别)))/u)
    .map(s=>s.trim()).filter(s=>s&&!/^(?:请|先|也)?(?:不要|不用|无需|别)/u.test(s));
}

function numberOf(label){
  if(/^\d+$/u.test(label))return Number(label);
  const digits='零一二三四五六七八九',parts=label.replaceAll('两','二').split('十');
  if(parts.length===1)return digits.indexOf(parts[0]);
  return (parts[0]?digits.indexOf(parts[0]):1)*10+(parts[1]?digits.indexOf(parts[1]):0);
}

export function imageSlots(text,count,hasBase=false){
  const slots=[];
  for(const quote of activeClauses(text)){
    let ops=Object.keys(patterns).filter(op=>patterns[op].test(quote));
    if(!ops.length)return {question:'请说明「'+quote+'」要生成、重绘、编辑还是放大。'};
    if(ops.length>1&&!ops.every(op=>op==='edit'||op==='img2img'))return {question:'「'+quote+'」包含多种操作，请用“然后”说明先后顺序。'};
    const refs=[];
    if(ops.includes('edit')&&ops.includes('img2img')&&/(?:其他|其余)(?:部分|区域|内容|地方)?(?:都)?(?:保持原样|不变|不动|别动|不要改)/u.test(quote))ops=['edit'];
    if(!ops.includes('generate')){
      let target;
      for(const match of quote.matchAll(/图\s*(\d+|[零一二两三四五六七八九十]+)|第\s*(\d+|[零一二两三四五六七八九十]+)\s*张/gu)){
        const n=numberOf(match[1]??match[2]);
        if(n<1||n>count)return {question:`本轮收到 ${count} 张附件，找不到图${n}。请补图或说明要用哪一张。`};
        if(!refs.includes(n))refs.push(n);
        if(/(?:把|将)\s*$/u.test(quote.slice(0,match.index))||/^(?:图)?\s*(?:作为|当作|用作|为)底图/u.test(quote.slice(match.index+match[0].length)))target=n;
      }
      if(!slots.length&&!hasBase){
        const other=ops.includes('edit')?target:refs.find(n=>n!==1);
        if(other>1&&!/(?:换到|放到|用在)图\s*[1一]/u.test(quote))
          return {question:'本次的第一张图是底图。如果要修改图'+other+'，请将它作为第一张上传。'};
      }
      if(count>1&&!refs.length&&ops.includes('edit'))return {question:'请说明底图和额外参考分别是第几张，用图号指定。'};
    }
    slots.push({quote,ops,refs:refs.filter(n=>hasBase||slots.length||n!==1)});
  }
  return slots.length?{slots}:{question:'请说明要执行的图像操作。'};
}

export function resolveImageChoices(slots,choices){
  if(!Array.isArray(choices)||choices.length!==slots.length)return null;
  const steps=[];
  for(const [i,slot] of slots.entries()){
    const op=choices[i];
    if(!slot.ops.includes(op))return null;
    steps.push({op,quote:slot.quote,refs:op==='edit'?slot.refs:[]});
  }
  return steps;
}

export function literalPlan(text,count,hasBase=false){
  const {slots}=imageSlots(text,count,hasBase);
  return slots?.every(s=>s.ops.length===1)?resolveImageChoices(slots,slots.map(s=>s.ops[0])):null;
}

export function checkEditConstraints(text,steps){
  const edits=steps.filter(s=>s.op==='edit'||s.op==='img2img');
  if(!edits.length)return;
  for(const part of text.split(/[，,；;。\n]|然后|接着|最后/u)){
    const keep=/(?:保留|保持|不要改变|不要改动|别改变|别改动).+/u.exec(part.trim())?.[0];
    if(keep&&!edits.some(s=>s.quote.includes(keep)))throw Error('编辑步骤漏掉了「'+keep+'」，请核对后重新描述。');
  }
}
