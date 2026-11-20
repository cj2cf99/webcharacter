import assert from 'node:assert/strict';
import test from 'node:test';
import {conversationRoute} from '../../desktop/conversation-routing.mjs';

test('重启只接受用户对绯月自身的直接指令',()=>{
  for(const command of ['绯月，请重启一下你自己','重启','请马上重新启动','帮我重启绯月',
    '去重启下','绯月，你自己去重启下吧','麻烦现在把桌面精灵重启一下','自己重启','帮我重启下桌面精灵好吗？','重启下自己','请让绯月再重启一次',
    '你先重启下试试看吧','把绯月重启一下，谢谢！']){
    assert.equal(conversationRoute(command).kind,'restart',command);
  }
  for(const text of ['不要重启','你能重启自己吗？','重启电脑','他说“重启一下”','明天提醒我重启绯月',
    '绯月，去重启下电脑','你自己重启下浏览器','把微信重启下','重启绯月和记事本','让某个程序自己重启','请重启绯月的插件','绯月怎么重启','刚刚绯月重启过了']){
    assert.notEqual(conversationRoute(text).kind,'restart',text);
  }
  for(const mode of ['registration','supplement','web','memory']){
    assert.notEqual(conversationRoute('重启',mode).kind,'restart');
  }
});
