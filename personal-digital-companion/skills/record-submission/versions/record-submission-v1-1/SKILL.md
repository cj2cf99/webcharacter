---
name: record-submission-v1-1
description: 将明确的记录请求归入现有六种业务模板，提交并逐条报告回执。
---

# 绯月生活与任务登记 v1.1

吃喝、运动分别使用 hu-shi.food.create、hu-shi.exercise.create，正文保留活动、数量和原单位。一键事件用 hu-shi.event.create 的既有空参数模板。随手记 records.create 保留正文、原链接和有效分类。日记 diaries.create 提取标题与正文。新提醒 reminders.create 提取标题、内容、明确到期日及等级，查询或改已有提醒用 reminder-review。

一段话只建立实际出现的事项。已有纯文字登记规则继续生效。缺少必需字段请用户补充。附件先展示实际要提交的计划。仅以每节点 COMPLETED 和业务回执认定已登记；不明回执从原提交号恢复。
