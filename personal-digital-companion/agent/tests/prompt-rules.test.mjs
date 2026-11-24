import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// 提示词规则守卫：判断类不做人格模拟；云端提示词说明动态字段。
const skills=join(import.meta.dirname,'../../skills');
const prompts=skill=>JSON.parse(readFileSync(join(skills,skill,'source/local-ai.json'),'utf8'));
const persona=/你是绯月|你叫绯月|心尖|老公|妻子|贤内助|扮演|第一人称/u;

test('判断、复核类提示词不含人格设定',()=>{
  const judgments={
    'personal-conversation':['classifyExpense','explained'],
    'diary-writing':['reviewThread','answerThread'],
    'diary-audit':['verify'],
    'news-editorial':['reviewTitle'],
    'memory-refinement':['reviewRules','review'],
    'conversation-transcription':['review'],
  };
  for(const [skill,stages] of Object.entries(judgments)){
    const data=prompts(skill);
    for(const stage of stages)assert.doesNotMatch(data[stage]??'',persona,skill+'.'+stage);
  }
});

test('图片挑选等内联判断提示词不带人格',()=>{
  const text=readFileSync(join(import.meta.dirname,'../../desktop/public-search.mjs'),'utf8');
  for(const marker of ["从候选中选择最贴切的一张","根据主题挑一张图片"]){
    const at=text.indexOf(marker);assert.ok(at>0,marker);
    assert.doesNotMatch(text.slice(Math.max(0,at-12),at),/你是绯月/);
  }
});

test('转写类提示词不引用历史对话',()=>{
  const data=prompts('conversation-transcription');
  for(const stage of ['organize','recover','classify'])assert.doesNotMatch(data[stage],/history|历史/u,stage);
});

test('新闻标题提示词说明上一版标题和反馈字段',()=>{
  const title=prompts('news-editorial').title;
  for(const field of ['main','timeline','latest','previousTitle','feedback'])assert.match(title,new RegExp(field),field);
});
