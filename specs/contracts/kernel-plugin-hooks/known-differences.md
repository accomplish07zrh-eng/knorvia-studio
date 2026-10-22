// SPDX-License-Identifier: Apache-2.0
// kernel-plugin-hooks 与旧 core-hooks 行为的差异登记。空表示无差异。

# known-differences（v1）

**规则**：每条差异必须写明「旧行为 / 新行为 / 原因 / 影响 / 是否有等价替代」。
**不得**把「实现没做完」登记为差异 —— 差异必须是**平台能力导致的必然结果**。

---

## D1 `PostToolUse` 的 `additionalContext` 延后到下一步

| 项           | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **旧行为**   | `PostToolUse` Hook 返回 `additionalContext` 后，该内容在**同一回合**进入模型上下文（下一次模型请求就能看到）                                                                                                                                                                                                                                                                                                                                                                                |
| **新行为**   | `additionalContext` 通过 `agent/pre-step` 的 messages 替换能力注入，**延后到下一步**                                                                                                                                                                                                                                                                                                                                                                                                        |
| **原因**     | DSH 没有「工具结果返回后追加上下文」的公开通道：<br/>· `tools/post-execute` 能「接受/替换/增强/阻断」**结果本身**，但没有「额外插入一条 message」的接口<br/>· `tools/result` 是 `emit` + `deep-frozen`，只能观察<br/>· `ToolRunContext.deferContext(message)` 存在，但它是**工具实现内部**的接口（JSDoc：「typically a nested-dispatch context ferried by a composite tool, or a fresh plugin-sourced instruction」），不是插件扩展点<br/>· `agent/pre-step` 的 messages 替换是**公开**能力 |
| **影响**     | 若 Hook 用 `additionalContext` 做「立即纠正模型」的事，纠正晚一拍生效。对于「补充信息供下一步参考」的用法无影响                                                                                                                                                                                                                                                                                                                                                                             |
| **等价替代** | 无完全等价的替代；`agent/pre-step` 是语义最接近的公开路径                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **已确认**   | 2026-10-22 实测 `tools/post-execute` / `tools/result` / `ToolRunContext` 三者的 JSDoc                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## D2 `Stop` 的多 Hook 执行次数不同（聚合结论等价）

| 项           | 内容                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **旧行为**   | 多个 `Stop` Hook **按注册顺序**执行；第一个返回 `continue: true` 的 Hook 之后的**不再执行**（短路）                                                                                                            |
| **新行为**   | `agent/turn-stopping` 是 `serial`：**按序 await 直到某个监听器 bail**；DSH 的约束是「数据决定，监听器顺序不能改变结论」。因此**所有监听器都会执行**（除非某个 bail），最终只要有任一 Hook 要求继续，回合就继续 |
| **原因**     | cordis `serial` 的分发语义（`events.d.ts`：「awaits them in order until one bails」）+ `agent/turn-stopping` 的「listener order cannot change the outcome」                                                    |
| **影响**     | · **聚合结论等价**（都是「有一个要继续就继续」）<br/>· **执行次数不同**：旧行为短路后不再跑后续 Hook，新行为会跑完<br/>· 若某个 Hook 有副作用（写文件、发网络请求），它会在「旧行为本不会执行」的情况下执行    |
| **等价替代** | 无 —— `serial` 的模式决定了顺序无关。若需要严格短路，需 DSH 增加 bail 语义的 Stop 挂载点                                                                                                                       |
| **已确认**   | 2026-10-22 实测 `cordis/lib/types/events.d.ts` 的 `serial` 定义 + `dsh-agent` 的 `agent/turn-stopping` JSDoc                                                                                                   |

---

## D3 `SessionStart` 的异步 Hook 不能阻断会话创建

| 项           | 内容                                                                                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **旧行为**   | `SessionStart` Hook 可返回阻止性结果，旧运行时据此中止会话                                                                                                                                                                                                                    |
| **新行为**   | `session/created` 是 `emit`；**只有同步 throw 能否决**（DSH JSDoc：「A synchronous throw vetoes and rolls back」「A returned-promise rejection is logged but cannot retroactively veto this synchronous boundary」）。异步 Hook 的阻断**降级为记录 + 计入 telemetry**，不阻断 |
| **原因**     | `session/created` 的分发模式与 DSH 的同步边界约束                                                                                                                                                                                                                             |
| **影响**     | 若用户的 `SessionStart` Hook 是异步脚本（`process` / `command` 形态必然异步），它**无法阻断会话创建**；只能记录                                                                                                                                                               |
| **等价替代** | 无直接替代。**缓解**：若要「阻止会话进入某个状态」，可用 `UserPromptSubmit`（`agent/pre-step` waterfall）在第一次提交前阻断<br/>**注意**：这与「SessionStart 阻断」语义不同（后者在会话创建时，前者在第一次输入时）                                                           |
| **已确认**   | 2026-10-22 实测 `dsh-session` 的 `session/created` JSDoc                                                                                                                                                                                                                      |

---

## 待替换步骤确认的潜在差异

以下需在实现时实测确认，若成立则补登记：

| 潜在差异                          | 待确认内容                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Hook 输入的 `tool_input` 字段形状 | `ToolExecution` 的 args 是「已解析参数」还是「原始 JSON 字符串」？旧 B1 要求 `tool_input` 为对象                  |
| `ToolExecutionResult` 的字段映射  | B8 要求解析 stdout 的 `{decision, reason, ...}`；DSH 的 result 形状需对照                                         |
| `transcript` 的构造               | B1 要求在临时目录写 `transcript.jsonl`；DSH 的会话日志格式不同，需按 B1 的**行格式**自行构造（不读 DSH 会话日志） |
