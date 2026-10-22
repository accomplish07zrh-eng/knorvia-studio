// SPDX-License-Identifier: Apache-2.0
// kernel-plugin-hooks 验收记录。合同阶段已完成 DSH 实测；替换步骤填写实现实测。

# kernel-plugin-hooks 验收记录（v1）

**状态**：替换步骤进行中 —— **6 个挂载点已实现**（7 个 Hook 事件全覆盖）。

## 一、6 个挂载点验证（全部完成）

|  #  | Hook 事件                            | DSH 挂载点            | 实现模块                |           契约测试 | 结果 |
| :-: | ------------------------------------ | --------------------- | ----------------------- | -----------------: | :--: |
|  1  | `PreToolUse`                         | `tools/pre-execute`   | `pre-tool-use.ts`       |                 10 |  ✅  |
|  2  | `PermissionRequest`                  | `approval/request`    | `permission-request.ts` |                  8 |  ✅  |
|  3  | `PostToolUse` + `PostToolUseFailure` | `tools/post-execute`  | `post-tool-use.ts`      |                 10 |  ✅  |
|  4  | `UserPromptSubmit`                   | `agent/pre-step`      | `user-prompt-submit.ts` |                 10 |  ✅  |
|  5  | `Stop`                               | `agent/turn-stopping` | `turn-stopping.ts`      |                  9 |  ✅  |
|  6  | `SessionStart`                       | `session/created`     | `session-start.ts`      |                  9 |  ✅  |
|  —  | （纯观测）                           | `tools/result`        | `result-observer.ts`    |                  7 |  ✅  |
|  —  | 共用                                 | —                     | `verdict.ts`            | （被各挂载点覆盖） |  ✅  |

**合计 63 个契约测试，全部通过。**

## 一之二、测试覆盖与条款进度（2026-10-22 修正）

**⚠️ 修正说明**：本合同的早期版本写「`core-hooks` 的 33 个契约测试迁入」——
而实测 `specs/contracts/core-hooks/acceptance.md` 的口径是：

| 项                                      | 值               |
| --------------------------------------- | ---------------- |
| 用例数                                  | 33               |
| 源码入口（`core/src/hooks/index.ts`）   | 33 通过 / 0 失败 |
| dist 入口（`core/dist/hooks/index.js`） | 33 通过 / 0 失败 |

**→ 那 33 个测试的被测对象是 `core/src/hooks/index.ts`（core 旧实现）**，
而 `core` 随 `kernel-switch` **整包删除**（包去向表 L88）→ **那些测试随 core 消失，不迁入本包**。

**正确口径**：本包的测试**按 B1–B19 逐条新写**。当前覆盖：

| 条款 | 内容                          |  实现   | 测试数 |
| ---- | ----------------------------- | :-----: | -----: |
| B1   | stdin JSON 构造（19 条）      |   ✅    |     16 |
| B2   | 环境叠加 + 变量展开（6 条）   |   ✅    |     13 |
| B3   | 执行描述元数据（7 条）        |   ✅    |     19 |
| B4   | 展示文本脱敏（4 条）          |   ✅    |     18 |
| B5   | 配置登记（8 条）              | ⚠️ 部分 |      5 |
| B7   | 执行映射（6 条）              |   ✅    |     13 |
| B8   | 结果解析（5 条）              |   ✅    |     10 |
| B9   | stdout 与 exit 2 语义（2 条） |   ✅    |     11 |

**未实现的条款组**（后续 PR）：

- B6（workspace 登记与插入顺序）
- B10（策略提供者）/ B11（信任协调者）/ B12–B16（信任规则）
- B17（session mailbox）

**→ 按条款组算：5.5 / 17 ≈ 32%**（按代码行数或关键路径算会更高，
但按合同条款算更保守、更诚实，故采用此口径）。

## 二、探针实测记录（31 个探针用例，`tests/probes/`）

|  探针  | 结论                                                         | 影响                                      |
| :----: | ------------------------------------------------------------ | ----------------------------------------- |
|   1    | cordis `Context` 可创建、事件可注册触发                      | 测试基础设施可行                          |
|   2    | **漏传 `next` 会 TypeError**                                 | 第一轮的错误写法（保留作记录）            |
|   2b   | `next` 是 `ctx.waterfall()` 的**最后一个参数**               | 修正了 7 个挂载点的写法                   |
|   3    | `serial` 的首个 bail 值即短路                                | Stop 聚合依据                             |
|   4    | `exec.arguments` 是**已解析对象**                            | `tool_input` 不需 `JSON.parse`            |
|   5    | `tools/pre-execute` 的完整 waterfall 链路                    | —                                         |
|   6    | deny 时直接返回、不调 next（阻断）                           | —                                         |
|  7-9   | `approval/request` 返回 outcome 即认领；不调 next 下游不执行 | PermissionRequest 依据                    |
|   10   | `tools/post-execute` 可返回替换决策                          | —                                         |
|   11   | **`result` 是 deep-frozen，不可原地修改**                    | 只能返回新决策                            |
|   12   | `additionalContexts` 可随决策返回                            | 同回合注入（D1 撤销依据）                 |
|   13   | `isError` 判别成功/失败                                      | 一个挂载点覆盖两个事件                    |
|   14   | 失败结果的 `error.message` 可取                              | —                                         |
|   15   | `agent/pre-step` 可 reject / enter / 委托                    | —                                         |
|   16   | **`enter` 是「替换」语义**（返回 1 条 → 只剩 1 条）          | 注入时必须带上原 messages，否则丢用户输入 |
|   17   | `startsRequestSeries` 可传递（效果待真实运行时验证）         | 本包不使用                                |
|   18   | `agent/turn-stopping` 可 steer 让回合继续                    | —                                         |
|   19   | 不 steer 时回合正常关闭                                      | —                                         |
|   20   | bail 值短路后续监听器                                        | —                                         |
|   21   | 多个监听器都 steer 时都会执行（无 bail 不短路）              | 本包不 bail 的依据                        |
| 22-22b | `tools/result` 是 emit，返回值被忽略                         | —                                         |
|  23b   | **cordis 的 `emit` 不捕获监听器异常**                        | 观测必须自己 try/catch（第 5 个陷阱）     |
| 24-25  | emit 不短路；成功/失败都到达                                 | —                                         |
|   26   | `session/created` 的同步 throw 会传播（可否决）              | —                                         |
|   27   | **async 监听器的 throw 变成 rejection，不能否决**            | D2 是结构性限制                           |
|   28   | emit 不 await async 监听器                                   | —                                         |
| 29-30  | emit 不短路；同步 throw 中断后续                             | —                                         |

**结论与边界写在 [`tests/probes/probe-findings.md`](tests/probes/probe-findings.md)。**

## 三、未覆盖内容（三级如实标注）

| 语义                                          | 覆盖级别          | 说明                                                                                              |
| --------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| 6 个挂载点的**决策逻辑**                      | ✅ **单元测试**   | 63 个契约测试，用真实 cordis Context                                                              |
| `exec.arguments` 的**真实类型**               | ⚠️ **仅替身验证** | 探针用「构造与 DSH 类型一致的对象」验证，**未在真实工具调用链上验证**                             |
| `session/created` 的**同步 throw → DSH 回滚** | ⚠️ **仅本包逻辑** | 契约测试验证「throw 会传播」，但**未验证 DSH 是否真的回滚会话**（需集成测试 + 真实 SessionStore） |
| `startsRequestSeries` 的**实际效果**          | ❌ **未验证**     | 只验证了可传递；「新回合 vs 延续」的语义需真实运行时                                              |
| Hook 的**实际执行**（起子进程、解析 stdout）  | ❌ **未实现**     | 本 PR 只做「挂载点 + 裁决映射」；Hook 执行器（复用 B1–B9）是后续工作                              |
| 工作区 Hook **信任规则**（B10–B16）           | ❌ **未实现**     | 后续工作                                                                                          |

**⚠️ 三级标注原则**：不把「替身验证」写成「已验证」，不把「本包逻辑」写成「端到端」。

## 四、相似度门禁（新代码，全部 PASS）

| 文件                    | containment | run | structural |  判定   |
| ----------------------- | ----------: | --: | ---------: | :-----: |
| `verdict.ts`            |   **0.071** |   1 |      0.091 | ✅ PASS |
| `pre-tool-use.ts`       |   **0.056** |   1 |      0.091 | ✅ PASS |
| `permission-request.ts` |        PASS |   — |          — | ✅ PASS |
| `post-tool-use.ts`      |        PASS |   — |          — | ✅ PASS |
| `user-prompt-submit.ts` |        PASS |   — |          — | ✅ PASS |
| `turn-stopping.ts`      |        PASS |   — |          — | ✅ PASS |
| `result-observer.ts`    |        PASS |   — |          — | ✅ PASS |
| `session-start.ts`      |        PASS |   — |          — | ✅ PASS |

**口径**：`--allow-upstream-only`（新文件在 `beff12b5` 上不存在，按 #272 规则 3 显式声明）。
**门槛 0.20 / 8 / 0.40，全部大幅低于门槛。**

## 五、门禁与回归

| 项                  | 命令                                               | 结果                                                             |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| fmt                 | `pnpm fmt:check`                                   | ✅ 0                                                             |
| provenance          | `pnpm provenance:check`                            | ✅ 0（reviewProblems 0）                                         |
| 契约测试            | `node --import tsx --test tests/*.test.mjs`        | ✅ **63/63**                                                     |
| 探针                | `node --import tsx --test tests/probes/*.test.mjs` | ✅ **31/31**                                                     |
| bootstrap typecheck | `pnpm --dir apps/cli/packages/bootstrap typecheck` | ⚠️ 275 个**既有**错误，**本包文件 0 错误**（需先构建 contracts） |
| 全量离线回归        | `pnpm test:studio`                                 | 替换步骤后续填写                                                 |

## 六、DSH 侧实测记录（合同阶段已完成，此处保留）

| 项                                   | 结论                                           | 依据                                                                          |
| ------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| DSH 是否提供 Hook 机制               | **不提供**                                     | 扫描 51 个 cordis 事件扩展点（18 包），无 `dsh-hooks-*`；规格亦明确「不挂载」 |
| `tools/result` 能否阻断              | **不能**（`emit` + deep-frozen）               | `dsh-tools` 类型 L85-92                                                       |
| `tools/post-execute` 能否阻断        | **能**（`waterfall`）                          | 同 L59-70                                                                     |
| `serial` 的短路语义                  | 按序 await，**首个 bail 值即短路**             | `cordis` `events.d.ts` L20-25、L48-56                                         |
| `session/created` 能否否决           | **同步 throw 可 veto**；promise rejection 不能 | `dsh-session` L31-42                                                          |
| `agent/turn-stopping` 能否让回合继续 | **能**（`agent.steer(...)`）                   | `dsh-agent` `runtime-types.d.ts` L370-391                                     |

## 七、与 policy 的分工对齐

| 项                                                                                | 状态                                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `tools/pre-execute` 顺序约定（policy 硬约束独占 → 软约束才调 next 让 hooks 参与） | 本包合同 §六 已写明；policy 合同已对齐（issue #287 / #286） |
