// 回复时序与跳页：经完整抓取器（含页面就绪后的 0.8 秒预等）复核。仅访问 127.0.0.1。
import * as electron from 'electron';
import http from 'node:http';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {createElectronArticleFetcher}=await import(new URL('../../../desktop/x-article.mjs',import.meta.url).href);
electron.app.setPath('userData',mkdtempSync(join(tmpdir(),'xv-review2-f-')));electron.app.on('window-all-closed',()=>{});
const src=readFileSync(join(import.meta.dirname,'recheck-scraper.mjs'),'utf8');
// 复用同一批夹具定义。
const block=src.slice(src.indexOf('const cell=html=>'),src.indexOf('const server=http.createServer'));
const pages=new Function(block+';return pages;')();
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><body>'+(pages[req.url.split('?')[0]]??'')+'</body>');});
electron.app.whenReady().then(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const fetchArticle=createElectronArticleFetcher(electron),base='http://127.0.0.1:'+server.address().port;
  for(const [id,path,limit,want] of [['Q1','/late/status/1',2,2],['Q2','/page/status/1',3,3],['Q3','/nav/status/1',6,3]]){
    const data=await fetchArticle({url:base+path,repliesLimit:limit});
    console.log('FETCH',id,'应有',want,'取到',data.replies.length,data.replies.map(r=>r.author+':'+r.text).join(' | '));
  }
  server.close();electron.app.exit(0);
}).catch(error=>{console.error(error);electron.app.exit(1);});
