import {runElectronCheck} from './run-electron-check.mjs';

// 学习面板由正式菜单首击打开，使用隔离题库同时截取浅色和深色。
const entry=process.argv.includes('--study')?'./test-study-electron.mjs':'./menu-panel-capture.mjs';
void runElectronCheck(new URL(entry,import.meta.url));
