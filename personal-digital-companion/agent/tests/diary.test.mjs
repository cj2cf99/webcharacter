import assert from 'node:assert/strict';
import test from 'node:test';
import {createDiaryWorkflow, createMainSiteDiaryStore} from '../assistant/diary.mjs';

const day = '2026-11-19';
const note = {
  title: '约好阅读与整理',
  content: '今天确认先读完第二章，再整理笔记。助手建议周末集中整理，具体日期还没有定。',
};
const entry = (source, id, timestamp, content, role = 'user') => ({source, id, timestamp, content, role});
const book = entry('desktop', 'a', '2026-11-18T15:00:00Z', '今天先读完第二章，再整理笔记。');
const plan = entry('web', 'b', '2026-11-19T14:59:59Z', '建议周末集中整理。', 'assistant');
const messages = [
  plan, book, book,
  entry('private', 'c', '2026-11-19T01:00:00Z', '这个来源未授权。'),
  entry('desktop', 'd', '2026-11-18T14:59:59Z', '上一天。'),
  entry('desktop', 'e', '2026-11-19T15:00:00Z', '下一天。'),
];
const draft = {state: 'preview', day, ...note};

function createTest({lost = false, dropped = false, unavailable = false, summarize} = {}) {
  const list = [];
  let writes = 0;
  const request = async ({method, path, body}) => {
    const url = new URL(path, 'https://test.invalid');
    if (method === 'POST') {
      writes++;
      if (!dropped) list.push({seq: writes, ...body});
      if (lost || dropped) throw new Error('simulated missing receipt');
      return {item: list.at(-1)};
    }
    if (url.pathname !== '/api/diaries') return {item: list.find(item => path.endsWith('/' + item.seq))};
    if (unavailable) { unavailable = false; throw new Error('simulated list failure'); }
    const q = url.searchParams.get('q');
    const items = list.filter(item => (item.title + item.content).includes(q))
      .map(({content, ...item}) => ({...item, excerpt: content.slice(0, 16)}));
    return {items, total: items.length};
  };
  const diary = createDiaryWorkflow({
    allowedSources: ['desktop', 'web'],
    readMessages: async input => {
      assert.equal(input.startAt, '2026-11-18T15:00:00.000Z');
      assert.equal(input.endAt, '2026-11-19T15:00:00.000Z');
      return messages;
    },
    summarize,
    store: createMainSiteDiaryStore(request),
  });
  return {diary, writes: () => writes};
}

test('Codex 合成日记按东京日合并两个来源，排除越界、重复和未授权记录', async () => {
  const {diary, writes} = createTest({summarize: async input => {
    assert.equal(input.timezone, 'Asia/Tokyo');
    assert.deepEqual(input.messages.map(item => item.content), [book.content, plan.content]);
    assert.match(input.instructions, /最终决定和待办/);
    return note;
  }});
  assert.deepEqual(await diary.preview({day}), {...draft, messageCount: 2});
  assert.equal(writes(), 0);
  await assert.rejects(diary.preview({day, sources: ['private']}), /尚未授权/);
  assert.deepEqual(await diary.preview({day, sources: []}), {state: 'empty', day, messageCount: 0});
  await assert.rejects(diary.preview({day: '2026-02-30'}), /东京日期/);
});

test('正式保存需要确认，回执丢失后回读核对，按日和关键词都可查找', async () => {
  const {diary, writes} = createTest({lost: true});
  assert.throws(() => diary.save(draft), /确认/);
  const [a, b] = await Promise.all([diary.save(draft, {confirmed: true}), diary.save(draft, {confirmed: true})]);
  assert.deepEqual(a, b);
  assert.equal((await diary.search({query: '第二章'})).items[0].seq, a.seq);
  assert.equal((await diary.findDay(day))[0].seq, a.seq);
  assert.equal((await diary.read(a.seq)).content, note.content);
  assert.deepEqual(await diary.save(draft, {confirmed: true}), a);
  assert.equal(writes(), 1);
});

test('写入结果未明时冻结重试，提交前读失败则允许重新发起', async () => {
  const lost = createTest({dropped: true});
  await assert.rejects(lost.diary.save(draft, {confirmed: true}), {code: 'DIARY_SAVE_UNCERTAIN'});
  await assert.rejects(lost.diary.save(draft, {confirmed: true}), {code: 'DIARY_SAVE_UNCERTAIN'});
  assert.equal(lost.writes(), 1);
  const blocked = createTest({unavailable: true});
  await assert.rejects(blocked.diary.save(draft, {confirmed: true}), /list failure/);
  assert.equal((await blocked.diary.save(draft, {confirmed: true})).seq, 1);
});
