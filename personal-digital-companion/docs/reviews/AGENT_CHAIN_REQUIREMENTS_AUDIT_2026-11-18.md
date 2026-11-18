# 链式任务实施前需求审计
2026-11-18 JST。先审计，后实施。
已读AGENT_CHAIN_DESIGN、用户最新原文、原任务/截止/恢复/AI/发现设计与源码；沿用根规则及框架偏好，独立备忘录未定位记录不变。
新需求明确覆盖链式暂缓、自动领取、无限名额；只实施最多5节点、单前置、主动领取、每终端全局2名额和失败人工决定。旧业务暂停/空handler、截止+7天、JST展示/UTC存储不变。
审计通过：稳定node/current_task_id；force/continue新task_id保留旧轮；旧RUNNING取消其领取权但不保证远程物理停止，迟到结果单独归档；未领取后代检查全部祖先。
普通仍原目标PC；force/continue显式接取到发起PC。group stop阻止新领取，已运行可完成。名额原子SQL守卫，桌面另有物理2执行守卫。
主会话负责desktop及pending-poller测试，本代理只改agent核心/sync/其他测试和本报告。不做业务模板、主站、Access、真实D1/模型、常驻服务、安装或Git。
## 修改前SHA256
- agent/worker.mjs AF4A9A4E7107D7A37BB67446BD844623C0D4612BE37EBF0C410FE4D4AB7C3439
- agent/tasks/actions.mjs 38388E868F00909B483937E719A0B2F5FA3583EB248FE27A3804D22E7019F69E
- agent/tasks/recover.mjs 3C38031BE448273FD7F5FC056FD571FD3E3C549CD92FA302579B66F54F3BCAC3
- agent/execution/sync.mjs B9D49D169C1A86DE35FD98B9294442C5F8B97FE01219ECE329AFF6EC9E3EF47F
- agent/execution/runner.mjs BB90D42A6BE58F04C17AD2F92F7540E113E60489C04CD6531CF35CB0AE00AFFB
- docs/AGENT_CHAIN_DESIGN.md C96DEEA3AB8B07CFB5837E79F829F095D32C0DF48DF387F5DE83E96BDE538BC6
