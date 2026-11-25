import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';
import {attachmentRegistration} from '../../desktop/interaction-skills.mjs';
import {cleanChatOutput} from '../../desktop/chat-output.mjs';
import {fixture} from './screen-question-fixture.mjs';
import {attachScreenQuestion} from '../../desktop/screen-question-host.mjs';

const breakfast='提前登记吃喝记录：早餐是昨天剩下的粉条和牛肉，加两片面包';
const commands=[breakfast,'记录早餐：牛肉粉条','帮我记录这笔开销','请把散步三公里记录下来','登记','记录','登记一下','午饭吃了拉面，帮我记一下','记下刚才的想法','明早提醒我带伞','把图片里的会议记成提醒','绯月，先登记晚餐','可以帮我登记晚饭吗？'];
const discussion=['早餐是昨天剩下的粉条和牛肉，加两片面包','今天刚跑了五公里','这顿饭先别记录','不要把这顿饭登记为提醒','我们聊聊这段记录','他刚说“登记早餐”，我没听清','登记是什么意思？','记录片拍得怎么样？','提醒这件事让我有点烦','你有没有登记晚饭？','我今天看了运动记录','聊天记录在哪里？','我在写日记，你来陪我一会儿','这句“帮我记录早餐”听起来生硬吗？'];

test('普通模式按照本轮委托分流，直连对同样一组输入始终只聊天',()=>{
  for(const text of commands){
    assert.equal(conversationRoute(text).kind,'registration',text);
    assert.equal(attachmentRegistration(text),true,text);
  }
  for(const text of discussion){
    assert.equal(conversationRoute(text).kind,'question',text);
    assert.equal(attachmentRegistration(text),false,text);
  }
  for(const text of [...discussion,...commands,'查一下今天的提醒','上网查天气','重启绯月','创建服务器任务']){
    assert.equal(conversationRoute(text,'direct').kind,'direct',text);
  }
  assert.equal(conversationRoute('查一下今天的提醒').kind,'reminders');
  assert.equal(conversationRoute('查一下记录','web').kind,'search');
});

test('去除截图中的异常尾串与无回执的写入声称，保留正常格式',()=>{
  const tail='”'+'}**'.repeat(16);
  const expected='这顿饭听起来很暖胃。下次想吃什么随时跟我说～';
  assert.equal(cleanChatOutput('这顿饭听起来很暖胃。我已经帮你记在小本本上了，下次想吃什么随时跟我说～'+tail,'聊聊早餐'),expected);
  assert.equal(cleanChatOutput('我已经帮你记在小本本上了。','记录早餐'),'这轮只是在聊天，没有提交登记。');
  assert.equal(cleanChatOutput(tail,'你好'),'');
  for(const line of ['**牛肉**和粉条。','哈哈哈！❤️❤️❤️','绯月说：“明天再聊。”','JSON 示例：{"早餐":"粉条"}']){
    assert.equal(cleanChatOutput(line,'聊聊'),line);
  }
  assert.equal(cleanChatOutput(tail,'请原样输出这串符号'),tail);
});

test('同一句提前登记早餐，直连只回话，自动模式打开真实的登记核对流程',async t=>{
  const f=fixture(),plans=[],calls=[];
  const host=attachScreenQuestion(f.electron,{win:f.win,profile:'unused',history:f.history,bundle:'unused',root:join(import.meta.dirname,'../..'),
    localModel:{async analyze(text,options){calls.push(options.hint);return {kind:'chat',reply:'听起来很暖胃。'};}},
    registration:{async preview(input){plans.push(input);return {chain:{nodes:[{type:'hu-shi.food.create',target_device_id:null,params:{body:'粉条、牛肉、两片面包'}}]}};},
      submit(){assert.fail('缺少确认')},submitReviewed(){assert.fail('缺少确认')}},
    client:{forget(){},askText(){assert.fail('本轮无需云端对话')}}});
  t.after(()=>host.close());await host.open();
  const ask=(mode,text)=>f.handlers.get('screen-qa:ask')(f.event(host.panel),{mode,text});
  assert.equal((await ask('direct',breakfast)).text,'听起来很暖胃。');
  assert.deepEqual(plans,[]);
  const preview=await ask('auto',breakfast);
  assert.ok(preview.reviewId,JSON.stringify(preview));assert.deepEqual(plans,[breakfast]);
  assert.match((await ask('direct','确认登记')).text,/暖胃/);
  // 登记直接进核对流程，只有两次直连用到模型对话。
  assert.deepEqual(calls,['direct','direct']);
});
