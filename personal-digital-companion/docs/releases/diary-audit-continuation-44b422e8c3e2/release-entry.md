## 2026-11-23 JST · Windows 绯月手记续跑与显示 · 44b422e8c3e2

**需求与验收。** 用户指出同一轮手记核对高频续跑、正常分批被归为重试、「提醒检查」混入手记活动、气泡只报已保存步数，并要求「拆开，并且修正展示位置和气泡的显示内容」「把其他问题一起改了」。验收要求为正常小批回执显示「本批完成」，遇实际占用才入等待队列。手记核对和修订的排队及回执在任务日志查看，气泡显示工作阶段。每个用户已设周期给核对五分钟开工窗口，默认周期 60 分钟。到限收完当前小批，下周期从原检查点继续。界面按 JST 显示下一批时间。

**项目、环境与比较范围。** 只发布 Windows 本机正式绯月，根目录 `G:/selftool/.release-feiyue-handbook-desktop-20261120/personal-digital-companion`。来源是 WebCharacter 子项目 `personal-digital-companion`。开发 Git 基线 `03942463b3de924c380ae45a0c29a30bfbbee1c6` 加实际工作区定向改动。正式版 `bba9a244c54c` 的原 26 项摘要与实装逐件一致，积压归类候选 `895a9f8c4750` 仍在准备目录。正式快捷方式和登录项指向该目录。本次只替换清单八项，清单 SHA-256 `44b422e8c3e2959c8b6c493208bf93b1952ca6677c0034e1d55a3954a546b498`。可复验材料位于 `G:/selftool/WebCharacter/work/feiyue-diary-audit-continuation-20261123` 的 `windows-files.json`、`windows.patch`、`before/` 和 `candidate/`。以这些文件的字节比较为审核边界。

**逐项变更及前后行为。**

- `desktop/diary-audit.mjs` 和 `desktop/personality-nags.mjs`。原先小批完成回传延后。现在回传正常小批完成及已保存步数，气泡的工作反馈使用提取线索、比对手记、核实疑点。
- `desktop/poll-scheduler.mjs`。原先小批成功留在 15 秒忙碌重试队列。现在正常续跑使用专用计时器，在五分钟窗口内间隔 15 秒。窗口到限或共享 AI 预算耗尽时，安排下个周期继续。复用已有轮询时间记录保存期限；真正忙碌仍走原队列。
- `desktop/reminder-checks.mjs`、`desktop/conversation-details.mjs`、`desktop/conversation-ui.mjs` 及 `output/desktop-bundle/conversation-ui.mjs`。手记质问和手记修订从提醒检查队列、历史、分页总数移除。任务日志首页显示两类工作当前状态和续跑时间，回执归「绯月自主行动」。旧的正常小批回执和提醒历史推迟记录使用准确的展示标签。构建版与源码版渲染文件字节相同。
- `desktop/shell.mjs`。气泡说明开始、阶段变化及结果，重复阶段和小批成功省略弹出。断点计数保留在任务日志。

**数据、配置和兼容性。** 无数据库结构迁移、回填、配置更改、业务数据修改、模型或远端部署。程序运行后使用既有 `idle_poll_resume` 存续跑时间和当前窗口起点，旧版忽略额外键。本次纯代码发布，不创建数据库备份。手记断点及提醒和任务日志都保留。只读预检六库快速检查成功，手记断点有 114 步，本机未发现进行中的任务或监听进程。安装后核对同一断点起点及步数。

**实际验证。** 工作区的全量 `node --test 'agent/tests/*.test.mjs'` 为 525 通过、3 个已设跳过，最后一轮 `node --test agent/tests/autonomous-idle.test.mjs agent/tests/diary-audit.test.mjs tools/test-reminder-checks.mjs tools/test-poll-settings.mjs` 为 46 通过。桌面构建、标题栏、气泡、任务日志及浅深色截图通过。在实装基线合入八件后，以同一命令跑候选得到 41 通过、5 个答复用例失败。扩展手记修订用例为 2 通过、11 个失败。用同一测试资料回放原实装，五个答复和十一个修订失败均复现，候选无新增失败；详细失败在 `candidate-node.log`、`candidate-refinement.log` 和 `baseline-node.log`。隔离候选的 Electron `tools/test-autonomous-log-electron.mjs`、`tools/test-context-actions-electron.mjs` 均通过。安装脚本已解析检查，未实际运行。未做正式模型推理、正式桌宠交互和独立第三方审核。

**安装、风险和恢复。** 审核重点包括五分钟限制与共享预算的顺延、重启当前断点、角色气泡稳定、旧数据和提醒观察入口。确认后执行包内 `install.ps1`。安装器会重验正式文件原摘要、候选摘要、正式根目录审核和启动入口。有正式进程时先等业务空闲并正常退出。当前没有正式进程，按原入口启动。对八件做同目录临时文件替换，随后核实进程、REST v7、命令行、资料路径、八件摘要、六库快速检查和断点。异常从 `before/` 恢复原字节及原运行状态。用户可在正式版任务日志核对「当前自主行动」和「本批完成」，并观察气泡阶段。安装版本、JST 时间、验收回执及 Git 同步结果在实际发生后补记。

**确认、第三方审核和花园。** 用户已要求部署，准备审核后针对本八文件安装另行确认。第三方独立审核未执行。按默认规则准备花园登记，拟归「网页角色组件 → 绯月（桌面精灵）」#61，新增发布和明细各一条。具体编号、旧版本及成功后的 +0.1 以线上实际回读为准。正式本机 REST 目前未运行，实际线上基线、精确清单确认、SQL 和批次均未执行。本机安装授权与花园清单确认分别记录。代码、审核及相关测试的 Git 同步待安装结果明确后执行。
