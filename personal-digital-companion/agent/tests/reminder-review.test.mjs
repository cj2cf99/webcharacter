import assert from 'node:assert/strict';
import test from 'node:test';
import {createReminderReviewFlow} from '../../desktop/reminder-review-flow.mjs';
import {createReminderReview, handleReminderReview} from '../host/reminder-review.mjs';
import {openTestDatabase} from './sqlite-d1.mjs';

const today = '2026-11-20', tomorrow = '2026-11-21', previous = '2026-11-18';
const valid = {today, version: 'b'.repeat(64), action: 'complete'};

test('按选择逐条执行并回读，丢回执只读不重写，失败与空选不串项', async () => {
  const row = (id, deadline, other = {}) => ({id, deadline, title: String(id), identity: 'row-' + id,
    version: 'b'.repeat(64), group: deadline.startsWith(today) ? 'today' : 'overdue', ...other});
  const calls = [], items = [
    row(1, previous + 'T10:00:00+09:00'), row(2, today, {recurrence: '每周', nextDeadline: '2026-11-27'}),
    row(3, today), row(4, today), row(5, today, {reason: '由长期计划管理'}),
  ];
  const flow = createReminderReviewFlow({async request(path, opts) {
    calls.push([path, opts.method]);
    if (path.endsWith('review')) return Response.json({today, tomorrow, items});
    const id = Number(path.at(-1));
    if (opts.method === 'POST') {
      if (id === 2) throw Error('丢失写入响应');
      if (id === 3) return Response.json({error: {message: '已改动'}}, {status: 409});
      return Response.json({accepted: true});
    }
    return Response.json({identity: 'row-' + id, deadline: tomorrow + 'T10:00:00+09:00', finished: id === 2,
      next: {id: 9, deadline: '2026-11-27'}});
  }});
  await flow.load();
  await assert.rejects(flow.apply([{id: 5, action: 'complete'}]), /所选操作无效/);
  const report = await flow.apply([{id: 2, action: 'complete'}, {id: 1, action: 'tomorrow'}, {id: 3, action: 'complete'}]);
  assert.equal(report.unchanged, 2); // 未选的普通提醒及可登记工时的当天计划。
  assert.deepEqual(report.results.map(item => [item.id, item.result]), [[1, 'moved'], [2, 'completed'], [3, 'failed']]);
  assert.equal(report.results[1].next, '2026-11-27');
  assert.deepEqual(calls.slice(1).map(([path, method]) => [path.at(-1), method]),
    [['1', 'POST'], ['1', 'GET'], ['2', 'POST'], ['2', 'GET'], ['3', 'POST']]);
  await assert.rejects(flow.apply([{id: 1, action: 'tomorrow'}]), /刷新/);
});

test('服务通过事实来源识别只读项目，拒绝过期快照和来源锁定', async t => {
  const {db, sqlite} = (() => { const fixture = openTestDatabase(); t.after(fixture.close); return {db: fixture.DB, sqlite: fixture.sqlite}; })();
  sqlite.exec(`CREATE TABLE reminders(seq INTEGER,title,content,deadline,level,regDatetime,isFinished,recurrence,recurrenceNextSeq,planner_dispatch_id);
    CREATE TABLE reminder_links(target_todo_id);
    INSERT INTO reminders VALUES (1,'逾期','', '${previous}','高','r1',0,NULL,NULL,NULL),
      (2,'今天','', '${today}','中','r2',0,NULL,NULL,NULL),(3,'计划','', '${previous}','中','r3',0,NULL,NULL,'plan'),
      (4,'缴费','', '${today}','中','r4',0,NULL,NULL,NULL),(5,'明天','', '${tomorrow}','中','r5',0,NULL,NULL,NULL);
    INSERT INTO reminder_links VALUES ('4');`);
  const mutations = [];
  const service = createReminderReview({db, visible: () => db, getDates: () => ({today, tomorrow}), present: () => ({}),
    memberDays: () => [{id: 'member:1', name: '会员日'}], mutate: ({row, action}) => {
      mutations.push([row.seq, action]); return Response.json({item: {seq: row.seq}});
    }});
  const list = await service.list();
  assert.deepEqual(list.items.map(item => [item.id, item.group]), [[1, 'overdue'], [3, 'locked'],
    [2, 'today'], [4, 'locked'], ['member:1', 'locked']]);
  await assert.rejects(service.change(1, valid), /刷新/);
  await assert.rejects(service.change(3, {...valid, version: list.items[1].version}), /来源模块/);
  await assert.rejects(service.change(4, {...valid, version: list.items[3].version}), /来源模块/);
  assert.deepEqual(await service.change(1, {...valid, version: list.items[0].version}), {accepted: true});
  assert.deepEqual(mutations, [[1, 'complete']]);
  const read = await handleReminderReview(new Request('https://api.test'), {reviewReminders: service.list}, '/api/reminder-review');
  assert.equal((await read.json()).items.length, 5);
});

test('下一期不存在时，完成回执保留为待核对而不补发完成', async () => {
  const calls = [];
  const flow = createReminderReviewFlow({async request(path, options) {
    calls.push(options.method);
    if (path.endsWith('review')) return Response.json({today, tomorrow, items: [{id: 8, title: '循环',
      deadline: today, identity: 'same', version: valid.version, recurrence: '每周', nextDeadline: '2026-11-27'}]});
    if (options.method === 'POST') return Response.json({accepted: true});
    return Response.json({identity: 'same', finished: true, next: null});
  }});
  await flow.load();
  const report = await flow.apply([{id: 8, action: 'complete'}]);
  assert.equal(report.results[0].result, 'unknown');
  assert.deepEqual(calls, ['GET', 'POST', 'GET']);
});

test('长期计划只接受当前快照的有效工时，事实回执包含登记时间', async t => {
  const fixture = openTestDatabase();
  t.after(fixture.close);
  fixture.sqlite.exec(`CREATE TABLE reminders(seq INTEGER,title,content,deadline,level,regDatetime,isFinished,recurrence,recurrenceNextSeq,planner_dispatch_id);
    CREATE TABLE reminder_links(target_todo_id);
    INSERT INTO reminders VALUES(8,'普通计划','','${today}','中','r8',0,NULL,NULL,'dispatch'),
      (9,'里程碑','','${today}','中','r9',0,NULL,NULL,'milestone'),
      (10,'超市会员日','','${today}','中','r10',0,NULL,NULL,NULL);`);
  let revision = 1, writes = 0;
  const recordedAt = '2026-11-20T01:00:00Z';
  const service = createReminderReview({db: fixture.DB, visible: () => fixture.DB, getDates: () => ({today, tomorrow}),
    present: () => ({}), memberDays: () => [], mutate: () => assert.fail('不得从通用提醒路径登记'),
    planner: {
      lookup(row) {
        return {id: row.planner_dispatch_id, recordable: row.seq === 8 && !writes, revision, plannedHours: 2,
          actualHours: writes ? 0 : null, recordedAt: writes ? recordedAt : null};
      },
      record(entry, hours) {
        assert.equal(entry.id, 'dispatch');
        assert.equal(hours, 0);
        writes++;
        fixture.sqlite.prepare('UPDATE reminders SET isFinished=1 WHERE seq=8').run();
      },
    }});
  const list = await service.list();
  assert.equal(list.items.find(row => row.id === 8).plannerWork.plannedHours, 2);
  assert.equal(list.items.find(row => row.id === 9).plannerWork, undefined);
  const host = {changeReviewReminder: async (...args) => {
    try { return await service.change(...args); }
    catch (error) { return {error: error.message, status: error.status}; }
  }};
  const write = input => handleReminderReview(new Request('https://api.test', {method: 'POST', body: JSON.stringify(input)}),
    host, '/api/reminder-review/8');
  const command = {action: 'record-hours', today, version: list.items.find(row => row.id === 8).version, actualHours: 0};
  assert.equal((await write({...command, actualHours: '0'})).status, 400);
  assert.equal((await write({...command, actualHours: 25})).status, 400);
  assert.equal((await write({...command, actualHours: -1})).status, 400);
  assert.equal((await write({...command, dispatchId: 'tampered'})).status, 400);
  revision++;
  assert.equal((await write(command)).status, 409);
  command.version = (await service.list()).items.find(row => row.id === 8).version;
  assert.equal((await write(command)).status, 200);
  assert.equal((await write(command)).status, 409);
  assert.deepEqual((await service.status(8)).plannerRecord, {dispatchId: 'dispatch', actualHours: 0, recordedAt});
  assert.equal(writes, 1);
});

test('桌面登记工时后核对同一派发及实际投入，暂缺证据只读重核', async () => {
  const item = {id: 8, title: '当前计划', group: 'locked', reason: '由长期计划管理',
    plannerWork: {dispatchId: 'this-dispatch'}, deadline: today, identity: 'row-8', version: valid.version};
  const writes = [];
  let correct = false;
  const recordedAt = '2026-11-20T01:00:00Z';
  const flow = createReminderReviewFlow({async request(path, options) {
    if (path.endsWith('review')) return Response.json({today, tomorrow, items: [item]});
    if (options.method === 'POST') {
      writes.push(JSON.parse(options.body));
      throw new Error('模拟响应断开');
    }
    return Response.json({identity: item.identity, finished: true,
      plannerRecord: {dispatchId: correct ? item.plannerWork.dispatchId : 'other-dispatch', actualHours: 0, recordedAt}});
  }});
  await flow.load();
  await assert.rejects(flow.apply([{id: 8, action: 'complete'}]), /不能执行/);
  await assert.rejects(flow.apply([{id: 8, action: 'record-hours', actualHours: null}]), /不能执行/);
  const sent = await flow.apply([{id: 8, action: 'record-hours', actualHours: 0}]);
  assert.equal(sent.results[0].result, 'unknown');
  assert.equal(sent.unchanged, 0);
  correct = true;
  const [readback] = (await flow.load()).report.results;
  assert.equal(readback.result, 'recorded');
  assert.equal(readback.actualHours, 0);
  assert.equal(readback.recordedAt, recordedAt);
  assert.deepEqual(writes, [{action: 'record-hours', today, version: item.version, actualHours: 0}]);
});

test('刷新补核对已成功但回读失败的延期，不再发送写入', async () => {
  const row = {id: 8, title: '取资料', deadline: today + 'T09:00:00+09:00', identity: 'same', version: valid.version};
  const calls = [];
  let moved = false, firstRead = true;
  const flow = createReminderReviewFlow({async request(path, options) {
    calls.push([path, options.method]);
    if (path.endsWith('review')) return Response.json({today, tomorrow, items: moved ? [] : [row]});
    if (options.method === 'POST') { moved = true; return Response.json({accepted: true}); }
    if (firstRead) { firstRead = false; throw Error('回读中断'); }
    return Response.json({identity: 'same', deadline: tomorrow + 'T09:00:00+09:00', finished: false});
  }});
  await flow.load();
  assert.equal((await flow.apply([{id: 8, action: 'tomorrow'}])).results[0].result, 'unknown');
  const refreshed = await flow.load();
  assert.equal(refreshed.report.results[0].result, 'moved');
  assert.equal(refreshed.report.results[0].deadline, tomorrow + 'T09:00:00+09:00');
  assert.deepEqual(calls.map(([, method]) => method), ['GET', 'POST', 'GET', 'GET', 'GET']);
});

test('取消重启后继续剩余已选提醒，等待确认期间不提交下一条', async () => {
  const items = [1, 2].map(id => ({id, title: '测试', deadline: today, identity: 'row-' + id, version: valid.version}));
  const writes = [];
  let checking = false, release, sawFirstRead;
  const gate = new Promise(resolve => { release = resolve; });
  const firstRead = new Promise(resolve => { sawFirstRead = resolve; });
  const flow = createReminderReviewFlow({
    canStart: () => !checking,
    waitForStart: () => checking ? gate : undefined,
    async request(path, options) {
      if (path.endsWith('review')) return Response.json({today, tomorrow, items});
      const id = Number(path.at(-1));
      if (options.method === 'POST') {
        writes.push(id);
        if (id === 1) checking = true;
        return Response.json({accepted: true});
      }
      if (id === 1) sawFirstRead();
      return Response.json({identity: 'row-' + id, finished: true});
    },
  });
  await flow.load();
  const batch = flow.apply(items.map(row => ({id: row.id, action: 'complete'})));
  await firstRead;
  await new Promise(setImmediate);
  assert.deepEqual(writes, [1]);
  checking = false;
  release();
  assert.deepEqual((await batch).results.map(item => item.result), ['completed', 'completed']);
  assert.deepEqual(writes, [1, 2]);
});

test('回读缺字段或状态不是布尔值时不给成功回执', async () => {
  const items = [1, 2].map(id => ({id, title: '测试', deadline: today, identity: 'row-' + id, version: valid.version}));
  const flow = createReminderReviewFlow({async request(path, options) {
    if (path.endsWith('review')) return Response.json({today, tomorrow, items});
    if (options.method === 'POST') return Response.json({accepted: true});
    if (path.endsWith('/1')) return Response.json({identity: 'row-1', finished: 'false'});
    return Response.json({identity: 'row-2', deadline: tomorrow});
  }});
  await flow.load();
  const report = await flow.apply([{id: 1, action: 'complete'}, {id: 2, action: 'tomorrow'}]);
  assert.deepEqual(report.results.map(item => item.result), ['unknown', 'unknown']);
});

test('执行下一批保留前批待核对结果，补查成功时更新且不重发操作', async () => {
  const rows = [1, 2].map(id => ({id, title: '提醒 ' + id, deadline: today, identity: 'row-' + id, version: valid.version}));
  const written = [];
  let oldProofReady = false;
  const flow = createReminderReviewFlow({async request(path, options) {
    if (path.endsWith('review')) return Response.json({today, tomorrow, items: rows.filter(row => !written.includes(row.id))});
    const id = Number(path.at(-1));
    if (options.method === 'POST') { written.push(id); return Response.json({accepted: true}); }
    if (id === 1 && !oldProofReady) throw Error('暂时读不到前批回执');
    return Response.json({identity: 'row-' + id, finished: false, deadline: tomorrow});
  }});
  await flow.load();
  assert.equal((await flow.apply([{id: 1, action: 'tomorrow'}])).results[0].result, 'unknown');
  await flow.load();
  const current = await flow.apply([{id: 2, action: 'tomorrow'}]);
  assert.equal(current.results.find(row => row.id === 1)?.result, 'unknown');
  assert.equal(current.results.find(row => row.id === 1)?.earlier, true);
  oldProofReady = true;
  const verified = await flow.load();
  assert.equal(verified.report.results.find(row => row.id === 1)?.result, 'moved');
  assert.equal(verified.report.results.find(row => row.id === 1)?.earlier, true);
  assert.deepEqual(written, [1, 2]);
});
