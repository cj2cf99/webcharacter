// 检查最终GLB的真实三角面、顶点光照、内部资源和网页入口。
import fs from 'node:fs';
const root=new URL('./site/',import.meta.url), asset=new URL('assets/realtime/',root);
const bytes=fs.readFileSync(new URL('shore.glb',asset));
if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(8)!==bytes.length)throw Error('GLB格式或长度无效');
const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length).toString());
let primitives=0,triangles=0,colored=0;
for(const mesh of gltf.meshes)for(const p of mesh.primitives){primitives++;triangles+=gltf.accessors[p.indices].count/3;if(p.attributes.COLOR_0!==undefined)colored++;}
if(colored!==primitives)throw Error(`缺失烘焙颜色：${colored}/${primitives}`);
if(gltf.buffers.some(b=>b.uri)||gltf.images?.some(i=>i.uri))throw Error('GLB存在未打包外部依赖');
const metadata=JSON.parse(fs.readFileSync(new URL('scene.json',asset),'utf8'));
if(metadata.glbBytes!==bytes.length||triangles>5000000)throw Error('资源统计异常');
for(const file of ['sky.jpg','swash-motion.bin','swash-motion.json'])if(!fs.statSync(new URL(file,asset)).size)throw Error(file);
for(const file of ['index.html','realtime.html','realtime.mjs','animation.html','vendor/three/three.module.min.js','vendor/three/GLTFLoader.js','vendor/three/LICENSE'])if(!fs.statSync(new URL(file,root)).size)throw Error(file);
console.log(JSON.stringify({bytes:bytes.length,meshes:gltf.meshes.length,primitives,colored,uniqueTriangles:triangles,instancesTriangles:metadata.trianglesWithInstances,materials:gltf.materials.length,images:gltf.images?.length||0},null,2));
