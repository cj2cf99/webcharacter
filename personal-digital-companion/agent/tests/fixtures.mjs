// 仅测试使用的类型定义，不随产品种子初始化，也不执行真实业务。
export function seedMockTask(sqlite, { type = 'mock.echo', executor = 'pc', spec = { drive: { type: 'string', required: true, pattern: '^[A-Za-z]:$' } } } = {}) {
  sqlite.prepare(`INSERT INTO tasklist (type, name, description, executor, parameter_spec_json, procedure, report_spec)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(type, '测试任务', '仅用于临时数据库验证', executor,
      JSON.stringify(spec), '目标 Windows PC 调用测试桩，不访问磁盘或真实业务', '返回测试桩结果或固定失败说明');
}

// 正常创建用真实签发接口；契约专项直接请求 /api/tasks 来覆盖缺号和重放。
export async function withTaskSubmission(request, body) {
  const issued = await request('/api/task-submissions', {});
  if (issued.status !== 201) throw new Error('测试提交号签发失败');
  return { ...body, submission_id: (await issued.json()).submission_id };
}
