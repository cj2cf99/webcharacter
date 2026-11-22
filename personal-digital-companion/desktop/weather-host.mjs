import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createPanelWindow,showPanel} from './panel-window.mjs';
import {createWeatherService, JMA_WARNING_PAGE, JMA_RADAR_PAGE} from './weather-service.mjs';
import {JMA_TYPOON_PAGE, JMA_BULLETIN_PAGE} from './jma-typhoon.mjs';

import {weatherBrief} from './weather-brief.mjs';

const jmaPages = new Map([
  ['radar', JMA_RADAR_PAGE], ['warning', JMA_WARNING_PAGE],
  ['typhoon', JMA_TYPOON_PAGE], ['bulletin', JMA_BULLETIN_PAGE],
]);

export function attachWeather(electron, {bundle, root, profile, service, request, requestHourly, background = true, visible = true, recordCheck=()=>{}, checks}) {
  const {ipcMain, shell} = electron;
  let seen=checks?.weatherState();
  if(!seen){
    seen={};
    try{
      const old=JSON.parse(readFileSync(resolve(profile,'weather-notices.json'),'utf8'));
      if(old && typeof old==='object' && !Array.isArray(old))seen=old;
    }catch{}
  }
  let panel=null,closed=false,collecting=false;
  const triggers=new Map();
  function collectReminder(row,items,category='官方预警'){
    const reasons=triggers.get(row.id)??[];
    for(const item of items){
      const text=category==='气象通报'?item.type+'通报':item.shortTitle||item.title;
      reasons.push(text);
    }
    triggers.set(row.id,reasons);
  }
  const api=service??createWeatherService({request,requestHourly,seen,remindersEnabled:()=>collecting,important:collectReminder,
    onChange:data=>{if(panel&&!panel.isDestroyed())panel.webContents.send('weather:changed',data);}});
  function trusted(event) {
    return panel && !panel.isDestroyed() && event.sender === panel.webContents && event.senderFrame === panel.webContents.mainFrame;
  }
  const handlers = {
    'weather:get': () => api.snapshot(),
    'weather:refresh': () => api.refreshAll(),
    'weather:jma': (_event, page) => {
      const url = jmaPages.get(page);
      if (url) return shell.openExternal(url);
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, value) => {
      if (!trusted(event)) throw new Error('仅天气窗口可使用');
      return handler(event, value);
    });
  }
  async function open(activate = true) {
    if (closed) return;
    if (panel && !panel.isDestroyed()) {
      if (visible && activate) { showPanel(panel); panel.focus(); }
      else if (visible && !panel.isVisible()) panel.showInactive();
      return;
    }
    const created = createPanelWindow(electron,{title: '绯月 · 三地天气', width: 560, height: 465,
      minWidth: 360, minHeight: 330, show: false, autoHideMenuBar: true,
      webPreferences: {preload: resolve(root, 'desktop/weather-preload.cjs'), sandbox: true,
        nodeIntegration: false, contextIsolation: true, webSecurity: true, offscreen: !visible}},root);
    panel = created;
    const entry = resolve(bundle, 'weather.html');
    created.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    created.webContents.on('will-navigate', (event, url) => {
      if (url !== pathToFileURL(entry).href) event.preventDefault();
    });
    created.on('closed', () => { if (panel === created) panel = null; });
    try {
      await created.loadFile(entry);
      if (closed || panel !== created || created.isDestroyed()) return;
      if (visible && activate) showPanel(created);
      else if (visible) created.showInactive();
    } catch (error) {
      if (!created.isDestroyed()) created.destroy();
      throw error;
    }
  }
  async function check(){
    if(closed)return;
    if(!request||service||!background)throw Object.assign(Error('天气连接未配置'),{code:'NO_CONNECTION'});
    const at=Date.now(),before=structuredClone(seen);
    try{
      // 手动查询只更新面板，让自动轮询独立判定新预警。
      await api.whenIdle();
      if(closed)return;
      collecting=true;
      const {rows}=await api.refreshAll({includeHourly:true});
      if(closed)return;
      const places={...seen.brief?.places};
      for(const row of rows){
        if(!places[row.id]?.temperatures){
          places[row.id]={...places[row.id],temperatures:checks.weatherTemperatureHistory(row,at)};
        }
      }
      const brief=weatherBrief(rows,triggers,{...seen.brief,places},at);
      seen.brief=brief.state;seen.lastCheck=at;
      checks.saveWeather(seen,brief,at);
      for(const row of rows){
        const results=[],failed=[];
        function field(label,part,value){
          if(part.state==='ready')results.push(value());
          else failed.push(label);
        }
        field('预警',row.alerts,()=>row.alerts.value.values.length+' 个有效预警');
        if(row.japan){
          field('台风动态',row.japan.tracks,()=>row.japan.tracks.values.length+' 条台风动态');
          field('通报',row.japan.bulletins,()=>row.japan.bulletins.values.length+' 条通报');
        }
        field('实况',row.current,()=>row.current.value.text+' '+row.current.value.temperature+'°C');
        field('当日气温',row.minimum,()=>row.minimum.value.maximum===null?'最低 '+row.minimum.value.temperature+'°C':
          '全天 '+row.minimum.value.temperature+'～'+row.minimum.value.maximum+'°C');
        field('短时雨雪',row.hourly,()=>row.hourly.value.length?'未来 6 小时有雨雪':'未来 6 小时暂无明显雨雪');
        if(row.minimum.state==='ready'&&row.minimum.value.maximum===null)failed.push('最高温');
        const status=failed.length?(results.length?'部分失败':'查询失败'):'已检查';
        if(failed.length)results.push(failed.join('、')+'未取得');
        results.push(brief.body?'本轮已发'+brief.title:'本轮无新简报');
        recordCheck('天气 · '+row.name,status,results.join(' · '),at);
      }
      return brief.body?'已生成'+brief.title:'检查完成，未生成新简报';
    }catch(error){
      if(!closed){
        for(const key of Object.keys(seen))delete seen[key];
        Object.assign(seen,before);
        throw error;
      }
    }finally{
      collecting=false;triggers.clear();
    }
  }
  function close(){
    closed=true;
    api.close();
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
    if (panel && !panel.isDestroyed()) panel.destroy();
  }
  return {open, check, close, get panel() {return panel;}};
}
