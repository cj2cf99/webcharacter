import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
let checked=0;
function requirePath(from,ref){if(/^(https?:|#|data:)/.test(ref))return;const dest=path.resolve(path.dirname(from),ref.split(/[?#]/)[0]);assert.ok(dest.startsWith(root),'引用越过项目边界');assert.ok(fs.existsSync(dest),`${path.relative(root,from)} 引用缺失：${ref}`);checked++;}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=[...walk(path.join(root,'src')),...walk(path.join(root,'tools')),...fs.readdirSync(root).filter(n=>n.endsWith('.html')).map(n=>path.join(root,n))];
for(const file of files){if(!/\.(mjs|html)$/.test(file))continue;const source=fs.readFileSync(file,'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){if(m[1].startsWith('.'))requirePath(file,m[1]);}if(file.endsWith('.html'))for(const m of source.matchAll(/(?:href|src)="([^"]+)"/g))requirePath(file,m[1]);if(file.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/white/manifest.json')));for(const name of manifest.images)requirePath(path.join(root,'assets/white/manifest.json'),name+'.png');
const json=JSON.parse(fs.readFileSync(path.join(root,'assets/white/character.json')));assert.ok(json);
for(const name of ['body','arm_L','arm_R','hair_back','hair_front','face','eye_L','eye_R','iris_L','iris_R','lash_L','lash_R','brow_L','brow_R','nose','mouth'])requirePath(path.join(root,'assets/source-layers/list'),name+'.png');
console.log(`PASS: ${checked} 个本地引用/素材存在，项目模块语法检查通过。`);
