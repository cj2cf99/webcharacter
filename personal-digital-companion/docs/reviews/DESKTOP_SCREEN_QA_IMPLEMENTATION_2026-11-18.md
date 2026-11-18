# 精灵截图问答客户端实施记录

2026-11-18 JST。仅本子代理分工：desktop/screen-question-client.mjs 与 agent/tests/desktop-screen-question.test.mjs。原文/云端契约见 SCREEN_QA_REQUIREMENTS.md、SCREEN_QA_API.md；审计见 DESKTOP_SCREEN_QA_AUDIT_2026-11-18.md。主会话负责系统入口、IPC、气泡、构建与独立复核。

## 实现与固定接线

`await createScreenQuestionClient({profile,screen,desktopCapturer,request?})` 返回 captureAndAsk(question,{signal,onState})、retryLast({signal,onState})、forget()。request注入函数为(path,options)=>Promise<Response>；默认主进程fetch从profile/task-config.json读取base_url/api_token/api_prefix，不使用任务5秒包装。仅HTTPS或本地HTTP，Origin为配置地址origin，禁止redirect；不打印凭据。

两个异步方法resolve安全状态：`{state:'answer',text}` 或 `{state:'error',code,text,retryable}`。onState另外可收到`{state:'waiting',text:'正在查看屏幕…'}`。waiting只在截图完成后发，避免宿主重新显示问答窗污染截图。一个问题在途时返回BUSY；forget清除内存图并取消，取消后不再发送onState，异步结果返回REQUEST_CANCELLED，宿主仍须依据自己的关闭状态忽略返回值。

鼠标所在display的DIP尺寸乘scaleFactor请求整屏thumbnail；严格source.display_id匹配，不匹配失败。NativeImage JPEG质量85/65/45，仍大则逐步缩小，最多8轮；非空且小于等于4MiB才发送。无图片落盘、数据库、任务、轮询或新依赖。

每次问答最多两次HTTP尝试（初次+一次自动重试），35秒覆盖响应头及body。只有约定retryable=true或传输/非JSON/坏回执才重试；HTTP认证/参数/配置失败禁止重试。手动retryLast复用已保存的同一个JSON请求字符串，不重新截屏；新有效问题显式提交才新截屏。仅HTTP200、严格ok:true和合法answer才能展示正文。服务端错误文字不直接转发，避免错误内容包含诊断/秘密。

示例：用户问报错原因，第一次AI_TIMEOUT后仍发送最初同一截图与问题；即使屏幕已变化也不会暗中换图。用户另发“现在正常了吗”才重新截图。

## 实际验证

工作目录 G:/selftool/WebCharacter。

- `node --test personal-digital-companion/agent/tests/desktop-screen-question.test.mjs`：DSQ01–08，8/8通过。
- `node --test --test-reporter=dot personal-digital-companion/agent/tests/*.test.mjs`：127项、exit0。

覆盖多屏精确ID/1.5倍缩放、空图和过大JPEG缩小、同图自动/手动重试、非JSON与网络错误两次上限、认证配置不重试、BUSY、截图中/请求中取消、forget后无迟到回调、35秒完整响应体超时、本地配置前缀/Origin/redirect。测试全部mock screen/desktopCapturer/NativeImage/网络，不采集实际用户屏幕、不调用真实模型。真实Electron截图权限/多屏效果及气泡视觉由主会话另行记录，不能以本测试替代。

API依据：[Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer/)、[DesktopCapturerSource](https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source)，官方明确display_id对应Display.id，thumbnail实际尺寸不保证等于请求尺寸，因此编码依据实际NativeImage并检查为空，不假设请求尺寸就是返回尺寸。

冻结SHA256：

- desktop/screen-question-client.mjs：8833C4CEE3FF9465C98F22E72E7A97667D205692412464C822A3CD8047AD1896
- agent/tests/desktop-screen-question.test.mjs：7DA595BE4D386E38A6403F0A1FCBC2A16F1D927C07265BC3BCBA90D5B8A4BBED

未改shell/preload/UI/build/总纲，未启动常驻、部署、生产访问或Git操作。独立主审核另记。
