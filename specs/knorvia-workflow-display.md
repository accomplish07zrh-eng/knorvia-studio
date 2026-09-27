<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 工作流结果的快照投影

2026-09-28。替换 core 的 create-workflow-display 和 workflow-observation-display 两个入口，保留现有确认窗、实时结果和历史回放载荷。已访问旧源码，不作无接触声明。固定名字、字段、截断标记、阈值及状态值属于兼容要求，不作为独立实现的唯一依据。

## 所有者与设计

工作流运行状态仍由引擎/工具持有；投影器同步读取通过完整 schema 校验的快照，不接触文件、时间、事件或模型。新设计使用精确名称登记表和完整解析适配器；卡片策略通过调用内的配额记录器选择头部、尾部及字节文本。诊断共享单独的字符投影；每种卡片明确决定何种裁剪计入 truncated，不能将不同单位和旧策略混合。

```text
工具原始输出 → 精确名称 → 原公共 schema 完整校验
                             ↓
                     解析后的独立快照
                             ↓
          卡片策略 + 调用内配额事实 → 原 display payload
                                      ↓
                            continuous / replayable
```

公开 createCreateWorkflowDisplay 再导出继续供确认和修订流程调用；观察卡仍是结果总路由的候选，undefined 允许原 MCP/文件差异后备。没有更换工作流引擎、审批、来源识别、图算法、schema 或 UI；不存在新业务状态和额外 await。

## 固定契约

- 名称严格区分大小写。错误名称不读取 output 属性；匹配后使用原完整输出 schema，包含最终不展示的字段。schema 拒绝返回 undefined，属性读取异常继续传播，不转换为成功卡片。
- CreateWorkflow 与 AmendWorkflow 共用 create_workflow。诊断取前 100 条，单条 message 按 UTF-16 取前 2048 单元，保留 line/column/code，errorCount 是完整诊断数。只有诊断条目丢失才设置外层 truncated；单条消息截短和 causalityGraph.truncated 不影响它。图保持解析后的结构，不把 gate/source 字段加进 display。
- GetWorkflowRun：actors 取前 32 条；logTail 取最后 40 条，条目 message 为 1024 UTF-8 字节；result 为 4000 字节，使用既有完整截断标记。以上裁剪、phases/subagents 的可见裁剪和 subagentsTruncated=true 共同设置 truncated。phases 空或缺席时省略，subagents 即使为空也保留。possiblyInterrupted 只有严格 true 输出；result 空串、日志 at=0 保留，不补当前时钟。
- 详情保留 runId/label/status/stopReason、summary/generatedAt/usage、health；不增加模型面专用字段。error 只输出 code/message，providerStop 不得进入卡片，以免破坏严格回放 schema。
- 子代理按原顺序投影身份、可选 name、state/phaseName、currentAsk 的 instructionsHead/startedAt/turn/toolCalls/lastTool、waitCause/retryAfterMs/waitSince、parkedOn、stepsSettled/stepsFailed/tokens/lastProgressAt。可选值只按 undefined 判断，保留 0 和空字符串。不带 wait.reason、ask 身份或 actorSeq。
- ListWorkflowRuns 使用解析后的 runs，只有上游 truncated===true 才设置标记，当前投影不额外限制行数。
- EvalWorkflowSnippet：诊断规则同创建卡但无 errorCount；日志取尾 40 条，每条 1024 字节；response 4000 字节。日志/response 的字节裁剪及条目丢失标记 truncated，诊断单条字符裁剪不标记。保留 ok/durationMs；输入日志超出完整 schema 的 2048 字符限制时先拒绝，不能通过显示截断绕过校验。
- ListSavedWorkflows：每行保持 name/description/whenToUse/scope/path/argNames 的顺序，description 与 whenToUse 各 2048 字节；缺 whenToUse 仍保留 own 属性值 undefined。args 仅取解析后 Object.keys 顺序，不携带声明正文。invalid.reason 同用 2048 字节，空 invalid 省略。列表和参数名数量沿用当前无额外裁剪规则。
- ListModels：前 100 行；providerLabel/disabledReason 各 2048 字节，缺席才省略；reasoningLevels 是复制数组，其他字段按当前顺序和缺席规则输出。current 即使指向被裁掉的行也保留，不自动重选。行数或文本裁剪设置 truncated。
- ResumeWorkflowRun 严格验证完整输出后只返回 kind/runId；response 和 backgroundTaskId 虽不显示仍须有效，不自动校正两个 ID 的关系。

## 既有合同缺口

ListWorkflowRuns 超过 50 行、ListSavedWorkflows 超过 50 行或超过 32 个参数名仍能构造卡片，随后被公共 display schema 拒绝。保存列表 invalid.reason 的投影预算为 2048 字节，但公共 display schema 仅允许 1024 字符；例如 1500 个 ASCII 字符会原样输出但不能通过后续校验。此批明确记录并锁定这些既有边界，不借独立替换改变实际行为，也不声称这些载荷已通过回放验证。

phases 超过 32、subagents 超过 64 则由完整输出 schema 先拒绝；显示 slice 不是允许超限输入的备用路径。测试应区别输入拒绝、构造时裁剪、构造后 schema 拒绝三个阶段。

## 验收与许可范围

先在原实现运行固定用例，覆盖精确路由、完整校验/异常、各项配额、缺席与零值、字段顺序、错误细节过滤、原有 schema 缺口及总结果路由回退。新实现再做有限结构/序列化对照、源代码及编译产物检查、根/CLI 类型和 lint、变更严格 lint、架构、格式、来源清单及完整离线回归。没有真实工作流执行、模型、设备或人工目视验收。

仅对本批明确替换的实现、新规格和测试记录来源依据与摘要；原公共合同、图、工具/运行引擎、UI 和第三方继续保留适用许可。根许可和预览版本继续保留，整库独立替换和最终稳定版发布尚未完成。
