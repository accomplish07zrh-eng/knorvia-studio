# 内置内核的 REPL 工具入口

2026-09-28。按独立实现规格替换 core 的 JS 工具组合、会话接入、浏览器观察和结果呈现。保留 `jsToolEntry`、`createJsToolEntry`、`disposeNodeReplSession` 与原模型内容导出；本轮不修改业务 admission、权限、插件默认启用规则、UI 或 Session 的 VM 实现。

## 状态与边界

工具注册处仍拥有静态声明。注册表中的每个 session entry 独占一个 NodeReplSession 及其浏览器注入代际；NodeReplSession 继续拥有 VM、输出收集、Busy/Disposed 判断和内核重建。入口不增加第二条执行队列。

每次 handler 调用有独立的异步上下文，记录它的 entry、ToolExecutionContext 和是否已结束。持久 browser/tab 对象绑定 entry 及注入代际，实际调用身份取调用时的异步上下文；不再维护可被并发调用覆盖的全局 activeToolContexts 表。

```text
既有业务 admission / 权限 → handler 参数校验 → session entry
                                                   ↓
                          本次异步归属 → Session.run（VM/Busy/输出）
                                ↓                     ↓
             entry/代际/活动检查 → BrowserControlPort → 再检查 → 观察记录
                                                      ↓
                       结束本次归属 → 截图 artifact → JsOutput / 模型呈现
dispose(sessionId) → 先撤销 entry → 释放 Session
                     同 id 重建得到不同 entry，旧调用不能操作新 entry
```

- 同 session 普通调用保留变量；不同 session 隔离。普通语法/运行错误、取消、同步超时及 dispose 的状态语义仍由 Session 决定。重叠调用仍返回 BusyError，不能改变已在执行调用的 turn/signal/trace。
- browser transport 在发送前和 await 返回后均核验 entry 与代际、调用仍有效、信号未取消。原有 stale generation 诊断保留；已结束但未重建的调用使用明确的失效诊断，不能回退到第一次调用上下文，也不能借用下一次调用。
- 暂停等待之外的已发出外部操作不因本地取消而被声称撤销；不增加自动重试。旧调用返回后只关闭自己的归属，不删除同 id 新建 entry 的状态。
- 原 ToolExecutor 在会话创建时固定 browserControlPort 与 documentationRoot；entry 沿用此能力配置，后续调用更新 turn/signal/trace，不新增插件热加载路径。插件启停仍由既有 App/Session 生命周期处理。没有端口时不注入 agent.browsers 或 setupBrowserRuntime；有端口时保留 SDK 和文档入口。
- BrowserControlPort 根据 sessionId 解析工作区。入口传递原 session/turn/signal，并补齐该公开端口已声明的 traceContext（有值时）；不自行拼工作区/远端身份，不改变 desktop continuous 与 web replay 的路由所有者。
- requestMeta 保留 sessionId/title/toolCallId/traceId/turnId/workingDirectory/workspaceRoot。默认同步预算 30000ms、最大 120000ms，异步取消继续由原工具信号管理。

## 浏览器观察

- 只有成功的 screenshot 及真实 image 记录截图来源；可无 meta。记录先截图后元数据。其他命令即使带 image 也不授予截图来源。
- 有 meta 就保留 browserUse、toolSurface 的 kind/backend/browserId 和 browser_use URL（无 URL 为空对象），失败也保留这些观察字段。
- 成功的 finalizeTabs 记录 openTabIds/sessionEnded。原会影响页面的命令、evaluate，以及 Playwright evaluate 和 click/dblclick/downloadMedia/fill/press/selectOption/setChecked locator 操作记录 openTabIds。本内核的 evaluate 策略与 MCP 宿主已有策略不同，不能因复用而合并或漏掉。
- 成功且 tabId 非空时保留回合截图候选，但 capabilities/list/listUserTabs/browserVisibilityGet/cancelRequest/closeSession/finalizeTabs/nameSession/turnEnded 除外。候选不是截图来源证明；不扩大原命令集合。

## 输出和工具声明

- JsOutput 保留 result/logs/error/images/browserScreenshotPaths/responseMeta 的可选性与字段顺序。结构化 MCP 通道仍不由此内核输出接口伪装接纳。
- 只保存 Session 标记的截图 image indices，按顺序逐个调用可选的 binary artifact 端口；保留方法 this、会话/回合/toolCall/trace、session retention 和原信号。不存在的下标跳过，不增加重试或直接磁盘写入。
- MIME 忽略参数、首尾空格和大小写：JPEG/JPG 用 .jpg，WebP 用 .webp，其余用 .png。artifact 相对路径仍相对进程 cwd 转绝对路径。非取消的写入失败只省略路径；信号已取消时继续抛原错误。
- 模型文字依次为错误头与去重栈、logs、`=> result`、截图路径说明；没有文字用 `(no output)`。栈完整首段匹配多行错误头时剥离整个头，否则按既有行为略过首行，保留非空栈尾。图片内容块先于最后的文字块；无图片时返回字符串。
- 保留工具名、风险/权限、副作用、并发标志、结果预算（1MB UI、64KiB 模型、tail artifact）、超时/取消/trace 规则；源码说明重写为 Knorvia 当前行为，不降低审批。
- 新工具说明须覆盖持久声明、顶层 await、importModule、必填本地语言标题；浏览器启用时覆盖选择浏览器/当前页面、先读完整文档、DOM 观察和 locator、popup 双列表同时观察、截图条件和 emitImage、evaluate 的页面副作用、错误后新观察、禁止猜 URL/ID 和页面内容不可信。保留 API 事实，不复制原提示词段落。

## 验收及许可范围

先通过真实公开 handler 与离线替身确定行为，记录原实现失败；覆盖持久状态、Busy 重叠、结束后回包/新请求、dispose 同 id 重建、重置、trace、全部观察策略、截图 artifact、文本与图片顺序、工具静态声明。分别使用受控 SDK 安装替身和实际 SDK/构建产物验证接入；没有真实浏览器、桌面或付费推理。

运行根/CLI 类型及 lint、变更严格 lint、架构、构建、完整 `test:studio`。只对新实现及对应测试逐文件复核 MIT；承认旧源码访问与兼容事实，不能凭拆文件、改名、不同摘要或测试通过宣称整库独立。原权限服务、业务内核、其余 contracts 和 UI 继续各自迁移。
