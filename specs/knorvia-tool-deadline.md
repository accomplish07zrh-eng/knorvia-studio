<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具时钟与单次结算

2026-09-28。在 `specs/knorvia-tool-invocation.md` 的调用边界之后，独立替换 executor/timeout.ts 及其内部实现，同时修复已复现的 handler 同步抛错后残留 deadline。已访问旧源码，不作无接触声明；公开名称、消息、错误字段、数字运算和标准取消行为是兼容要求，改名或拆分不是独立依据。

## 所有权和设计

每个 ToolDeadline 独占一个预算账本与一个当前定时器引用。账本用明确的等待区间（起点、嵌套深度）、累计排队量及剩余可运行额度表达事实；定时器只消费账本返回的调度决定，不另存排队业务状态。标准 Date.now/setTimeout/clearTimeout 是本地计时适配边界，不新增外部端口、环境变量或真实服务调用。

每次 executeWithTimeout 独占一个结算门，只有成功、异常、父取消或超时中的第一项能结算。结算先释放本次 deadline 和 abort 监听，再通知 Promise 消费者。Invocation 仍拥有父 signal 链接，序列化与 Hook 不被移动进 handler 的超时范围。审批竞速继续复用同一 linkAbortSignal；没有第二条审批或任务队列。

```text
模型 queued/admitted → 本次工具的等待账本 → 暂停/重设定时器
handler Promise ─┐
父取消 ──────────┼→ 单次结算门 → deadline.clear / 移除监听 → resolve/reject
超时 ────────────┘       ↑
同步 handler 异常 ───────┘
```

Desktop continuous 与 Web replayable 沿原 ModelNetworkStatus 事件出口传递排队事实；只匹配同一个 toolCallId，不新增时间戳推断或重放。超时错误保留 queuedMs 诊断。

## 计时合同

- timeoutMs 缺席不设 timer，仍统计排队区间。start 替换回调并尝试计时，不重置剩余额度或累计排队量。
- 第一层 pause 开始等待；若当前有 timer，取消它并按 `max(0, remaining - (pausedAt - armedAt))` 扣除已运行时间。嵌套 pause 不重复扣除或移动等待起点。
- resume 在未暂停时无效；只有最外层恢复才累计从首次暂停开始的等待时长，并按当前额度重新计时。等待期间 queuedMs 包含尚未闭合的区间。
- clear 只清当前 timer 和回调，不清等待深度、累计排队或剩余额度；后续恢复不会自行通知过期，显式 start 保持既有再启动语义。
- 只处理 ModelNetworkStatus 中同 toolCallId 的 model_request_queued/model_request_admitted。其他类型、其他调用及缺席 payload 无效果。
- 当前实际调用每个 deadline 只 start 一次；若重复 start 导致遗留 timer，属于已存在的非标准使用边界，不在此修复中悄悄改成重置或总时长计时。

## 结算、取消与故障修复

- handler 仍同步调用，不通过 Promise.resolve().then 延迟。保留原 `.then(success).catch(failure)` 的两个反应阶段；已拒绝 Promise 与下一微任务取消的竞争，仍允许取消先到达失败 catch。
- 调用前子 signal 已取消时直接拒绝，使用原取消消息，不启动时钟/监听，也不调用 handler。
- 建立 deadline、注册子 abort 监听后调用 handler。普通完成/拒绝释放本次 timer 和监听，迟到结果无效果；不会取消正常完成的子 signal。
- 超时先标记为 timeout 来源、构造 ToolTimeout（消息含 timeoutMs，context 包含 cleanup/queuedMs/timeoutMs/toolName）、abort 子控制器，再尝试结算；不能被这个 abort 反过来改写成 ToolCancelled。
- 普通执行期 abort 拒绝 ToolCancelled，保留 cleanup/toolName、可恢复标记和自定义取消消息；预取消的错误仍保留原较窄字段。
- **本次明确修复**：handler 同步 throw（合法返回类型 never），以及建立其 then/catch 链时的同步异常，也进入同一结算门并释放 timer/监听。错误原值继续拒绝给调用者；不能在已返回失败后再由残留 timer 把子 signal 改成 ToolTimeout。先用确定性模拟时钟建立旧实现失败测试，再实现。
- deadline.start 或监听注册等设置端口自身异常不扩大为本次 handler 修复；不新增笼统重试、吞错或后台异常报告。
- linkAbortSignal 保留无父信号的空解绑、预取消立即传播 reason、已经取消的 child 不改 reason，以及移除监听后的隔离；不反向取消父 signal。

## 预算解析

none 优先且不读 resolver。其余 fallback 为 policy.defaultMs、metadata.timeoutMs、调用默认值；再按工具 resolver 非空结果、允许覆盖时的 input.timeout_ms、input.timeout、fallback 选择。保留工具方法 receiver、model context 与惰性读取。上限先 Math.min，再对清理宽限截断并夹至非负，对主额度截断并夹至至少 1，最后相加。原 NaN/Infinity 和浮点行为不在重写中被静默更正。

## 验收与许可

确定性内存时钟验证剩余额度、嵌套等待并集、clear/restart、无 timer 排队及事件归属；结算测试验证同步执行顺序、完成/拒绝/abort/timeout 竞争、后到结果、精确错误和资源释放。先建立正常旧行为基线，以及单独能失败的同步 throw 清理测试，再替换。复核真实 Invocation 和审批竞速调用者；不运行模型、设备或真实 shell。

最终运行根/CLI 类型与 lint、变更严格检查、架构、格式、来源清单、CLI 构建和编译产物以及完整离线回归。逐文件来源决定只覆盖本批独立实现、规格和新测试；公共合同、审批竞速、Hook 等相邻实现仍保留适用许可。根许可/版本和旧发行不改；此批不表示整体 MIT 迁移完成。
