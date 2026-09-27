<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 单次工具调用的阶段所有权

2026-09-28。独立替换 core 的 executor/call-runner.ts 主流程，保留工具执行、权限、Hook、取消、显示、背景任务与遥测的现有行为。已访问旧源码，不作无接触声明。公开名称、固定文案、事件、字段、错误分类和顺序是兼容要求；拆分和变量改名本身不是独立实现依据。

## 范围与设计

一次调用只有一个执行状态所有者，持有规范化的调用身份、当前 executionInput、已完成的前置 Hook 事实、执行阶段、子取消控制器，以及最后记录的读取文件/技能元数据。Registry、权限服务、Hook runner、Artifact Store、BackgroundTaskTracker 和事件出口仍为原有所有者，此批通过原端口调用它们，不复制持久状态或重新实现其协议。

新实现将同步入口事实、输入准备决定、Hook/权限准入和执行收尾划为明确阶段；每个阶段只产生有限的继续/返回事实或调用现有副作用端口。终止结果不再隐含在宽泛 catch 中：前置失败仍按原路径完成，只有 Started 之后的既有守护区进入执行失败收口。内部帮助模块保持单一调用状态，不缓存模型、模式或用户输入到全局。

具体实现采用每次调用的 `Invocation` 所有者：准入策略返回 `validation`、`denied`、`permission` 等封闭决定，所有者按决定中的事件要求提交终态；输入 resolver、Hook 和权限仍顺序写入同一输入槽。进入执行后以同一个所有者收集 metadata，并明确切换失败阶段。身份解析器只产生同步事实，context 适配器只连接原端口，结果策略只处理来源与模型正文；它们不另存调用进度。许可依据是这些职责、决定协议及实现本身的审查，不能仅凭文件拆分或测试通过。

```text
遥测入口 → 登记/身份/trace → 模型输入和工具语义校验
                             ↓
                   可选 resolveInput → PreToolUse
                             ↓
                    Hook 改写校验 → 权限
                             ↓
            Started 事件 → timeout/子 signal 设置
                             ↓
             context → handler → 输出校验/来源判定
                             ↓
            serialize → PostToolUse → 附加上下文/卡片
                             ↓
              帧证明 → Result 事件 → 背景追踪
                             ↓
                       成功遥测/结果

守护区失败 → PostToolUseFailure → 失败结果/上下文
                             ↓
                       Error 事件/遥测

守护区 finally → 解除父 signal 链接
```

Desktop continuous 与 Web replayable 都继续通过同一事件出口接收事实，主流程不改两种投递模式，不新增时间戳推断、重放或背景任务副本。工具自行调用的模型状态先更新本次准入时钟，再 await 原会话事件出口。

## 入口、准备与准入

- 外层在创建遥测 scope 前解析一次 registry 名称；未登记名只在遥测中归入 unknown，业务错误保留原名。执行体按原规则再次查 registry，不将两个读取合并成隐式快照。别名在登记项存在时使用 metadata.name 形成规范调用。
- parent trace 按 options.traceContext、当前异步 trace、deps.traceContext、根 trace 的顺序选择。子 trace 保留 session/turn 与规范调用 id/name；实际 turnId 使用子 trace 的值再回退 deps.turnId。
- 初始模型按 options.model ?? deps.model 选择，并解析工具对应模型合同。handler context 在执行守护区重新读取当前模型；不能因提取共同事实而误把两个时点合并。
- 未登记/空白工具名先构造错误、发布 Error、日志、lookup/configuration 遥测后返回。空名模型正文保持原空白名称和既有工具错误包装。不得发 Started。
- 登记存在后先读 mode，再检查父 signal 是否已取消。此早退返回取消结果并结束取消遥测，不补 Error/Started 事件，也不执行输入准备。
- 输入依次经历初始归一化、模型 schema 校验、可选工具 validateInput。后两者返回的失败先发 Error 再结束 validation/parse 遥测，不运行 PreToolUse、权限或 Failure Hook。工具专属校验仅在既有 handler-failure 判定成立时短路。
- 可选 resolveInput 在 Hook 前 await，收到业务失败走上述 validation 出口；成功更新唯一 executionInput，不新增另一轮初始 schema 校验。workingDirectory、runtimeTaskRegistry、workflow/modelCatalog 端口及 sessionId 仍按既有存在性规则传入。解析异常继续传播至外层遥测，不进入执行 Failure Hook。
- PreToolUse 接父 signal。deny 或 preventContinuation 保持原权限错误原因优先级、Plan Exit turn-stop 与附加上下文，结束 denied/policy_denied 遥测；不补统一 Error 事件。
- Hook.updatedInput 只有非 undefined 时才归一化并 validateInput；失败追加已有 PreToolUse 上下文并结束 validation/parse 遥测，不发 Started 或新增 Error。没有 updatedInput 时继续原 executionInput。
- 权限流程沿原端口接收当前输入、PreToolUse 事实、mode、trace、父 signal 和遥测。拒绝结果按原 Plan Exit、workflow refine follow-up 及前置上下文包装；PermissionDenied 记 user_denied，其他权限阶段错误使用原类型分类。允许后以返回的 executionInput 和 permissionWaitMs 为准。

## 执行与收尾

- startTime 在准入后取值。先以最终执行输入解析能力并构造初始 MCP 显示，再 await Started；其后才日志、解析 timeout、建立子 signal 链接和可暂停 ToolDeadline。上述动作在主守护 try 之外，异常不伪装成 handler 失败。
- context 在主守护区构造：原端口、工作目录/身份、remoteSessionId、runtimeScope、交付模式、providerVisibleToolNames、shell 选择与内核能力保持。两个 metadata 回调按最后一次写入生效，互相及不同调用之间不共享。
- 模型 context 沿用默认状态 sink，显式调用层 sink 的优先级不变。透过 context 发出的 ModelNetworkStatus 先由本次 toolCallId 的 deadline 观察，再进入原 emitEvent。
- executeWithTimeout 只围绕 handler，使用子 signal 和 deadline。durationMs 从 Started 发布前计起，在 handler 返回后计算，含 Started 订阅者等待和上下文设置，不包括序列化和 PostToolUse；其余总时长继续单独记录。handler 返回业务失败要进入原异常失败路径；输出校验与临时模型保护判定都仍归 handler 阶段。
- 仅共享 node_repl（精确名称或 MCP serverName）且具备实际官方帧 authority 的结果，可以为本次序列化临时启用原子帧保护；预算下限 256 KiB、truncate/head。原登记项不修改，显示来源仍按原 entry 判断，不能用临时保护状态提升 CUA 卡片信任。
- failureStage 在序列化前改为 serialize，在 PostToolUse 前改为 post_hook；此后卡片、证明、结果事件或背景追踪错误均沿用该既有归类。serialize 接子 signal，PostToolUse/Failure Hook 接父 signal；handler deadline 不扩展为整个生命周期超时。
- PostToolUse 成功后以前置上下文在前、后置在后的顺序追加，按临时模型保护项处理。卡片使用原 raw output。performance 组合已有工具计量、permissionWaitMs 和从最外入口计起的 totalMs。
- 最终 modelContent 为 serialization.modelContent ?? serialization.content。已要求帧保护且最终数组含 image 时，证明失败产生可恢复的 ToolExecutionFailed，不输出成功结果；不能依据普通文字授予 authority。
- 成功结果保留 output、display、modelContent、serialization、performance、durationMs、startedAt/completedAt 和有效 readFileStateMetadata，再应用 terminal tool turn-stop。先 await Result 事件，后 await 背景追踪，再记录完成日志/字节与截断遥测并返回。
- 因为背景追踪在 Result 之后，追踪错误仍可能进入 Failure Hook 并追加 Error。此批不改变这条既有顺序，也不宣称 Result 表示背景注册成功。

## 失败与资源边界

- 守护区失败先 await Failure Hook；构造业务失败结果时保留 Error，否则按 String(error) 包装。handler-failure 的专用模型文本保持；其余使用错误消息，依原规则追加前置/失败 Hook 上下文，不擅自扩大预算或更换包装。
- 之后应用 Automation create-limit turn-stop，发布含技能元数据的 Error，记录失败日志。父 signal 已取消或结果类型 ToolCancelled 时结束取消遥测；否则按当前 failureStage、原错误类型类别和原始 error 结束失败遥测。
- Failure Hook、Error 发布、日志或遥测本身抛错仍向外传播。主守护 finally 始终解除父 signal 链接；外层遥测 scope 继续按原 unhandled/unknown 或 abort_signal 收口。不要新增宽泛 catch 或重试来吞掉这些异常。
- 类型类别保持 configuration（ConfigurationError/ToolNotFound）、permission（PermissionDenied/Escalation/Timeout）、parse（InvalidInput）、cancelled、timeout，其余 internal。
- 此批不移动守护区起点来声称修复 setup 阶段资源边界，不修改独立 timeout/Hook/permission/event/telemetry 实现的许可状态。

已单独记录两项相邻实现的既存问题，不通过此主流程补偿：timeout 的 handler 同步 throw 会绕过 timer 清理，可能在返回失败后再次取消子 signal；batch-runner 的 executeSchedule 转发会漏掉 offPeakTurn。它们需要各自的失败测试和后续修复，不能计为本批已修复。

## 验收和许可

在旧主流程建立有限契约矩阵：未登记/空名/别名、初始取消、校验/解析短路、Hook 改写和拒绝、权限允许/拒绝、父子 signal、Started-before-handler、默认模型状态时钟、各失败阶段、最终模型证明、Result-before-background、metadata 最后写入、异常传播和取消链接释放。使用隔离替身与内存端口，不运行真实命令、模型、桌面或浏览器。

新实现需通过相关矩阵、有限旧/新阶段序列对照、编译产物、根/CLI 类型和 lint、严格变更 lint、架构、格式、来源清单及完整离线回归。实际帧合同若拒绝 authority，成功分支只能用明确隔离替身验证 consumer，不写成真实设备能力。源文件须按独立设计与摘要逐项核验，未迁移的端口/服务、合同和 UI 继续保留原许可；根许可和版本不提前调整。
