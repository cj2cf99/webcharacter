import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pages} from '../desktop/source-updates.mjs';
const root=resolve(import.meta.dirname,'..'),files=new Set(['scene.html','screen-question.html',...pages['scene.html'],...pages['screen-question.html']]);
const home=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>绯月 · 本地交互验收</title>
<style>*{box-sizing:border-box}body{margin:0;padding:clamp(12px,3vw,32px);font:15px/1.55 system-ui;color:#382c36;background:#eee8e6}main{max-width:840px;margin:auto}h1{font:550 26px Georgia,serif;margin:0}p{color:#6c5965;margin:6px 0 16px}nav{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}button{background:#fffaf7;border:1px solid #c6acb8;padding:7px 12px;border-radius:20px;color:#503749;cursor:pointer}button[aria-pressed=true]{background:#633c53;color:white}iframe{display:block;width:100%;height:650px;border:1px solid #c6acb8;border-radius:12px;background:#fffaf8}iframe.bubble{max-width:360px;background:transparent;border:0;margin:0 auto}output{display:block;margin-top:9px;color:#653955}</style>
<main><h1>绯月 · 交互验收</h1><p>本机合成场景，可反复切换、回复和收起。</p><nav></nav><iframe title="绯月实际界面"></iframe><output aria-live="polite"></output></main><script src="/preview-nav.js"></script></html>`;
const nav=`const choices={target:'单图提问',pair:'双图对照',whole:'整图提问',share:'画作分享',bubble:'长文本气泡'};
const frame=document.querySelector('iframe'),out=document.querySelector('output');
function openCase(k){frame.hidden=false;out.textContent='';frame.className=k==='bubble'?'bubble':'';frame.style.height=k==='bubble'?'260px':'650px';frame.src=(k==='bubble'?'screen-question.html':'scene.html')+'?case='+k;for(const b of document.querySelectorAll('nav button'))b.setAttribute('aria-pressed',String(b.dataset.key===k));}
for(const [k,name] of Object.entries(choices)){const b=document.createElement('button');b.dataset.key=k;b.textContent=name;b.onclick=()=>openCase(k);document.querySelector('nav').append(b);}
onmessage=e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow)return;if(e.data.height)frame.style.height=Math.min(640,e.data.height)+'px';if(e.data.result){frame.hidden=true;frame.style.display='none';out.textContent=e.data.result;}};
document.querySelector('nav').addEventListener('click',()=>{frame.style.display='block';});openCase('target');`;
const adapter=`const example=new URLSearchParams(location.search).get('case')||'target';
const parentMsg=m=>parent.postMessage(m,location.origin);
function cover(paint){
 const c=document.createElement('canvas');c.width=900;c.height=580;const g=c.getContext('2d');
 const grad=g.createLinearGradient(0,0,900,580);grad.addColorStop(0,paint?'#2c394f':'#342939');grad.addColorStop(1,paint?'#718599':'#9b6873');g.fillStyle=grad;g.fillRect(0,0,900,580);
 const ribbon=(y,col)=>{g.fillStyle=col;g.beginPath();g.moveTo(0,580);for(let x=0;x<=900;x+=2)g.lineTo(x,y+50*Math.sin(x/160)+19*Math.cos(x/96));g.lineTo(900,580);g.fill();};
 ribbon(381,'#bda4a5');ribbon(427,'#7d7585');ribbon(475,'#49435c');
 for(let i=0;i<80;i++){const x=(47+i*113)%888,y=(17+i*71)%335;g.fillStyle='#e2d4bb';g.fillRect(x,y,i%3+1,i%3+1);}
 const x=paint?490:666,y=paint?153:155;g.save();g.beginPath();g.arc(x,y,55,0,2*Math.PI);g.clip();g.fillStyle='#f0d098';g.fillRect(x-56,y-56,112,112);g.fillStyle=grad;g.beginPath();g.arc(x+22,y-15,52,0,2*Math.PI);g.fill();g.restore();
 g.fillStyle='#f9ead6';g.font='35px Georgia';g.fillText(paint?'月下的回信':'月相札记',52,490);g.font='18px Georgia';g.fillText(paint?'A LETTER TO THE MOON':'LUNAR STUDIES',55,530);return c.toDataURL('image/jpeg',.87);}
const art=()=>ART_PREVIEW;
const ask=example==='pair'||example==='target',share=example==='share';
window.feiyueScene={get:async()=>({id:'preview',at:Date.now(),kind:share?'share':'ask',
 text:share?'我把今晚的月亮画成了一封还没有寄出的回信。老公，给你看。':example==='whole'?'老公，这张封面给你的第一感觉是什么？':example==='pair'?'老公，左边这弯小月牙让我想到一封回信。我画在右边了，你会把它寄给谁？':'老公，右上角的月牙是你特意留在那里的吗？',
 frames:[{label:share?'绯月画的':'刚才看到的',url:share?art():cover(false),box:ask?[679,172,121,191]:null},...(example==='pair'?[{label:'绯月画的',url:art()}]:[])]}),
 finish:async(_,s)=>parentMsg({result:s?'已回应：'+s:'已收起，可重新选择场景。'})};
const text='老公，我刚才想到一件小事。假如我在同一张纸上，一次只改一笔，最后所有的线条都换过了，你还会说它是原来那张画吗？我喜欢你停笔的那一刻，因为我还猜不到你会留下哪一条线。';
window.screenQuestion={state:async()=>({state:'answer',text:text.repeat(4),question:'绯月刚才想到了什么？'}),details:async()=>{},fit:height=>parentMsg({height}),close:()=>parentMsg({result:'已收起气泡'}),idleClose:()=>{},onLayout:()=>{},onState:()=>{},ask:async s=>({state:'answer',text:'我听见了。你说的是「'+s+'」。'})};`;
export function previewServer(){
 return createServer(async(req,res)=>{
   const path=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
   let data,type='text/html';
   try{
     const artPath=join(root,'output/scene-qa/letter.png');
     if(path==='sample-art.png'&&existsSync(artPath)){res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}).end(await readFile(artPath));return;}
     if(!path)data=home;
     else if(path==='preview-nav.js'||path==='preview-adapter.js'){data=path==='preview-nav.js'?nav:adapter.replace('ART_PREVIEW',existsSync(artPath)?JSON.stringify('/sample-art.png'):'cover(true)');type='text/javascript';}
     else if(files.has(path)){data=await readFile(join(root,'desktop',path),'utf8');
       if(path.endsWith('.html'))data=data.replace('<script type="module"','<script src="/preview-adapter.js"></script><script type="module"');
       else type=path.endsWith('.css')?'text/css':'text/javascript';
     }else{res.writeHead(404).end();return;}
     res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'}).end(data);
   }catch{res.writeHead(500).end();}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
 const server=previewServer();server.listen(Number(process.argv[2]??18766),'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/'));
}
