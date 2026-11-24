import {stat} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const LOCAL_MODEL_FILE = 'Qwen3.5-4B-Q4_K_M.gguf';
const entry = fileURLToPath(new URL('./local-model-process.mjs', import.meta.url));
export function createLocalModel({utilityProcess, modelPath, log, loadTimeout = 15000,device='cpu',threads=4}) {
  const modelName=basename(modelPath).replace(/-Q4_K_M\.gguf$/i,'');
  let status = {state: 'idle'};
  let child, loading, finishLoad, request, loadTimer, exited;
  const write = (stage, start, error, skill, timing) => {
    void log?.({direction:'local',route:'本地 AI',stage,model:modelName,duration_ms:Math.round(performance.now()-start),error,
      ...(skill?.aiAttemptId?{ai_attempt_id:skill.aiAttemptId}:{}),
      ...(skill?.aiKind?{ai_kind:skill.aiKind}:{}),
      ...timing,...(skill?.stage?{ai_phase:skill.stage}:{}),...(skill?.name==='memory-refinement'&&skill.stage?{refinement_phase:skill.stage}:{}),
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
        const worker = utilityProcess.fork(entry,[modelPath,device,String(threads)],{serviceName:'Feiyue Local AI',stdio:'ignore'});
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

  async function analyze(text, {hint, previous, signal, onProgress, skillInstruction,replyMode} = {}) {
    const started = performance.now();
    signal?.throwIfAborted();
    onProgress?.('本地思索 · 理解输入…');
    let result,timing;
    if (status.state === 'loading') {
      await new Promise(resolve => {
        const done = () => {signal?.removeEventListener('abort',done);resolve();};
        signal?.addEventListener('abort',done,{once:true});
        void loading.then(done);
      });
    }
    signal?.throwIfAborted();
    if (!child || status.state !== 'ready') result = {error:status.error ?? 'LOCAL_AI_NOT_READY'};
    else if (request) result = {error:'LOCAL_AI_BUSY'};
    else result = await new Promise(resolve => {
      const id = crypto.randomUUID();
      const worker = child;
      let cancelTimer;
      const finish = value => {
        if (request?.id !== id) return;
        clearTimeout(cancelTimer);
        signal?.removeEventListener('abort',abort);
        request = null;
        resolve(value);
      };
      const abort = () => {
        // Wait for the stopped generation to release the sequence before reusing it.
        cancelTimer = setTimeout(() => void close(),1000);
        cancelTimer.unref?.();
        try {worker.postMessage({type:'cancel',id});}
        catch {void close();}
      };
      request = {id,finish,message(value) {
        if (value.type === 'review') onProgress?.(`本地思索 · 复核 ${value.pass}/2…`);
        if (value.type === 'refinement-timing') timing=value.timing;
        if (value.type === 'result') finish(value.result);
      }};
      signal?.addEventListener('abort',abort,{once:true});
      try {
        worker.postMessage({type:'analyze',id,text,hint,previous,skillInstruction,replyMode});
      } catch {
        finish({error:'LOCAL_AI_PROCESS_EXITED'});
      }
    });
    if (signal?.aborted) {
      write('思索取消',started,undefined,skillInstruction,timing);
      signal.throwIfAborted();
    }
    write(result?.error ? '思索后继续处理' : '思索完成', started, result?.error,skillInstruction,timing);
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
