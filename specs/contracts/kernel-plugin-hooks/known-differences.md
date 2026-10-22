// SPDX-License-Identifier: Apache-2.0
// kernel-plugin-hooks 与旧 core-hooks 行为的差异登记。空表示无差异。

# known-differences（v1）

**规则**：每条差异必须写明「旧行为 / 新行为 / 原因 / 影响 / 是否有等价替代」。
**不得**把「实现没做完」登记为差异 —— 差异必须是**平台能力导致的必然结果**。

---

## 已撤销的差异

### ~~D1 `PostToolUse` 的 `additionalContext` 延后到下一步~~ —— **不成立，已撤销**

**撤销原因（2026-10-22 复核）**：我先前只看了 `tools/post-execute` 的 JSDoc 概览，
漏看了 `PostToolDecision` 的**字段定义**。实测其三个分支都支持 `additionalContexts`：

```ts
export type PostToolDecision =
  | { kind: "accept"; content?: ContentBlock[]; additionalContexts?: UserMessage[] }
  | { kind: "accept"; value: JsonValue; additionalContexts?: UserMessage[] }
  | { kind: "block"; feedback: ContentBlock[]; additionalContexts?: UserMessage[] };
```

**→ `PostToolUse` 的 `additionalContext` 可以在同一回合注入**
（`tools/post-execute` 返回 `{ kind: 'accept', additionalContexts }`），
**与旧行为一致，无需延后到 `agent/pre-step`。**

**顺带确认**：`ToolExecutionSuccess` 与 `ToolExecutionFailure` 也各自携带
`additionalContexts?: UserMessage[]`，说明这是 DSH 的一等通道，不是补丁。

**教训**：判断「平台有没有某个能力」时，不能只看事件的 JSDoc 概览，
必须读到**决策/结果类型的字段定义**——能力常常在返回类型里，不在事件签名上。

---

## D1 `PostToolUse` 的 `deny` 会**把结果改写为失败**（用户可见）

| 项           | 内容                                                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **旧行为**   | `PostToolUse` Hook 返回 deny 时，工具**已经执行成功**；旧实现的处置是「附加反馈 / 标记」，工具结果本身不一定是失败                                                                                                                                                      |
| **新行为**   | DSH 的 `PostToolDecision` 只有三个分支：`accept`（可带 content/value）、`accept`（可带 additionalContexts）、`block`（feedback）。**没有「接受但标记为警告」这一档** → `deny` 只能表达为 `{ kind: 'block', feedback }`，即**把成功结果转成 `isError: true` 的错误结果** |
| **原因**     | `PostToolDecision` 的类型约束（`dsh-tools` 的类型定义里没有第四种分支）                                                                                                                                                                                                 |
| **影响**     | **用户可见**：若用户的 Hook 用 `deny` 表达「我不喜欢这个结果，但工具确实执行了」，新实现会让工具**显示为失败**。旧实现可能只是附加了警告                                                                                                                                |
| **等价替代** | 若只是想「附加提示」而不想改结果状态 → 用 `additionalContexts`（`accept` 分支支持），**不要用 deny**                                                                                                                                                                    |
| **已确认**   | 2026-10-22 实测 `PostToolDecision` 三分支 + 契约测试 `post-tool-use.test.mjs`「deny → block」                                                                                                                                                                           |

**实现建议**：本包在 `post-tool-use.ts` 里把 `deny` 映射为 `block` 并附 `feedback`；
文档/telemetry 应提示用户「PostToolUse 的 deny 会改变结果状态」，
避免用户以为它只是「加个警告」。

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

| 项           | 内容                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **旧行为**   | `SessionStart` Hook 可返回阻止性结果，旧运行时据此中止会话                                                                                                                                                                                                                                                                                                        |
| **新行为**   | `session/created` 是 `emit`；**只有同步 throw 能否决**（DSH JSDoc：「A synchronous throw vetoes and rolls back」「A returned-promise rejection is logged but cannot retroactively veto this synchronous boundary」）。异步 Hook 的阻断**降级为记录 + 计入 telemetry**，不阻断                                                                                     |
| **原因**     | `session/created` 的分发模式与 DSH 的同步边界约束                                                                                                                                                                                                                                                                                                                 |
| **影响**     | **这是静默失效，不是显式报错**：<br/>· 用户配置的 `SessionStart` Hook 几乎必然是异步脚本（`process` / `command` 形态），所以它在 DSH 上**无法阻断会话创建**<br/>· 旧运行时能阻断，新运行时只记录一条 log/telemetry → **依赖「Hook 阻止会话启动」的配置不再生效，但没有错误提示**<br/>· 若产品要求「Hook 能阻止会话」，这属于**功能缺失**而非仅差异 → 需产品侧确认 |
| **等价替代** | 无直接替代。**缓解**：若要「阻止会话进入某个状态」，可用 `UserPromptSubmit`（`agent/pre-step` waterfall）在第一次提交前阻断<br/>**注意**：这与「SessionStart 阻断」语义不同（后者在会话创建时，前者在第一次输入时）                                                                                                                                               |
| **已确认**   | 2026-10-22 实测 `dsh-session` 的 `session/created` JSDoc                                                                                                                                                                                                                                                                                                          |

**⚠️ 需要产品确认**：若「Hook 阻止会话启动」是既有能力且被用户依赖，则本差异升级为
**功能缺口**，需在 `acceptance.md` 单列并上报，而不是仅记为 known-difference。

---

## 待替换步骤确认的潜在差异

以下需在实现时实测确认，若成立则补登记：

| 潜在差异                          | 待确认内容                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Hook 输入的 `tool_input` 字段形状 | `ToolExecution` 的 args 是「已解析参数」还是「原始 JSON 字符串」？旧 B1 要求 `tool_input` 为对象                  |
| `ToolExecutionResult` 的字段映射  | B8 要求解析 stdout 的 `{decision, reason, ...}`；DSH 的 result 形状需对照                                         |
| `transcript` 的构造               | B1 要求在临时目录写 `transcript.jsonl`；DSH 的会话日志格式不同，需按 B1 的**行格式**自行构造（不读 DSH 会话日志） |
