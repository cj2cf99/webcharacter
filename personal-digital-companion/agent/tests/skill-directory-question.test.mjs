import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {attachScreenQuestion} from '../../desktop/screen-question-host.mjs';
import {fixture} from './screen-question-fixture.mjs';

test('合并后的问答入口能直接回答技能目录且不调用模型或业务写入',async t=>{
  const profile=await mkdtemp(join(tmpdir(),'feiyue-skill-directory-question-'));
  const f=fixture(),root=resolve(import.meta.dirname,'../..');
  const noCall=()=>assert.fail('技能目录不调用模型或登记');
  const host=attachScreenQuestion(f.electron,{win:f.win,profile,root,bundle:'unused',history:f.history,
    localModel:{analyze:noCall},registration:{submit:noCall}});
  t.after(async()=>{host.close();await rm(profile,{recursive:true,force:true});});
  await host.open();
  const answer=await f.handlers.get('screen-qa:ask')(f.event(host.panel),{text:'查看技能目录'});
  assert.equal(answer.state,'answer');
  assert.match(answer.text,/已登记技能/u);
  assert.match(answer.text,/对话转录：整理 → 按模板拟稿 → 交回待确认/u);
});
