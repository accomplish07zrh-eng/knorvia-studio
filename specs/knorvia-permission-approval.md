<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 权限预览与应答仲裁

2026-09-28。本批仅独立替换工具执行器的 approval-gate 与 permission-responder-race，保持 resolveToolApproval、racePermissionResponders 及其调用者合同。已接触旧实现，不作无接触声明；固定字段、错误文案、协议读取次序及标准 Promise/AbortSignal 操作不声称为发明，拆分或测试通过不能单独证明独立。

## 所有权与设计

预览路径使用逐请求投影对象，独占已经读取的选项策略，统一构造 ask 记录或选择 proceed。工具的 prepareApproval 仍是同步端口，执行输入和显示对象按原引用传递。公开适配器负责原阶段的属性调用、错误报告，不读取目录、文件或设备；准备输入仍属于之前的 resolveInput。

应答竞争使用纯三态仲裁器，状态为 open、broker-claimed、settled；它是唯一胜负事实所有者。异步适配器拥有两条取消支路、原 Promise continuation 和最终 resolver，只按仲裁器决定发布结果及取消败者，不复制 settled/claimed 标志。一次函数调用内的临时状态不持久化，不创建新的业务 run、审批队列或自动回复通道。

```text
权限服务已要求 ask → 逐请求选项投影 → prepareApproval → ask / proceed
                                          ↓ ask
原权限流程发出请求 → 同步建立 broker → 启动 Hook
                          ↓ claim           ↓ reply
                     唯一三态仲裁器
                          ↓ 接纳一个决定
                     先发布 → abort 败者 → finally 解绑父信号
```

原 Host、交互注册表、权限服务与 Runtime 继续拥有请求、持久权限和事件。Desktop continuous 与 Web replay 都消费原请求/结果；本批不改传输、重放、owner/lease 或 stale run 判断。新内部模块归现有 unmanaged CLI，不新增跨模块依赖。

## 预览合同

- 先读取 permission?.askOptions?.allowAlways：false 对应 no-always-allow，session 对应 session-always-allow，其余不附该字段。缺失 permission 仍可用。策略只捕获一次，prepareApproval 改动原 permission 不影响本次。
- prepareApproval 的存在检查在 try 外；实际方法在 try 内重新读取并以 entry 为 receiver，用原 executionInput 调用。无方法直接返回 ask，不读 display、不记日志。
- gate 严格为 proceed 时只返回该 gate，丢弃选项策略且不读 display。其他值沿 ask 投影，真实 display 按 truthy 条件附入，保留条件和赋值的两次读取；字段顺序 gate、可选 display、可选 optionsPolicy。
- 预览方法、gate 或 display 读取失败时保持 ask 并沿原 logger.warn 报告；禁止把预览失败当执行许可。告警包含同一 trace 和 tool identity，Error 取 message，其他值用 String；logger/日志字段转换自身异常继续上抛，不吞掉。
- 策略读取或存在检查抛错不进入预览 catch。公共类型和真实权限流程不放宽，现有 allow/deny 不会因为本投影额外变成 ask。

## 应答与取消合同

- 分别创建 Hook/broker AbortController 并各自连接父信号。先同步调用 requestBroker，保证原调用内建立可回答通道，然后调用 runHooks；两个方法的 receiver 都是 input。
- 正常 broker 成功/拒绝与有效 Hook 决定按原 Promise reaction 时点竞速。决定对象和异常原值透传；有效 Hook 包括 allow、deny、modify、escalate，不由本层重新解释。
- claimResponse 仅在尚未收口且 broker 信号未取消时可成功；成功后立即取消 Hook，broker 成为唯一候选但还未发布结果。重复 claim 继续返回 true，直到取消或收口：交互注册表的持久权限提交失败后保留请求，重试需要这一行为。不得改成仅成功一次的锁。
- claim 不等于审批完成；broker 成功或拒绝才收口。Hook 已有决定在 claim 后到达也必须忽略，不能在持久提交期间先运行工具。
- Hook 返回 undefined 表示退赛，仍等待 broker。Hook Promise 拒绝在未收口时调用 onHookFailure，receiver 为 input；即使已 claim 但 broker 未完成也报告。收口后的 Hook 错误被消费，不报告。
- 发布先于取消败者，不等待败者 Promise；败者挂起不能阻塞已得到的决定。取消时状态已经 settled，重入 claim 返回 false，迟到成功/拒绝不能覆盖赢家。
- 父信号只取消双方，结果仍由原 broker 取消/超时语义产生；不新增提前 resolve 或强制拒绝。已经取消的父信号仍传给两个端口，保持调用顺序；最终按 Hook、broker 顺序解绑父监听。
- 保留原 async/await/finally 边界，尤其结果发布后的微任务与父监听解绑时点，不增加额外 await。

## 已确认的相邻限制

同步端口启动异常与 Promise 拒绝不同：runHooks 同步 throw 会拒绝外层并解绑父监听，已启动 broker 不会立即取消；真实 permission-flow 的 Hook 使用 async wrapper，因此不走此同步分支。onHookFailure 自身抛错会成为分支 Promise 的未处理拒绝，仲裁仍等待 broker；当前回调为日志报告。先记录这些已有边界，不借迁移暗中改变异常归属或扩展自动许可。任意损坏的 thenable、全局 Promise/原型替换不作为完整等价保证。

只读复核另用真实协议 broker/交互注册表确认调用方的可达缺口：permission-flow 先 await PermissionRequested 事件，之后才进入本竞速。事件回调中的立即回复找不到请求，登记后第二次回复才命中。broker-first 只保证本函数内部次序，不能据此宣称整个 UI 已实现可见即可答；该调用方边界现已按 `knorvia-permission-readiness.md` 采用强制准备/发布/激活端口修正；修复证据见后续独立验收，不归入本仲裁模块的旧版对照声明。

## 先行验证与范围

先在原实现锁定：策略/字段与输入引用、预览失败仍 ask、getter 读取及 receiver；broker-first、两种赢家、弃权/失败、重复 claim 与失败重试、父取消、迟到响应、失败原值、微任务解绑和启动异常。用真实 Invocation 验证拒绝零 handler、预览 proceed、Hook 竞争及 Computer Use 用户授权边界，所有设备和模型端口均用离线替身。

实现后做有限固定基线对照、编译产物与完整离线回归，执行根/CLI 类型与 lint、变更架构、格式与逐文件来源校验。公共权限合同、HookRunner、broker/交互持久层、permission-flow、其余策略和 UI 不随本批变更许可；不改数据、根许可、版本、旧发行或安装/便携与官网。整体独立迁移与稳定发布继续进行。
