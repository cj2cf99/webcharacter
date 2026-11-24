import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {watchFileChanges,warnLiveUpdate} from './live-files.mjs';

// 记录窗口是否完成首次绘制。透明无边框窗口在首帧前被显示时，Windows 上可能什么也没画出来，
// 要等第二次 show 才出现（重启后第一次点开对话框不显示的现象）。
const painted=new WeakSet(),tracked=new WeakSet();
function track(panel){
  if(!panel||typeof panel.once!=='function'||tracked.has(panel))return panel;
  tracked.add(panel);
  panel.once('ready-to-show',()=>painted.add(panel));
  return panel;
}

// 置顶窗口按最近一次抬升排序；显示后抬到顶端，不改变焦点。
export function raiseTop(panel){
  if(!panel||panel.isDestroyed?.())return;
  try{panel.moveTop?.();}catch{/* 窗口正在销毁。 */}
}

export function showPanel(panel){
  panel.show();
  // Windows 隐藏启动时，窗口可能获得焦点却仍不可见。先显示，再激活同一个窗口。
  if(process.platform==='win32'&&!panel.isVisible()){
    panel.showInactive();
    panel.show();
  }
  raiseTop(panel);
  if(process.platform!=='win32'||typeof panel.once!=='function')return;
  // 期间若被主动隐藏就不再补显示。
  let cancelled=false;
  const cancel=()=>{cancelled=true;};
  panel.once('hide',cancel);
  const again=()=>{
    if(cancelled||panel.isDestroyed())return;
    if(!panel.isVisible())panel.show();
    raiseTop(panel);
    panel.webContents?.invalidate?.(); // 已显示但没画出内容的透明窗口，强制重绘。
  };
  // 首帧尚未画出时，首帧完成后和稍后各补一次，等同于用户“再点一次”。
  if(tracked.has(panel)&&!painted.has(panel))panel.once('ready-to-show',()=>setImmediate(again));
  setTimeout(()=>{again();if(!panel.isDestroyed())panel.removeListener?.('hide',cancel);},400).unref?.();
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
  if(options.frame===false||process.platform!=='win32')return track(new BrowserWindow(options));
  const file=join(root,'desktop/panel-titlebar.json');
  const panel=track(new BrowserWindow({...options,titleBarStyle:'hidden',titleBarOverlay:true}));
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
