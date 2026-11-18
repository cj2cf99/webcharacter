# 精灵截图问答模块需求审计

用户最新授权补精灵端，沿用 SCREEN_QA_REQUIREMENTS.md 原文及 SCREEN_QA_API.md 固定云端契约。分工仅 desktop/screen-question-client.mjs 与独立测试，主会话处理系统入口、IPC和气泡。不修改任务执行、模型契约或真实业务。

审计通过：主动提交时读取鼠标位置，精确匹配所在display.id与source.display_id；匹配失败不得取其它屏幕。考虑屏幕scaleFactor，NativeImage JPEG/resize限制4 MiB；图片只存主进程内存。重试始终使用同问题同图；自动最多一次，仅允许可重试错误或传输/非JSON；配置/认证/参数错误不重试。一个请求在途返回BUSY，35秒覆盖响应体，取消/forget屏蔽迟到回调。

API：异步createScreenQuestionClient({profile,screen,desktopCapturer,request?})，返回captureAndAsk(question,{signal,onState})、retryLast({signal,onState})、forget()。回调与返回值仅waiting/answer/error状态及text/code/retryable，无图片或令牌。配置沿用profile/task-config.json，但独立请求不使用任务5秒包装。默认主进程fetch，可信宿主/测试可注入request。

无新依赖、存储表、轮询或截图落盘；不采集实际屏幕、不调用真实模型。Electron接口依据官方desktopCapturer、screen及nativeImage文档；模拟验证不冒充真实多屏/气泡验收。
