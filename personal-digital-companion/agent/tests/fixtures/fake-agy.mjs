// 模拟 agy CLI：-p "" --input-format stream-json 时常驻，每收到一条 user 事件返回一次结果；否则按 -p 一次性回答。
import {createInterface} from 'node:readline';
const args=process.argv.slice(2);
const flag=name=>args[args.indexOf(name)+1];
let turn=0;
const answer=prompt=>{
  turn++;
  if(/"done"/.test(prompt))return JSON.stringify({reply:'周末一起去公园走走吧，回来喝一杯热茶。路上如果看到好看的树，我想站一会儿，听听风吹树叶的声音，再和你商量晚饭吃什么。',done:false});
  if(/"kind"/.test(prompt))return JSON.stringify({kind:'chat',summary:'s',reply:'第'+turn+'轮 pid'+process.pid,review:false});
  return /JSON Schema/.test(prompt)?JSON.stringify({answer:'是'}):'你好，第'+turn+'轮 pid'+process.pid;
};
if(args.includes('--version')){console.log('fake-1.0');process.exit(0);}
if(flag('--input-format')==='stream-json'){
  console.log(JSON.stringify({event:'init',conversation_id:'c-'+process.pid,init:{model:flag('--model')}}));
  createInterface({input:process.stdin}).on('line',line=>{
    const message=JSON.parse(line);
    console.log(JSON.stringify({event:'result',result:{conversation_id:'c-'+process.pid,status:'SUCCESS',response:answer(message.message.content),duration_seconds:0.01}}));
  });
}else{
  const prompt=flag('-p');
  const schema=args.includes('--json-schema');
  console.log(JSON.stringify({status:'SUCCESS',conversation_id:'cold-'+process.pid,response:schema?'':answer(prompt),structured_output:schema?{answer:'是'}:undefined}));
}
