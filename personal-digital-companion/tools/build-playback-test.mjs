// 生成单个自包含HTML，媒体保留原始字节，不安装依赖、不启动服务器。
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.argv[2]?resolve(process.argv[2]):resolve(root,'绯月播放测试_直接打开.html');
if(existsSync(output))throw Error('输出已存在，请指定新的文件名以保留旧版');
const files={webm:[resolve(root,'output/video-wave-review/wave-alpha-test.webm'),'video/webm'],mp4:['G:/picsample/q版挥手打招呼.mp4','video/mp4']};
const media={};
for(const[k,[path,type]]of Object.entries(files))media[k]={type,data:readFileSync(path).toString('base64')};
const template=readFileSync(new URL('./playback-test.template.html',import.meta.url),'utf8');
const html=template.replace('__EMBEDDED_MEDIA__',JSON.stringify(media));
assert(!html.includes('__EMBEDDED_MEDIA__'));
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new Script(script,{filename:'playback-test-inline.js'});
// 回读成品，核对内嵌媒体与输入字节完全相同。
writeFileSync(output,html);
const embedded=JSON.parse(readFileSync(output,'utf8').match(/<script id="embedded-media" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const hashes={};
for(const[k,[path]]of Object.entries(files)){
  const data=Buffer.from(embedded[k].data,'base64');assert(data.equals(readFileSync(path)));
  hashes[k]=createHash('sha256').update(data).digest('hex');
}
console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),scriptSyntax:'PASS',embeddedMedia:'byte-identical',sha256:hashes},null,2));
