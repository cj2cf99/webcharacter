// 原型构建：用主站真实 shell() 生成页头，并只读复制主站与绯月的现行样式。
// 运行：node prototype/cloud-reminder/build.mjs
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '../../desktop');
const main = process.env.FEIYUE_MAIN_DIR || 'G:/cloudflare/myapp';
const copies = [
  ...['styles/shell.css', 'styles/theme.css', 'shell/theme.js', 'shell/navigation.js', 'shell/workspace-layout.js']
    .map(name => [join(main, 'src/client', name), 'assets/' + name]),
  [join(main, 'src/client/companion/chains.css'), 'assets/companion/chains.css'],
  [join(main, 'public/assets/icons/anim/feiyue.svg'), 'assets/icons/anim/feiyue.svg'],
  ...['feiyue-surface.css', 'message-box.css', 'menu.css'].map(name => [join(desktop, name), 'assets/desk/' + name]),
];
for (const [from, to] of copies) {
  await mkdir(dirname(join(here, to)), {recursive: true});
  await copyFile(from, join(here, to));
}
const {shell} = await import(pathToFileURL(join(main, 'src/pages/navigation.js')).href);
const source = await readFile(join(here, 'src/web.html'), 'utf8');
await writeFile(join(here, 'web.html'), shell(source, '/companion/tasks', {COMPANION_ENABLED: 'true'}));
console.log('已生成 prototype/cloud-reminder/web.html');
