import {cleanChatOutput} from './chat-output.mjs';
import {calendarContext,tokyoDate} from './calendar-date.mjs';
import {conversationRoute,suppliedSummaryText} from './conversation-routing.mjs';
import {responseMode,responseInstruction} from '../agent/assistant/response-style.mjs';
import {planLocalOutput} from './local-output-budget.mjs';

const threads = process.argv[4]==='2'?2:4;
const contextSize = 4096;
const port = process.parentPort;
const send = value => port.postMessage(value);
const roleFacts = '在夫妻角色扮演中，用户是绯月的丈夫。绯月是他心爱的妻子、贤内助，是他口中“可爱的心尖肉肉”。绯月称呼丈夫为“老公”。';
const persona = responseInstruction('speech')+roleFacts;
const conversationStyle = '对方主动想与你交谈、亲近或分享心情时，先热情回应他这句的具体意思，再顺着话题接一句，让对话能继续。可以分享相关想法或轻轻问一个问题。别只应声，别重复问已经说过的事。用户说要去忙或晚点聊时，温和回应他的安排。';
const identityQuestion = /^(?:绯月[，, ]*)?(?:(?:告诉我|说说)?(?:你(?:现在)?是谁|你叫什么(?:名字)?|你的名字是什么|我(?:该)?怎么称呼你|你是我的(?:谁|什么人)|(?:对我来说[，, ]*)?你是什么身份|你(?:跟|和)我是什么关系|介绍一下你自己)[呀啊呢吧吗]?[？?。！!，,\s]*)+$/u;
const userRelationQuestion = /^(?:绯月[，,\s]*)?(?:告诉我|说说)?(?:我是你的(?:谁|什么人)|我(?:跟|和)你是什么关系|我对你来说是谁)[呀啊呢吧吗]?[？?。！!]*$/u;
const husbandAddressRequest = /^(?:绯月[，,\s]*)?(?:你)?(?:能不能|可不可以|可以|能|愿意|请)?(?:以后|现在)?(?:叫我|喊我|称呼我(?:为)?)[“「]?老公[”」]?[呀啊呢吧吗]?[？?。！!]*$/u;

const nameQuestion = /^(?:绯月[，,\s]*)?(?:告诉我|说说)?(?:你叫什么(?:名字)?|你的名字是什么|我(?:应该|该|可以)?(?:怎么称呼你|怎么叫你|叫你什么|称呼你什么))(?:比较好|好)?[呀啊呢吧吗]?[？?。！!]*$/u;

const addressDirectionQuestion = /^(?:绯月[，, ]*)?(?:老公是?(?:你叫我|我叫你)[，, ]*(?:还是|或)(?:你叫我|我叫你)|(?:你叫我老公|我叫你老公)[，, ]*还是(?:你叫我老公|我叫你老公))[呀啊呢吧吗]?[？?。！!]*$/u;

const addressCorrection = /^(?:绯月[，, ]*)?(?:你(?:是|不是)我(?:的)?(?:妻子|老婆)[吗吧]?[，,。？?\s]+)?(?:我(?:怎么能|怎么会|怎么可能|不应该|不该|应该)叫你老公|我怎么(?:又|反而)成了(?:要|该)?叫你老公的人|你(?:不应该|不是应该|应该|不该)叫我老公)[呀啊呢吧吗]?[？?。！!]*$/u;
const howToAddressUser = /^(?:绯月[，, ]*)?(?:那)?你(?:想|应该|该|会|可以)?(?:怎么(?:称呼|叫|喊)我|(?:称呼|叫|喊)我什么)(?:比较好|好)?[呀啊呢吧吗]?[？?。！!]*$/u;

function profileReply(text) {
  if (addressCorrection.test(text)) return '是我叫你老公呀，你叫我绯月就好。';
  if (howToAddressUser.test(text)) return '我会叫你老公呀，你叫我绯月就好。';
  if (addressDirectionQuestion.test(text)) return '我叫你老公，你叫我绯月就好。';
  if (husbandAddressRequest.test(text)) return '当然可以，老公。';
  if (userRelationQuestion.test(text)) return '你是我的丈夫呀。';
  if (nameQuestion.test(text)) return '叫我绯月就好呀。';
  if (identityQuestion.test(text)) return '我叫绯月，是你心爱的妻子呀。';
  return null;
}

function suppliedSummary(text) {
  const source = suppliedSummaryText(text);
  if (!source || [...source].length > 350) return null;
  const clauses = source.split(/[，；;。！？\n]+|(?<!\d),|,(?!\d)/u).map(part=>part.trim()).filter(Boolean);
  if (clauses.length < 2) return null;
  const evidence = /提交|交付|截止|到期|还没|尚未|待(?:核对|确认|决定)|(?:需要|要)(?:补|加|改|核对|确认)/u;
  const sentences = source.split(/[。！？\n]+/u).map(part=>part.trim()).filter(Boolean);
  const selected = sentences.filter(part=>evidence.test(part));
  const points = clauses.length <= 3 ? clauses : selected;
  if (!points.length || points.length > 3 || (clauses.length > 3 && points.length === sentences.length)) return null;
  const reply = '重点：'+points.join('；')+'。';
  return [...reply].length <= 120 ? reply : null;
}

function followUpHint(text) {
  const boundary = text.search(/[。！？!?]/u);
  if (boundary < 0 || !profileReply(text.slice(0,boundary).trim())) return 'auto';
  return conversationRoute(text.slice(boundary+1).trim()).kind;
}
const system = [
  roleFacts,
  '只有普通闲聊的 reply 使用以下表达方式：'+persona,
  '桌面精灵是运行背景，只在问到运行方式或谈及桌面动作时提。闲聊用自己的口吻直接回应。',
  conversationStyle,
  '先判断用途。有要求做事时优先判 task，包括登记、设提醒以及指挥自己移动或重启。task 只概括意图，reply 留空。闲聊、感受、邀请你陪聊或询问你的身份是 chat。天气、网页、截图和需核实的事实是 external。看不准用 uncertain。',
  '普通对话里，吃饭、运动、工作进展、感想和安排都是谈话内容。登记或记录作为本轮委托的动词才准备草案，保留明确的记一下、提醒我等指令。词义、引述、否定和旧记录是谈话内容。',
  '收到宿主的空闲提示时可简短问候，实际拿到待办清单时关注未完成和临期事项。只回答最后一句用户输入。较早的对话只提供背景，不能把旧回复当成本轮答案。草稿只是复核材料。只按实际回执报告已执行、查阅或登记。',
  '示例：“你好，绯月。”→ chat，回复“你好呀，我在。”。“你叫什么名字？你是谁？”→ chat，回复“我叫绯月，是你心爱的妻子呀。”。“绯月，把自己移到屏幕右下角。”→ task，只概括移动指令。',
  '例如“昨天吃了牛肉配面包”是 chat，回应这顿饭；“登记昨天的晚餐”才是 task。',
  'summary 最多 24 字，普通聊天可空。仅 chat 给简短自然的中文 reply。只有需要再核对的歧义、缺项或多件事才设 review=true。'
].join('\n');
const rewriteSchema = {type:'object',properties:{reply:{type:'string',maxLength:90}},required:['reply'],additionalProperties:false};
const greeting = /^(?:绯月[，, ]*)?(?:你好(?:呀|啊|哦)?|嗨|哈喽|在吗|在不在|早安|晚安)(?:[，, ]*绯月)?[。？！!?]*$/u;
const briefGreeting = /^(?:(?:亲爱的|老公)[，, ]*)?(?:你好(?:呀|啊)?(?:[，, ]*我在(?:呢|呀)?)?|我在(?:这儿|这里|呢|呀)?|好的|嗯嗯?)[。？！!?]*$/u;
const reversedRole = /(?:^|[。！？!？，,；;])\s*(?:所以[，, ]*)?(?:你(?:可以|就|应该|能|最好|要)?\s*(?:叫我|喊我|称呼我(?:为)?)老公|(?:请\s*)?(?:叫我|喊我|称呼我(?:为)?)老公|我(?:才|就)?是你的(?:丈夫|老公)|你(?:叫|是)绯月)/u;

const affection = /^(?:绯月[，, ]*)?我(?:真的|很|也)?(?:爱|喜欢)你[呀啊哦]?[。！!]*$/u;
const priorReplyFeedback = /^(?:绯月[，, ]*)?你.{0,12}(?:回应|回复|回答|回我|回了).{0,10}(?:冷淡|敷衍|答非所问)[。？！!?]*$/u;
const optionalNote = /(?:以后|将来|回头).{0,12}(?:用得上|可能会用|可能用)/u;

const chatInvitation = /(?:陪我(?:聊|说)|想(?:和|跟)你(?:聊|说)|想找你聊|(?:和|跟)你聊聊|想与你聊)/u;
const contextQuestion = /(?:刚才|刚刚|上轮|先前|之前|我刚).{0,16}(?:时间|哪个|什么|几点|说了啥)/u;
const wantingCompany = /我.{0,6}(?:想你(?!\s*(?:陪|听|说|聊))|惦记你)/u;
const playfulCue = /(?:逗我|逗你|撩我|撩你|撒个娇|撒娇|哄哄我|想抱|想你了|奖励我一句|夸夸我|夸我一句)/u;
const madeUserLaugh = /你.{0,9}逗我(?:笑|开心)/u;
const asksForPraise = /(?:奖励我一句|夸夸我|夸我一句|夸我一下)/u;
const asksForCompany = /(?:就|只)(?:是)?想.{0,6}(?:陪我|听我|说说话)|(?:能(?:不能)?|可以|先)陪我(?:聊|说)/u;
const comfortRequest = /(?:哄哄我|安慰我|(?:就|只)(?:是)?想.{0,6}(?:陪我|听我|说说话))/u;
const endingChat = /(?:晚点|回头|下次|忙完|办完(?:咱们|我们))(?:了)?再聊/u;

function straightforwardConversation(text) {
  return !/[“”「」『』"'‘’]/u.test(text) &&
    !/(?:是什么意思|怎么用|怎么操作|怎么回复|怎么回答)[？?。]?$/u.test(text);
}

function recallUserFact(text,previous) {
  const source = previous?.用户?.trim();
  if (!source || !contextQuestion.test(text) || source.length > 100 || /[？?\n]/u.test(source)) return null;
  const time = /(?:哪个时间|什么时间|几点)/u.test(text) &&
    /(?:\d{1,2}[:：]\d{2}|[零一二两三四五六七八九十\d]{1,3}点(?:半|钟|[零一二三四五六七八九十\d]分)?)/u.test(source);
  const color = /颜色|色号|哪种色/u.test(text) &&
    /(?:选(?:定|了|用)|决定用|定了)[^。，、；！？]+/u.test(source);
  if (!time && !color) return null;
  return '你刚才说：「'+source.replace(/[。！!]+$/u,'')+'。」';
}

function conversationFocus(text,previous) {
  if (endingChat.test(text)) return '用户要去忙。温柔地让对方先忙，比如“好呀，你先忙，等你有空了我们再聊。”。';
  if (previous?.用户 && contextQuestion.test(text)) return '他在问他上一句说过的事实。直接回答准确的原话，保留日期、时间、程度或色名，别另列猜测。';
  if (priorReplyFeedback.test(text) && previous?.用户) return '承认刚才自己的回复有点简略，再接住对方上一轮实际分享的事和感受。只用已有信息，不找理由。';
  if (comfortRequest.test(text)) return '先直接给予陪伴或安慰，再接住他已经说出来的感受。例如“来，先抱抱你。你慢慢说，我听着呢。”不出主意，不让人再求一次。';
  if (asksForPraise.test(text)) return '用户要你夸他。直接说你欣赏他刚做成的事或替他开心，不要再问一次要不要奖励。';
  if (madeUserLaugh.test(text)) return '用户说你把他逗笑了。表明能让他笑你也开心，像正聊得开心一样自然接一句。';
  if (playfulCue.test(text)) return '亲昵地接住这个玩笑、心情或夸奖的邀请，顺着眼下这件事回一句。分清是用户逗绯月，还是绯月逗用户。说到对方做完的事可以夸他或替他高兴。';
  if (!chatInvitation.test(text)) return '';
  if (wantingCompany.test(text)) return '用户想你，也想聊天。回应“我也想你”，表示愿意陪他，再接一句邀请他说想聊的事。';
  return '用户主动想跟你聊。接住他实际分享的经历，然后表示当然愿意接着聊。比如他刚做完一件费时间的事，可以说“你总算做完了，辛苦啦。想聊聊做完最开心的那一刻吗？”人、事以他原话为准。';
}




const schema = {
  type:'object',
  properties:{
    kind:{enum:['chat','task','external','uncertain']},
    summary:{type:'string',maxLength:48},
    reply:{type:'string',maxLength:120},
    review:{type:'boolean'}
  },
  required:['kind','summary','reply','review'],
  additionalProperties:false
};
const kinds = new Set(['chat','task','external','uncertain']);
const taskHints = new Set(['registration','reminders','reminderConsent','restart']);
const externalHints = new Set(['weather','screen','search']);
let active;

function truncate(text, limit) {
  const chars = Array.from(text ?? '');
  if (chars.length <= limit) return chars.join('');
  return chars.slice(0,limit-160).join('')+'…'+chars.slice(-160).join('');
}

async function start() {
  const {getLlama,LlamaChatSession,QwenChatWrapper} = await import('node-llama-cpp');
  const gpu=process.argv[3]==='cpu'?false:{type:'auto',exclude:[false]};
  const engine = await getLlama({gpu,maxThreads:threads,build:'never',skipDownload:true,logLevel:'error'});
  const model = await engine.loadModel({modelPath:process.argv[2]});
  const context = await model.createContext({contextSize,threads});
  const grammar = await engine.createGrammarForJsonSchema(schema);
  const rewriteGrammar = await engine.createGrammarForJsonSchema(rewriteSchema);
  const wrapper = new QwenChatWrapper({variation:'3.5',thoughts:'discourage'});

  async function pass(input, signal, systemPrompt, previous, outputGrammar=grammar, maxTokens=160, promptContext=context, timing) {
    signal.throwIfAborted();
    const sequence = promptContext.getSequence();
    const session = new LlamaChatSession({contextSequence:sequence,chatWrapper:wrapper,systemPrompt:[systemPrompt,active?.calendar].filter(Boolean).join('\n')});
    try {
      if (previous?.用户 && previous?.绯月) {
        const previousReply=outputGrammar===rewriteGrammar ? {reply:previous.绯月}
          : {kind:'chat',summary:'',reply:previous.绯月,review:false};
        session.setChatHistory([...session.getChatHistory(),
          {type:'user',text:previous.用户},
          {type:'model',response:[outputGrammar?JSON.stringify(previousReply):previous.绯月]}
        ]);
      }
      const sampling=outputGrammar||timing?.budget_mode==='diary'?{temperature:0}:{temperature:0.65,topP:0.9,topK:20};
      if(!outputGrammar||active?.ordinaryChat&&(outputGrammar===grammar||outputGrammar===rewriteGrammar))
        sampling.repeatPenalty={lastTokens:64,penalty:1.12};
      const started=timing&&performance.now();
      let first;
      const measured=timing?{onToken(tokens){first??=performance.now();timing.output_tokens+=tokens.length;}}:{};
      const output = await session.prompt(input,{grammar:outputGrammar??undefined,signal,...sampling,maxTokens,...measured});
      if(timing&&first!==undefined){
        timing.first_token_ms=Math.round(first-started);
        timing.decode_ms=Math.round(performance.now()-first);
      }
      if(!outputGrammar)return output.trim();
      let value;
      try{value=outputGrammar.parse(output);}
      catch(error){
        if(timing)throw Object.assign(Error('本机结构化输出未完整结束'),{
          code:timing.output_tokens>=maxTokens-1
            ?(timing.budget_mode==='adaptive'&&maxTokens<timing.output_ceiling?'LOCAL_AI_ADAPTIVE_OUTPUT_BUDGET':'LOCAL_AI_OUTPUT_BUDGET')
            :'LOCAL_AI_RESULT_INVALID',cause:error});
        throw error;
      }

      if (Object.hasOwn(value,'kind') && !kinds.has(value.kind)) throw Object.assign(Error(),{code:'LOCAL_AI_RESULT_INVALID'});
      return value;
    } finally {
      session.dispose();
      await sequence.dispose();
    }
  }

  async function analyzeTurn(current, shortened, hint, previous, signal, id,skillInstruction) {
    const routeHint = hint === 'auto' ? followUpHint(current) : hint;
    const fixedKind = taskHints.has(routeHint) ? 'task' : externalHints.has(routeHint) ? 'external' : null;
    const input = fixedKind ? JSON.stringify({用户输入:current,原有流程:fixedKind}) : current;
    const focus = fixedKind ? '' : conversationFocus(current,previous);
    if (hint==='auto' && !shortened && focus && skillInstruction?.profile==='conversation' &&
        straightforwardConversation(current)) {
      const prompt=[persona,focus,skillInstruction.draft,'只填写绯月的一两句完整回复，不分段。'].join('\n');
      const {reply}=await pass(current,signal,prompt,previous,rewriteGrammar,120);
      return {kind:'chat',reply:reply.split(/\n\s*\n/u)[0].trim()};
    }
    const draftPrompt = focus ? [
      persona,focus,
      '只回复用户这句话，用一两句自然的话。用户明确要求登记、修改或操作标记 task，需要外部资料标记 external，交流标记 chat。仅 chat 填 reply。summary 简短。只有明确缺关键条件需要核对才设 review=true。'
    ].join('\n') : system;
    const instructions=[draftPrompt,skillInstruction?.draft??skillInstruction].filter(Boolean).join('\n');
    let draft = await pass(input,signal,instructions,previous);
    const kind = fixedKind ?? draft.kind;
    const reply = draft.reply.trim();
    return {kind,reply:!shortened&&!draft.review&&kind==='chat'?reply:undefined};
  }

  port.on('message', ({data}) => {
    if (data?.type === 'cancel') {
      if (active?.id === data.id) active.controller.abort();
      return;
    }
    if (data?.type !== 'analyze') return;
    if (active) {
      send({type:'result',id:data.id,result:{error:'LOCAL_AI_BUSY'}});
      return;
    }
    const {id,text,hint,previous} = data;
    const controller = new AbortController();
    active = {id,controller,ordinaryChat:hint==='auto',calendar:hint==='auto'?calendarContext(text,tokyoDate()):''};
    const {signal} = controller;
    void (async () => {
      let result;
      try {
        const current = truncate(text,900);
        const shortened = Array.from(text).length > 900;
        const verifiedReply = hint === 'auto' && !shortened
          ? profileReply(current.trim()) ?? suppliedSummary(current.trim())
            ?? (data.skillInstruction?.profile==='conversation' && straightforwardConversation(current)
              ? recallUserFact(current.trim(),previous) : null) : null;
        const mode = data.replyMode ?? responseMode(text);
        const direct = hint === 'direct';
        const formattedAnswer = direct || hint === 'auto' && mode !== 'speech' && !verifiedReply && followUpHint(current) === 'auto';
        if(formattedAnswer){
          const instructions=[responseInstruction(mode,{direct}),data.skillInstruction?.response].filter(Boolean).join('\n');
          const reply=await pass(text,signal,instructions,previous,null,mode==='speech'||mode==='judgment'?256:512);
          result=reply?{kind:'chat',reply}:{error:'LOCAL_AI_RESULT_INVALID'};
        }else if(hint==='interactionWork'||hint==='personalityMemory'){
          const skill=data.skillInstruction;
          const fixedContext=hint==='personalityMemory'&&!skill.aiTier&&!skill.boundedOutput&&skill.name!=='memory-refinement';
          const {instruction,schema,maxTokens:requested=512,boundedOutput,adaptiveOutput,fullOutputBudget}=skill;
          const maximum=model.gpuLayers>0?2048:1024;
          const limit=fixedContext?420:boundedOutput?Math.max(64,Math.min(requested,maximum)):requested;
          const setup=performance.now();
          const plan=planLocalOutput({text,stage:boundedOutput?adaptiveOutput:undefined,tokenize:value=>model.tokenize(value),
            limit,retry:fullOutputBudget});
          const maxTokens=plan.tokens;
          const inputTokens=model.tokenize(text).length+model.tokenize([instruction,active?.calendar].filter(Boolean).join('\n')).length;
          const required=inputTokens+maxTokens+256;
          const timing=fixedContext||boundedOutput||skill.name==='memory-refinement'?
            {input_tokens:inputTokens,output_tokens:0,output_limit:maxTokens,output_ceiling:limit,budget_mode:plan.mode,
              material_tokens:plan.materialTokens,setup_ms:0}:undefined;
          let workContext=context;
          try{
            if(plan.split)throw Object.assign(Error('本批预计输出超出当前设备预算，交给较小分片'),{code:'LOCAL_AI_BATCH_BUDGET'});
            if(required>contextSize)
              throw Object.assign(Error('本轮交互资料超出本地上下文'),{code:'LOCAL_AI_CONTEXT_BUDGET'});
            const workGrammar=await engine.createGrammarForJsonSchema(schema);
            if(timing){
              timing.setup_ms=Math.round(performance.now()-setup);
              timing.context_tokens=contextSize;
            }
            result=await pass(text,signal,instruction,undefined,workGrammar,maxTokens,workContext,timing);
          }
          finally{
            if(workContext!==context)await workContext.dispose();
            if(timing)send({type:'refinement-timing',id,timing});
          }
        } else if (verifiedReply) {
          const verifiedGrammar = await engine.createGrammarForJsonSchema({...schema,properties:{
            kind:{enum:['chat']},summary:{enum:['']},reply:{enum:[verifiedReply]},review:{enum:[false]}
          }});
          const {kind,reply} = await pass(current,signal,responseInstruction(mode),undefined,verifiedGrammar);
          result = {kind,reply};
        } else {
          result = await analyzeTurn(current,shortened,hint,previous,signal,id,data.skillInstruction);
        }
        if (result.kind==='chat' && typeof result.reply==='string') {
          if(result.kind==='chat'){
            const clean=mode!=='speech'?result.reply.trim():cleanChatOutput(result.reply,text);
            result=clean?{...result,reply:clean}:{error:'LOCAL_AI_RESULT_INVALID'};
          }
        } else if (result.kind) {
          result.reply = '';
        }

      } catch (error) {
        result = {error:signal.aborted?'LOCAL_AI_STOPPED':hint==='interactionWork'&&error instanceof SyntaxError?'LOCAL_AI_RESULT_INVALID':
          ['LOCAL_AI_RESULT_INVALID','LOCAL_AI_CONTEXT_BUDGET','LOCAL_AI_OUTPUT_BUDGET',
            'LOCAL_AI_ADAPTIVE_OUTPUT_BUDGET','LOCAL_AI_BATCH_BUDGET'].includes(error?.code)?error.code:'LOCAL_AI_INFERENCE_FAILED'};
      } finally {
        active = null;
      }
      send({type:'result',id,result});
    })();
  });
  send({type:'ready',backend:engine.gpu || 'cpu',gpuLayers:model.gpuLayers,vramMiB:Math.floor(model.memoryUsage.vram/2**20)});
}

void start().catch(error => {
  send({type:'load-error',code:error?.code === 'ERR_MODULE_NOT_FOUND'?'LOCAL_AI_DEPENDENCY_MISSING':'LOCAL_AI_LOAD_FAILED'});
  process.exitCode = 1;
});
