# 任务活动与设备多任务列表：非界面交接

2026-11-18 JST。现行需求见REQUIREMENT_CHANGES.md及AGENT_BATCH_05_REVISED_DESIGN.md。本次只有API与D1记录，不含界面、接收新任务开关、心跳、在线状态或独立设备凭据。

## 设备概况与按需列表

GET /api/devices原设备字段保留，每项新增：

```json
{
  "task_summary": {
    "active_count": 2,
    "last_task_update": "2026-11-18T03:00:00.000Z"
  }
}
```

active_count为该设备PENDING+RUNNING总数，不限制任务数量；last_task_update为关联任务活动的MAX时间。无活动为null，无未结束任务为0；时间多久没有变化也不推断离线或任务失败。读取此接口不会刷新时间。

用户展开某设备时请求GET /api/devices/:id/tasks?offset=0，返回：

```json
{
  "device": { "device_id": "pc-固定UUID", "computer_name": "电脑说明", "alias": "homepc", "created_at": "UTC ISO时间", "display_name": "homepc" },
  "tasks": [{ "task_id": "任务ID", "type": "任务类型", "name": "任务名称", "status": "RUNNING", "attempt_count": 0, "created_at": "UTC ISO时间", "updated_at": "UTC ISO时间或null", "progress_message": "已读取输入" }],
  "next_offset": null
}
```

每页最多50条，服务端多读第51条判断next_offset；非null时按给定offset读取后续。未结束任务优先，然后按最近活动时间（无活动则创建时间）倒序及task_id固定顺序。所有状态的任务保留在列表。offset是非负安全整数，未知/重复查询字段拒绝。分页用于按需读取历史，不限制创建或领取数量；数据变化时刷新第一页，静态分页保证无遗漏。

列表不含params/result/executions；点击任务后GET /api/tasks/:id读取原详情。该详情新增activity为null或{updated_at,event,progress_message}；event只有claim/progress/result。设备改名后仍按固定ID关联。

## 显式进度上报

宿主已有认证request可按实际阶段调用：

```js
await request(`/api/tasks/${taskId}/progress`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ device_id: deviceId, message: '已读取输入' })
});
```

仍沿用既有开发Bearer边界，示例不包含秘密。body只接受device_id/message；message去首尾空白后1..200 Unicode字符，无控制字符。只接受目标匹配且RUNNING的PC任务，不接受客户端时间、百分比、状态或次数。

成功响应{task_id,updated_at,progress_message}；服务端记录UTC接收时间，不改status/attempt_count、不创建execution。错误目标/非RUNNING为409，未知404，格式400，未认证401，错误方法405，内部失败500。失败不自动重试或伪造进度，页面/宿主可显式处理；本轮不增加可靠文本进度队列。

## 更新时间规则

- 有效claim（含对已RUNNING同目标的再次核对）：event=claim，清空progress_message。
- 有效progress：event=progress，保存最新说明，覆盖旧快照。
- 有效result（含完全相同回执补传）：event=result，清空progress_message；不重复执行记录。
- 创建任务、读取详情/列表、改名、终端认领均不写activity。无效/冲突报告也不刷新时间。

例：homepc拥有A、B两条任务，概况可同时为2。A上报进度后仅A的快照变化；A完成后历史仍可看，active_count降为1。B几小时无更新只显示最后时间，不判离线或失败。

数据库保存UTC ISO；界面必须用Asia/Tokyo（JST）展示日期时间。null显示“暂无任务更新”等简短文本，不能用当前时间补齐。列表加载/空态/失败重试由界面线接线，不在本次生成页面。

## 存储与准备

003-task-activity.sql只新建task_activity，每个task_id一行，不保存进度历史；既有devices/tasks/executions不重建、不回填虚构活动。领取与首次结果活动写和原状态变更在同一D1 batch中；写失败整体回滚，晚到进度条件写不会覆盖终态。

本轮只在隔离SQLite验证003，未应用实际Wrangler本地D1或生产D1；实际Worker启动前应按主会话README初始化003。尚未启动HTTP Worker、接桌面或界面验收。旧credential-store/request草稿未导入，旧第五组设计不适用。
