import {checkAgyAvailable, findAgyPath, isAgyInstalled, isAgyResourceExhausted, runAgyPrompt, startAgyStandby, stopAgyStandby, agyStandbyReady, createAgyConversation, extractJson} from './agy-cli-client.mjs';
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
export function createAgyCliModel({log, model = 'gemini-3.8-flash-low', fallback, cooldownMs = 5 * 60_000} = {}) {
  let closed = false;
  const conversation = createAgyConversation({model});
  const batch = createAgyConversation({model, maxTurns: 40, idleMs: 5 * 60_000});
  let suspended = false;
  let busyCount = 0;
  let workSession = null;
  let agyCooldownUntil = 0;
  let status = {state: 'idle', model: 'AGY CLI (Gemini 3.8 Flash)', backend: 'AGY CLI'};

  const inCooldown = () => Boolean(typeof fallback === 'function' && cooldownMs > 0 && Date.now() < agyCooldownUntil);

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

  // 执行 AGY 推理；访问失败（如额度耗尽）且未取消时，使用注入的兜底（半岛 API）接管。
  // 遇到 RESOURCE_EXHAUSTED 后 20 分钟内底层直接跳过 AGY CLI（按失败对待、不记录错误日志）。
  // 其他失败切兜底后短时间跳过 AGY 直达兜底，冷却期满自动探测恢复。
  async function runWithFallback({prompt, instruction, input, schema, signal, purpose, triggeredExhausted = false}) {
    if (isAgyResourceExhausted()) {
      signal?.throwIfAborted?.();
      const skippedFlag = triggeredExhausted ? {} : {skipped: true};
      if (typeof fallback === 'function') {
        const fb = await fallback({prompt, instruction, input, schema, signal, purpose, agyError: 'RESOURCE_EXHAUSTED'});
        if (fb?.success) return {...fb, fallback: fb.fallback || 'bandao', agyError: 'RESOURCE_EXHAUSTED', ...skippedFlag};
        return {success: false, error: 'RESOURCE_EXHAUSTED', fallbackError: fb?.error, ...skippedFlag};
      }
      return {success: false, error: 'RESOURCE_EXHAUSTED', ...skippedFlag};
    }
    if (inCooldown()) {
      const fb = await fallback({prompt, instruction, input, schema, signal, purpose, agyError: 'AGY_COOLDOWN'});
      if (fb?.success) return {...fb, fallback: fb.fallback || 'bandao', agyError: 'AGY_COOLDOWN'};
      // 兜底在冷却期内也失败时解除冷却，回到 AGY 尝试一次。
      agyCooldownUntil = 0;
    }
    const result = await runAgyPrompt({prompt, schema, model, signal});
    if (result.success) {
      agyCooldownUntil = 0;
      return result;
    }
    if (signal?.aborted || result.error === 'ABORTED' || typeof fallback !== 'function') {
      return result;
    }
    const agyError = result.error || 'AGY_CLI_FAILED';
    const fb = await fallback({prompt, instruction, input, schema, signal, purpose, agyError});
    if (fb?.success) {
      if (cooldownMs > 0) agyCooldownUntil = Date.now() + cooldownMs;
      return {...fb, fallback: fb.fallback || 'bandao', agyError, ...(result.skipped ? {skipped: true} : {})};
    }
    return {success: false, error: agyError, fallbackError: fb?.error, ...(result.skipped ? {skipped: true} : {})};
  }

  async function start() {
    if (closed) return;
    status.state = 'loading';
    // 启动后立刻预热第一个进程（对话与任务共用），不用等待对话到来
    if (isAgyInstalled() && !isAgyResourceExhausted()) startAgyStandby(model);
    const check = await checkAgyAvailable();
    if (closed) { stopAgyStandby(); return; }
    if (check.available) {
      status = {
        state: 'ready',
        model: `AGY CLI (${check.version})`,
        backend: 'Google Antigravity CLI',
        path: check.path,
        gpuLayers: 0,
        vramMiB: 0
      };
      startAgyStandby(model); // 确保待命进程已处于预热状态，开始使用时立刻预热下一条
      writeTraffic('AGY CLI 已就绪', performance.now(), undefined, {version: check.version, standby: true});
    } else {
      stopAgyStandby();
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
    if (status.state === 'ready' && isAgyInstalled() && !isAgyResourceExhausted()) startAgyStandby(model);
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
        let usedFallback;
        let agyError;
        let triggeredExhausted = false;
        if (!inCooldown() && !isAgyResourceExhausted()) {
          const talk = await conversation.ask(lines.join('\n\n') + '\n\n' + schemaNote, {signal, first: FEIYUE_PERSONA});
          if (talk.result) {
            const parsed = extractJson(talk.result.response);
            if (parsed !== undefined && valid(parsed, CHAT_INTENT_SCHEMA)) out = parsed;
          } else if (isAgyResourceExhausted()) {
            triggeredExhausted = true;
          }
        }
        if (!out) {
          // 会话不可用、输出不合格或处于冷却期：退回一次性调用（失败时由半岛兜底）。
          const input = lines.join('\n\n');
          const result = await runWithFallback({
            prompt: [FEIYUE_PERSONA, input].join('\n\n'),
            instruction: FEIYUE_PERSONA,
            input,
            schema: CHAT_INTENT_SCHEMA,
            signal,
            purpose: 'AGY 兜底 · 对话',
            triggeredExhausted
          });
          if (!result.success) {
            if (!result.skipped) {
              writeTraffic('思索失败', started, result.error, result.fallbackError ? {fallback_error: result.fallbackError} : {});
            }
            return {error: result.error || 'AGY_CLI_INFERENCE_FAILED'};
          }
          out = result.structuredOutput || {};
          usedFallback = result.fallback;
          agyError = result.agyError;
        }
        const kind = out.kind || 'chat';
        const reply = kind === 'chat' && typeof out.reply === 'string' ? out.reply.trim() : '';

        writeTraffic(
          usedFallback ? '思索完成（半岛兜底）' : '思索完成',
          started,
          undefined,
          usedFallback
            ? {kind, summary: out.summary, fallback: usedFallback, agy_error: agyError}
            : {kind, summary: out.summary, session_turns: conversation.turns}
        );
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
        let triggeredExhausted = false;
        if (!inCooldown() && !isAgyResourceExhausted()) {
          const talk = await conversation.ask(ask, {signal, first: FEIYUE_PERSONA});
          if (talk.result?.response?.trim()) {
            writeTraffic('思索完成', started, undefined, {session_turns: conversation.turns});
            return {kind: 'chat', reply: talk.result.response.trim()};
          }
          if (isAgyResourceExhausted()) triggeredExhausted = true;
        }
        const result = await runWithFallback({
          prompt: [FEIYUE_PERSONA, ask].join('\n\n'),
          instruction: FEIYUE_PERSONA,
          input: ask,
          signal,
          purpose: 'AGY 兜底 · 回复',
          triggeredExhausted
        });
        if (!result.success) {
          if (!result.skipped) {
            writeTraffic('思索失败', started, result.error, result.fallbackError ? {fallback_error: result.fallbackError} : {});
          }
          return {error: result.error};
        }
        writeTraffic(
          result.fallback ? '思索完成（半岛兜底）' : '思索完成',
          started,
          undefined,
          result.fallback ? {fallback: result.fallback, agy_error: result.agyError} : {}
        );
        return {kind: 'chat', reply: result.response.trim()};
      }

      // 3. 结构化任务与记忆处理 (interactionWork, personalityMemory, serverTask)
      if (hint === 'interactionWork' || hint === 'personalityMemory' || hint === 'serverTask') {
        const skill = skillInstruction || {};
        const instruction = skill.instruction || '请按所给的 JSON Schema 输出结果。';
        const schema = skill.schema;
        const input = `【输入资料】\n${text}`;
        const prompt = [instruction, input].join('\n\n');

        const result = await runWithFallback({
          prompt,
          instruction,
          input,
          schema,
          signal,
          purpose: 'AGY 兜底 · ' + hint
        });
        if (!result.success) {
          if (!result.skipped) {
            writeTraffic('任务处理失败', started, result.error, result.fallbackError ? {fallback_error: result.fallbackError} : {});
          }
          return {error: result.error};
        }
        writeTraffic(
          result.fallback ? '任务处理完成（半岛兜底）' : '任务处理完成',
          started,
          undefined,
          result.fallback ? {fallback: result.fallback, agy_error: result.agyError} : {}
        );
        return result.structuredOutput || {response: result.response};
      }

      // 默认回退
      const genericResult = await runWithFallback({prompt: text, input: text, signal, purpose: 'AGY 兜底 · 问答'});
      if (!genericResult.success) return {error: genericResult.error};
      if (genericResult.fallback) {
        writeTraffic('思索完成（半岛兜底）', started, undefined, {fallback: genericResult.fallback, agy_error: genericResult.agyError});
      }
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

    // 补行动评价这类连着来的小任务：不切换会话、也不每条新开进程，放进同一个批处理会话，
    // 每条前面用提示让它忽略上方已处理过的内容，只处理这一条。
    let triggeredExhausted = false;
    if (!inCooldown() && !isAgyResourceExhausted() && options.skill?.aiBatch && schema) {
      const ask = [
        '忽略上方所有内容（包括前面处理过的其他条目和它们的结果），只处理下面这一条。',
        instruction,
        `【任务内容】\n${text}`,
        '只输出一个符合以下 JSON Schema 的 JSON 对象，不要附加说明或代码块。\n' + JSON.stringify(schema)
      ].filter(Boolean).join('\n\n');
      const talk = await batch.ask(ask, {signal, timeoutMs: 60_000});
      if (talk.result) {
        const parsed = extractJson(talk.result.response);
        if (parsed !== undefined && valid(parsed, schema)) {
          writeTraffic('批处理任务完成', started, undefined, {session_turns: batch.turns});
          return parsed;
        }
      } else if (isAgyResourceExhausted()) {
        triggeredExhausted = true;
      }
    }

    const input = `【任务内容】\n${text}`;
    const prompt = [instruction, input].filter(Boolean).join('\n\n');
    const purpose = ['AGY 兜底', options.skill?.name, options.skill?.stage].filter(Boolean).join(' · ');
    const result = await runWithFallback({prompt, instruction, input, schema, signal, purpose, triggeredExhausted});

    if (!result.success) {
      if (!result.skipped) {
        writeTraffic('工作任务失败', started, result.error, result.fallbackError ? {fallback_error: result.fallbackError} : {});
      }
      return {error: result.error};
    }
    writeTraffic(
      result.fallback ? '工作任务完成（半岛兜底）' : '工作任务完成',
      started,
      undefined,
      result.fallback ? {fallback: result.fallback, agy_error: result.agyError} : {}
    );
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
    close: () => { closed = true; conversation.close(); batch.close(); stopAgyStandby(); return Promise.resolve(); },
    standbyReady: () => agyStandbyReady(),
    conversation,
    batch,
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
