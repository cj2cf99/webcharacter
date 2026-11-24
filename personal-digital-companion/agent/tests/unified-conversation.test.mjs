import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';
import {searchHint} from '../assistant/search-hint.mjs';
import {askDeepSeek,searchPublicWeb} from '../../desktop/public-search.mjs';
import {createConversationHistory} from '../../desktop/conversation-history.mjs';

test('自动输入区分登记、询问和显式搜索，登记中的搜索文字保留在原记录',()=>{
  for(const text of ['午饭吃了拉面，帮我记一下','登记今天跑的五公里','帮我登记今天的支出','明天下午提醒我看医生','随手记：上网查 Firefox']){
    assert.equal(conversationRoute(text).kind,'registration',text);
  }
  for(const text of ['今天刚跑了五公里','我们聊聊这段记录','先别记录晚饭','昨天吃了牛肉和面包','今天吃了多少算合理？','刚才那段是什么意思','提醒我是什么意思？','今天需要带伞吗','不用联网，解释这个词']){
    assert.equal(conversationRoute(text).kind,'question',text);
  }
  assert.deepEqual(conversationRoute('帮我上网查一下 Firefox'),{kind:'search',query:'Firefox'});
  assert.deepEqual(conversationRoute('Firefox，帮我上网查一下'),{kind:'search',query:'Firefox'});
  assert.equal(conversationRoute('上网查 Firefox','registration').kind,'registration');
  assert.deepEqual(conversationRoute('Firefox 最新版本','web',true),
    {kind:'search',query:'Firefox 最新版本',summarize:true});
  assert.deepEqual(conversationRoute('帮我上网查一下 Firefox','web'),
    {kind:'search',query:'Firefox',summarize:true});
  assert.equal(conversationRoute('帮我登记刚才的事','memory',true).kind,'memory');
  assert.equal(conversationRoute('重启绯月','web').kind,'search');
  assert.deepEqual(searchHint('不认识 Firefox','Firefox'),{search_query:'Firefox'});
  assert.deepEqual(searchHint('不要联网，解释 Firefox','Firefox'),{});
  assert.deepEqual(searchHint('解释截图里的问题','截图中的私密信息'),{});
});

test('公开搜索只读固定搜索页，拒绝不明确的目标并保留实际链接',async()=>{
  const calls=[],signal=new AbortController().signal;
  const reader=async request=>{
    calls.push(request);
    return [{title:'Mozilla Firefox',snippet:'网页搜索',url:'https://www.mozilla.org/'}];
  };
  for(const query of ['那个','secret=123456789'])assert.equal((await searchPublicWeb(query,signal,reader)).sources,undefined);
  assert.equal(calls.length,0);
  const answer=await searchPublicWeb('Mozilla Firefox',signal,reader);
  assert.equal(answer.sources[0].url,'https://www.mozilla.org/');
  assert.equal(calls[0].query,'Mozilla Firefox');
  const unavailable=await searchPublicWeb('Mozilla Firefox',signal,async()=>{throw Error('TAVILY_NOT_CONFIGURED')});
  assert.equal(unavailable.state,'error');
  assert.equal(unavailable.code,'TAVILY_NOT_CONFIGURED');
  assert.deepEqual(conversationRoute('打开本期新闻简报'),{kind:'newsBriefing'});
  assert.equal(conversationRoute('帮我找几张京都的照片').images,true);
  assert.equal(conversationRoute('查京都新闻').research,'news');
  assert.equal(conversationRoute('打开网页 https://example.org/look 找图').images,true);
  assert.equal(conversationRoute('问 DeepSeek 如何分析公开数据').research,'deepseek');

});

test('DeepSeek 公开问答经共用客户端只发送明确提供的公开问题',async t=>{
  const previous=process.env.bandao_api_key;
  t.after(()=>{
    if(previous===undefined)delete process.env.bandao_api_key;
    else process.env.bandao_api_key=previous;
  });
  const signal=new AbortController().signal;
  delete process.env.bandao_api_key;
  const query='Firefox 是什么？';
  assert.match((await askDeepSeek(query,signal,()=>assert.fail('没有密钥'))).text,/尚未配置/);
  process.env.bandao_api_key='fixture-key';
  assert.equal((await askDeepSeek('帮我分析我的日记内容',signal,()=>assert.fail('不应发送私有问题'))).state,'error');
  const answer=await askDeepSeek(query,signal,async(url,options)=>{
    assert.equal(url,'https://sub.bandaoapi.com/v1/chat/completions');
    assert.equal(options.headers.authorization,'Bearer fixture-key');
    assert.deepEqual(JSON.parse(options.body).messages,[{role:'user',content:query}]);
    return Response.json({choices:[{finish_reason:'stop',message:{content:'一个浏览器。',reasoning_content:'不进入结果'}}]});
  });
  assert.match(answer.text,/一个浏览器/);
  assert.doesNotMatch(answer.text,/不进入结果/);
});

test('本地记录按东京午夜跨日，同次提交写入最终回复，重开可读',async t=>{
  const profile=await mkdtemp(join(tmpdir(),'feiyue-history-'));
  const codec={encryptStringAsync:async value=>Buffer.from(value),decryptStringAsync:async value=>({result:value.toString()})};
  let history=createConversationHistory(profile,codec);
  t.after(async()=>{history.close();await rm(profile,{recursive:true,force:true});});
  const last={id:'1',at:Date.parse('2026-11-20T14:59:59Z'),question:'问题',text:'暂时失败'};
  await history.save(last);
  const failures=[{at:last.at,attempt:1,httpStatus:502,code:'INVALID_AI_RESPONSE',text:'模型答复无效'}];
  await history.save({...last,text:'完整的回答',failures});
  await history.save({...last,id:'2',at:last.at+1000,text:'新一天'});
  history.close();history=createConversationHistory(profile,codec);
  assert.deepEqual((await history.read('2026-11-20')).map(x=>x.text),['完整的回答']);
  assert.deepEqual((await history.latest('2026-11-20')).failures,failures);
  assert.equal((await history.latest('2026-11-21')).text,'新一天');
});
