# Knorvia Playwright 客户端独立实现

这是 BrowserControlPort 上的协议客户端，不启动 Playwright 浏览器、不建立额外 CDP 连接，也不接管宿主的授权或超时计时器。替换对象为 core/browser-client/playwright.ts 的实现，现有页面、浏览器代际、截图来源和用户界面均保持原边界。

## 对象与状态

公开入口继续提供 PlaywrightAPI、PlaywrightLocator、PlaywrightFrameLocator、PlaywrightDownload、PlaywrightFileChooser、createPlaywrightAPI 和 configurePlaywrightObjectWrapper，以及当前类型别名。保留构造参数和方法签名。

每个页面 API 拥有传输回调、独立 locator owner 和当前对象包装器。Locator / FrameLocator 保存不可变 selector 和创建时的包装器；链式调用产生新对象。组合条件必须来自同一个 owner，不同 tab 的 locator 不能混用。下载/文件选择对象只保存事件 id、传输回调和相应标志，不持有浏览器业务状态。

默认对象视图从统一 API 目录派生允许成员，隐藏内部回调/字段；不再另维护一份手写成员清单。方法在原目标上执行。外部能力策略可替换后续对象的包装器，configure 返回包装后的 API；已有 API 内的 owner 不变。Symbol 内部协议只用于包装和 locator 身份，不是授权机制。

## Selector 行为

字符串 matcher 使用 JSON 转义和 exact/非 exact 标记，RegExp 保留 source/flags 并支持其他 VM realm 的正则。getByRole/Text/Label/Placeholder/TestId、CSS locator、frameLocator、first/last/nth、and/or、has/hasNot、hasText/hasNotText 和 visible 均保留现有协议编码。

构造 selector 不发送命令；执行 count/click 等操作时才发送。嵌套 frame 的每一层都保留 enter-frame 标记。filter 的顺序保持 text、not-text、has、has-not、visible，空字符串 text 条件仍有效。组合 locator 的类型错误和跨 owner 错误必须发生在传输之前。

## 传输、等待与错误

- 普通调用发送 method=playwright 及 action；固定等待单独发送 playwrightWaitForTimeout。常规 timeoutMs 原样交给宿主，不在客户端增加隐式等待、重试或计时器。
- fill 与 type 都映射到 fill 操作，replace 分别 true/false。check/uncheck 映射到 setChecked；selectOption 把字符串转为 value 对象，保留合法对象选项。
- 函数 evaluate 序列化为函数字符串并标 function，字符串标 string，arg 和超时原样传递。返回值来自 result.value；screenshot 返回普通 Uint8Array。不会把返回值为 undefined 或 null 当成传输失败。
- 变更动作在失败消息后追加操作和 selector 上下文，并保留原异常为 cause；普通读取和 evaluate 保留 BrowserCommandError。输入缺失在本地返回原有清晰错误，不发送半成品命令。
- waitForURL 支持 commit，waitForLoadState 支持现有三个状态；expectNavigation 先发出所选导航等待，再调用 action，并等待两者完成后返回 action 的结果。等待失败不撤销已经发生的动作。
- waitForEvent 支持 download/filechooser；事件值中的 id 用于后续 path/setFiles，isMultiple 决定选择器多选状态。文件选择仅转换字符串为单项数组，不读取本机文件；空数组、null/undefined 在发送前失败。其余文件合法性由宿主验证。
- 不把客户端对象隐藏当作安全沙箱；每次真实命令仍由 facade 和宿主验证当前权限与浏览器代际。

补充边界验收：waitFor 缺少 state 时返回异步输入错误，getAttribute 空名称与 filter 非布尔 visible 在本地同步失败；elementInfo / elementScreenshot 拒绝非有限数坐标，分别保持同步/异步错误契约。事件等待只接受 timeoutMs，不让额外运行时字段覆盖事件或操作。子 locator 仍经过子对象和 filter 对象两次包装。下载/文件选择的内部 id 不属于公开 API，新对象视图隐藏这些实现字段。

导航动作即使同步抛错，也须同时接住已经启动的等待 Promise；等待之后失败不能形成未处理 rejection。此项是旧实现未覆盖的异常边界修正，须用独立子进程复现和验收，不能把新旧完全一致作为此用例的目标。

## 验收

替换前先用模拟 transport 检查旧实现的 selector 编码、完整命令、返回值、对象包装、同 tab 约束和失败形态。测试不访问真实浏览器或模型。替换后重跑同一组契约；新增异常边界单独记录，不能通过改测试掩盖能力缺失。

实际构建 CLI 和浏览器插件后，检查新实现进入产物，旧 Playwright 正文不再作为构建输入或 fallback。根类型、lint、架构，CLI 类型/构建，严格变更文件 lint 和完整离线回归均须执行。接口目录、随包文档和公开入口同步核对。
