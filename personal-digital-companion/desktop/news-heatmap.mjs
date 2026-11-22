function worst(row, side) {
  if (!row.length) return Infinity;
  const sum=row.reduce((total,item)=>total+item.area,0);
  return Math.max(side**2*row[0].area/sum**2,sum**2/(side**2*row.at(-1).area));
}

export function tilesFor(counts,{width,height}) {
  if (!counts.length || width<=0 || height<=0) return [];
  const total=counts.reduce((sum,count)=>sum+count,0);
  const waiting=counts.map((count,index)=>({index,area:count/total*width*height}))
    .sort((a,b)=>b.area-a.area);
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
  card.classList.toggle('heat-no-line',!lines);
  card.style.setProperty('--title-lines',String(Math.max(1,lines)));
}

export function drawHeatmap(root) {
  const groups=[...root.querySelectorAll('[data-heat-group]')];
  const active=groups.length?groups.filter(group=>group.childElementCount):root.childElementCount?[root]:[];
  const size=root.getBoundingClientRect();
  if (!active.length || !size.width || !size.height) return;
  const maps=active.map(group=>{
    const cards=[...group.children], counts=cards.map(card=>Number(card.dataset.reports));
    return {group,cards,counts,total:counts.reduce((sum,count)=>sum+count,0)};
  });
  const total=maps.reduce((sum,map)=>sum+map.total,0);
  const max=Math.max(...maps.flatMap(map=>map.counts));
  const wide=size.width>=610;
  let left=0,top=0;
  for (const {group,cards,counts,total:subtotal} of maps) {
    const fraction=subtotal/total;
    const width=size.width*(wide?fraction:1);
    const height=size.height*(wide?1:fraction);
    if (group!==root) place(group,{left,top,width,height});
    const rectangles=tilesFor(counts,{width,height});
    for (const [index,card] of cards.entries()) {
      const bounds=rectangles[index];
      place(card,bounds);
      card.style.setProperty('--heat',Math.round(21+65*Math.log1p(counts[index])/Math.log1p(max))+'%');
      fitTitle(card,bounds);
    }
    if (wide) left+=width;
    else top+=height;
  }
}
