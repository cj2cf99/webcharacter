// 菜单「动画生成器」：只做入口。服务不在运行时以独立进程拉起 webmcreator，再用系统浏览器打开对应页签；
// 长时间处理都在该服务进程里，不占绯月进程。
import {spawn as nodeSpawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

export const ANIMATION_MAKER_DIR = process.env.FEIYUE_WEBMCREATOR_DIR || 'G:/selftool/webmcreator';
export const ANIMATION_MAKER_URL = process.env.FEIYUE_WEBMCREATOR_URL || 'http://127.0.0.1:8766';
const TABS = new Set(['crop', 'gemini', 'gif']);

export function createAnimationMaker({openExternal, spawn = nodeSpawn, fetcher = fetch, dir = ANIMATION_MAKER_DIR, base = ANIMATION_MAKER_URL, wait = 5000, sleep = ms => new Promise(r => setTimeout(r, ms))}) {
  let starting = null;
  async function alive() {
    try {
      const r = await fetcher(base + '/api/status', {signal: AbortSignal.timeout(1500)});
      return r.ok && (await r.json()).app === 'webmcreator';
    } catch { return false; }
  }
  async function start() {
    const entry = join(dir, 'server.mjs');
    if (!existsSync(entry)) throw Error('找不到动画生成器：' + entry);
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn('node', [entry], {cwd: dir, env, detached: true, stdio: 'ignore', windowsHide: true});
    child.on?.('error', () => {});
    child.unref?.();
    for (let t = 0; t < wait; t += 250) { await sleep(250); if (await alive()) return; }
    throw Error('动画生成器 5 秒内未启动，请确认已安装 Node.js');
  }
  return {
    async open(tab) {
      if (!TABS.has(tab)) throw Error('未知页签：' + tab);
      if (!await alive()) { starting ||= start().finally(() => { starting = null; }); await starting; }
      await openExternal(`${base}/#${tab}`);
    },
  };
}
