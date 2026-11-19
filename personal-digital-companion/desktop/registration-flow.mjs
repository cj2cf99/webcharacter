import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isSubmissionId } from '../agent/tasks/submissions.mjs';

function chooseNode(chain) {
  const active = chain.nodes.filter(node => !node.skipped);
  const waiting = active.find(node => node.current_task.status === 'RUNNING');
  if (waiting) return { status: 'waiting', node: waiting };
  const failed = active.find(node => node.current_task.status === 'FAILED');
  if (failed) return { status: 'needs_decision', node: failed };
  const byId = new Map(chain.nodes.map(node => [node.node_id, node]));
  const next = active.find(node => {
    if (node.current_task.status !== 'PENDING') return false;
    let prerequisite = node.depends_on;
    while (prerequisite) {
      const required = byId.get(prerequisite);
      if (!required || (!required.skipped && required.current_task.status !== 'COMPLETED')) return false;
      prerequisite = required.depends_on;
    }
    return true;
  });
  return next ? { status: 'ready', node: next } : { status: 'blocked', node: null };
}

export function createRegistrationFlow({ profile, request, canStart = () => true, log = () => {} }) {
  const file = join(profile, 'registration-submission.json');
  let active = null;

  async function call(path, body) {
    if (!request) throw Error('未配置云端登记连接');
    if (!canStart()) throw Error('精灵暂时不能继续领取，登记请求已保留');
    const response = await request(path, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    let result;
    try { result = await response.json(); } catch { throw Error('云端登记回执无法读取，已保留原任务'); }
    if (!response.ok) throw Object.assign(new Error(result?.error?.message || '云端登记操作失败'), { code: result?.error?.code });
    return result;
  }

  async function load() {
    let saved;
    try { saved = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      throw Error('本地登记恢复记录无法读取');
    }
    if (!saved || !isSubmissionId(saved.submissionId) || !Array.isArray(saved.plan?.nodes)
      || !saved.plan.nodes.length || !Array.isArray(saved.pending) || typeof saved.created !== 'boolean') {
      throw Error('本地登记恢复记录无效');
    }
    return saved;
  }

  async function save(saved) {
    const draft = file + '.tmp';
    await writeFile(draft, JSON.stringify(saved), { encoding: 'utf8', mode: 0o600 });
    await rename(draft, file);
  }

  async function run(saved) {
    const path = `/api/chains/${saved.submissionId}`;
    function verify(chain) {
      if (chain?.chain_id !== saved.submissionId || chain.temporary_registration !== true || !Array.isArray(chain.nodes)) {
        throw Error('登记任务链回执无效，原提交号已保留');
      }
      return chain;
    }
    let chain;
    if (!saved.created) {
      chain = verify(await call('/api/chains', {
        ...saved.plan, temporary_registration: true, submission_id: saved.submissionId,
      }));
      saved.created = true;
      await save(saved);
    } else {
      chain = verify(await call(path));
      const pendingReceipt = chooseNode(chain);
      if (chain.status === 'ACTIVE' && pendingReceipt.status === 'waiting') {
        const taskId = pendingReceipt.node.current_task.task_id;
        await call(`/api/tasks/${encodeURIComponent(taskId)}/receipt`, {});
        chain = verify(await call(path));
      }
    }
    if (saved.decision) {
      const { path: decisionPath, body } = saved.decision;
      try {
        const receipt = await call(decisionPath, body);
        if (receipt?.acknowledged !== true || receipt.operation?.request_id !== body.request_id) {
          throw Error('操作回执无效，已保留原请求');
        }
      } catch (error) {
        const rejected = ['OLD_ROUND', 'REGISTRATION_BLOCKED', 'CLAIM_BLOCKED', 'OPERATION_CONFLICT', 'INVALID_DECISION'];
        if (!rejected.includes(error.code)) throw error;
        delete saved.decision;
        await save(saved);
        throw error;
      }
      delete saved.decision;
      await save(saved);
      chain = verify(await call(path));
    }
    while (canStart()) {
      if (chain.status === 'COMPLETED' || chain.status === 'STOPPED') {
        await unlink(file);
        return { status: chain.status === 'COMPLETED' ? 'completed' : 'stopped', chain, pending: saved.pending };
      }
      const next = chooseNode(chain);
      // 恢复阶段只查询原链。正在执行或回执不明的节点由服务器保留，客户端不会重新发起写入。
      if (next.status !== 'ready') return { ...next, chain, pending: saved.pending };
      const taskId = next.node.current_task.task_id;
      try {
        const receipt = await call(`/api/tasks/${encodeURIComponent(taskId)}/execute`, {});
        if (receipt?.task_id !== taskId) throw Error('登记节点回执无效，原任务已保留');
      } catch (error) {
        if (error?.code !== 'REGISTRATION_BLOCKED') throw error;
        chain = verify(await call(path));
        return { status: 'waiting', chain, pending: saved.pending };
      }
      chain = verify(await call(path));
    }
    return { status: 'paused', chain, pending: saved.pending };
  }

  function once(text, action) {
    if (active) {
      if (action === undefined && (active.text === text || text === undefined)) return active.promise;
      return Promise.reject(Error('已有登记正在进行'));
    }
    const promise = (async () => {
      const saved = await load();
      if (saved) {
        if (text !== undefined) throw Error('已有登记链待处理，请先恢复原链');
        if (action !== undefined && !saved.decision) {
          if (!saved.created) throw Error('请先恢复原登记链');
          const path = `/api/chains/${saved.submissionId}`;
          const chain = await call(path);
          if (chain.chain_id !== saved.submissionId || chain.temporary_registration !== true) throw Error('登记任务链回执无效');
          const { status, node } = chooseNode(chain);
          if (chain.status !== 'ACTIVE' || (action !== 'stop' && status !== 'needs_decision')) {
            throw Error('任务链状态已改变，请先恢复原链');
          }
          const requestId = crypto.randomUUID();
          saved.decision = action === 'stop' ? {
            path: `${path}/stop`, body: { request_id: requestId },
          } : {
            path: `${path}/nodes/${node.node_id}/decision`,
            body: { action, expected_task_id: node.current_task.task_id, request_id: requestId,
              ...(action === 'continue' ? { new_task_id: crypto.randomUUID() } : {}) },
          };
          await save(saved);
        }
        return run(saved);
      }
      if (text === undefined) {
        if (action !== undefined) throw Error('没有待处理的登记链');
        return null;
      }
      const planned = await call('/api/assistant/recording-plan', { text });
      if (!Array.isArray(planned?.pending)) throw Error('AI 登记计划回执无效');
      if (planned.chain === null) return { status: 'needs_input', chain: null, pending: planned.pending };
      if (!Array.isArray(planned.chain?.nodes) || !planned.chain.nodes.length) throw Error('AI 登记计划回执无效');
      const issued = await call('/api/task-submissions', {});
      if (!isSubmissionId(issued?.submission_id)) throw Error('登记提交号回执无效');
      const next = { submissionId: issued.submission_id, plan: planned.chain, pending: planned.pending, created: false };
      await save(next);
      const traceId = planned.ai?.trace_id;
      void log({direction: 'local', event: 'registration_prepared', chain_id: next.submissionId,
        ...(isSubmissionId(traceId) ? {ai_trace_id: traceId} : {})});
      return run(next);
    })();
    active = { text, promise };
    void promise.finally(() => { active = null; }).catch(() => {});
    return promise;
  }

  return {
    submit(text) {
      if (typeof text !== 'string' || !text.trim()) return Promise.reject(Error('请输入登记内容'));
      return once(text.trim());
    },
    resume: () => once(),
    decide(action) {
      if (!['continue', 'skip', 'stop'].includes(action)) return Promise.reject(Error('登记操作无效'));
      return once(undefined, action);
    },
    activeCount: () => active ? 1 : 0,
  };
}
