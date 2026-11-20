// 使用独立的无头 Chrome 配置；只连接本脚本启动的浏览器，不访问用户会话。
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'work/bird-2d');await mkdir(out,{recursive:true});
const profile=resolve(out,`qa-profile-${Date.now()}`);
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--no-proxy-server',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{windowsHide:true,stdio:'ignore'});
let ws,seq=0;const pending=new Map();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
  let port;for(let i=0;i<100;i++){try{port=Number((await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await wait(100);}}
  if(!port)throw Error('Chrome 启动失败');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const base=process.env.BIRD_URL||'http://127.0.0.1:8784/bird-2d/';
  const errors=[],httpFailures=[];ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Network.responseReceived'&&m.params.response.status>=400&&!m.params.response.url.endsWith('favicon.ico'))httpFailures.push({url:m.params.response.url,status:m.params.response.status});});
  const prefix=process.argv[2]||'review';
  const moments=[0,3.5,5.2,6.65,7.15,10,18.8,26.8];
  for(let i=0;i<moments.length;i++){
    await send('Page.navigate',{url:`${base}?t=${moments[i]}&still`});await wait(450);
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,`${prefix}-${i}.png`),Buffer.from(shot.data,'base64'));
  }
  const desktop=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,loaded:getComputedStyle(document.querySelector('#loading')).display==='none',phase:document.querySelector('#pose-name').textContent})`);
  const frozen=await evaluate(`document.querySelector('canvas').toDataURL()`);await wait(150);const pausedStill=frozen===await evaluate(`document.querySelector('canvas').toDataURL()`);
  const motion=await evaluate(`(async()=>{
    const{sampleCourtship,duration}=await import('/bird-2d/courtship.mjs');const{bodyMotion}=await import('/bird-2d/motion.mjs');const{fanPoint}=await import('/bird-2d/bird-art.mjs');
    let samples=0,bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity},maxPhaseJump=0;
    for(let t=0;t<=duration;t+=.025){const s=sampleCourtship(t),p=s.pose,m=bodyMotion(p,s.clock);if(Object.values(p).some(v=>!Number.isFinite(v)))throw Error('nonfinite scene');
      const points=[[-130,-320],[120,-320],[-130,80],[120,80]];if(p.fan>0)for(const side of[-1,1])for(let j=0;j<=64;j++)points.push(fanPoint(p,side,j/64,1));
      for(const[x,y]of points){const xx=m.x+Math.cos(m.roll)*x*m.yaw-Math.sin(m.roll)*y,yy=m.y+Math.sin(m.roll)*x*m.yaw+Math.cos(m.roll)*y;bounds.left=Math.min(bounds.left,xx);bounds.right=Math.max(bounds.right,xx);bounds.top=Math.min(bounds.top,yy);bounds.bottom=Math.max(bounds.bottom,yy);}samples++;
    }
    for(const t of[1.2,2.8,3.5,4.4,6,6.5,6.8,7.15,12.6,13.1,18.5,19.5,25.4,26.3,27.5]){const aa=sampleCourtship(t-1e-7),bb=sampleCourtship(t+1e-7),a=aa.pose,b=bb.pose;for(const k of Object.keys(a))maxPhaseJump=Math.max(maxPhaseJump,Math.abs(a[k]-b[k]));const ma=bodyMotion(a,aa.clock),mb=bodyMotion(b,bb.clock);for(const k of ['x','y','roll','yaw'])maxPhaseJump=Math.max(maxPhaseJump,Math.abs(ma[k]-mb[k]));}
    const stage=document.querySelector('canvas').getBoundingClientRect(),scale=Math.min(stage.width/820,stage.height/570),screen={left:stage.width*.51+bounds.left*scale,right:stage.width*.51+bounds.right*scale,top:stage.height*.74+bounds.top*scale,bottom:stage.height*.74+bounds.bottom*scale,width:stage.width,height:stage.height};
    return{samples,maxPhaseJump,bounds,screen,inside:screen.left>=12&&screen.right<=screen.width-12&&screen.top>=12&&screen.bottom<=screen.height-12};
  })()`);
  const sheet=await evaluate(`(async()=>{const{drawBird}=await import('/bird-2d/bird-art.mjs');const{sampleCourtship}=await import('/bird-2d/courtship.mjs');const c=document.createElement('canvas');c.width=1440;c.height=800;const g=c.getContext('2d'),moments=[0,3.5,5.2,6.65,7.15,10,18.8,26.8];for(let i=0;i<moments.length;i++){const s=sampleCourtship(moments[i]);g.save();g.translate((i%4)*360,Math.floor(i/4)*400);g.fillStyle='#26382a';g.fillRect(0,0,360,400);g.fillStyle='#d6e3bc';g.font='14px sans-serif';g.fillText(moments[i]+'s / '+s.phase,14,25);g.translate(180,355);g.scale(.62,.62);drawBird(g,s.pose,s.clock);g.restore();}return c.toDataURL().split(',')[1]})()`);await writeFile(resolve(out,`${prefix}-sequence.png`),Buffer.from(sheet,'base64'));
  await evaluate(`document.querySelector('#seek').value='10';document.querySelector('#seek').dispatchEvent(new Event('input'));document.querySelector('#play').click()`);const live=await evaluate(`document.querySelector('canvas').toDataURL()`);await wait(180);const animationChanged=live!==await evaluate(`document.querySelector('canvas').toDataURL()`);await evaluate(`document.querySelector('#play').click()`);
  const seek=await evaluate(`document.querySelector('#seek').value='18.8';document.querySelector('#seek').dispatchEvent(new Event('input'));({phase:document.querySelector('#pose-name').textContent,value:document.querySelector('#seek').value})`);
  await evaluate(`document.querySelector('#loop').click();document.querySelector('#speed').value='1.5';document.querySelector('#speed').dispatchEvent(new Event('change'));document.querySelector('#seek').value='31.98';document.querySelector('#seek').dispatchEvent(new Event('input'));document.querySelector('#play').click()`);await wait(200);
  const completion=await evaluate(`({value:+document.querySelector('#seek').value,paused:document.querySelector('#play').textContent,loop:document.querySelector('#loop').getAttribute('aria-pressed')})`);
  await evaluate(`document.querySelector('#replay').click()`);await wait(80);const replay=await evaluate(`({value:+document.querySelector('#seek').value,playing:document.querySelector('#play').textContent})`);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:`${base}?t=10&still`});await wait(450);
  const mobile=await evaluate(`(()=>{const b=${JSON.stringify(motion.bounds)},r=document.querySelector('canvas').getBoundingClientRect(),scale=Math.min(r.width/820,r.height/570);return{width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.body.scrollHeight,inside:r.width*.51+b.left*scale>=12&&r.width*.51+b.right*scale<=r.width-12&&r.height*.74+b.top*scale>=12&&r.height*.74+b.bottom*scale<=r.height-12};})()`);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(resolve(out,`${prefix}-mobile.png`),Buffer.from(shot.data,'base64'));
  let reference=null;
  const result={reference,desktop,pausedStill,motion,animationChanged,seek,completion,replay,mobile,httpFailures,errors};await writeFile(resolve(out,`${prefix}-results.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  if(errors.length||httpFailures.length||!desktop.loaded||!pausedStill||!animationChanged||!motion.inside||!mobile.inside||motion.maxPhaseJump>.001||desktop.scroll>desktop.width||mobile.scroll>mobile.width||completion.value!==32||replay.value>1)process.exitCode=1;
  await send('Browser.close');
}finally{ws?.close();browser.kill();}
