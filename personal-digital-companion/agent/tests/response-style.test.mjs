import test from 'node:test';
import assert from 'node:assert/strict';
import {responseMode,responseInstruction} from '../assistant/response-style.mjs';

test('按交付内容选择说话、写作、判断和工具语体',()=>{
  const cases={
    speech:['绯月，今晚陪我聊聊','你好呀','描述一下你现在在做什么','你对我有什么感受？'],
    writing:['帮我写一篇今天的日记','请写一段评论','给他写一封信'],
    judgment:['帮我判断这个说法的逻辑是否成立','这件事前后有矛盾吗？','判断她的情绪'],
    tool:['汇总这篇文章','帮我分析这张表','如何配置本地服务','截图里有什么','给我写一段排序代码','写一个脚本分析这些评论','解释系统启动步骤','请根据附件回答用户问题。','用列表汇总这些材料','把这篇文章总结成三点']
  };
  for(const [mode,examples] of Object.entries(cases)){
    for(const input of examples) assert.equal(responseMode(input),mode,input);
  }
});

test('直连的亲密口语提示只用于面对面交谈',()=>{
  assert.match(responseInstruction('speech',{direct:true}),/^你叫绯月，扮演我的妻子。/u);
  assert.match(responseInstruction('speech',{direct:true}),/第一人称.+面对面/u);
  assert.match(responseInstruction('speech',{direct:true}),/合适的亲密对话里偶尔/u);
  assert.doesNotMatch(responseInstruction('speech'),/亲热、做爱/u);
  for(const mode of ['writing','judgment','tool']){
    assert.equal(responseInstruction(mode,{direct:true}),responseInstruction(mode));
    assert.doesNotMatch(responseInstruction(mode),/当面说出口|亲热、做爱/u);
  }
  assert.match(responseInstruction('writing'),/口语或书面语/u);
  assert.match(responseInstruction('judgment'),/身份、立场和当下情绪/u);
  assert.doesNotMatch(responseInstruction('tool'),/妻子|丈夫|第一人称/u);
});
