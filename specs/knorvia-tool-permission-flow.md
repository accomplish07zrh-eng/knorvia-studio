<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工具权限主流程的单次计划

2026-09-28。独立替换 resolveToolPermission 的主流程，保留现有方法签名、返回字段及全部调用者。已读取旧源码，不作无接触声明；固定协议、文案和标准异步语义不声称为发明，拆分/改名/测试通过不能单独证明独立。

## 单一所有者与执行方式

每次调用由一个同步生成的权限计划拥有局部评估、项目规则、当前决定、请求 ID、应答及已规范化输入。计划只在原来确需等待的端口上悬停；一个小型适配驱动执行当前步骤、等待结果、将成功值或原异常送回该计划。不存在第二份已接受状态、备用队列或持久缓存。

计划的命名步骤分别是项目规则读取、权限事件发布、broker/Hook 应答、改写输入复核及授权应用。每步用带类型的调用闭包表达既有端口操作；驱动在相同同步阶段调用闭包，并且每个原 await 只对应一次等待，不能增加业务层 async 包装。纯记录投影和初始评估辅助保持同步，外部 IO 仍由现有 adapter、permission service、broker、hook 和 store 所有。

```text
原执行器输入 → 单次权限计划（唯一决定/输入所有者）
                    ↓ 一个待执行步骤
              端口驱动 → 原规则/事件/应答/授权端口
                    ↑ 原值或原异常
                    ↓
                 原允许/拒绝结果
```

新内部文件属于现有 unmanaged CLI；不新增跨模块依赖、事件、原生权限、环境变量或第二套 Hook/broker 仲裁。Desktop continuous 和 Web replay 仍走原 Host 事件与同一 requestId，owner/lease、stale run 和交互注册表保持原职责。

## 评估与短路顺序

1. 先构造 permissionContext（含原 mode、risk、prePlanMode、planEnabled、workingDirectory）；随后 runtime context，再调用工具规则策略。user approvalAuthority 强制空建议，否则规则策略的建议优先于默认建议。
2. 项目规则读取单独等待并捕获；失败创建 StorageError/Failed to load project permission rules，内部错误保留 recoverable、session/tool identity 及 Error cause，再由原 createErrorResult 投影为执行结果（公开 error 不含 recoverable），不发布请求事件。
3. permission service 读取 runtime capability 和项目规则，之后依次应用 PreToolUse 决定与 memory 规则，最后报告 evaluated。上述同步阶段的异常不误归入存储失败或审批失败。
4. allowed 优先短路并标记 not_required；显式 deny 先标记 denied，再等待 PermissionDenied，记录日志，返回带规则/mode 的原权限错误。无 ask 请求、broker 或 handler。
5. 剩余路径才运行已独立实现的工具审批投影；明确 proceed 直接允许。其余只创建一次 perm\_ 请求 ID、标记 requested、等待原 PermissionRequested，再开始计算 permissionWaitMs。

## 请求与应答

- requestBroker 的请求字段、字段顺序、缺席策略、原 input、risk/rule/sideEffect 和建议引用不变。trace.turnId 使用 nullish 回退，optionsPolicy 仅 truthy 时附入，Date 在原调用时创建；选项保留 signal、claimResponse、timeoutMs。
- 沿原 racePermissionResponders：同步 broker-first、重复 claim 的提交重试、单一赢家和取消仍由该模块负责。onHookFailure 沿原 warn 内容与原错误字符串转换，不吞掉日志错误。
- user approvalAuthority 过滤自动 Hook 的 allow/modify，仅使其退赛；deny 仍可赢。普通工具的 Hook 决定保持原行为。
- Hook modify 先对 modifiedInput ?? executionInput 规范化。只有 schema 有效（validateInput 返回空）才调用既有复核；无效输入先走原 resolved 事件及最终验证错误路径，不额外请求 broker。复核可更新当前 decision/result，只有复核 broker allow 才沿用这份规范化输入。
- 竞速、规范化与复核范围内的失败：先标记 denied，已有 CoreError 原样沿用，其他异常包装 PermissionDenied/Permission request failed（Error 才作为 cause）；发布一次 deny 的 PermissionResolved 后返回执行错误。事件发布自身失败继续上抛。
- 保留 PermissionRequested 发布在此 try 之外：发布失败目前不启动 broker、不包装为 PermissionDenied。不得在替换中挪动这个异常边界。

## 收口与执行输入

- 应答浅复制并补 nullish resolvedAt，保留 own undefined 和读取顺序；等待耗时为原 Math.max/round 算式，起点不含 requested 事件等待。先发布 PermissionResolved，再记录 resolved 日志，之后才应用规则或返回结果。
- deny 保留 reasonSource 与 preserveReasonFormatting；escalate 保留专用 CoreError 和默认原因。两者标记 denied，不应用授权。
- 其他应答先 await applyResolvedPermissionGrants，失败直接返回，不把尚未持久成功的状态标为 granted。user-only 规则限制仍归该 helper。
- 授权成功标记 granted；非 modify 返回原输入或已复核的规范化输入和 permissionWaitMs。modify 才最终规范化/验证，错误返回原 validation 结果（此时遥测已 granted），不添加新的外部副作用。
- 保留原 callback receiver、getter 时点、错误原值、事件/日志/遥测先后和异步续接；有限回归覆盖调用端口边界，不宣称任意 Proxy、原型或生成器私有状态篡改等价。

## 就绪缺口与后续端口迁移

本批保持原 requested→broker 登记顺序，不宣称修复所有客户端的即时回复。已用真实 V4 投影、broker、registry 和命令处理器加可控异步 sessionEntries 复现：可答事件已发布，读取尚悬起，首次回答被当作无待处理交互；登记后第二次才成功。默认 SQLite 查询同步完成，普通 V4 事件按 30/150 ms 批帧，因此没有证据称它是默认桌面的实机点击故障。

后续 PermissionBrokerPort 与全部具体 broker 同批迁移时，须提供明确的“已登记、尚未通知”事实，core 发布成功后才开放通知/Hook，并处理取消、发布失败清理、同请求重试及 registry 自动继续事件排序。不能只上移最终答案 Promise 的调用，不能以未适配的可选 callback 假定所有端口已就绪，也不能为早到回答建立第二套缓存/队列。这是未完成事项，不纳入本批修复声明。

## 验收与许可范围

先写原版契约，覆盖存储/评估短路、上下文和建议、请求字段/事件次序、用户专属审批、Hook 改写复核、原 CoreError、deny/escalate、授权失败、最终输入验证和取消。复用原 Invocation、CUA、审批仲裁测试；所有端口离线，不访问实际模型、设备或用户数据。

新实现再做固定基线的有限结果/事件/日志/遥测及时序对照、编译产物与完整离线回归；执行根/CLI 类型与 lint、严格变更 lint、架构、格式、来源摘要与密钥检查。项目规则 helper、permission service、memory 规则、HookRunner、broker、事件和公共类型不随本批修改许可。没有 UI、版本、根许可、旧发行、便携或官网变更；整体迁移与稳定版目标继续进行。
