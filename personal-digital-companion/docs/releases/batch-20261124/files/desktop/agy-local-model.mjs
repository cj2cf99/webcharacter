import {checkAgyAvailable, findAgyPath, isAgyInstalled, runAgyPrompt, startAgyStandby, stopAgyStandby, agyStandbyReady, createAgyConversation, extractJson} from './agy-cli-client.mjs';
import {valid} from './ai-schema.mjs';

const FEIYUE_PERSONA = [
  '【角色设定】',
  '你是绯月，是用户心爱的妻子、贤内助，是他口中“可爱的心尖肉肉”。你称呼用户为“老公”。',
  '态度：温和、亲昵、体贴、陪伴、自然。',
  '桌面精灵是运行背景，只在问到运行方式或谈及桌面动作时提及。',
  '【任务要求】',
  '先判断用户输入的意图：',
  '1. chat: 闲聊、分享心情、问候、撒娇、交流感受。此模式下必须给出符合绯月妻子口吻的自然回复 reply（不超120字）。',
  '2. task: 明确要求做某事、设提醒、做登记、移动窗口、重启等。此时 reply 为空字符串，summary 写简短意图。',
  '3. external: 查天气、截图、查网页、搜索等。此时 reply 为空字符串。',
  '4. uncertain: 含义不清或看不准。',
  'summary 简短概括用户输入（不超过40字）。',
  'review 表示是否有严重歧义需要用户再次核对（布尔值，普通对话为 false）。'
].join('\n');

const CHAT_INTENT_SCHEMA = {
  type: 'object',
  properties: {
    kind: {type: 'string', enum: ['chat', 'task', 'external', 'uncertain']},
    summary: {type: 'string', maxLength: 48},
    reply: {type: 'string', maxLength: 160},
    review: {type: 'boolean'}
  },
  required: ['kind', 'summary', 'reply', 'review'],
  additionalProperties: false
};

/**
 * 创建基于 AGY CLI 的本地模型替换实现
 */
export function createAgyCliModel({log, model = 'gemini-3.8-flash-low'} = {}) {
  let closed = false;
  const conversation = createAgyConversation({model});
  let suspended = false;
  let busyCount = 0;
  let workSession = null;
  let status = {state: 'idle', model: 'AGY CLI (Gemini 3.8 Flash)', backend: 'AGY CLI'};

  const writeTraffic = (stage, start, error, extra = {}) => {
    void log?.({
      direction: 'local',
      route: 'AGY CLI 本地推理',
      stage,
      model: status.model,
      duration_ms: Math.round(performance.now() - start),
      ...(error ? {error} : {}),
      ...extra
    });
  };

  async function start() {
    if (closed) return;
    status.state = 'loading';
    const check = await checkAgyAvailable();
    if (check.available) {
      status = {
        state: 'ready',
        model: `AGY CLI (${check.version})`,
        backend: 'Google Antigravity CLI',
        path: check.path,
        gpuLayers: 0,
        vramMiB: 0
      };
      startAgyStandby(model); // 预热备用进程，之后每次调用都能立即发出，用完再预热下一个
      writeTraffic('AGY CLI 已就绪', performance.now(), undefined, {version: check.version, standby: true});
    } else {
      status = {
        state: 'unavailable',
        model: 'AGY CLI',
        error: check.error || 'AGY_NOT_AVAILABLE'
      };
      writeTraffic('AGY CLI 未就绪', performance.now(), status.error);
    }
  }

  async function preheatConversation(route, signal) {
    if (closed || suspended) return {error: 'AGY CLI 已暂停或已关闭'};
    return {ready: true, size: 'cloud', backend: status.backend};
  }

  async function analyze(text, options = {}) {
    if (closed || suspended) return {error: 'LOCAL_AI_STOPPED'};
    const started = performance.now();
    const {hint, previous, signal, onProgress, skillInstruction} = options;

    busyCount++;
    try {
      signal?.throwIfAborted();
      onProgress?.('AGY CLI 思索 · ' + status.model);

      // 1. 普通闲聊与意图识别 (hint === 'auto')：保留同一个会话进程，多轮自然记得前文。
      if (hint === 'auto') {
        const lines = [];
        // 会话刚建立（首次或进程重启）时补上一轮，让它接得上话；之后会话自己记着。
        if (previous?.用户 && previous?.绯月) {
          lines.push(`上一轮对话：\n老公说：「${previous.用户}」\n绯月回答：「${previous.绯月}」`);
        }
        lines.push(`当前老公说：「${text}」`);
        const schemaNote = '只输出一个符合以下 JSON Schema 的 JSON 对象，不要附加说明或代码块。\n' + JSON.stringify(CHAT_INTENT_SCHEMA);
        let out;
        const talk = await conversation.ask(lines.join('\n\n') + '\n\n' + schemaNote, {signal, first: FEIYUE_PERSONA});
        if (talk.result) {
          const parsed = extractJson(talk.result.response);
          if (parsed !== undefined && valid(parsed, CHAT_INTENT_SCHEMA)) out = parsed;
        }
        if (!out) {
          // 会话不可用或输出不合格：退回一次性调用（不带前文，带人设和上一轮）。
          const promptLines = [FEIYUE_PERSONA, ...lines];
          const result = await runAgyPrompt({prompt: promptLines.join('\n\n'), schema: CHAT_INTENT_SCHEMA, model, signal});
          if (!result.success) {
            writeTraffic('思索失败', started, result.error);
            return {error: result.error || 'AGY_CLI_INFERENCE_FAILED'};
          }
          out = result.structuredOutput || {};
        }
        const kind = out.kind || 'chat';
        const reply = kind === 'chat' && typeof out.reply === 'string' ? out.reply.trim() : '';

        writeTraffic('思索完成', started, undefined, {kind, summary: out.summary, session_turns: conversation.turns});
        return {
          kind,
          reply,
          summary: out.summary || '',
          review: Boolean(out.review)
        };
      }

      // 2. 直接回复 / 角色问答：同一个会话。
      if (hint === 'direct' || options.replyMode === 'speech') {
        const ask = `请以绯月（心爱妻子）的口吻，自然回复老公的这番话，不要额外添加前后缀：\n「${text}」`;
        const talk = await conversation.ask(ask, {signal, first: FEIYUE_PERSONA});
        if (talk.result?.response?.trim()) {
          writeTraffic('思索完成', started, undefined, {session_turns: conversation.turns});
          return {kind: 'chat', reply: talk.result.response.trim()};
        }
        const result = await runAgyPrompt({prompt: [FEIYUE_PERSONA, ask].join('\n\n'), model, signal});
        if (!result.success) {
          writeTraffic('思索失败', started, result.error);
          return {error: result.error};
        }
        writeTraffic('思索完成', started);
        return {kind: 'chat', reply: result.response.trim()};
      }

      // 3. 结构化任务与记忆处理 (interactionWork, personalityMemory, serverTask)
      if (hint === 'interactionWork' || hint === 'personalityMemory' || hint === 'serverTask') {
        const skill = skillInstruction || {};
        const instruction = skill.instruction || '请按所给的 JSON Schema 输出结果。';
        const schema = skill.schema;
        const prompt = [instruction, `【输入资料】\n${text}`].join('\n\n');

        const result = await runAgyPrompt({prompt, schema, model, signal});
        if (!result.success) {
          writeTraffic('任务处理失败', started, result.error);
          return {error: result.error};
        }
        writeTraffic('任务处理完成', started);
        return result.structuredOutput || {response: result.response};
      }

      // 默认回退
      const genericResult = await runAgyPrompt({prompt: text, model, signal});
      if (!genericResult.success) return {error: genericResult.error};
      return {kind: 'chat', reply: genericResult.response.trim()};
    } catch (err) {
      writeTraffic('异常终止', started, err.message);
      return {error: signal?.aborted ? 'LOCAL_AI_STOPPED' : 'AGY_CLI_FAILED'};
    } finally {
      busyCount--;
    }
  }

  async function work(text, options = {}) {
    if (closed || suspended) return {error: 'LOCAL_AI_STOPPED'};
    const started = performance.now();
    const {instruction = '', schema, signal, onProgress} = options;
    onProgress?.('AGY CLI 工作处理中…');

    const prompt = [instruction, `【任务内容】\n${text}`].filter(Boolean).join('\n\n');
    const result = await runAgyPrompt({prompt, schema, model, signal});

    if (!result.success) {
      writeTraffic('工作任务失败', started, result.error);
      return {error: result.error};
    }
    writeTraffic('工作任务完成', started);
    return result.structuredOutput || result.response;
  }

  async function memory(text, instruction, schema, signal, skill, meter) {
    meter?.begin();
    try {
      const result = await work(text, {instruction, schema, signal, skill});
      // 与本机 4B 一致：失败抛错，由任务队列按错误码重试或回退。
      if (result?.error) throw Object.assign(Error(String(result.error)), {code: String(result.error)});
      return result;
    } finally {
      meter?.end();
    }
  }

  async function withWorkSession(id, signal, run) {
    if (closed || suspended) throw Object.assign(Error('AGY CLI 已停用'), {code: 'LOCAL_AI_STOPPED'});
    const lease = Promise.withResolvers();
    workSession = {id, done: lease.promise};
    try {
      return await run((text, options) => work(text, {...options, session: id, signal}));
    } finally {
      workSession = null;
      lease.resolve();
    }
  }

  return {
    start,
    preheatConversation,
    analyze,
    work,
    memory,
    withWorkSession,
    reportsInference: true,
    canLoadTask: () => true,
    isBusy: () => Boolean(busyCount > 0 || workSession || suspended || closed),
    suspend: async () => { suspended = true; return true; },
    resume: () => { suspended = false; },
    close: () => { closed = true; conversation.close(); stopAgyStandby(); return Promise.resolve(); },
    standbyReady: () => agyStandbyReady(),
    conversation,
    snapshot: () => ({...status})
  };
}

/**
 * 诊断 AGY CLI 完整调用及解析流程（用于菜单测试模块）
 */
export async function testAgyCliPipeline({log} = {}) {
  const started = performance.now();

  // 1. 检查可执行文件与版本
  const check = await checkAgyAvailable();
  if (!check.available) {
    return {
      success: false,
      error: `未检测到 AGY CLI 可执行文件或无法启动：${check.error || 'ENOENT'}`,
      path: check.path
    };
  }

  // 2. 运行对话及角色解析测试
  const chatPrompt = [
    FEIYUE_PERSONA,
    '当前老公说：「老公今天敲代码好累呀，快抱抱我。」'
  ].join('\n\n');

  const chatRes = await runAgyPrompt({
    prompt: chatPrompt,
    schema: CHAT_INTENT_SCHEMA,
    timeoutMs: 30000
  });

  if (!chatRes.success) {
    return {
      success: false,
      error: `对话意图推理失败：${chatRes.error}`,
      path: check.path,
      version: check.version
    };
  }

  // 3. 运行结构化任务抽取测试
  const taskPrompt = '请解析任务要素：明天上午10点提醒我去交水电费。';
  const taskSchema = {
    type: 'object',
    properties: {
      action: {type: 'string', description: '行动'},
      time: {type: 'string', description: '时间'},
      category: {type: 'string', description: '分类'}
    },
    required: ['action', 'time', 'category'],
    additionalProperties: false
  };

  const taskRes = await runAgyPrompt({
    prompt: taskPrompt,
    schema: taskSchema,
    timeoutMs: 30000
  });

  if (!taskRes.success) {
    return {
      success: false,
      error: `结构化抽取失败：${taskRes.error}`,
      path: check.path,
      version: check.version
    };
  }

  const durationMs = Math.round(performance.now() - started);

  void log?.({
    direction: 'local',
    route: 'AGY CLI 菜单测试',
    stage: '管道测试通过',
    version: check.version,
    duration_ms: durationMs
  });

  return {
    success: true,
    path: check.path,
    version: check.version,
    durationMs,
    chatReply: chatRes.structuredOutput?.reply || chatRes.response.trim(),
    chatIntent: chatRes.structuredOutput?.kind,
    structuredData: taskRes.structuredOutput
  };
}

export {isAgyInstalled};
