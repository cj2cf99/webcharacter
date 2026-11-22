// Run a hidden Electron session against the local companion Worker and real business routes.
import * as electron from 'electron';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startDesktop } from '../desktop/shell.mjs';
import { createScreenQuestionClient } from '../desktop/screen-question-client.mjs';
import { createAssistantClient } from '../agent/assistant/client.mjs';
import { startLocalAcceptance } from '../agent/tests/local-command-service.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'output/local-command-acceptance');
const profile = mkdtempSync(join(tmpdir(), 'companion-local-acceptance-'));
mkdirSync(output, { recursive: true });
electron.app.setPath('userData', profile);
electron.app.commandLine.appendSwitch('disable-gpu');

let menu;
class HiddenWindow extends electron.BrowserWindow {
  constructor(options) {
    super({ ...options, show: false, webPreferences: { ...options.webPreferences, backgroundThrottling: false } });
  }
  showInactive() {}
  show() {}
}
class HiddenTray {
  setContextMenu(value) { menu = value; }
  setToolTip() {}
  on() {}
  destroy() {}
}
const tasks = { async startup() {}, beginQuitCheck() {}, activeCount: () => 0, async stop() {} };
const inspect = (path, sql) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return db.prepare(sql).all().map(row => ({ ...row })); }
  finally { db.close(); }
};
async function wait(predicate, label) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error('等待超时：' + label);
}
let rig, service;
async function run() {
  await electron.app.whenReady();
  service = await startLocalAcceptance({ profile, mainSite: process.env.COMPANION_MAIN_SITE || 'G:/cloudflare/myapp' });
  const assistant = createAssistantClient(service.request, { prefix: '/api/companion' });
  const receipts = [];
  async function get(path) {
    const response = await service.request(path);
    assert.equal(response.status, 200, path);
    return response.json();
  }
  const commands = {
    propose: input => assistant.message({ messages: [{ role: 'user', content: input }] }),
    async confirm() {
      const published = await assistant.confirm({ accepted: true });
      const task = await get('/api/companion/tasks/' + encodeURIComponent(published.task_id));
      receipts.push(task);
      return task;
    },
  };
  let captures = 0;
  const image = electron.nativeImage.createFromBitmap(Buffer.alloc(64 * 64 * 4, 255), { width: 64, height: 64 });
  const screenQuestionClient = await createScreenQuestionClient({
    profile,
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ id: 123, size: { width: 64, height: 64 }, scaleFactor: 1 }),
    },
    desktopCapturer: {
      async getSources() {
        captures++;
        return [{ display_id: '123', thumbnail: image }];
      },
    },
    request: (path, options) => service.request('/api/companion' + path.slice('/api'.length), options),
  });
  rig = await startDesktop({ ...electron, BrowserWindow: HiddenWindow, Tray: HiddenTray }, {
    profile, tasks, localCommands: commands, screenQuestionClient, screenQuestionVisible: false,
    bundle: resolve(root, 'output/desktop-bundle'), windowSource: () => () => {},
  });
  assert(rig, '隔离桌面实例未启动');
  await wait(() => rig.getStats().ready, '桌面精灵就绪');
  const js = code => rig.screenQuestion.panel.webContents.executeJavaScript(code);
  const state = () => js("({ text:document.querySelector('#answer').textContent, confirm:!document.querySelector('#confirm').hidden, status:document.querySelector('#reply').dataset.state })");
  const open = async (label, badge) => {
    const item = menu.items.find(item => item.label === label);
    assert(item, '未找到精灵菜单 ' + label);
    await item.click();
    await wait(async () => {
      const panel = rig.screenQuestion.panel;
      return panel && !panel.webContents.isLoading() && await js("document.querySelector('#badge').textContent") === badge;
    }, badge);
    assert.equal(rig.screenQuestion.panel.isVisible(), false);
  };
  const enter = text => js("document.querySelector('#question').value=" + JSON.stringify(text) + ";document.querySelector('#questionForm').requestSubmit()");
  const clickConfirm = () => js("document.querySelector('#confirm').click()");
  const hasText = async phrase => (await state()).text.includes(phrase);
  const databaseTasks = () => inspect(service.taskPath, 'SELECT type,status,task_id,submission_id,attempt_count FROM tasks ORDER BY rowid');
  const notes = () => inspect(service.businessPath, 'SELECT id,body,category_id FROM ra_records');
  const diaries = () => inspect(service.businessPath, 'SELECT seq,title,content FROM diaries');

  await open('输入命令（本地验收）', '输入命令 · 本地验收');
  await enter('帮我记一下');
  await wait(() => hasText('请说明要登记的内容'), '信息不足提示');
  assert.equal((await state()).confirm, false);
  assert.equal(databaseTasks().length, 0);

  const noteBody = '今天把桌面精灵的指令链路跑通了';
  await enter('帮我新增一条随手记，内容是“' + noteBody + '”，记在生活分类。');
  await wait(async () => (await state()).confirm, '随手记预览');
  assert(await hasText(noteBody));
  assert.equal(databaseTasks().length, 0);
  assert.equal(notes().length, 0);
  service.dropSubmissionResponse();
  await clickConfirm();
  await wait(() => hasText('提交结果暂未确认'), '模拟回执丢失');
  assert.equal((await state()).confirm, true);
  const original = databaseTasks()[0];
  assert.equal(original.status, 'COMPLETED');
  assert.equal(notes().length, 1);
  await clickConfirm();
  await wait(() => hasText('随手记登记成功'), '随手记重试回执');
  assert.deepEqual(databaseTasks(), [original], '重试沿用原任务及提交号');
  const noteId = receipts.at(-1).result.record_id;
  const { record } = await get('/api/records/' + noteId);
  assert.deepEqual(notes(), [{ id: noteId, body: noteBody, category_id: 'qa-life' }]);
  assert.equal(record.body, noteBody);
  assert.equal(record.category_id, 'qa-life');

  const diaryTitle = '本地联调';
  const diaryBody = '今天完成窗口精灵到真实登记路由的隔离验收。';
  await enter('帮我写一篇日记，标题是“' + diaryTitle + '”，正文是“' + diaryBody + '”');
  await wait(async () => (await state()).confirm, '日记预览');
  assert(await hasText(diaryTitle));
  assert(await hasText(diaryBody));
  assert.equal(databaseTasks().length, 1);
  assert.equal(diaries().length, 0);
  await clickConfirm();
  await wait(() => hasText('日记登记成功'), '日记登记');
  const diaryId = receipts.at(-1).result.record_id;
  const { item } = await get('/api/diaries/' + diaryId);
  assert.deepEqual(diaries(), [{ seq: diaryId, title: diaryTitle, content: diaryBody }]);
  assert.equal(item.title, diaryTitle);
  assert.equal(item.content, diaryBody);

  await enter('我想记一条随手记，内容是“这一条应登记失败”，记在不存在分类。');
  await wait(async () => (await state()).confirm, '错误分类预览');
  await clickConfirm();
  await wait(() => hasText('登记失败'), '业务错误回执');
  assert.equal((await state()).status, 'error');
  assert.equal(receipts.at(-1).status, 'FAILED');
  assert.equal(notes().length, 1);
  assert.equal(diaries().length, 1);

  await open('看屏幕提问（头顶气泡）', '看屏幕问答');
  await enter('请描述一下这张用于本地测试的截图。');
  await wait(() => hasText('图片提交成功'), '截图问答回执');
  assert.equal(captures, 1);
  assert.equal(service.log.visionCalls, 2);
  assert.equal(service.log.textCalls, 4);
  const tasksAfter = databaseTasks();
  assert.deepEqual(tasksAfter.map(t => [t.type, t.status, t.attempt_count]), [
    ['records.create', 'COMPLETED', 1], ['diaries.create', 'COMPLETED', 1], ['records.create', 'FAILED', 1],
  ]);
  assert.equal(inspect(service.businessPath, 'SELECT count(*) AS count FROM qa_receipts')[0].count, 2);
  const report = {
    note: { recordId: noteId, body: noteBody, category: '生活' },
    diary: { recordId: diaryId, title: diaryTitle, content: diaryBody },
    tasks: tasksAfter.map(({ type, status, task_id, attempt_count }) => ({ type, status, taskId: task_id, attempts: attempt_count })),
    screenshot: { source: 'synthetic JPEG', captures, aiCalls: service.log.visionCalls, reusedImage: true },
    duplicateOnLostResponse: false,
    missingContentCreatedTask: false,
    http: service.log.http,
  };
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS 随手记和日记均登记并读回；提交回执丢失后重试无重复；无内容、登记拒绝、截图原图重试通过。');
}

async function main() {
  try {
    await run();
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    rig?.screenQuestion.close();
    if (service) await service.close();
    electron.app.exit(process.exitCode || 0);
  }
}

main().catch(error => {
  console.error(error.stack);
  electron.app.exit(1);
});
