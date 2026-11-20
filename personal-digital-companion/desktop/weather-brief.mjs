export const WEATHER_HOUR=60*60_000;

// 普通简报只比较天气描述与当日高低温，不比较每小时的实时温度。
export function weatherBrief(rows,triggers,previous={},now=Date.now()){
  const places={...previous.places},lines=[],warnings=[];
  for(const row of rows){
    const old=places[row.id]??{},next={...old},changes=[];
    if(row.current.state==='ready'){
      next.sky=row.current.value.text;
      if(next.sky!==old.sky)changes.push(next.sky);
    }
    if(row.minimum.state==='ready'&&Number.isFinite(row.minimum.value.maximum)){
      next.range=row.minimum.value.temperature+'～'+row.minimum.value.maximum+'°C';
      if(next.range!==old.range)changes.push(next.range);
    }
    places[row.id]=next;
    if(changes.length)lines.push(row.name+'：'+changes.join('，'));
    const reasons=triggers.get(row.id)??[];
    if(reasons.length)warnings.push(row.name+'：'+[...new Set(reasons)].join('、'));
  }
  if(warnings.length){
    // 警报正文只含地点和警报；普通变化仍可在后续符合条件时汇报。
    return {body:warnings.join('\n'),title:'天气提醒',state:previous.places?previous:{at:now,places}};
  }
  if(!lines.length||Number.isFinite(previous.at)&&now-previous.at<4*WEATHER_HOUR)
    return {state:previous};
  return {body:lines.join('\n'),title:'天气简报',state:{at:now,places}};
}
