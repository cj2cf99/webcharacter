import {CharacterPlayer} from './character-player.mjs';
const root=document.querySelector('#players'),cards=[];
for(const [scene,title] of [['apple','苹果交接'],['magic','魔法书与扫帚'],['office','痛苦码农']]){
 const card=document.createElement('section');card.className='card';const heading=document.createElement('h2');heading.textContent=title;const viewport=document.createElement('div');viewport.className='viewport';const status=document.createElement('div');status.className='status';card.append(heading,viewport,status);root.append(card);
 let player;const create=async()=>{player=new CharacterPlayer(viewport,{scene});player.addEventListener('state',()=>status.textContent=`${player.status.time.toFixed(1)} 秒 · ${player.status.playing?'播放':'暂停'}`);player.addEventListener('error',e=>status.textContent=e.detail);await player.load();status.textContent='已加载 · 暂停';};
 for(const [label,action] of [['播放',()=>player.play()],['暂停',()=>player.pause()],['中段',()=>player.seek(player.status.duration/2)],['重播',()=>player.replay()],['销毁',()=>{player.destroy();status.textContent='已销毁';}],['重建',async()=>{player.destroy();await create();}]]){const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{try{await action();}catch(e){status.textContent=e.message;}};card.append(b);}
 cards.push({viewport,get player(){return player;}});await create();
}
const sleep=t=>new Promise(r=>setTimeout(r,t));const assert=(v,m)=>{if(!v)throw Error(m);};
document.querySelector('#test').onclick=async e=>{e.target.disabled=true;const out=document.querySelector('#result'),log=[];try{
 const [a,b]=cards.map(c=>c.player);a.pause();b.pause();a.seek(1);b.seek(3);await sleep(200);a.play();await sleep(350);a.pause();await sleep(150);assert(a.status.time>1.1,'实例 A 没有播放');assert(Math.abs(b.status.time-3)<.01,'实例 B 被串改');log.push('通过：实例独立播放、暂停与跳转');
 const at=a.status.time;await sleep(200);assert(Math.abs(a.status.time-at)<.01,'暂停后时间仍变化');log.push('通过：暂停冻结时间');
 let count=0;a.addEventListener('complete',()=>count++,{once:true});a.seek(a.status.duration-.05);await sleep(120);a.play();await sleep(300);assert(count===1,'完成事件异常');log.push('通过：非循环完成事件');
 const box=document.createElement('div');box.style.cssText='width:300px;height:171px';root.append(box);
 for(let i=0;i<3;i++){const p=new CharacterPlayer(box,{scene:'office'});await p.load();p.play();p.destroy();p.destroy();assert(!box.querySelector('iframe'),'销毁残留 iframe');}log.push('通过：连续创建/销毁与重复销毁');
 const retry=new CharacterPlayer(box,{assetBase:'/missing-assets/'});let failed=false;try{await retry.load();}catch{failed=true;}assert(failed,'资源加载失败未上报');retry.url.searchParams.delete('assets');await retry.load();retry.destroy();box.remove();log.push('通过：加载失败后重试');
 out.textContent=log.join('\n')+'\n全部通过（未测 GPU / 显存及后台隐藏行为）';
 }catch(error){out.textContent=log.join('\n')+'\n失败：'+error.message;}finally{e.target.disabled=false;}};
