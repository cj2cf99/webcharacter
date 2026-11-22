import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {watchFileChanges,warnLiveUpdate} from './live-files.mjs';

export function showPanel(panel){
  panel.show();
  // Windows 隐藏启动时，窗口可能获得焦点却仍不可见。先显示，再激活同一个窗口。
  if(process.platform==='win32'&&!panel.isVisible()){
    panel.showInactive();
    panel.show();
  }
}

function readOverlay(file){
  const data=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  const color=value=>typeof value==='string'&&/^#[\da-f]{6}([\da-f]{2})?$/i.test(value);
  if(!Number.isInteger(data?.height)||data.height<1||data.height>2147483647||
    ![data.color,data.lightSymbolColor,data.darkSymbolColor].every(color))throw Error('标题栏高度或颜色无效');
  return data;
}

// 原生覆盖层在建窗时开启；外观变动只更新当前窗口，不触碰页面或草稿。
export function createPanelWindow({BrowserWindow,nativeTheme},options,root){
  // 头顶气泡和模态消息自行提供关闭按钮，保留原来的透明外形与焦点行为。
  if(options.frame===false||process.platform!=='win32')return new BrowserWindow(options);
  const file=join(root,'desktop/panel-titlebar.json');
  const panel=new BrowserWindow({...options,titleBarStyle:'hidden',titleBarOverlay:true});
  let current;
  function apply(config){
    panel.setTitleBarOverlay({height:config.height,color:config.color,
      symbolColor:nativeTheme?.shouldUseDarkColors?config.darkSymbolColor:config.lightSymbolColor});
  }
  function refresh(){
    const config=readOverlay(file);
    apply(config);
    current=config;
  }
  const stop=watchFileChanges(file,refresh);
  try{refresh();}catch(error){warnLiveUpdate('绯月标题栏',error);}
  const sync=()=>{if(current)apply(current);};
  nativeTheme?.on('updated',sync);
  panel.once('closed',()=>{stop();nativeTheme?.removeListener('updated',sync);});
  return panel;
}
