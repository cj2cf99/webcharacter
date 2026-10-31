import {readFile,readdir,copyFile,mkdir} from 'node:fs/promises';
const from=new URL('../work/rigby-white/',import.meta.url),to=new URL('../assets/white/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',from)));
const names=['character.json','manifest.json',...manifest.images.map(n=>n+'.png')];
const available=new Set(await readdir(from));
for(const name of names){if(!/^[\w.-]+$/.test(name)||!available.has(name))throw Error('缺少或无效资源：'+name);}
JSON.parse(await readFile(new URL('character.json',from)));
await mkdir(to,{recursive:true});for(const name of names)await copyFile(new URL(name,from),new URL(name,to));
console.log('已更新 assets/white/，请运行测试并在浏览器检查两个演示。');
