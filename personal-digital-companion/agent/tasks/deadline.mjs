export const DEADLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

// 显式时区、真实日历日期；不依赖运行主机时区或Date对不存在日期的自动归一。
export function normalizeDeadline(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('截止时间必须是明确时区的ISO时间');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new Error('截止时间必须是明确时区的ISO时间');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', , zone, , zoneHour = '0', zoneMinute = '0'] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59
    || (zone !== 'Z' && (Number(zoneHour) > 23 || Number(zoneMinute) > 59))) {
    throw new Error('截止时间不是有效日期或时区');
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error('截止时间无效');
  const normalized = new Date(milliseconds).toISOString();
  if (!/^\d{4}-/.test(normalized)) throw new Error('截止时间年份超出支持范围');
  return normalized;
}

export function canClaim(task, now = Date.now()) {
  if (task.status !== 'PENDING' || task.type === 'disk.query') return false;
  return task.deadline_at === null || task.deadline_at === undefined
    || now < Date.parse(task.deadline_at) + DEADLINE_GRACE_MS;
}
