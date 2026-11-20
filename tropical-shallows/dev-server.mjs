// 只读本地预览，支持视频 Range/HEAD；仅提供本实验 site/ 下的资源。
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'site');
const PORT=Number(process.argv[2]||8786);
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.bin':'application/octet-stream','.mp4':'video/mp4'};
createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    const url=new URL(req.url,'http://localhost');
    const pathname=decodeURIComponent(url.pathname);
    if(pathname.split('/').some(x=>x.startsWith('.')))throw Error('path');
    const file=resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(ROOT+sep)||!MIME[extname(file)]){res.writeHead(404).end();return;}
    const info=await stat(file);if(!info.isFile())throw Error('file');
    let start=0,end=info.size-1,status=200;
    if(req.headers.range){
      const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      if(!m[1])start=Math.max(0,info.size-Number(m[2]));
      else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
      if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      status=206;
    }
    const headers={'Content-Type':MIME[extname(file)],'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store'};
    if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
    res.writeHead(status,headers);
    if(req.method==='HEAD'){res.end();return;}
    const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.once('close',()=>stream.destroy());stream.pipe(res);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:400).end('资源不可用');}
}).listen(PORT,'127.0.0.1',()=>console.log(`热带浅滩本地预览：http://127.0.0.1:${PORT}/`));
