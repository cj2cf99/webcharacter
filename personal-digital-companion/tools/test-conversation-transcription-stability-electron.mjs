import assert from 'node:assert/strict';
import * as electron from 'electron';
import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createWorker} from '../agent/worker.mjs';
import {initializeDatabase, openTestDatabase} from '../agent/tests/sqlite-d1.mjs';
import {createBalancedLocalModel} from '../desktop/balanced-local-model.mjs';
import {createConversationTranscription, prepareConversationBatch} from '../desktop/conversation-transcription.mjs';
import {desktopModelPath} from '../desktop/local-model.mjs';
import {createRegistrationFlow} from '../desktop/registration-flow.mjs';

const fixtures = [
  {
    name: '长消息混合登记',
    text: [
      '我下午去市场买了 6 个橘子、两盒牛奶和一包茶。购物袋还装得下。',
      '今天大部分时间在改备份工具，导出能用了，恢复功能还在测试。',
      '今天白天没吃饭，晚饭煮了一碗荞麦面，喝了一杯无糖茶。',
      '下个版本也许要迁移到另一台电脑。想让桌宠陪我练英语，这个点子可以记下来。',
      '明天给乌龟喂一点，天气凉，别喂太多。',
      '今天就聊到这里。',
    ].join('\n'),
    types: ['diaries.create', 'hu-shi.food.create', 'records.create', 'reminders.create'],
    approve: ['hu-shi.food.create', 'records.create'],
    paths: ['/api/records', '/api/records/hu-shi/food/entries'],
    check(rows) {
      assert.match(rows.find(row => row.type === 'diaries.create').params.content, /6\s*个橘子/u);
      const reminder = rows.find(row => row.type === 'reminders.create').params;
      assert.equal(reminder.deadline, '2026-11-23');
      assert.match(reminder.content, /喂/u);
      assert.doesNotMatch(rows.find(row => row.type === 'records.create').params.body, /迁移/u);
    },
  },
  {
    name: '明确提醒及依赖',
    text: '明天提醒我给田中回信，回信前先看周报。',
    types: ['reminders.create'],
    approve: ['reminders.create'],
    paths: ['/api/reminders'],
    check(rows) {
      assert.equal(rows[0].params.deadline, '2026-11-23');
      assert.match(rows[0].params.title, /回信/u);
      assert.match(rows[0].params.content, /先看周报/u);
    },
  },
  {
    name: '兴趣资源但拒绝登记',
    text: '我很喜欢这个色板网站 https://example.invalid/palette ，以后想参考它的颜色搭配做原型。',
    types: ['resources.create'],
    approve: [],
    paths: [],
    check(rows) {
      assert.equal(rows[0].params.url, 'https://example.invalid/palette');
    },
  },
  {
    name: '交流和否定',
    text: '晚安呀，今天和你聊天很开心。朋友昨天跑了十公里，我没跑，也不用帮我记这件事。',
    types: [],
    approve: [],
    paths: [],
    check() {},
  },
];

const root = join(import.meta.dirname, '..');
const profile = process.env.FEIYUE_TRANSCRIPTION_TEST_PROFILE ?? mkdtempSync(join(tmpdir(), 'feiyue-transcription-stability-'));
const now = () => Date.parse('2026-11-22T22:00:00+09:00');
electron.app.setPath('userData', profile);
electron.app.commandLine.appendSwitch('disable-gpu');
await electron.app.whenReady();

const database = openTestDatabase();
const writes = [], requests = [], results = [];
let transcription, model, failed = false;
try {
  initializeDatabase(database.sqlite);
  for (const seed of ['tasklist-hu-shi.sql', 'tasklist-registration.sql']) {
    database.sqlite.exec(readFileSync(join(root, 'agent', 'seeds', seed), 'utf8'));
  }
  const worker = createWorker({
    authorize: () => ({ownerId: 'transcription-stability-fixture'}),
    loadRegistrationCategories: async () => [{id: 'notes-fixture', name: 'AI登记内容'}],
    async writeRegistrationEntry({path, body, idempotencyKey}) {
      assert.ok(idempotencyKey);
      assert.ok(!writes.some(entry => entry.idempotencyKey === idempotencyKey), '重复业务写入');
      writes.push({path, body, idempotencyKey});
      return ['/api/reminders', '/api/diaries'].includes(path)
        ? {item: {seq: writes.length}}
        : {id: 'fixture-' + writes.length, created_at: now()};
    },
  });
  const env = {DB: database.DB, COMPANION_HOST: {async resourceCategories() {
    return [{id: 'resource-fixture', name: 'AI登记内容'}];
  }}};
  let loseReceipt = false;
  const request = async (path, options) => {
    requests.push(path);
    const response = await worker.fetch(new Request('https://fixture.invalid' + path, options), env);
    if (loseReceipt && /^\/api\/tasks\/[^/]+\/execute$/u.test(path) && response.ok) {
      loseReceipt = false;
      throw Error('模拟执行回执丢失');
    }
    return response;
  };
  const events = [];
  model = createBalancedLocalModel({utilityProcess: electron.utilityProcess, modelPath: desktopModelPath(electron.app, root),
    log: event => events.push(event), localFirst: true});
  const openStore = () => createConversationTranscription({profile, safeStorage: electron.safeStorage, model,
    registration: createRegistrationFlow({profile, request}),
    prepareBatch: rows => prepareConversationBatch(rows, request, now)});
  transcription = openStore();
  async function waitFor(id, states) {
    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline) {
      const detail = transcription.detail(id);
      if (states.includes(detail.state)) return detail;
      if (detail.state === 'failed' || detail.state === 'submit-pending') throw Error(detail.error);
      await delay(40);
    }
    throw Error('等待转录结果超时');
  }

  const rounds = Number(process.env.FEIYUE_TRANSCRIPTION_TEST_ROUNDS ?? 3);
  assert.ok(Number.isInteger(rounds) && rounds > 0);
  for (let round = 1; round <= rounds; round++) {
    for (const [index, fixture] of fixtures.entries()) {
      const before = {writes: writes.length, requests: requests.length, events: events.length};
      const id = `stability-${round}-${index}`;
      let rows = [];
      try {
        transcription.turn(id, {id: 'message', at: now(), text: fixture.text});
        transcription.seal(id);
        transcription.seal(id);
        const result = await waitFor(id, ['ready', 'empty']);
        rows = result.result.rows;
        assert.equal(requests.length, before.requests, '确认前产生了登记请求');
        assert.deepEqual(rows.map(row => row.type).sort(), [...fixture.types].sort(), '候选类型或数量不符');
        assert.ok(rows.every(row => !row.missing.length), '有待核对的候选');
        fixture.check(rows);
        await transcription.close();
        transcription = openStore();
        assert.deepEqual(transcription.detail(id).result.rows, rows, '重启改变了已保存清单');
        if (rows.length) {
          const selected = rows.filter(row => fixture.approve.includes(row.type)).map(row => row.id);
          const faulted = index === 1;
          loseReceipt = faulted;
          transcription.decide({id, selected});
          assert.equal(transcription.decide({id, selected: [...selected].reverse()}).state,
            selected.length ? 'approved' : 'discarded');
          if (faulted) {
            const pending = await waitFor(id, ['submit-pending']);
            assert.equal(pending.error, '模拟执行回执丢失');
            assert.equal(writes.length, before.writes + 1);
            await transcription.close();
            transcription = openStore();
            transcription.retry(id);
          }
          await waitFor(id, [selected.length ? 'done' : 'discarded']);
          assert.equal(transcription.decide({id, selected}).state, selected.length ? 'done' : 'discarded');
          assert.throws(() => transcription.decide({id, selected: selected.length ? [] : [rows[0].id]}));
        }
        assert.deepEqual(writes.slice(before.writes).map(entry => entry.path).sort(), fixture.paths);
        assert.equal(requests.slice(before.requests).filter(path => path === '/api/chains').length, fixture.paths.length ? 1 : 0);
        results.push({round, sample: fixture.name, ok: true, elapsedMs: result.durationMs,
          calls: events.slice(before.events).filter(event => event.stage === '思索完成').length});
      } catch (error) {
        loseReceipt = false;
        failed = true;
        results.push({round, sample: fixture.name, ok: false, rows: rows.map(({type, params, missing}) => ({type, params, missing})),
          error: error.message});
      }
      console.log(JSON.stringify(results.at(-1)));
    }
  }
} catch (error) {
  console.error(error);
  failed = true;
} finally {
  await transcription?.close();
  await model?.close();
  database.close();
  // Windows 要等 Electron 退出后才会释放资料目录，由启动进程清理。
  electron.app.exit(failed ? 1 : 0);
}
