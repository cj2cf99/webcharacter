import {EventEmitter} from 'node:events';

export function fixture(){
  const ipcMain=new EventEmitter(),handlers=new Map();ipcMain.handle=(k,fn)=>handlers.set(k,fn);ipcMain.removeHandler=k=>handlers.delete(k);
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.bounds={x:600,y:500,width:240,height:360};this.visible=false;this.destroyed=false;this.sent=[];this.webContents=new EventEmitter();Object.assign(this.webContents,{mainFrame:{},send:(...args)=>this.sent.push(args),setWindowOpenHandler:fn=>this.popup=fn});}
    isDestroyed(){return this.destroyed;}getBounds(){return this.bounds;}setBounds(b){this.bounds=b;}show(){this.visible=true;}showInactive(){this.visible=true;}focus(){}hide(){this.visible=false;}destroy(){this.destroyed=true;this.emit('closed');}async loadFile(){}
  }
  const win=new Window(),screen={getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1280,height:900}})};
  return {win,handlers,ipcMain,history:{save(){},read(){return [];}},electron:{BrowserWindow:Window,screen,ipcMain},event:panel=>({sender:panel.webContents,senderFrame:panel.webContents.mainFrame})};
}
