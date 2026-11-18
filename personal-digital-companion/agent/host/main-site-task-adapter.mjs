import { validateParameters } from '../tasks/parameters.mjs';

// 受信任的业务接口表。D1 存参数定义和说明，不提供运行地址或代码。
const operations = {
  'records.create': {
    path: '/api/records',
    body: ({ body, category_id }) => ({ body: body.trim(), category_id, tag_ids: [], photos: [] }),
    recordId: response => typeof response?.id === 'string' && response.id.trim() ? response.id : null,
  },
  'reminders.create': {
    path: '/api/reminders',
    body: ({ title, content = '', deadline, level = '中' }) => {
      if (deadline !== undefined) {
        const day = new Date(`${deadline}T00:00:00Z`);
        if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== deadline) {
          throw new Error('提醒日期无效');
        }
      }
      return { title: title.trim(), content, deadline: deadline ?? null, level };
    },
    recordId: response => Number.isSafeInteger(response?.item?.seq) && response.item.seq > 0 ? response.item.seq : null,
  },
};

// 接入者必须提供能够按同一个键找回原回执的写入函数。此模块没有默认网络行为。
export function prepareMainSiteTask(task) {
  const operation = Object.hasOwn(operations, task?.type) ? operations[task.type] : null;
  if (!operation || task.definition?.executor !== 'cloud' || task.target_device_id !== null
      || typeof task.task_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(task.task_id)) {
    throw new Error('任务尚未配置主站适配或目标无效');
  }
  if (!validateParameters(task.definition.parameter_spec, task.params).valid) {
    throw new Error('任务参数不符合模板');
  }
  return { path: operation.path, body: operation.body(task.params) };
}

export async function executeMainSiteTask(task, writeOnce) {
  const operation = prepareMainSiteTask(task);
  const response = await writeOnce({ ...operation, idempotencyKey: task.task_id });
  const recordId = operations[task.type].recordId(response);
  if (recordId === null) throw new Error('未取得有效业务回执');
  return { record_id: recordId };
}
