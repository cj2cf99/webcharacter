// 原生窗口API复现：无鼠标注入，隐藏窗口上比较移动方法是否改变尺寸。
import {app,BrowserWindow,screen} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'output/window-size-check');mkdirSync(out,{recursive:true});
app.setPath('userData',resolve(out,'profile'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{const results=[];
for(const display of screen.getAllDisplays())for(const method of ['setPosition','fixedBounds']){
  const a=display.workArea,w=243,h=360,x=a.x+20,y=a.y+20;
  const win=new BrowserWindow({x,y,width:w,height:h,show:false,transparent:true,frame:false,resizable:false,hasShadow:false,focusable:false});
  await delay(50);const sizes=[];
  for(let i=0;i<120;i++){
    const next={x:x+(i%8)*5,y:y+(i%6)*5,width:w,height:h};
    if(method==='setPosition')win.setPosition(next.x,next.y,false);else win.setBounds(next,false);
    await delay(3);const b=win.getBounds();sizes.push({width:b.width,height:b.height});
  }
  results.push({display:display.id,scaleFactor:display.scaleFactor,method,initial:[w,h],
    minWidth:Math.min(...sizes.map(s=>s.width)),maxWidth:Math.max(...sizes.map(s=>s.width)),
    minHeight:Math.min(...sizes.map(s=>s.height)),maxHeight:Math.max(...sizes.map(s=>s.height)),last:sizes.at(-1)});
  win.destroy();
}
writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));app.quit();
}).catch(error=>{console.error(error);app.quit();});
