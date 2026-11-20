import {recordPlannerHours, validPlannerHours} from '../host/reminder-review.mjs';

export const plannerHoursType = 'planner.hours.record';

export function validatePlannerTask({reminderId, actualHours}) {
  if (!Number.isSafeInteger(reminderId) || reminderId < 1 || !validPlannerHours(actualHours)) {
    throw Error('提醒编号或实际投入小时数无效。');
  }
}

export async function readPlannerReceipt(host, {reminderId, dispatchId, actualHours, today}) {
  const row = await host.reviewReminderStatus(reminderId);
  const record = row?.plannerRecord;
  if (row?.id !== reminderId || row.deadline?.slice(0, 10) !== today || record?.dispatchId !== dispatchId
    || record.actualHours !== actualHours || !Number.isFinite(Date.parse(record.recordedAt))) return null;
  return {record_id: dispatchId, actualHours, recordedAt: record.recordedAt};
}

export async function executePlannerTask(host, params) {
  const {reminderId, dispatchId, today, version, actualHours} = params;
  const reject = message => Object.assign(Error(message), {code: 'PLANNER_REJECTED'});
  let row;
  try { row = await host.reviewReminderStatus(reminderId); }
  catch { throw reject('未能读取主站派发，本次工时尚未提交。'); }
  if (row?.error || !row) {
    if (row?.status === 404) throw reject('主站未找到此计划任务。');
    throw reject('未能读取主站派发，本次工时尚未提交。');
  }
  if (row.id !== reminderId || row.today !== today || row.version !== version || row.plannerWork?.dispatchId !== dispatchId) {
    throw reject('计划派发或日期已变化，请刷新今日任务。');
  }
  const response = await host.changeReviewReminder(reminderId, {action: recordPlannerHours, today, version, actualHours});
  if (response?.error && response.status >= 400 && response.status < 500 && response.status !== 408) {
    throw reject(response.error);
  }
  const result = await readPlannerReceipt(host, params);
  if (!result) throw Error('主站登记结果待核对。');
  return result;
}
