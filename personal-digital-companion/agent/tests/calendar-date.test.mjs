import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDate,calendarContext,dateQuestion,tokyoDate} from '../../desktop/calendar-date.mjs';
import {parseReminderCommand} from '../../desktop/reminder-command.mjs';
import {explicitRegistration} from '../../desktop/server-registration-plan.mjs';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';

test('东京跨午夜、周末、跨年和闰年按日历换算',()=>{
  assert.equal(tokyoDate(Date.parse('2026-11-22T15:00:00Z')),'2026-11-23');
  for(const [today,term,expected] of [
    ['2026-11-20','这周日','2026-11-22'],['2026-11-22','这周日','2026-11-22'],
    ['2026-11-23','这周日','2026-11-29'],['2026-11-20','本周一','2026-11-16'],
    ['2026-12-31','下周一','2027-01-04'],['2028-02-28','明天','2028-02-29'],
    ['2026-01-01','前天','2025-12-30'],['2026-11-20','三天后','2026-11-23']
  ])assert.equal(calendarDate(term,today),expected);
  assert.throws(()=>calendarDate('2026-02-29'),/有效日期/);
  assert.match(dateQuestion('假设今天是12月31日，那明天是几号？','2026-11-20'),/2027-01-01/);
  assert.match(dateQuestion('这周日是几号？','2026-11-20'),/2026-11-22，星期日/);
  assert.equal(dateQuestion('这周日看什么书？','2026-11-20'),'');
  assert.match(calendarContext('我计划这周日读书','2026-11-20'),/这周日=2026-11-22/);
});

test('提醒查询、改期、PC 任务使用同一业务日期，标题中的引语保持原样',()=>{
  const at='2026-11-20';
  assert.equal(conversationRoute('宝贝，加个提醒，这周日看手顺书，rene的手顺书工作至少推进3个才行').kind,'registration');
  assert.deepEqual(parseReminderCommand('查看下周一的提醒',at).filter,{day:'2026-11-23',q:'',id:null});
  const moved=parseReminderCommand('把「这周日的资料」移到下周一下午三点',at);
  assert.equal(moved.filter.q,'这周日的资料');assert.equal(moved.filter.day,'');
  assert.deepEqual(moved.changes,{date:'2026-11-23',clock:'T15:00:00+09:00'});
  assert.deepEqual(explicitRegistration('创建提醒「周报」，日期为这周日',Date.parse(at+'T20:00:00+09:00')).params,{title:'周报',deadline:'2026-11-22'});
});
