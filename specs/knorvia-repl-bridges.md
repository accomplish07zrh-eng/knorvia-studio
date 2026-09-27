# REPL 宿主能力桥独立实现

替换 node-repl-host 的 Browser / Computer Use bridge 与浏览器桥读取契约。保留公共符号、导出、方法、文档根和调用者接口；不改变 MCP 队列、Worker、broker 服务端或权限系统。依赖上一边界的单次 IPC 事务，不新增网络端点、环境变量或副作用重试。

## 结构与状态

新设计把宿主桥分为执行有效性检查、命名空间传输适配和纯结果观察投影。共享有效性模块只读取调用者持有的活动执行，不自己保存第二份 session 或 generation。纯观察投影生成“记录截图 / 合并元数据 / 记录应用身份”的有限动作，由对应 Session 的现有记录方法执行；投影不获取全局会话、连接或业务状态。

```text
SDK 持有能力桥 → 活动执行检查 → 该执行的信号与身份 → 本地 IPC
                                                      ↓
                         再检查活动执行 ← 已验证的响应
                                  ↓
                纯观察投影 → 本执行 Session 记录 → SDK 返回
```

- 没有活动执行、generation 不同、信号已取消或 runtime_scope=subagent 均在发送前拒绝。保留现有诊断文字与检查顺序；响应到达后再次检查，过期/取消的结果不能进入 Session。
- Browser 每次请求读取当前配置的 socket/token 并 trim；任一个缺失则报不可用。assertAvailable 只检查执行有效性，连接可用性在真正请求时检查。Browser 仍只发送宿主允许的 session/turn/trace 字段，不发送客户端工作区断言。
- Computer Use 使用构建桥时显式传入的连接，assertAvailable 同时检查该连接存在。context 保留 IPC 边界规定的工作区、远端和链路信息；本层不自行选择 runtime、用户程序或显示器。
- 两者都使用 brokerCall 的 ID/token/取消保护。Browser 响应按共享严格 schema 解析；list 缺少 browsers 时返回空列表，execute 缺少 result 时明确报错。Computer Use 保留 content 必须为数组的既有结果边界。
- 公共浏览器 bridge 读取器逐个检查 list/execute/assertAvailable 的函数形态和 documentationRoot 的字符串形态，返回原对象，不触发实际请求或 availability。沿用可继承属性和可调用对象的兼容行为；此形状检查不是宿主认证，VM 也不是安全沙箱。

## 观察与可信来源

- 只有成功的 screenshot 命令及其真实 image 调用 recordBrowserScreenshot；其他方法即使带 image 也不授予截图来源。截图可没有 meta，仍须记录。
- 无 meta 不合并浏览器展示信息。有 meta 时保留 knorvia/browserUse、toolSurface 的 kind/backend/browserId 和 browser_use URL（无 URL 时为空对象），失败结果也保持这部分观察事实。
- 成功的 finalizeTabs 记录 openTabIds 和 sessionEnded。成功的 navigate/back/forward/reload/click/fill/type/press/scroll/hover/select/check/drag/handleDialog/close，以及 Playwright locator 的 click/dblclick/downloadMedia/fill/press/selectOption/setChecked，记录 openTabIds。其他方法不因本次迁移扩展该集合。
- 成功且 meta.tabId 非空时生成回合截图候选提示，但 capabilities/list/listUserTabs/browserVisibilityGet/cancelRequest/closeSession/finalizeTabs/nameSession/turnEnded 除外。提示不等于真实截图来源；实际图片仍须由真实截图记录匹配。
- Computer Use 将 broker 的对象 responseMeta 合并进 Session；仅从结果 `_meta` 的应用关联 primary 中提取非空 appKey 和可选 displayName（trim），交给 recordCuaAppIdentity。SDK 返回的原结果保留全部内容，不从模型手填的会话元数据推断可信应用。
- 记录顺序保持截图先于浏览器元数据、Computer Use 元数据先于应用身份。只改变实现组织，不改变现有界面读取的字段、失败展示或跨内核来源判定。

## 验收

先在旧实现运行活动检查、缺配置、命名空间字段、严格响应、迟到结果、全部命令的观察策略、Playwright 动作、截图来源和应用身份测试。再独立实现公共桥合同、共享有效性与纯观察投影，并验证同一测试及真实构建的 MCP/Browser/CUA 模拟串联。

执行根/CLI 类型与 lint、严格变更文件 lint、新测试类型、架构、格式、CLI 构建及完整离线回归。源码访问和兼容词汇保留明确记录，不以相同功能、不同摘要或拆文件单独证明原创；只给新设计并复核的具体文件记录 MIT。其他宿主、驱动、业务内核和 UI 的迁移继续独立核验。
