# 第二组设备识别与命名复核

日期：2026-11-18 JST。依据：AGENT_MINIMAL_DESIGN.md中的原始需求及修订、AGENT_BATCH_02_DESIGN.md。状态：本地自动测试通过，实际桌面/Worker运行与用户验收未执行。

## 范围与基线

主仓库HEAD：9ccdf3a147c302ca23092d9596d4958db28f6719。personal-digital-companion整体尚未跟踪，本次不把其他未提交文件视为自己的修改。第二组新增文件：agent/devices/identity.mjs、agent/devices/api.mjs、agent/tests/devices.test.mjs及第二组设计、本文。第一组子任务负责Worker入口、数据库和任务API；设备路由由子任务按主会话契约接入认证之后。

最终SHA256：

- identity.mjs：37EFC415DCCA4DE08D861D051A8E961CE3F0CB321A05177E4F319CAE73DFB708
- api.mjs：10DCE16156D3A1926FC5C6E0C417CE52D48295E7F54A7645F0C69AB53CD096ED
- devices.test.mjs：CA7AB8F0EB6EF51F1DF73BCF0449E562D978CB7C639F19C27F0EF0308300981A

## 实际检查

工作目录G:/selftool/WebCharacter，Node v24.22.1。

- `node --test personal-digital-companion/agent/tests/devices.test.mjs`：首次3/4通过，设备路由尚未接入，集成用例收到404；接入后4/4通过。不是生产故障。
- `node --test personal-digital-companion/agent/tests/tasks.test.mjs personal-digital-companion/agent/tests/devices.test.mjs`：两组集成11/11通过。
- 使用真实SQLite执行正式SQL。验证身份文件重读不变、损坏不覆盖；设备重复登记不覆盖别名；标注/清空/重复名/非法输入；带SQL字符的名称按数据保存；未经认证不能访问设备接口；改名不改变任务目标。
- Get-FileHash记录上述实际交付文件。

## 复核与停止

第一轮：对照原始需求、已确认决定和最简原则检查。路由尚未接入的集成问题已通过第一组接线解决；未增加MAC读取、用户表、设备管理平台、链式调度或桌面UI。设备ID与凭据分开，通用名只改变展示，不改变任务归属。

第二轮：集成11项测试通过，字段与两组设计契约一致，无残留阻断问题，停止。单用户少量设备列表不做分页；名称唯一使用SQLite NOCASE（ASCII大小写不敏感），不引入Unicode名称归一化系统。

## 未验证与后续边界

- 桌面主进程尚未调用身份模块，也未接入实际设备上报；未启动、重启或修改现有精灵应用。
- 未开发设备设定表UI、独立设备凭证、实际任务执行或失败重试；创建任务维持PENDING。
- SQLite适配测试不等于Cloudflare D1运行时验证；没有生产数据库写入、部署、Git提交或推送。
- 本地Worker启动须等用户指示；线上Access效果只由用户确认，不代理登录。
- 链式任务仍为待开发，第一轮不处理。重装遗失ID的恢复/合并不在本轮。
