import {stat} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chatTotalMs} from './chat-budget.mjs';

export const LOCAL_MODEL_FILE = 'Qwen3.5-0.8B-Q4_K_M.gguf';
const entry = fileURLToPath(new URL('./local-model-process.mjs', import.meta.url));
export function createLocalModel({utilityProcess, modelPath, log, loadTimeout = 15000,device='cpu',intentBudgetMs=6500}) {
  const modelName=basename(modelPath).replace(/-Q4_K_M\.gguf$/i,'');
  let status = {state: 'idle'};
  let child, loading, finishLoad, request, loadTimer, exited;
  const write = (stage, start, error, skill) => {
    void log?.({direction:'local',route:'本地 AI',stage,model:modelName,duration_ms:Math.round(performance.now()-start),error,
      ...(skill?.name&&skill.version?{skill:skill.name,skill_version:skill.version}:{})});
  };

  function start() {
    if (status.state !== 'idle') return loading;
    const started = performance.now();
    status = {state:'loading'};
    loading = new Promise(resolve => {
      finishLoad = (state, error, details) => {
        clearTimeout(loadTimer);
        if (status.state !== 'loading') return;
        const durationMs = Math.round(performance.now()-started);
        status = {state, durationMs, ...details, ...(error ? {error} : {})};
        if (state !== 'stopped') write(state === 'ready' ? '模型已就绪 · '+status.backend : '模型加载失败', started, error);
        resolve();
      };
    });
    loadTimer = setTimeout(() => {
      finishLoad('unavailable','LOCAL_AI_LOAD_TIMEOUT');
      child?.kill();
    }, loadTimeout);
    loadTimer.unref?.();

    void (async () => {
      try {
        if (!(await stat(modelPath)).isFile()) throw Object.assign(Error(), {code:'ENOENT'});
        if (status.state !== 'loading') return;
        const worker = utilityProcess.fork(entry,[modelPath,device],{serviceName:'Feiyue Local AI',stdio:'ignore'});
        child = worker;
        exited=new Promise(resolve=>worker.once('exit',resolve));
        worker.on('message', value => {
          if (child !== worker) return;
          if (value?.type === 'ready') finishLoad('ready',undefined,{backend:value.backend,gpuLayers:value.gpuLayers,vramMiB:value.vramMiB});
          if (value?.type === 'load-error') {
            finishLoad('unavailable',value.code);
            worker.kill();
          }
          if (request && value?.id === request.id) request.message(value);
        });
        worker.once('exit', () => {
          if (child !== worker) return;
          child = null;
          finishLoad('unavailable','LOCAL_AI_PROCESS_EXITED');
          if (status.state === 'ready') {
            status = {state:'unavailable',error:'LOCAL_AI_PROCESS_EXITED'};
            write('本地进程已退出',performance.now(),status.error);
          }
          request?.finish({error:'LOCAL_AI_PROCESS_EXITED'});
        });
      } catch (error) {
        finishLoad('unavailable',error?.code === 'ENOENT' ? 'LOCAL_AI_MODEL_MISSING' : 'LOCAL_AI_START_FAILED');
      }
    })();
    return loading;
  }

  async function analyze(text, {hint, previous, signal, onProgress, imageSkill,skillInstruction,replyMode,reviewLimit=3,revision} = {}) {
    const started = performance.now();
    const budgetMs = hint==='personalityMemory'?120000:['image-plan','serverTask'].includes(hint) ? Math.max(16000,intentBudgetMs) : ['auto','direct'].includes(hint) ? chatTotalMs : intentBudgetMs;
    const deadline = AbortSignal.timeout(budgetMs);
    const wait = signal ? AbortSignal.any([signal,deadline]) : deadline;
    signal?.throwIfAborted();
    onProgress?.('本地思索 · 理解输入…');
    let result;
    if (status.state === 'loading') {
      await new Promise(resolve => {
        const done = () => {wait.removeEventListener('abort',done);resolve();};
        wait.addEventListener('abort',done,{once:true});
        void loading.then(done);
      });
    }
    if (wait.aborted) result = {error:'LOCAL_AI_TIMEOUT'};
    else if (!child || status.state !== 'ready') result = {error:status.error ?? 'LOCAL_AI_NOT_READY'};
    else if (request) result = {error:'LOCAL_AI_BUSY'};
    else result = await new Promise(resolve => {
      const id = crypto.randomUUID();
      const worker = child;
      const finish = value => {
        if (request?.id !== id) return;
        wait.removeEventListener('abort',abort);
        request = null;
        resolve(value);
      };
      const abort = () => {
        try {worker.postMessage({type:'cancel',id});} catch {}
        finish({error:'LOCAL_AI_TIMEOUT'});
      };
      request = {id,finish,message(value) {
        if (value.type === 'review') onProgress?.(`本地思索 · 复核 ${value.pass}/2…`);
        if (value.type === 'answer-review') onProgress?.(`本地思索 · 回复自审 ${value.pass}/${reviewLimit}…`);
        if (value.type === 'answer-rewrite') onProgress?.(`本地思索 · 按反馈重写 ${value.pass}/${reviewLimit}…`);
        if (value.type === 'result') finish(value.result);
      }};
      wait.addEventListener('abort',abort,{once:true});
      try {
        worker.postMessage({type:'analyze',id,text,hint,previous,imageSkill,skillInstruction,replyMode,reviewLimit,revision,remainingMs:Math.max(1, Math.floor(budgetMs-(performance.now()-started)))});
      } catch {
        finish({error:'LOCAL_AI_PROCESS_EXITED'});
      }
    });
    if (signal?.aborted) {
      write('思索取消',started,undefined,skillInstruction);
      signal.throwIfAborted();
    }
    write(result?.error ? '思索后继续处理' : '思索完成', started, result?.error,skillInstruction);
    return result ?? {error:'LOCAL_AI_RESULT_INVALID'};
  }

  function close() {
    finishLoad?.('stopped');
    status = {state:'stopped'};
    request?.finish({error:'LOCAL_AI_STOPPED'});
    const worker = child;
    child = null;
    worker?.kill();
    return exited;
  }

  return {start,analyze,close,snapshot:()=>({...status,model:modelName})};
}

export function desktopModelPath(app, root) {
  return join(app.isPackaged ? process.resourcesPath : join(root,'desktop'),'models',LOCAL_MODEL_FILE);
}
