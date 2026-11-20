// 独立读取转换结果，检查布局、索引、实际冲退和循环接缝。
import fs from 'node:fs';
const root = new URL('../work/tropical-shallows/realtime-prep/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('swash-motion.json', root), 'utf8'));
const bytes = fs.readFileSync(new URL(meta.binary, root));
const result = { meshes: [] };
for (const mesh of meta.meshes) {
  const data = new Float32Array(bytes.buffer, bytes.byteOffset + mesh.byteOffset, mesh.byteLength / 4);
  if (data.length !== mesh.vertexCount * mesh.frameCount * 3 || !data.every(Number.isFinite)
    || mesh.indices.some(i => i < 0 || i >= mesh.vertexCount)) throw Error(`无效数据：${mesh.name}`);
  const stride = mesh.vertexCount * 3;
  let gap = 0;
  for (let i = 0; i < stride; i += 3) {
    const end = (mesh.frameCount - 1) * stride + i;
    gap = Math.max(gap, Math.hypot(data[i]-data[end], data[i+1]-data[end+1], data[i+2]-data[end+2]));
  }
  result.meshes.push({ name: mesh.name, vertices: mesh.vertexCount, frames: mesh.frameCount, loopGapMetres: gap });
  if (gap > .00001) throw Error(`循环位置未闭合：${mesh.name}`);
  if (mesh.name === 'film') {
    const sample = frame => {
      const t = (frame - 1) / 6, lo = Math.floor(t), hi = Math.ceil(t), a = t - lo;
      const index = (Math.round(17 / 35 * 500) * mesh.columns + mesh.columns - 1) * 3;
      return [0,1,2].map(k => data[lo*stride+index+k]*(1-a) + data[hi*stride+index+k]*a);
    };
    const start = sample(1), high = sample(51), retreat = sample(130);
    result.advanceMetres = high[0] - start[0];
    result.retreatMetres = high[0] - retreat[0];
    if (result.advanceMetres < 1 || result.retreatMetres < .8) throw Error('丢失横向冲退运动');
  }
}
fs.writeFileSync(new URL('browser-data-check.json', root), JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
