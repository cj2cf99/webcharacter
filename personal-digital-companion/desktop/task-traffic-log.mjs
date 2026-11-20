import {appendFile, rename, stat} from 'node:fs/promises';
import {join} from 'node:path';

const timestamp = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium'});
const id = value => typeof value === 'string' && /^[a-z0-9_-]{1,128}$/i.test(value) ? value : undefined;
const word = value => typeof value === 'string' && /^[a-z0-9_./@:-]{1,128}$/i.test(value) ? value : undefined;
const peek = value => {
  try { return JSON.parse(value); } catch { return null; }
};
function taskSummary(task) {
  const record = task?.result?.record_id;
  return {task_id: id(task?.task_id), type: word(task?.type), status: word(task?.status),
    chain_id: id(task?.chain?.chain_id), attempt_count: Number.isSafeInteger(task?.attempt_count) ? task.attempt_count : undefined,
    record_id: Number.isSafeInteger(record) ? record : id(record)};
}
function responseSummary(body) {
  const chain = body?.chain ?? body;
  const tasks = body?.tasks ?? body?.items ?? (Array.isArray(chain?.nodes) ? chain.nodes.map(node => node.current_task) : undefined);
  return {
    task: body?.task?.task_id || body?.task_id ? taskSummary(body.task ?? body) : undefined,
    chain_id: id(chain?.chain_id), submission_id: id(body?.submission_id), operation_id: id(body?.operation?.request_id),
    task_count: Array.isArray(tasks) ? tasks.length : undefined,
    tasks: Array.isArray(tasks) ? tasks.slice(0, 64).map(taskSummary) : undefined,
    error: word(body?.error?.code),
    ai: Array.isArray(body?.ai?.attempts) ? {trace_id: id(body.ai.trace_id),
      preferred_provider: word(body.ai.preferred_provider),
      preference_saved: body.ai.preference_saved === false ? false : undefined,
      attempts: body.ai.attempts.slice(0, 32).map(attempt => ({
        provider: word(attempt?.provider), model: word(attempt?.model), code: word(attempt?.code),
        stage:word(attempt?.stage),at:Number.isSafeInteger(attempt?.at)?attempt.at:undefined,
        upstream_status: Number.isSafeInteger(attempt?.upstream_status) ? attempt.upstream_status : undefined,
        provider_code: Number.isSafeInteger(attempt?.provider_code) ? attempt.provider_code : undefined,
        duration_ms: Number.isSafeInteger(attempt?.duration_ms) ? attempt.duration_ms : undefined,
      }))} : undefined,
  };
}

export function createTaskTrafficLog(profile, {maxBytes = 2 * 1024 * 1024, clock = Date.now} = {}) {
  const file = join(profile, 'task-traffic.jsonl');
  let pending = Promise.resolve();
  let failed = false;
  function write(event) {
    const time = timestamp.format(clock()).replace(' ', 'T') + '+09:00';
    pending = pending.then(async () => {
      const line = JSON.stringify({time, ...await event}) + '\n';
      const size = await stat(file).then(info => info.size, error => {
        if (error.code === 'ENOENT') return 0;
        throw error;
      });
      if (size && size + Buffer.byteLength(line) > maxBytes) await rename(file, join(profile, 'task-traffic.previous.jsonl'));
      await appendFile(file, line, {encoding: 'utf8', mode: 0o600});
    }).catch(() => { failed = true; });
    return pending;
  }
  return {
    file, write, flush: () => pending, failed: () => failed,
    wrap(request) {
      return async (path, options = {}) => {
        // The query can hold filters and headers carry credentials. Record identifiers and statuses only.
        const route = path.split('?')[0];
        if (!/^\/api\/(?:tasks(?:\/|$)|devices(?:\/|$)|chains(?:\/|$)|task-submissions$|assistant\/(?:recording-plan|heartbeat)$|reminder-review(?:\/|$))/.test(route)) {
          return request(path, options);
        }
        const request_id = crypto.randomUUID();
        const start = clock();
        const requestBody = peek(options.body);
        const event = {request_id, route, method: options.method ?? 'GET'};
        void write({...event, direction: 'send', submission_id: id(requestBody?.submission_id),
          operation_id: id(requestBody?.request_id), task_status: word(requestBody?.status),
          task_id: id(requestBody?.expected_task_id), action: word(requestBody?.action)});
        let response;
        try { response = await request(path, options); }
        catch (error) {
          void write({...event, direction: 'receive', error: word(error?.code) ?? 'CONNECTION_ERROR', duration_ms: clock() - start});
          throw error;
        }
        const duration_ms = clock() - start;
        const summary = response.clone().json().catch(() => null).then(body => ({
          ...event, direction: 'receive', status: response.status, duration_ms, ...responseSummary(body),
          ...(route==='/api/assistant/heartbeat'?{heartbeat:word(body?.status),provider:word(body?.provider)}:{}),
        }));
        void write(summary);
        return response;
      };
    },
  };
}
