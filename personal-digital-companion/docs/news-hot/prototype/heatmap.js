// 复制自 desktop/news-heatmap.mjs（2026-11-25），去掉 export 以便 file:// 直接打开。
function worst(row, side) {
  if (!row.length) return Infinity;
  const sum=row.reduce((total,item)=>total+item.area,0);
  return Math.max(side**2*row[0].area/sum**2,sum**2/(side**2*row.at(-1).area));
}

function tilesFor(counts,{width,height}) {
  if (!counts.length || width<=0 || height<=0) return [];
  if (counts.length===1) {
    return [{left:0,top:0,width:width>=height?width/2:width,height:width>=height?height:height/2}];
  }
  const rawTotal=counts.reduce((sum,count)=>sum+count,0);
  // 超过一半的块压到与其余块等重，其他块之间仍按原报道数分配。
  const weights=counts.map(count=>Math.min(count,rawTotal-count));
  const total=weights.reduce((sum,count)=>sum+count,0);
  const waiting=weights.map((count,index)=>({index,area:count/total*width*height}))
    .sort((a,b)=>b.area-a.area||a.index-b.index);
  const result=[];
  let left=0, top=0;
  while(waiting.length) {
    const side=Math.min(width,height);
    const row=[waiting.shift()];
    while(waiting.length && worst([...row,waiting[0]],side)<=worst(row,side)) row.push(waiting.shift());
    const across=width>=height;
    const strip=row.reduce((sum,item)=>sum+item.area,0)/side;
    let along=0;
    for (const item of row) {
      const length=item.area/strip;
      result[item.index]=across?{left,top:top+along,width:strip,height:length}:
        {left:left+along,top,width:length,height:strip};
      along+=length;
    }
    if (across) {left+=strip;width-=strip;}
    else {top+=strip;height-=strip;}
  }
  return result;
}

function place(element,rectangle) {
  for (const [property,value] of Object.entries(rectangle)) element.style[property]=value+'px';
}

function fitTitle(card,{width,height}) {
  const flat=width>=115&&height<63;
  card.classList.toggle('heat-narrow',width<80);
  card.classList.toggle('heat-flat',flat);
  card.classList.toggle('heat-small',width<118||height<74);
  card.classList.toggle('heat-large',width>=280&&height>=205);

  const button=card.querySelector('.event-toggle');
  const style=getComputedStyle(button);
  const line=parseFloat(getComputedStyle(card.querySelector('.event-title')).lineHeight);
  const countLine=parseFloat(getComputedStyle(card.querySelector('.heat-count')).lineHeight);
  const gap=parseFloat(style.rowGap);
  const available=height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
  const showCount=width>=42 && (flat?available>=Math.max(countLine,line):available>=countLine+gap+line);
  card.classList.toggle('heat-title-only',!showCount);
  const lead=card.querySelector('.event-lead').getBoundingClientRect().height;
  const overhead=(showCount&&!flat?countLine+gap:0)+(lead?lead+gap:0);
  const lines=Math.max(0,Math.floor((available-overhead+.05)/line));
  card.classList.toggle('heat-no-line',!lines||width<27);
  card.style.setProperty('--title-lines',String(Math.max(1,lines)));
}

function drawHeatmap(root) {
  if(!root.hasAttribute('data-heatmap'))return;
  const cards=[...root.querySelectorAll('.event[data-reports]')];
  const size=root.getBoundingClientRect();
  if (!cards.length || !size.width || !size.height) return;
  const counts=cards.map(card=>Number(card.dataset.reports));
  const max=Math.max(...counts);
  const rectangles=tilesFor(counts,size);
  // 先更新所有块的几何尺寸，再按新尺寸计算标题的可见行数。
  for (const [index,card] of cards.entries()) {
    place(card,rectangles[index]);
    card.style.setProperty('--heat',Math.round(21+65*Math.log1p(counts[index])/Math.log1p(max))+'%');
  }
  for (const [index,card] of cards.entries())fitTitle(card,rectangles[index]);
}

function clearHeatmapTile(card) {
  for(const property of ['left','top','width','height','--heat','--title-lines'])card.style.removeProperty(property);
  card.classList.remove('heat-flat','heat-small','heat-narrow','heat-large','heat-title-only','heat-no-line');
}
