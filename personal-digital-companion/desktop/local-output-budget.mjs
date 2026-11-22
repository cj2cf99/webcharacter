const policies={
  organize:{base:320,perItem:48,ratio:0.85},
  classify:{base:448,perItem:144,ratio:0.8},
};

export function planLocalOutput({text,stage,tokenize,limit,retry=false}){
  if(!Object.hasOwn(policies,stage))return {tokens:limit,mode:'fixed'};
  let input;
  try{input=JSON.parse(text);}catch{return {tokens:limit,mode:'fixed'};}
  if(!input||typeof input!=='object')return {tokens:limit,mode:'fixed'};

  let materials;
  if(stage==='organize'&&Array.isArray(input.turns))
    materials=input.turns.filter(turn=>!turn.handled).map(turn=>turn.text);
  if(stage==='classify'&&input.organized)
    materials=['actions','requests','signals'].flatMap(kind=>(input.organized[kind]??[]).map(item=>
      [item.summary,item.timeText,...(item.conditions??[]),...(item.evidence??[]).map(ref=>ref.quote)].filter(Boolean).join('\n')));
  if(!materials)return {tokens:limit,mode:'fixed'};

  const materialTokens=tokenize(materials.filter(Boolean).join('\n')).length;
  if(retry)return {tokens:limit,mode:'full-retry',materialTokens};
  const {base,perItem,ratio}=policies[stage];
  const estimate=base+perItem*materials.length+ratio*materialTokens;
  const tokens=Math.min(limit,Math.ceil(estimate/64)*64);
  const split=estimate>limit&&(materials.length>1||stage==='organize'&&materialTokens>480);
  return {tokens,mode:'adaptive',materialTokens,split};
}
