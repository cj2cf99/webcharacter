// electron.exe test-image-planner-mock.mjs ROUND OUTPUT.json
import * as electron from 'electron';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createLocalModel,LOCAL_MODEL_FILE} from '../desktop/local-model.mjs';
import {createImageTasks,imageRequest} from '../desktop/image-tasks.mjs';

const style={text:'把这张照片改成水彩画风',count:1,ops:[['img2img',[]]],terms:['水彩画风']};
const combined={text:'保留脸，换成图2的雨衣并放大',count:2,ops:[['edit',[2]],['upscale',[]]],terms:['保留脸','图2的雨衣']};
const ordinal={text:'用第二张图的围巾修改第一张图，保留表情',count:2,ops:[['edit',[2]]],terms:['第二张图的围巾','保留表情']};
const outOfRange={text:'把图1的披风换成图4的披风',count:2,ask:/图4/};
const cases={
  5:[style,combined,ordinal,outOfRange],
  6:[style,combined,ordinal,outOfRange,
    {text:'请把这张照片改成素描风格，不用放大',count:1,ops:[['img2img',[]]],terms:['素描风格']}],
  7:[{text:'画一只海豹，然后换上图1的蓝帽子，再换成图2的绿围巾，最后放大',count:2,
    ops:[['generate',[]],['edit',[1]],['edit',[2]],['upscale',[]]],terms:['海豹','蓝帽子','绿围巾']},
    {text:'保留表情，把图一的背景换成雪原并高清放大',count:1,ops:[['edit',[]],['upscale',[]]],terms:['保留表情','雪原']},
    {text:'把图1的衣服换成第三张图的风衣',count:2,ask:/第三张|图3/},
    {text:'图片怎么换背景再放大？',count:1,inquiry:true},
    {text:'把图2的背景换成沙漠',count:2,ask:/第一张.*底图/},
    {text:'把这张照片改成油画风格',count:1,ops:[['img2img',[]]],terms:['油画风格'],fail:true}],
  8:[{text:'把这张港口照改成铅笔素描风格',count:1,ops:[['img2img',[]]],terms:['港口','铅笔素描'],compare:true},
    {text:'把照片里雨伞的花纹改成水彩风格，只修改雨伞，其他部分保持原样',count:1,ops:[['edit',[]]],terms:['雨伞的花纹','其他部分保持原样'],compare:true},
    {text:'照着图3的发型修改图1，保留眼镜；最后高清放大',count:3,ops:[['edit',[3]],['upscale',[]]],terms:['图3的发型','保留眼镜']},
    {text:'换成参考图里的衣服',count:3,ask:/哪|图号|编号|指明/},
    {text:'画一张古城夜景，不要放大',count:0,ops:[['generate',[]]],terms:['古城夜景']},
    {text:'不要生成海报，也别放大图片',count:0,inquiry:true},
    {text:'把路灯的纹理改成版画风格，其余区域不动',count:1,ops:[['edit',[]]],terms:['路灯的纹理','其余区域不动']},
    {text:'把图2高清放大',count:2,ask:/第一张.*底图/}]
};

async function run(){
  const round=process.argv[2],output=process.argv[3],rows=[];
  const samples=round==='regression'?[...new Map(Object.values(cases).flat().map(c=>[c.text,c])).values()]:cases[round];
  if(!samples||!output)throw Error('需要轮次 5–8 或 regression，以及输出文件');
  const root=fileURLToPath(new URL('../',import.meta.url));
  const profile=await mkdtemp(join(tmpdir(),'feiyue-planner-mock-'));
  electron.app.setPath('userData',profile);
  electron.app.disableHardwareAcceleration();
  await electron.app.whenReady();
  const model=createLocalModel({utilityProcess:electron.utilityProcess,modelPath:join(root,'desktop/models',LOCAL_MODEL_FILE)});
  try{
    await model.start();
    if(model.snapshot().state!=='ready')throw Error(JSON.stringify(model.snapshot()));
    for(const [index,c] of samples.entries()){
      const row={text:c.text,expected:c.inquiry?'问答':c.ask?'澄清':c.fail?'报告失败':'排队并报告完成',modelCalls:[],queues:0};
      const files=Array.from({length:c.count},(_,i)=>({kind:'image',name:i+'.jpg',data:'data:image/jpeg;base64,/9j/2Q=='}));
      const routed=imageRequest(c.text,c.count);
      if(!routed){row.outcome='问答';row.passed=Boolean(c.inquiry);}
      else{
        let finish;
        const receipt=new Promise(r=>{finish=r;});
        const host=createImageTasks({root,profile:join(profile,'case-'+index),onFinish:finish,
          localModel:{async analyze(text,options){
            if(c.compare&&index%2===0)row.withoutSkill=await model.analyze(text,{...options,imageSkill:{...options.imageSkill,instruction:''}});
            const value=await model.analyze(text,options);
            row.modelCalls.push(value);
            if(c.compare&&index%2===1)row.withoutSkill=await model.analyze(text,{...options,imageSkill:{...options.imageSkill,instruction:''}});
            return value;
          }},
          async runPython(script,args,input){
            if(args[0]==='wait')return c.fail?{state:'failed',step:1,operation:'img2img',error:'模拟显存不足'}:
              {state:'done',width:512,height:512,output:join(profile,'mock-result.png')};
            if(!['describe','submit'].includes(args[0]))throw Error('未识别的模拟动作');
            const parsed=JSON.parse(execFileSync('python',['-B',script,args[0]==='submit'?'check':'describe',...args.slice(1)],
              {input:input?JSON.stringify(input):undefined,encoding:'utf8',windowsHide:true}));
            if(args[0]==='describe'){row.skillVersion=parsed.version;return parsed;}
            row.queues++;row.plan=parsed.steps;
            return {state:'queued',job:'a'.repeat(32),completed:[]};
          }});
        try{
          row.reply=(await host.submit(c.text,files)).text;
          const terminal=await receipt;
          row.terminal=terminal.text;
          row.outcome=terminal.state==='failed'?'报告失败':'排队并报告完成';
          row.passed=row.outcome===row.expected&&row.queues===1&&row.reply.includes('已排队')&&
            isDeepStrictEqual(row.plan.map(s=>[s.op,s.refs]),c.ops)&&c.terms.every(t=>row.plan.some(s=>s.quote.includes(t)))&&
            (!c.fail||terminal.text.includes('模拟显存不足'));
        }catch(error){
          row.reply=error.message;
          row.outcome=c.ask?'澄清':'可执行任务被拦下';
          row.passed=Boolean(c.ask?.test(row.reply)&&!row.queues);
        }finally{host.close();}
      }
      rows.push(row);
      await writeFile(output,JSON.stringify({round,model:LOCAL_MODEL_FILE,rows},null,2)+'\n');
    }
  }finally{model.close();}
  electron.app.exit(rows.every(r=>r.passed)?0:1);
}
run().catch(error=>{console.error(error);electron.app.exit(2);});
