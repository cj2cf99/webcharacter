import electron from 'electron';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {attachScenePanel} from '../desktop/scene-panel.mjs';
import {colourBounds} from '../desktop/scene-location.mjs';
import {encodeImage} from '../desktop/screen-question-client.mjs';
import {createBalancedLocalModel} from '../desktop/balanced-local-model.mjs';
import {createSceneCuriosity} from '../desktop/scene-curiosity.mjs';
import {localVision} from '../desktop/local-vision.mjs';
import {desktopModelPath} from '../desktop/local-model.mjs';

const root=resolve(import.meta.dirname,'..');
const profile=await mkdtemp(join(tmpdir(),'feiyue-scene-native-'));
electron.app.setPath('userData',profile);
async function run(){
  await electron.app.whenReady();
  const width=512,height=320,buf=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const rgb=(x-380)**2+(y-100)**2<35**2?[214,32,43]:x>50&&x<180&&y>60&&y<160?[53,105,169]:[250,248,244];
    const i=4*(y*width+x);buf[i]=rgb[2];buf[i+1]=rgb[1];buf[i+2]=rgb[0];buf[i+3]=255;
  }
  const img=electron.nativeImage.createFromBitmap(buf,{width,height});
  const box=colourBounds(img,'红色圆形');assert.ok(box);const [x,y,w,h]=box;
  for(const [got,want] of [[x,675],[y,206],[w,135],[h,216]])assert.ok(Math.abs(got-want)<12,JSON.stringify(box));
  if(process.argv.includes('--vision')){
    const crop=img.crop({x:Math.floor(x*width/1000),y:Math.floor(y*height/1000),width:Math.ceil(w*width/1000),height:Math.ceil(h*height/1000)});
    const result=await localVision(desktopModelPath(electron.app,root))('裁剪图中是否清楚包含完整的「红色圆形」？只答是或否。',encodeImage(crop),new AbortController().signal);
    console.log('合成红圆的实测外框和本机视觉核对',JSON.stringify(box),result.text??result.reason);
    assert.match(result.text??'',/^是[。.!！]?$/);
  }
  if(process.argv.includes('--initiative')){
    const model=createBalancedLocalModel({utilityProcess:electron.utilityProcess,modelPath:desktopModelPath(electron.app,root)});
    let choice,decision,shown;
    const instance=createSceneCuriosity({profile,memory:{folder:()=>profile},diary:{recordScene(){}},
      model:{memory:async(...args)=>{const out=await model.memory(...args);if(out.choice)choice=out.choice;else decision=out.action;return out;}},
      eligible:()=>true,context:()=>'平静，想知道颜色的名字和我们实际看到的颜色是否相同',wake:()=>{},
      electron:{screen:{getCursorScreenPoint:()=>({x:0,y:0}),getDisplayNearestPoint:()=>({id:1,size:{width,height}})},
        desktopCapturer:{getSources:async()=>[{display_id:'1',thumbnail:img}]},nativeImage:electron.nativeImage},
      vision:localVision(desktopModelPath(electron.app,root)),show:async s=>{shown=s;return true;},
      draw:async()=>join(root,'output/scene-qa/letter.png')});
    try{
      const answer=await instance.run(new AbortController().signal);
      assert.ok(['observe','reflect','wait'].includes(choice));
      if(choice!=='wait')assert.ok(['ask','share','quiet'].includes(decision));
      if(shown)await instance.finish(shown,'');
      console.log('真实人格判断（合成资料）',choice,decision??'',answer.detail);
    }finally{instance.close();await model.close();}
  }
  let receipt;
  const host=attachScenePanel(electron,{root,bundle:join(root,'output/desktop-bundle'),visible:false,finish:async(v,text)=>{receipt={id:v.id,text};}});
  const id='native-scene';
  await host.show({id,kind:'ask',at:Date.now(),text:'这颗红圆像什么？',frames:[{label:'合成图',box,url:'data:image/jpeg;base64,'+encodeImage(img).data_base64}]});
  const ui=expr=>host.panel.webContents.executeJavaScript(expr);
  for(let i=0;i<100&&!await ui("!!document.querySelector('.mark')");i++)await new Promise(r=>setTimeout(r,25));
  assert.equal(await ui("document.querySelectorAll('header.fy-titlebar').length"),1);
  assert.equal(await ui("document.querySelectorAll('.mark').length"),1);
  await ui("document.querySelector('.picture').click()");assert.ok(await ui("document.querySelector('dialog').open"));await ui("document.querySelector('#back').click()");
  await ui("document.querySelector('#reply').value='像印章';document.querySelector('form').requestSubmit()");
  for(let i=0;i<100&&!receipt;i++)await new Promise(r=>setTimeout(r,25));
  assert.deepEqual(receipt,{id,text:'像印章'});host.close();
  console.log('PASS: 实际 Electron 弹窗、图片外圈、放大、真实 IPC 回复及关闭');
}
run().then(()=>electron.app.exit(0),e=>{console.error(e);electron.app.exit(1);});
