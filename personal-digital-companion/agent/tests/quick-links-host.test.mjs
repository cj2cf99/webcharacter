import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {attachQuickLinks} from '../../desktop/quick-links-host.mjs';

function makeMockElectron({openExternalImpl=async()=>{}}={}){
  const handlers=new Map();
  const opened=[];
  let activeWin=null;
  class BrowserWindow{
    constructor(){
      this.destroyed=false;
      this.listeners=new Map();
      this.webContents={
        mainFrame:{id:'main'},
        sent:[],
        send:(ch,payload)=>this.webContents.sent.push([ch,payload]),
        setWindowOpenHandler:()=>{},
        on:()=>{},
      };
      activeWin=this;
    }
    once(name,fn){this.listeners.set(name,fn);}
    isDestroyed(){return this.destroyed;}
    loadFile(){return Promise.resolve();}
    show(){} showInactive(){} focus(){} setTitleBarOverlay(){}
    moveTop(){} isVisible(){return true;}
    destroy(){this.destroyed=true;this.listeners.get('closed')?.();}
  }
  return {
    handlers,
    opened,
    get win(){return activeWin;},
    electron:{
      BrowserWindow,
      ipcMain:{
        handle:(ch,fn)=>handlers.set(ch,fn),
        removeHandler:ch=>handlers.delete(ch),
      },
      shell:{
        openExternal:async url=>{opened.push(url);return openExternalImpl(url);},
      },
    },
  };
}

test('attachQuickLinks 校验可信 frame、拦截非 http(s) 并捕获菜单外链失败',async()=>{
  const profile=mkdtempSync(join(tmpdir(),'feiyue-ql-host-'));
  const menuChanges=[];
  const openErrors=[];
  let failOpen=false;
  const mock=makeMockElectron({
    openExternalImpl:async()=>{if(failOpen)throw Error('浏览器启动失败');},
  });
  const root=resolve(import.meta.dirname,'../..');
  const host=attachQuickLinks(mock.electron,{
    root,
    bundle:join(root,'output/desktop-bundle'),
    profile,
    onChange:snap=>menuChanges.push(snap.links.length),
    onOpenError:err=>openErrors.push(err.message),
  });
  try{
    const untrusted={sender:{},senderFrame:{}};
    assert.throws(()=>mock.handlers.get('quick-links:list')(untrusted),/应用链接设置页面/);

    await host.open();
    const trusted={sender:mock.win.webContents,senderFrame:mock.win.webContents.mainFrame};

    // 非 http/https 协议必须拒绝
    assert.throws(()=>mock.handlers.get('quick-links:open')(trusted,'file:///C:/Windows/win.ini'),/http:\/\/ 或 https:\/\//);
    assert.throws(()=>mock.handlers.get('quick-links:open')(trusted,'javascript:alert(1)'),/http:\/\/ 或 https:\/\//);

    // 正常打开 http(s)
    await mock.handlers.get('quick-links:open')(trusted,'https://example.com/a');
    assert.deepEqual(mock.opened,['https://example.com/a']);

    // 增删改触发菜单同步与悬停备注透传
    mock.handlers.get('quick-links:create')(trusted,{name:'题库',url:'https://example.com/q',note:'刷题备注'});
    assert.deepEqual(menuChanges,[1]);
    const items=host.menuItems();
    assert.equal(items[0].label,'应用链接设置');
    assert.equal(items[1].type,'separator');
    assert.equal(items[2].label,'题库');
    assert.equal(items[2].fyTitle,'刷题备注');

    // 点击菜单项触发 openExternal，异常进入 onOpenError 不产生未处理拒绝
    failOpen=true;
    items[2].click();
    await new Promise(resolveDelay=>setTimeout(resolveDelay,10));
    assert.deepEqual(openErrors,['浏览器启动失败']);
  }finally{
    host.close();
    rmSync(profile,{recursive:true,force:true});
  }
});
