// 返回可与任务状态变化一起batch提交的条件写，不独立刷新设备在线状态。
export function activityStatement(DB, { taskId, deviceId, at, event, message = null, finished = false }) {
  const condition = finished ? "t.status IN ('COMPLETED', 'FAILED')" : "t.status = 'RUNNING'";
  return DB.prepare(`INSERT INTO task_activity (task_id, updated_at, event, progress_message)
    SELECT t.task_id, ?, ?, ? FROM tasks t
    WHERE t.task_id = ? AND t.target_device_id = ? AND ${condition}
    ON CONFLICT(task_id) DO UPDATE SET updated_at = excluded.updated_at,
      event = excluded.event, progress_message = excluded.progress_message`)
    .bind(at, event, message, taskId, deviceId);
}
