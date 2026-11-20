import {copyFile, mkdir, readFile} from 'node:fs/promises';
import {dirname, isAbsolute, join, relative, resolve} from 'node:path';

const source = resolve(import.meta.dirname, '..');
const [apiArg, mainArg] = process.argv.slice(2);
if (!apiArg || !mainArg || process.argv.length !== 4) throw Error('用法 node tools/sync-release-sources.mjs <api-worker 目录> <myapp 目录>');
const api = resolve(apiArg), main = resolve(mainArg);
await Promise.all([readFile(join(api, 'package.json')), readFile(join(main, 'package.json'))]);
const selected = new Set();
const vendor = join(api, 'src/companion');
async function copy(file, destination) {
  await mkdir(dirname(destination), {recursive: true});
  await copyFile(file, destination);
}
async function collect(file) {
  if (selected.has(file)) return;
  const name = relative(source, file);
  if (!/^agent[\\/]/.test(name) || name.includes('..') || isAbsolute(name)) throw Error('不允许在发行目录外复制模块');
  selected.add(file);
  const sourceText = await readFile(file, 'utf8');
  const imports = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;
  await Promise.all([...sourceText.matchAll(imports)].map(match => collect(resolve(dirname(file), match[2]))));
  await copy(file, join(vendor, name));
}
await collect(join(source, 'agent/host/subscriptions.mjs'));
for (const name of [
  '001-task-units.sql','002-executions.sql','003-task-activity.sql','004-task-deadline.sql',
  '005-task-recoveries.sql','006-chains.sql','007-task-submissions.sql','008-daily-logs.sql',
  '009-chain-submissions.sql','010-temporary-chain-positions.sql','011-temporary-registration.sql',
  '012-registration-ai-preference.sql','013-ai-route-cooldown.sql','014-pc-dispatch.sql','015-serial-pc.sql',
]) await copy(join(source,'agent/migrations',name), join(vendor,'agent/migrations',name));
for (const name of ['tasklist-hu-shi.sql','tasklist-registration.sql','tasklist-pc.sql']) {
  await copy(join(source,'agent/seeds',name), join(vendor,'agent/seeds',name));
}
for (const name of ['registration-ai.mjs','registration-data.mjs','record-photo.mjs','chain-page.mjs','task-workspace-routes.mjs','reminder-edits.mjs','reminder-review.mjs']) {
  await copy(join(source,'agent/host',name), join(main,'src/features/companion/vendor',name));
}
for (const name of ['chains.js','chains.css']) await copy(join(source,'web',name), join(main,'src/client/companion',name));
console.log('已同步绯月 Worker 源码与迁移、主站私有模块及任务管理页面。');
