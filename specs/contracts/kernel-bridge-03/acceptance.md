# kernel-bridge-03 验收

> 合同侧的验收判据。实现 PR 需在本文件逐条回填实测结果。
> 实现阶段的验收记录另写 `docs/knorvia-kernel-bridge-03-acceptance.md`（与 02 同一做法）。

## 一、范围验收

| 条目 | 判据 | 状态 |
| --- | --- | --- |
| v4 命令覆盖 | `commandPayloadSchemas` 的 **34 条全部非 `unsupported`**（B25） | 待实现 |
| legacy 端口完整 | `HANDLED_METHODS` **恰好 12 行**，与 `PORT_BACKED_METHODS` 一一对应（B24） | 待实现 |
| `session/close` | 有**真正 handler**，不是 `-32031`（B24.4） | 待实现 |
| 缺口命令 | **10 条**回专门 reasonCode，且**不伪造成功**（B20–B23） | 待实现 |
| `entry.ts` | **零改动**（B28） | 待实现 |

## 二、逐条判据

见 `behavior.md` 的 B1–B28。验收时每条都要指向一个具体测试文件与用例名。

### 分组对照

| 分组 | 条目 | 测试文件（实现阶段填） |
| --- | --- | --- |
| A 纯投影/配置 | B1–B4、B23 | `config-session.test.mjs` |
| B 队列 | B6–B11 | `queue-ops.test.mjs` |
| C 回合栈 | B12–B18 | `fork-edit.test.mjs`、`goal-commands.test.mjs` |
| D 其余与缺口 | B19–B23 | `capability-gaps.test.mjs` |
| E 收口与回归 | B24–B28 | `turn-seam.test.mjs`、`no-unsupported.test.mjs` |

## 三、C2 的完整验收（12/12）

### 3.1 完成度演进（本包不是从零开始）

| 阶段 | 交付 | 状态 |
| --- | --- | --- |
| `kernel-bridge-02` | **4/12**：`session/send`、`session/stop`、`session/cancelBackgroundTask`、`session/compact` | ✅ 已合并（`67ceda04`） |
| **`kernel-bridge-03`（本包）** | 补足**其余 8/12** | 待实现 |
| 合计 | **12/12** | 本包完成时达成 |

**分母是 12 不是 11**：`PORT_BACKED_METHODS` 实测 12 个，其中 `session/close` 曾被人工清单两次漏计
（它在端口表里，但 `legacy/session-handlers.ts` 无 handler、02 也未交付，故归本包）。详见 `known-differences.md` D1。

### 3.2 判据

| 项 | 判据 |
| --- | --- |
| 表规模 | `HANDLED_METHODS.size === 12`，且每个 key 都在 `PORT_BACKED_METHODS` 里 |
| 注册后 | 12 个方法**全部**落到执行器（逐条断言方法名 + sessionId） |
| 未注册 | 12 个方法**全部**回 `-32031`（反向断言，且断言执行器 `seen.length === 0`） |
| 02 已交付的 4 个 | **仍需可用**（本包扩表不得破坏既有 4 条） |
| `session/close` | 有真实 handler；语义与 `session/stop` **不同**（需查旧引擎行为并在实现阶段说明依据） |
| 表注释 | 代码里写明「这张表是 C2 的唯一事实来源」 |
| 计数依据 | 以 `PORT_BACKED_METHODS` 为准，不靠人工清单（人工清单已两次漏 `session/close`） |
| 夹具校验 | `fixture-integrity.test.mjs` 对源头比对（34 命令 / 12 方法双向一致） |

## 四、门禁（与 02 同口径）

| 检查 | 判据 |
| --- | --- |
| `fmt` / `fmt:check` | exit 0 |
| `typecheck` | exit 0 |
| `lint` | exit 0，**本包零新增告警** |
| `architecture:check` | violations 0 / new 0 |
| `build:cli-packages` | 全部包通过 |
| 相似度 normal | 全部 candidate 通过 |
| 相似度 declaration | 全部 candidate 通过 |
| `provenance:report` / `check` | `reviewProblems: 0`、`missingReviews: []` |
| `knip` | **条目级零新增**（与 main 基线对比） |
| 假 provider 泄漏 | `grep -r "knorvia-fake" src dist` 两处都为空 |
| `test:studio` | 交 CI |

### 登记顺序（#229/#236 实测）

`fmt` → `fmt:check` → 登记（`register-files.mjs`）→ **`fmt`（关键）** → `fmt:check` →
`provenance:report` → `provenance:check`（最后一步，之后不再跑 `fmt`）。

## 五、回归判据

| 套件 | 判据 |
| --- | --- |
| `kernel-bridge-01` | 20/20 全过 |
| `kernel-bridge-02` | 50/50 全过 |
| `kernel-dsh-builtins` | 56/56 全过 |
| `kernel-dsh-00` | 25/25 全过 |
| `kernel-bridge-legacy` | 全过（本包不改它，但依赖它的端口面） |

## 六、实现阶段必须记录的证据

| # | 证据 |
| --- | --- |
| 1 | 34 条命令的 `reasonCode` 实测表（每条一行，证明非 `unsupported`） |
| 2 | 12 个 legacy 方法的到达实测（方法名 + sessionId） |
| 3 | 队列操作后 `order.queuePosition` 与 DSH 队列一致性的实测 |
| 4 | 缺口 10 条的能力缺席实测（证明不是 `accepted`） |
| 5 | 相似度两个门的逐文件实测（文件名 + containment + run + structural） |
| 6 | 「改既有文件前先测干净 main 基线」的对比数据（若本包需改既有文件） |

## 七、仍需 Lead 裁决的前置问题

| # | 问题 | 影响 |
| --- | --- | --- |
| Q1 | 端口表扩到 12 行（改 02 的文件）是否可接受 | 影响实现落点 |
| Q2 | `applyFileRewind` 边界（命令面归 03 / 机制归 `kernel-plugin-rewind`） | 影响 B20 |
| Q3 | 缺口 10 条的处置：拆三个接入包 vs 允许过渡期降级 | **决定 03 是否能声称「34 条全部实现」** |
| Q4 | ~~reasonCode 是否核准~~ **已核准并冻结为 `fault.command.capabilityAbsent`**（见 `interface.md` §3.1） | 已解决，B20–B23 直接断言该字面量 |

> **Q3 是阻塞项**：若用户选择「三包补齐后再 switch」，03 的范围不变；
> 若选择「允许过渡期降级」，03 要多写缺口条目与降级说明。
