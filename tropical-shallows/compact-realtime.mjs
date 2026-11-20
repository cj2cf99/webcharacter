// 去除烘焙静态网格不使用的法线/UV；对数颜色量化并焊接重复顶点。
import fs from 'node:fs';
const dir=new URL('./site/assets/realtime/',import.meta.url),path=new URL('shore.glb',dir);
if(JSON.parse(fs.readFileSync(new URL('scene.json',dir))).colorEncoding==='log8')throw Error('已精简过；请先从Blender重新导出原始GLB，避免重复量化。');
const input=fs.readFileSync(path),jsonLen=input.readUInt32LE(12),g=JSON.parse(input.subarray(20,20+jsonLen));
const binaryStart=20+jsonLen+8,binary=input.subarray(binaryStart),chunks=[],views=[],accessors=[];let offset=0;
function read(index){const a=g.accessors[index],v=g.bufferViews[a.bufferView],bytes={5126:4,5125:4,5123:2,5121:1}[a.componentType],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||size*bytes;return {a,size,get:(i,k=0)=>{const at=start+i*stride+k*bytes;return a.componentType===5126?binary.readFloatLE(at):a.componentType===5125?binary.readUInt32LE(at):a.componentType===5123?binary.readUInt16LE(at):binary.readUInt8(at);}};}
function add(data,type,componentType,normalized=false,bounds){const raw=Buffer.from(data.buffer,data.byteOffset,data.byteLength),view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:raw.length});chunks.push(raw);const pad=(4-raw.length%4)%4;if(pad)chunks.push(Buffer.alloc(pad));offset+=raw.length+pad;const a={bufferView:view,componentType,count:data.length/({SCALAR:1,VEC2:2,VEC3:3}[type]),type};if(normalized)a.normalized=true;if(bounds){a.min=bounds.min;a.max=bounds.max;}accessors.push(a);return accessors.length-1;}
let before=0,after=0;
for(const mesh of g.meshes)for(const p of mesh.primitives){
 const position=read(p.attributes.POSITION),color=read(p.attributes.COLOR_0),index=read(p.indices),m=g.materials[p.material];
 const texture=m.pbrMetallicRoughness?.baseColorTexture,uv=texture?read(p.attributes.TEXCOORD_0):null;
 if(texture)texture.texCoord=0;
 const count=position.a.count,remap=new Uint32Array(count),positions=[],colors=[],uvs=[],lookup=new Map();before+=count;
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<count;i++){
  const xyz=[position.get(i,0),position.get(i,1),position.get(i,2)],rgb=[0,1,2].map(k=>{let c=color.get(i,k);if(color.a.normalized)c/=color.a.componentType===5121?255:65535;return Math.round(Math.log1p(64*Math.max(0,c))/Math.log(65)*255);});
  if(!xyz.every(Number.isFinite)||!rgb.every(Number.isFinite))throw Error('非有限顶点数据');
  const tex=uv?[uv.get(i,0),uv.get(i,1)]:[];
  const key=xyz.map(x=>Math.round(x*10000)).join(',')+'|'+rgb.join(',')+'|'+tex.map(x=>Math.round(x*65535)).join(',');
  let n=lookup.get(key);if(n===undefined){n=positions.length/3;lookup.set(key,n);positions.push(...xyz);colors.push(...rgb);if(uv)uvs.push(...tex);for(let k=0;k<3;k++){min[k]=Math.min(min[k],xyz[k]);max[k]=Math.max(max[k],xyz[k]);}}remap[i]=n;
 }
 const indices=new Uint32Array(index.a.count);for(let i=0;i<indices.length;i++)indices[i]=remap[index.get(i)];
 p.attributes={POSITION:add(new Float32Array(positions),'VEC3',5126,false,{min,max}),COLOR_0:add(new Uint8Array(colors),'VEC3',5121,true)};
 if(uv)p.attributes.TEXCOORD_0=add(new Float32Array(uvs),'VEC2',5126);
 p.indices=add(indices,'SCALAR',5125);after+=positions.length/3;
 console.log('COMPACT',m.name,count,'->',positions.length/3);
}
for(const image of g.images||[]){const old=g.bufferViews[image.bufferView],raw=binary.subarray(old.byteOffset||0,(old.byteOffset||0)+old.byteLength);image.bufferView=views.length;views.push({buffer:0,byteOffset:offset,byteLength:raw.length});chunks.push(raw);const pad=(4-raw.length%4)%4;if(pad)chunks.push(Buffer.alloc(pad));offset+=raw.length+pad;}
g.bufferViews=views;g.accessors=accessors;g.buffers=[{byteLength:offset}];
let json=Buffer.from(JSON.stringify(g)),pad=(4-json.length%4)%4;json=Buffer.concat([json,Buffer.alloc(pad,32)]);const bin=Buffer.concat(chunks),header=Buffer.alloc(20),binHead=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+8+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHead.writeUInt32LE(bin.length);binHead.writeUInt32LE(0x004e4942,4);
// 先完整写入临时资源，再替换，避免本地预览同时读取时看到半个模型。
const next=new URL('shore.next.glb',dir),nextInfo=new URL('scene.next.json',dir);
const infoPath=new URL('scene.json',dir),info=JSON.parse(fs.readFileSync(infoPath));info.glbBytes=header.readUInt32LE(8);info.colorEncoding='log8';info.compaction={verticesBefore:before,verticesAfter:after};
fs.writeFileSync(next,Buffer.concat([header,json,binHead,bin]));fs.writeFileSync(nextInfo,JSON.stringify(info,null,2));
fs.renameSync(next,path);fs.renameSync(nextInfo,infoPath);console.log('RESULT',info.glbBytes,before,after);
