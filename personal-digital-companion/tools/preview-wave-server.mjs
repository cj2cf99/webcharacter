// 仅绑定本机，仅提供本次检查的三个固定文件；支持视频 Range 请求。
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
const files={
  '/':[fileURLToPath(new URL('./preview-wave.html',import.meta.url)),'text/html; charset=utf-8'],
  '/wave.webm':[fileURLToPath(new URL('../output/video-wave-review/wave-alpha-test.webm',import.meta.url)),'video/webm'],
  '/source.mp4':['G:/picsample/q版挥手打招呼.mp4','video/mp4'],
};
const port=Number(process.argv[2]||8792);
createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return}
  const file=files[new URL(req.url,'http://127.0.0.1').pathname];
  if(!file){res.writeHead(404).end();return}
  try{
    const {size}=await stat(file[0]);let start=0,end=size-1,status=200;
    const headers={'Content-Type':file[1],'Accept-Ranges':'bytes','Cache-Control':'no-store'};
    if(req.headers.range){
      const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if(!m){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return}
      start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;
      if(start>=size||start>end){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return}
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length']=end-start+1;res.writeHead(status,headers);
    if(req.method==='HEAD'){res.end();return}
    const stream=createReadStream(file[0],{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{res.writeHead(404).end()}
}).listen(port,'127.0.0.1',()=>console.log(`素材预览：http://127.0.0.1:${port}/`));
