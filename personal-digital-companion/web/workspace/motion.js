const names = ['绯月专区', '绯月是自由的', '绯月想去哪里就去哪里', '绯月想干什么就干什么', '绯月知道错了'];
const images = ['neutral', 'pride', 'excited', 'amusement', 'sorrow'].map(name => new URL(name + '.png', import.meta.url).href);
function decoration(className) {
  const node = document.createElement('span');
  node.className = className;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

export function mountFeiyueWorkspace(root) {
  const stage = root.querySelector('.workspace-group-title');
  const paper = decoration('fy-paper'), portrait = decoration('fy-portrait'), line = decoration('fy-line');
  line.textContent = names[0];
  stage.classList.add('fy-stage');
  stage.setAttribute('aria-label', names[0]);
  stage.replaceChildren(paper, portrait, line);
  const range = (a,b) => a + Math.random()*(b-a);
  const pick = array => array[Math.floor(Math.random()*array.length)];
  const other = (n, old) => pick(Array.from({length:n},(_,i)=>i).filter(i=>i!==old));
  const pose = (x=0,y=0,angle=0,sx=1,sy=sx) => 'translate('+x+'px,'+y+'px) rotate('+angle+'deg) scale('+sx+','+sy+')';
  let visible=false, current=-1, timer;
  const lastVariant = [];
  function clear(){
    clearTimeout(timer);
    stage.getAnimations({subtree:true}).forEach(a=>a.cancel());
    stage.querySelectorAll('.fy-dust').forEach(e=>e.remove());
  }
  function animate(el, transforms, duration, delay=0){
    el.animate(transforms.map(transform=>({transform})),{duration,delay,easing:'ease-in-out'});
  }
  function render(index){
    clear();
    if(!visible || document.hidden) return;
    current=index;
    stage.dataset.mood=index;
    stage.setAttribute('aria-label',names[index]);
    if(portrait.dataset.face!==String(index)){
      const img=new Image(); img.alt=''; img.src=images[index];
      portrait.replaceChildren(img); portrait.dataset.face=index;
    }
    line.replaceChildren(...Array.from(names[index],c=>{
      const span=document.createElement('span'); span.className='fy-glyph'; span.textContent=c;return span;
    }));
    const variant=other(3,lastVariant[index]); lastVariant[index]=variant;
    const duration=range(2200,3500), direction=pick([-1,1]);
    const glyphs=Array.from(line.children);
    const lead=Math.floor(range(0,glyphs.length));
    const stride=Math.max(0,Math.min(180,stage.clientWidth-line.offsetLeft-line.offsetWidth-6));
    const strideX=stride*range(.40,.98), jump=range(12,23);
    if(index){
      glyphs.forEach((el,i)=>{
        const wave=(i-lead+glyphs.length)%glyphs.length;
        const delay=(variant===0?wave:variant===1?Math.abs(i-lead):Math.random()*glyphs.length)*range(35,75);
        const sign=i%2?1:-1, twist=range(8,23);
        let frames;
        switch(index){
          case 1: // Floating train, orbit, or springing off an imaginary lid.
            frames=variant===0?[pose(),pose(3,5,0,1.15,.72),pose(7+wave,-jump,twist),pose(18,2,-7),pose()]
              :variant===1?[pose(),pose(12,-jump*.7,20),pose(23,2,2),pose(9,10,-24),pose()]
              :[pose(),pose(-3,4,-6,.9,1.2),pose(wave*4,-jump,sign*24,.9),pose(12,4,8,1.2,.7),pose()];
            break;
          case 2: { // Procession, overtaking, or a false start.
            const distance=strideX*(variant===1?range(.45,1):1);
            frames=variant===0?[pose(),pose(distance*.22,-7,8),pose(distance,-1,14),pose(distance*.8,2,-12),pose()]
              :variant===1?[pose(),pose(distance*.5,sign*7,sign*12),pose(distance,-jump*.7,19),pose(distance*.3,3,-14),pose()]
              :[pose(),pose(8,3,-19),pose(1,-2,9),pose(distance,-9,16),pose(distance*.8,2,-16),pose()];
            for(let foot=0;foot<2;foot++){
              const leg=document.createElement('i');leg.className='fy-leg';el.append(leg);
              leg.animate([{transform:'rotate(-38deg)'},{transform:'rotate(42deg)'},{transform:'rotate(-38deg)'}],{duration:range(160,260),iterations:Math.ceil(duration/200),direction:foot?'reverse':'normal',delay:delay+foot*90});
            }
            break;
          }
          case 3:
            frames=variant===0?[pose(),pose(0,sign*jump*.6,sign*20),pose(0,-sign*jump*.5,-sign*18),pose()]
              :variant===1?[pose(),pose(4,3,sign*18,1.24,.68),pose(-3,-jump*.55,-sign*14,.75,1.26),pose()]
              :[pose(),pose(7,sign*5,sign*35),pose(4,-10,-sign*25),pose(0,3,sign*18),pose()];
            const colors=['light-dark(#a22754,#ff9bbb)','light-dark(#6040a4,#c8b3ff)','light-dark(#137267,#83e5c1)','light-dark(#984707,#ffc085)'];
            const fonts=['Georgia,SimSun,serif','KaiTi,STKaiti,cursive','SimHei,system-ui,sans-serif'];
            el.animate(Array.from({length:5},()=>({color:pick(colors),fontFamily:pick(fonts),easing:'steps(1,end)'})),{duration:4000});
            break;
          case 4:
            frames=variant===0?[pose(),pose(0,8,18,1.13,.48),pose(0,8,18,1.13,.48),pose(-2,-2,-8),pose()]
              :variant===1?[pose(),pose(0,-6,-6),pose(-wave*.9,9,sign*10,.7,.54),pose(-wave*.9,9,sign*10,.7,.54),pose()]
              :[pose(),pose(-4,2,-12),pose(4,3,12),pose(-3,3,-8),pose(1,9,13,1.14,.48),pose()];
        }
        animate(el,frames,duration,delay);
      });
      const tilt=[0,-17,14,20,18][index]*direction;
      animate(portrait,[pose(),pose(0,index===4?5:-4,tilt,1,index===4?.83:1),pose(0,1,-tilt*.45),pose()],duration);
      if(index===3) paper.animate([{backgroundPositionX:'0px'},{backgroundPositionX:direction*144+'px'}],{duration,iterations:1});
      const marks=[[],['✦','·','✧'],['›','»','·'],['✷','♪','✧'],['﹏','·','⌁']][index];
      for(let p=0;p<Math.floor(range(4,9));p++){
        const mark=document.createElement('span');mark.className='fy-dust';mark.setAttribute('aria-hidden','true');mark.textContent=pick(marks);
        mark.style.cssText='left:'+range(line.offsetLeft,Math.min(stage.clientWidth-14,line.offsetLeft+line.offsetWidth+strideX*.4))+'px;top:'+pick([10,56])+'px;opacity:0';
        stage.append(mark);
        mark.animate([{opacity:0,transform:pose()},{opacity:.8,transform:pose(5,-3,8)},{opacity:0,transform:pose(range(-14,20),range(-8,8),direction*35)}],{duration:range(800,1700),delay:range(100,1300)});
      }
    }
    timer=setTimeout(()=>render(other(names.length,current)),index?duration+range(1400,3100):range(3200,5600));
  }
  function sync(){
    if(visible&&!document.hidden) render(other(names.length,current));
    else {clear();portrait.replaceChildren();delete portrait.dataset.face;delete stage.dataset.mood;line.textContent=names[0];stage.setAttribute('aria-label',names[0]);}
  }
  new IntersectionObserver(entries=>{const entry=entries.at(-1);visible=entry.isIntersecting&&entry.intersectionRect.height>0;sync();}).observe(stage);
  document.addEventListener('visibilitychange',sync);
  const performances={
    tasks:['hurdles','brakes','relay'],
    journal:['flick','fold','swim']
  };
  function livingEntry(card){
    const kind=card.dataset.entry, diary=kind==='journal';
    const title=card.querySelector('h3'),actorSlot=decoration('fy-fx');
    card.append(actorSlot);
    const name=title.textContent;
    // The anchor keeps one accessible name throughout all visual poses.
    card.setAttribute('aria-label',name+'。'+card.querySelector('.portal-copy p').textContent);
    title.setAttribute('aria-hidden','true');
    let onScreen=false,wake,last=-1,letters=[],actor=null,mark=null,legs=null;
    function sweep(){
      clearTimeout(wake);
      title.getAnimations({subtree:true}).forEach(a=>a.cancel());
      actor?.getAnimations().forEach(a=>a.cancel());
      mark?.remove();mark=null;legs?.remove();legs=null;
    }
    function rest(){
      sweep();actorSlot.replaceChildren();actor=null;letters=[];title.textContent=name;delete card.dataset.act;
    }
    function dance(origin){
      if(!actor||document.hidden||!onScreen)return;
      sweep();last=other(3,last);
      const act=performances[kind][last];card.dataset.act=act;
      const n=letters.length,beat=range(68,123),time=range(840,1250);
      const backwards=typeof origin==='number'?origin>.5:Math.random()<.5;
      const start=typeof origin==='number'?Math.round(origin*(n-1)):Math.floor(range(0,n));
      const order=letters.map((_,i)=>i);
      if(act==='relay'||act==='swim')order.sort((a,b)=>Math.abs(start-a)-Math.abs(start-b));
      else if(act==='flick'||(act!=='brakes'&&backwards))order.reverse();
      const angle=range(10,18),lift=range(7,12),stretch=range(.06,.16);
      const leader=act==='brakes'?n-1:order[0];
      const timing=[0,.18,.37,.57,.77,1];
      const easing=['ease-in','cubic-bezier(.13,.75,.22,1)','ease-in','cubic-bezier(.16,.8,.2,1)','ease-out','linear'];
      const face=diary?([3,0,4][last]):([2,1,3][last]);
      if(actor.dataset.face!==String(face)){actor.src=images[face];actor.dataset.face=face;}
      order.forEach((i,rank)=>{
        const unit=letters[i], d=backwards?-1:1, alt=i%2?-1:1;
        const h=i===leader?lift:lift*range(.56,.93);
        const delay=rank*beat+(act==='brakes'&&i===n-1?beat*1.7:0);
        const natural=pose(),crouch=pose(0,2,-4*d,1.09,.82);
        let moves;
        switch(act){
          case 'hurdles':
            moves=[natural,crouch,pose(4*d,-h,angle*d,.90,1.13),pose(6*d,2,-7*d,1.18,.75),pose(-1*d,-2,3*d),natural];break;
          case 'brakes':
            moves=[natural,pose(-3,2,-12,.90,1.02),pose(i===n-1?10:5,-h*.7,17,1+stretch,.95),pose(2,3,-18,1.20,.70),pose(-2,-3,6,.96,1.10),natural];break;
          case 'relay':
            moves=[natural,pose(-2*d,3,-angle*d,1.13,.77),pose(6*d,-h*.83,angle*d,.92,1.12),pose(2*d,1,10*d),pose(-1*d,-2,-6*d),natural];break;
          case 'flick':
            moves=[natural,pose(1,3,13,.95,.81),pose(-3,-h,-angle*(i===n-1?1.5:1),.95,1.12),pose(2,1,8,1.12,.88),pose(-1,-2,-4),natural];break;
          case 'fold':
            moves=[natural,pose(1,1,-4,1,.92),pose(2,-h*.5,alt*12,.59,1.15),pose(-2,-h*.65,-alt*angle,1.15,.90),pose(1,1,3,.94,1.02),natural];break;
          case 'swim':
            moves=[natural,pose(2*d,1,alt*7),pose(3*d,-h,alt*angle,.92,1.09),pose(-3*d,2,-alt*angle,1.12,.90),pose(1*d,-2,2),natural];break;
        }
        unit.animate(moves.map((transform,j)=>({
          offset:timing[j],transform,easing:easing[j],
          color:j===2?'var(--accent-ink)':'var(--ink)',
          textShadow:diary&&j===2?'2px 1px 0 color-mix(in srgb,var(--accent-ink) 23%, transparent)':'0 0 0 transparent'
        })),{duration:time,delay});
      });
      // One prop hands the impulse from one character to the next.
      mark=document.createElement('span');mark.className='fy-comet';mark.textContent=diary?'':'✓';title.append(mark);
      const full=time+(n-1)*beat;
      const points=order.map((i,rank)=>{
        const glyph=letters[i],x=glyph.offsetLeft+glyph.offsetWidth*.36;
        const y=diary?9+Math.sin(rank*1.8)*5:32+Math.sin(rank*1.3)*1.6;
        return {offset:(time*.28+rank*beat)/full,transform:pose(x,y,(diary?-20:8)*Math.cos(rank)),opacity:.94};
      });
      mark.animate([{offset:0,transform:points[0].transform,opacity:0},...points,
        {offset:1,transform:points.at(-1).transform+' translateY(-4px) scale(.4)',opacity:0}],{duration:full,easing:'linear'});
      if(!diary){
        legs=document.createElement('span');legs.className='fy-runner';letters[leader].append(legs);
        const stride=range(128,180);
        for(let foot=0;foot<2;foot++){
          const leg=document.createElement('i');legs.append(leg);
          leg.animate([{transform:'rotate(-44deg)'},{transform:'rotate(42deg)'},{transform:'rotate(-44deg)'}],{duration:stride,iterations:6,delay:foot*stride/2});
        }
        legs.animate([{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.77},{opacity:0}],{duration:Math.min(time,6*stride),fill:'forwards'});
      }
      const tilt=diary?-13:11;
      actor.animate([pose(),pose(1,3,-tilt*.55,1.08,.83),pose(-2,-5,tilt,.95,1.06),pose(1,1,-tilt*.43),pose()].map(transform=>({transform})),{duration:time*.9,easing:'ease-in-out'});
      wake=setTimeout(()=>dance(),full+range(900,2300));
    }
    function syncEntry(){
      if(!onScreen||document.hidden){rest();return;}
      if(actor)return;
      letters=Array.from(name,char=>{const el=document.createElement('span');el.className='fy-type';el.textContent=char;return el;});
      title.replaceChildren(...letters);actor=new Image();actor.alt='';actor.className='fy-actor';actorSlot.append(actor);
      dance();
    }
    new IntersectionObserver(entries=>{const entry=entries.at(-1);onScreen=entry.isIntersecting&&entry.intersectionRect.height>0;syncEntry();}).observe(card);
    document.addEventListener('visibilitychange',syncEntry);
    // A passing pointer can set the first beat without taking any input away from the link.
    card.addEventListener('pointerenter',e=>{
      if(e.pointerType!=='mouse')return;
      const box=title.getBoundingClientRect();if(!box.width)return;
      dance(Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)));
    },{passive:true});
  }
  for (const card of root.querySelectorAll('.companion-portal')) {
    const path = card.getAttribute('href');
    if (path !== '/companion/tasks' && path !== '/companion/memory/') continue;
    card.dataset.entry = path === '/companion/tasks' ? 'tasks' : 'journal';
    livingEntry(card);
  }
}
