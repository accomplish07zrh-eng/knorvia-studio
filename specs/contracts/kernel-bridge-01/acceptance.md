# kernel-bridge-01 验收

## 一、完成定义

本包完成 = 合同 PR 合并 + 实现 PR 合并 + 默认引擎零回归 + `dsh` 引擎在**同一套 v4 契约测试**上全过 + 桩门全失败 + 复用清单中的测试继续通过 + 来源登记 + Linux/Windows CI 全绿。

默认引擎切换不在本包（`kernel-switch`）。

## 二、合同阶段（PR「contract: kernel-bridge-01 v1」）

| 项                 | 判据                                                               | 状态 |
| ------------------ | ------------------------------------------------------------------ | ---- |
| 范围与不在范围     | [README.md](README.md) §一                                         | ✅   |
| 锁定不变量         | README §二 L1–L7                                                   | ✅   |
| 复用清单           | README §三（含“无既有运行时级 v4 用例”的实测结论）                 | ✅   |
| B 条目九项         | [behavior.md](behavior.md) B1–B16                                  | ✅   |
| 接口               | [interface.md](interface.md)                                       | ✅   |
| 调用方             | [callers.md](callers.md)                                           | ✅   |
| 已知差异           | [known-differences.md](known-differences.md) D1–D21                | ✅   |
| 合同测试           | `tests/*.test.mjs` 全部经 v4 公开入口；断言不得 import 内部模块    | ✅   |
| 旧门（默认引擎）   | `node .../run-old-gate.mjs`：全过                                  | ✅   |
| 桩门               | 同一运行器：`pass=0 && fail>0`                                     | ✅   |
| 格式 / Lint / 类型 | `pnpm fmt:check`、`pnpm lint`、`pnpm typecheck`                    | ✅   |
| 来源               | `licensing/reviews.json` 程序化追加；`provenance:report` / `check` | ✅   |

合同阶段产物：

| 文件                        | 内容                                                 |
| --------------------------- | ---------------------------------------------------- |
| `gate-old.json`             | 默认引擎运行记录（tests/pass/fail、Node 版本、命令） |
| `stub-gate.json`            | transport 桩运行记录与 `allFail` 判据                |
| `tests/entry.mjs`           | 入口解析（dist + 测试覆盖变量）                      |
| `tests/_protocol.mjs`       | 黑盒 NDJSON 驱动、环境隔离、帧匹配与 ACK 断言        |
| `stubs/app-server-stub.mjs` | 仅 transport 签名；用于证明用例非自证                |

## 三、实现阶段（PR「replace: kernel-bridge-01（DSH 协议桥）」）

### 1. 功能

- [ ] `KNORVIA_KERNEL_ENGINE=dsh` 时 `app-server --stdio` 提供 v4 入口；默认引擎输出与基线一致。
- [ ] `node specs/contracts/kernel-bridge-01/tests/run-old-gate.mjs --engine dsh`：B3–B16 全部通过，生成 `gate-dsh.json`。
- [ ] 旧门（默认引擎）继续全过；桩门继续 `pass=0 && fail>0`。
- [ ] `packages/shared/src/protocol-v4/**` 与 `packages/shared/src/protocol/index.ts` 无字段改动；`shared-01` 全过。
- [ ] 命令 → DSH 会话操作、DSH 事件 → v4 投影按 [interface.md](interface.md) §六实现；v4 `seq` 由桥独立记账。
- [ ] 双链路与 flow 语义保持；订阅响应先于 initial frame，resync 只作用于本订阅。
- [ ] stdin EOF/SIGTERM 后释放 DSH host 并退出 0；失败路径退出 1，不悬挂。
- [ ] 默认路径不加载任何 `@deepseek-ai/*`；不修改 DSH 源或 node_modules。

### 2. 命令组验收矩阵

离线场景至少覆盖 ACK 与帧；需要模型的路径标注“真实模型”（归 `kernel-switch`）。

| 命令组       | 命令                                                                                                                                      | 离线验收                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 会话生命周期 | `createSession`（含/不含 firstInput）、`createSelectionSideSession`、`renameSession`、`deleteSession`                                     | 草稿/首轮快照、幂等、删除后订阅语义                   |
| 输入与队列   | `sendText`、`sendGoalCommand`、`stop`、`compact`、`sendQueuedNow`、`editQueueItem`、`reorderQueueItem`、`deleteQueueItem`、`setAutoDrain` | 无模型下的 admission/queue 状态与 ACK；真实模型补轮次 |
| 交互         | `resolveInteraction`、`snoozeInteractionAutoResolution`                                                                                   | 先到先得与 `noop`；无交互时既有 fault                 |
| 配置         | `switchModelConfig`、`switchCollaborationMode`、`setFollowupMode`                                                                         | 快照/增量/revision；同值 no-op                        |
| 目标         | `pauseGoal`、`resumeGoal`                                                                                                                 | 无目标时的既有拒绝；有目标状态由实现验收              |
| 分支与行     | `forkAssistant`、`applyFileRewind`、`editUserQuery`、`retryTurn`、`setAssistantFeedback`                                                  | 行目标校验、CAS、fault；文件回退按既有语义            |
| Hook 审核    | `respondWorkspaceHookReview`、`toggleWorkspaceHookReviewItem`、`revokeWorkspaceHookTrust`、`requestWorkspaceHookReview`                   | 能力缺席返回既有 fault；插件接入后补                  |
| 后台与工作流 | `cancelBackgroundWork`、`resumeWorkflowRun`、`startSavedWorkflow`、`amendWorkflowRunSettings`                                             | 能力缺席返回既有 capability 错误；插件接入后补        |
| 共享上下文   | `discardSharedContext`                                                                                                                    | 幂等与边界                                            |

- “能力缺席”必须使用既有 `V4CapabilityUnsupportedError` / `fault.*` 词表，不得新增 reasonCode 或静默 accepted。
- 真实模型轮、工具调用、权限交互、附件字节流、工作流实际执行：实现 PR 给出可复现命令或明确标注归后续包/`kernel-switch`。

### 3. 复用清单回归

| 套件                                                                                                           | 实现阶段要求                                     |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `specs/contracts/shared-01`                                                                                    | source 与 dist 全过；无 schema 改动              |
| `specs/contracts/apps-cli-packages-01-model`                                                                   | 全过（若桥复用其模块）                           |
| `apps/cli/packages/bootstrap/test/session-projection-contract.test.ts`、`session-snapshot-contract.test.ts` 等 | 复用模块全过；未复用的模块随旧包删除并在 PR 说明 |
| `specs/contracts/kernel-dsh-00/tests/engine-selection.test.mjs`                                                | 全过；默认路径不加载 DSH                         |
| `specs/contracts/contracts-*`、`shared-02/03`、`dynamic-workflow-*`、`apps-cli-packages-01`                    | 全过；期望不变                                   |

### 4. 门禁（实现 PR 贴全表）

| 检查         | 命令                                               | 结果 |
| ------------ | -------------------------------------------------- | ---- |
| 类型         | `pnpm typecheck`                                   | ⬜   |
| Lint         | `pnpm lint`                                        | ⬜   |
| 格式         | `pnpm fmt:check`                                   | ⬜   |
| 架构（全量） | `pnpm architecture:check`                          | ⬜   |
| 构建         | `pnpm build:cli-packages`                          | ⬜   |
| 离线回归     | `pnpm test:studio`（含本目录测试自动发现）         | ⬜   |
| 旧门         | `run-old-gate.mjs`                                 | ⬜   |
| 新运行时门   | `run-old-gate.mjs --engine dsh`                    | ⬜   |
| 桩门         | 同一运行器（默认即跑）                             | ⬜   |
| 未使用       | `pnpm knip`                                        | ⬜   |
| 来源         | `pnpm provenance:report` + `pnpm provenance:check` | ⬜   |
| 相似度       | 替换文件才跑；新桥文件登记 original                | ⬜   |
| CI           | Linux + Windows 全绿                               | ⬜   |

## 四、演示缺口（不在本包）

- v4 之外的 DSH 表面（ACP/SDK/Web）不接入产品。
- 工具/权限/Hook/凭据/记忆/技能/MCP/目标/子 Agent/压缩（`kernel-plugin-*`）。
- 旧会话库导入（`kernel-legacy-sessions`）。
- 默认引擎切换与旧运行时删除（`kernel-switch`）。
- 安装版/便携版、macOS 实机、真实模型冒烟、网络抓包（`kernel-switch`）。

## 五、随旧包删除的旧端口测试

以下套件直接 import `apps/cli/packages/core/src/**` 或旧 runtime/tool handler 内部端口，**不迁移到新运行时**，随 `core` 包删除；这里登记以保证删除时有据可查：

| 套件                                                  |
| ----------------------------------------------------- |
| `specs/contracts/core-01`                             |
| `specs/contracts/core-02`                             |
| `specs/contracts/core-03`                             |
| `specs/contracts/core-hooks`                          |
| `specs/contracts/core-runtime-helpers-01`             |
| `specs/contracts/core-runtime-methods-01`             |
| `specs/contracts/core-runtime-methods-02`             |
| `specs/contracts/core-tool-01`                        |
| `specs/contracts/core-tool-handlers-bash-01`          |
| `specs/contracts/core-tool-handlers-workflow-01`      |
| `specs/contracts/core-tool-handlers-workflow-runs-01` |
| `apps/cli/packages/core/test/**`                      |

- 删除前必须确认对应路径随 `kernel-switch` 一并移除；不得在新运行时上伪造这些内部端口。
- 不属于旧端口的 schema/纯模块合同（`shared-*`、`contracts-*`、`apps-cli-packages-01*`）按 §三.3 继续保留。

## 六、首轮失败与修正

实现 PR 记录：首次失败项、原因（合同漏写 / 实现错误 / 既有失败）、修正方式。不得通过删测试、放宽断言、调门槛解决。

## 七、未覆盖

- B16 只断言正常 EOF；信号路径沿用 CLI 既有入口，实机验证归实现 PR/CI。
- `connection flow` 的 `closed` 状态保留既有语义，本包不新增断言。
- 分片帧（wire `kind="fragment"`）由 shared-01 编解码测试覆盖；本包只断言小帧 `complete` 路径。
