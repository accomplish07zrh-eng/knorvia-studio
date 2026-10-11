<!-- SPDX-License-Identifier: Apache-2.0 -->

# 继承文件分诊表（M0-3）

2026-10-11。对应《Knorvia 独立替换任务计划书》M0-3：首快照与上游相似文件分诊。

## 1. 方法与判据

- 输入：`licensing/current-files.json` 里 `unreviewed` 的 5729 个文件（主仓 70edae4b）。
- 首快照：路径存在于首快照提交 `7619e41b950bd52073ebf36754146cf25659d9fa` 的树里（该提交共 7047 个文件）。
- 上游相似：按计划书「行相似度」同一算法与同一门槛，与固定上游 `zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521` 逐文件比较。规范化去首尾空白、丢空行、丢纯括号行与 import/re-export 行；包含率取最相似同类文件；最长相同段取极大对齐起点向后延伸的最大值。
- 判定「相似」＝**按计划书门槛判为不通过**：规范化行数 ≥ 10 时包含率 ≥ 0.2 或最长相同段 ≥ 8；< 10 行时包含率 > 0。
- 二进制与不可解码文件不做相似度判定；未做判定的文件只按首快照判。

## 2. 结论汇总

| 分组                                                          | 候选 | 一档（强派生） | 二档（仅包含率） | 三档（仅首快照） |
| ------------------------------------------------------------- | ---- | -------------- | ---------------- | ---------------- |
| 产品源码（`packages/`、`apps/`）                              | 912  | 315            | 324              | 273              |
| 登记与证据（`licensing/`、`docs/`、`specs/`、`third-party/`） | 732  | 355            | 342              | 35               |
| 其他（根目录、`scripts/`、`examples/`、`config/`）            | 23   | 11             | 6                | 6                |
| 合计                                                          | 1667 | 681            | 672              | 314              |

处理口径（计划书原文）：**派生的视同继承，并入替换包；冻结证据里的上游摘录书面列为例外。**

- 产品源码的 912 个文件全部落在三档之内，按上式一律**并入对应替换包处理**：一、二档按计划书门槛本来就判不通过，不能作为自有实现交付，领包时重写到达标为止（包内也可先核实是否有误判，但不放宽门槛）；三档存在于首快照，按 M0-1 条件 1 不能登记为 original。
- 登记与证据类不随产品发布，其中的上游摘录按计划书**书面列为例外**（第 4 节），不作为替换目标。
- 本表只做分诊，不改分类、不改登记、不改代码；分类变更由 M0-2 与各包的替换 PR 按各自口径完成。

## 3. 需要并入替换包的源码文件

按项目目录分组；`里程碑` 一列给出替换包所属阶段，具体包 ID 按分包总表在领包时确定。

### apps/cli/packages（269）

| 文件                                                                                                  | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                                                        | 里程碑 |
| ----------------------------------------------------------------------------------------------------- | ---- | ------ | ------ | ---------- | ----------------------------------------------------------------------------------------------------- | ------ |
| `apps/cli/packages/adapters/src/fs/file-search-paths.ts`                                              | 一档 | 否     | 0.34   | 20         | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                    | M2 CLI |
| `apps/cli/packages/adapters/src/fs/node-file-io.ts`                                                   | 二档 | 否     | 0.40   | 6          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                    | M2 CLI |
| `apps/cli/packages/adapters/src/fs/node-file-policy.ts`                                               | 二档 | 否     | 0.33   | 5          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                    | M2 CLI |
| `apps/cli/packages/adapters/src/fs/node-search.ts`                                                    | 二档 | 否     | 0.42   | 6          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                    | M2 CLI |
| `apps/cli/packages/adapters/src/fs/ripgrep-plan.ts`                                                   | 一档 | 否     | 0.32   | 8          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                    | M2 CLI |
| `apps/cli/packages/adapters/src/fs/ripgrep-worker.ts`                                                 | 二档 | 否     | 0.27   | 4          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                    | M2 CLI |
| `apps/cli/packages/adapters/src/fs/text-search-lines.ts`                                              | 二档 | 否     | 0.23   | 4          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                    | M2 CLI |
| `apps/cli/packages/adapters/src/fs/text-search-results.ts`                                            | 二档 | 否     | 0.43   | 4          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                    | M2 CLI |
| `apps/cli/packages/adapters/test/artifact-uri.test.ts`                                                | 三档 | 是     | 0.06   | 1          | `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`                                             | M2 CLI |
| `apps/cli/packages/adapters/test/device-fs-contract/native-world.mjs`                                 | 二档 | 否     | 0.27   | 3          | `packages/services/src/fs/fsFaultInjection.ts`                                                        | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-entrypoint.ts`                                              | 一档 | 是     | 0.81   | 16         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts`                                  | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/assistant-feedback-persistence.ts`                       | 一档 | 是     | 0.99   | 59         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/assistant-feedback-persistence.ts`           | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/attachment-upload-registry.ts`                           | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/attachment-upload-registry.ts`               | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/cold-event-merge.ts`                                     | 一档 | 是     | 0.98   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cold-event-merge.ts`                         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/cold-file-change-summaries.ts`                           | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cold-file-change-summaries.ts`               | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/cold-session-resume.ts`                                  | 一档 | 是     | 0.97   | 29         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cold-session-resume.ts`                      | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/command-inbox.ts`                                        | 一档 | 是     | 0.99   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/command-inbox.ts`                            | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/attachment-refs.ts`                             | 一档 | 是     | 0.96   | 37         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/attachment-refs.ts`                 | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/executor.ts`                                    | 一档 | 是     | 1.00   | 61         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/executor.ts`                        | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/assistant-feedback.ts`                 | 一档 | 是     | 0.96   | 20         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/assistant-feedback.ts`     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/file-rewind.ts`                        | 一档 | 是     | 0.96   | 23         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/file-rewind.ts`            | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/fork-edit-retry.ts`                    | 一档 | 是     | 0.99   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/fork-edit-retry.ts`        | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/goal-compact.ts`                       | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/goal-compact.ts`           | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/interaction-background.ts`             | 一档 | 是     | 0.98   | 124        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/interaction-background.ts` | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/model-config.ts`                       | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/model-config.ts`           | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/queue.ts`                              | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/queue.ts`                  | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/selection-side-session.ts`             | 一档 | 是     | 0.98   | 57         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/selection-side-session.ts` | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/session-flow.ts`                       | 一档 | 是     | 0.99   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-flow.ts`           | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/handlers/session-mgmt.ts`                       | 一档 | 是     | 0.99   | 135        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-mgmt.ts`           | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/input-intent.ts`                                | 一档 | 是     | 1.00   | 116        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/input-intent.ts`                    | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/prompt-turn.ts`                                 | 一档 | 是     | 1.00   | 197        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/prompt-turn.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/commands/types.ts`                                       | 一档 | 是     | 0.97   | 160        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/types.ts`                           | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/conversation-telemetry-facts.ts`                         | 一档 | 是     | 0.99   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-telemetry-facts.ts`             | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/conversation-telemetry-workflow-facts.ts`                | 一档 | 是     | 0.99   | 81         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-telemetry-workflow-facts.ts`    | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/conversation-topic-publisher.ts`                         | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.ts`             | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/create-session-command-fact.ts`                          | 一档 | 是     | 1.00   | 47         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/create-session-command-fact.ts`              | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/cua-app-snapshot.ts`                                     | 一档 | 是     | 0.99   | 74         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cua-app-snapshot.ts`                         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/cua-permission-observation.ts`                           | 一档 | 是     | 0.89   | 35         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/cua-permission-observation.ts`               | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/event-normalizer.ts`                                     | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/event-normalizer.ts`                         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/interaction-options.ts`                                  | 一档 | 否     | 0.74   | 8          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/interaction-registry.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/interaction-registry.ts`                                 | 一档 | 是     | 0.86   | 87         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/interaction-registry.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/local-ttft-compaction.ts`                                | 一档 | 是     | 0.97   | 34         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/local-ttft-compaction.ts`                    | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/local-ttft.ts`                                           | 一档 | 是     | 0.99   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/local-ttft.ts`                               | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/model-config-mutation.ts`                                | 一档 | 是     | 0.92   | 13         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/model-config-mutation.ts`                    | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/persistent-command-facts.ts`                             | 一档 | 是     | 0.99   | 116        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/persistent-command-facts.ts`                 | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/persistent-command-index.ts`                             | 一档 | 是     | 1.00   | 67         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/persistent-command-index.ts`                 | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/product-projection-bash-progress.ts`                     | 一档 | 是     | 0.95   | 31         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection-bash-progress.ts`         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/product-projection.ts`                                   | 一档 | 是     | 0.99   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`                       | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/projection-rows.ts`                                      | 一档 | 是     | 0.99   | 132        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/projection-rows.ts`                          | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/projection-state.ts`                                     | 一档 | 是     | 0.99   | 172        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/projection-state.ts`                         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/queue-auto-drain.ts`                                     | 一档 | 是     | 1.00   | 15         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/queue-auto-drain.ts`                         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/sessions-index-projection.ts`                            | 一档 | 是     | 0.99   | 178        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-projection.ts`                | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/sessions-index-publisher.ts`                             | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/sessions-index-publisher.ts`                 | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/stable-fork-target.ts`                                   | 一档 | 是     | 0.97   | 78         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/stable-fork-target.ts`                       | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/task-list-session-membership.ts`                         | 一档 | 是     | 0.87   | 12         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/task-list-session-membership.ts`             | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/topic-frame-reservation.ts`                              | 一档 | 是     | 1.00   | 10         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/topic-frame-reservation.ts`                  | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/transcript-hydration.ts`                                 | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/v4-gateway.ts`                                           | 一档 | 是     | 0.99   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts`                               | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol-v4/workspace-config-publisher.ts`                           | 一档 | 是     | 1.00   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/workspace-config-publisher.ts`               | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/account-provider-config.ts`                                 | 一档 | 是     | 0.72   | 8          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/account-provider-config.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/ai-sdk-warning-logger.ts`                                   | 一档 | 是     | 0.88   | 18         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/ai-sdk-warning-logger.ts`                       | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/automation-port.ts`                                         | 一档 | 是     | 0.87   | 27         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/automation-port.ts`                             | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/background-work-owner.ts`                                   | 一档 | 是     | 0.95   | 17         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/background-work-owner.ts`                       | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/computer-use-operation-event.ts`                            | 一档 | 是     | 0.97   | 37         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/computer-use-operation-event.ts`                | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/dynamic-workflow-policy.ts`                                 | 一档 | 是     | 0.87   | 9          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/dynamic-workflow-policy.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/interaction-auto-resolution.ts`                             | 一档 | 否     | 0.90   | 27         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts`                          | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/interaction-broker.ts`                                      | 一档 | 是     | 0.70   | 24         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts`                          | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/interaction-permission-response.ts`                         | 一档 | 否     | 0.85   | 18         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts`                          | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/interaction-preferences.ts`                                 | 一档 | 是     | 0.88   | 8          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-preferences.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/interaction-question-response.ts`                           | 一档 | 否     | 0.93   | 71         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts`                          | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/mcp.ts`                                                     | 一档 | 是     | 0.90   | 25         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp.ts`                                         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/message-mapper.ts`                                          | 三档 | 是     | 0.17   | 1          | `apps/zcode-cli/packages/adapters/src/auth/localhost-callback.ts`                                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/model-execution.ts`                                         | 一档 | 是     | 1.00   | 17         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/model-execution.ts`                             | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/model-io-preferences.ts`                                    | 一档 | 是     | 0.90   | 11         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/model-io-preferences.ts`                        | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/model-mapper.ts`                                            | 一档 | 是     | 1.00   | 9          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/model-mapper.ts`                                | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/off-peak-tool-policy.ts`                                    | 二档 | 是     | 0.85   | 7          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/off-peak-tool-policy.ts`                        | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/official-mcp-auth-port.ts`                                  | 一档 | 是     | 0.84   | 12         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/official-mcp-auth-port.ts`                      | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/offpeak-port.ts`                                            | 一档 | 是     | 0.82   | 21         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/offpeak-port.ts`                                | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/plugin-reference-catalog.ts`                                | 一档 | 是     | 0.88   | 34         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugin-reference-catalog.ts`                    | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/plugins.ts`                                                 | 一档 | 是     | 0.76   | 59         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/plugins.ts`                                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/process-child-processes.ts`                                 | 一档 | 是     | 0.95   | 12         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/process-child-processes.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/protocol-mcp-config.ts`                                     | 一档 | 是     | 0.94   | 17         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/protocol-mcp-config.ts`                         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/provider-runtime-headers.ts`                                | 一档 | 是     | 0.82   | 20         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/provider-runtime-headers.ts`                    | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/resource-sampler.ts`                                        | 一档 | 是     | 0.79   | 19         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/resource-sampler.ts`                            | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/runtime-cleanup.ts`                                         | 一档 | 是     | 0.89   | 19         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/runtime-cleanup.ts`                             | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/runtime-resources.ts`                                       | 一档 | 是     | 0.88   | 18         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/runtime-resources.ts`                           | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/saved-workflows.ts`                                         | 一档 | 是     | 0.81   | 34         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/saved-workflows.ts`                             | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/server-operations.ts`                                       | 一档 | 是     | 0.89   | 138        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`                           | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/server-types.ts`                                            | 一档 | 是     | 0.78   | 34         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts`                                | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/server.ts`                                                  | 一档 | 是     | 0.83   | 99         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts`                                      | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/session-context-usage.ts`                                   | 二档 | 否     | 0.25   | 4          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`                              | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/session-debug.ts`                                           | 一档 | 是     | 0.96   | 81         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-debug.ts`                               | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/session-goal-recovery.ts`                                   | 二档 | 否     | 0.32   | 5          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`                              | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/session-mapper.ts`                                          | 一档 | 是     | 0.46   | 20         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`                              | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/session-projection-primitives.ts`                           | 二档 | 否     | 0.20   | 2          | `apps/zcode-cli/packages/adapters/src/model/failure-provider-business-codes.ts`                       | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/session-residency.ts`                                       | 一档 | 是     | 0.96   | 40         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-residency.ts`                           | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/session-resident-pool.ts`                                   | 一档 | 是     | 0.73   | 45         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-resident-pool.ts`                       | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/session-state-projection.ts`                                | 一档 | 否     | 0.15   | 10         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`                              | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/skill-reference-catalog.ts`                                 | 二档 | 是     | 0.70   | 7          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/skill-reference-catalog.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/slash-commands.ts`                                          | 一档 | 是     | 0.78   | 12         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/slash-commands.ts`                              | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/startup-resource.ts`                                        | 一档 | 是     | 0.97   | 26         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/startup-resource.ts`                            | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/storage-startup.ts`                                         | 一档 | 是     | 0.91   | 50         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/storage-startup.ts`                             | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/subagent-session-query.ts`                                  | 一档 | 是     | 0.97   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/subagent-session-query.ts`                      | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/transport.ts`                                               | 一档 | 是     | 0.82   | 60         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/transport.ts`                                   | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/usage-stats-builder.ts`                                     | 一档 | 是     | 0.99   | 186        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/usage-stats-builder.ts`                         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/v4-bridge.ts`                                               | 一档 | 是     | 0.96   | 200        | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts`                                   | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/v4-workspace-config.ts`                                     | 一档 | 是     | 0.86   | 13         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-workspace-config.ts`                         | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/workspace-hook-trust.ts`                                    | 一档 | 是     | 0.79   | 16         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-hook-trust.ts`                        | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/workspace-model-runtime.ts`                                 | 一档 | 是     | 0.76   | 16         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-runtime.ts`                     | M2 CLI |
| `apps/cli/packages/bootstrap/src/protocol/workspace.ts`                                               | 一档 | 是     | 0.92   | 12         | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace.ts`                                   | M2 CLI |
| `apps/cli/packages/bootstrap/src/storage-startup-entrypoint.ts`                                       | 二档 | 否     | 0.43   | 5          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts`                                  | M2 CLI |
| `apps/cli/packages/bootstrap/test/script-child-fixture.ts`                                            | 二档 | 否     | 0.26   | 4          | `apps/zcode-cli/packages/bootstrap/src/app/script-workflow-process.ts`                                | M2 CLI |
| `apps/cli/packages/browser-use-plugin/.knorvia-plugin/plugin.json`                                    | 二档 | 是     | 0.29   | 1          | `apps/zcode-cli/packages/browser-use-plugin/.zcode-plugin/plugin.json`                                | M2 CLI |
| `apps/cli/packages/browser-use-plugin/docs/LICENSE.txt`                                               | 一档 | 是     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/browser-use-plugin/docs/screenshots.md`                                            | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/cli/scripts/tui-distribution-smoke.mjs`                                            | 二档 | 否     | 0.33   | 5          | `scripts/zcode-distribution-smoke.mjs`                                                                | M2 CLI |
| `apps/cli/packages/cli/src/storage-preparation-command.ts`                                            | 二档 | 否     | 0.32   | 2          | `apps/zcode-cli/packages/cli/src/commands-command.ts`                                                 | M2 CLI |
| `apps/cli/packages/contracts/src/events/session-projection-ledgers.ts`                                | 二档 | 否     | 0.24   | 7          | `apps/zcode-cli/packages/contracts/src/events/event-reducer-helpers.ts`                               | M2 CLI |
| `apps/cli/packages/contracts/src/events/session-projection-queue.ts`                                  | 二档 | 否     | 0.22   | 4          | `apps/zcode-cli/packages/contracts/src/events/event-reducer.ts`                                       | M2 CLI |
| `apps/cli/packages/contracts/src/events/session-projection-transition.ts`                             | 一档 | 否     | 0.27   | 12         | `apps/zcode-cli/packages/contracts/src/events/event-reducer.ts`                                       | M2 CLI |
| `apps/cli/packages/contracts/src/tracing/span-residence.ts`                                           | 二档 | 否     | 0.25   | 7          | `apps/zcode-cli/packages/contracts/src/tracing/tracer.ts`                                             | M2 CLI |
| `apps/cli/packages/contracts/src/tracing/tracer-types.ts`                                             | 一档 | 否     | 0.97   | 14         | `apps/zcode-cli/packages/contracts/src/tracing/tracer.ts`                                             | M2 CLI |
| `apps/cli/packages/contracts/src/workflow/definition.ts`                                              | 一档 | 否     | 1.00   | 111        | `apps/zcode-cli/packages/contracts/src/workflow/index.ts`                                             | M2 CLI |
| `apps/cli/packages/contracts/src/workflow/graph-schema.ts`                                            | 一档 | 否     | 0.96   | 101        | `apps/zcode-cli/packages/contracts/src/workflow/index.ts`                                             | M2 CLI |
| `apps/cli/packages/contracts/src/workflow/run-schema.ts`                                              | 一档 | 否     | 0.95   | 108        | `apps/zcode-cli/packages/contracts/src/workflow/index.ts`                                             | M2 CLI |
| `apps/cli/packages/contracts/src/workflow/scheduler-state.ts`                                         | 一档 | 否     | 0.56   | 58         | `apps/zcode-cli/packages/contracts/src/workflow/index.ts`                                             | M2 CLI |
| `apps/cli/packages/contracts/src/workflow/session-links.ts`                                           | 一档 | 否     | 0.91   | 43         | `apps/zcode-cli/packages/contracts/src/workflow/index.ts`                                             | M2 CLI |
| `apps/cli/packages/core/src/mcp/result-format.ts`                                                     | 一档 | 否     | 0.76   | 26         | `apps/zcode-cli/packages/core/src/mcp/index.ts`                                                       | M2 CLI |
| `apps/cli/packages/core/src/permission/types.ts`                                                      | 一档 | 否     | 0.89   | 39         | `apps/zcode-cli/packages/core/src/permission/service.ts`                                              | M2 CLI |
| `apps/cli/packages/core/src/runtime/agent-runtime-api.ts`                                             | 一档 | 否     | 1.00   | 200        | `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`                                           | M2 CLI |
| `apps/cli/packages/core/src/runtime/helpers/attachment-media-resolver/context.ts`                     | 二档 | 否     | 0.43   | 5          | `apps/zcode-cli/packages/core/src/runtime/helpers/attachment-media-resolver.ts`                       | M2 CLI |
| `apps/cli/packages/core/src/runtime/helpers/attachment-media-resolver/inline.ts`                      | 一档 | 否     | 0.97   | 78         | `apps/zcode-cli/packages/core/src/runtime/helpers/attachment-media-resolver.ts`                       | M2 CLI |
| `apps/cli/packages/core/src/runtime/helpers/attachment-media-resolver/local-image.ts`                 | 一档 | 否     | 0.94   | 22         | `apps/zcode-cli/packages/core/src/runtime/helpers/attachment-media-resolver.ts`                       | M2 CLI |
| `apps/cli/packages/core/src/runtime/helpers/attachment-media-resolver/local-pdf.ts`                   | 一档 | 否     | 0.93   | 24         | `apps/zcode-cli/packages/core/src/runtime/helpers/attachment-media-resolver.ts`                       | M2 CLI |
| `apps/cli/packages/core/src/runtime/helpers/attachment-media-resolver/local-video.ts`                 | 一档 | 否     | 0.93   | 23         | `apps/zcode-cli/packages/core/src/runtime/helpers/attachment-media-resolver.ts`                       | M2 CLI |
| `apps/cli/packages/core/src/runtime/helpers/attachment-media-resolver/local.ts`                       | 一档 | 否     | 0.71   | 13         | `apps/zcode-cli/packages/core/src/runtime/helpers/attachment-media-resolver.ts`                       | M2 CLI |
| `apps/cli/packages/core/src/runtime/helpers/attachment-media-resolver/read-failure.ts`                | 一档 | 否     | 0.90   | 9          | `apps/zcode-cli/packages/core/src/runtime/helpers/attachment-media-resolver.ts`                       | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/background-payload.ts`                                    | 一档 | 否     | 0.96   | 39         | `apps/zcode-cli/packages/core/src/runtime/methods/background.ts`                                      | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/events-durable.ts`                                        | 一档 | 否     | 0.79   | 15         | `apps/zcode-cli/packages/core/src/runtime/methods/events.ts`                                          | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/events-session.ts`                                        | 一档 | 否     | 0.91   | 27         | `apps/zcode-cli/packages/core/src/runtime/methods/events.ts`                                          | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/events-summary.ts`                                        | 二档 | 否     | 0.39   | 6          | `apps/zcode-cli/packages/core/src/runtime/methods/events.ts`                                          | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/file-rewind-planning.ts`                                  | 一档 | 否     | 0.43   | 10         | `apps/zcode-cli/packages/core/src/runtime/methods/file-rewind.ts`                                     | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/file-rewind-storage.ts`                                   | 二档 | 否     | 0.25   | 3          | `apps/zcode-cli/packages/bootstrap/src/app/script-workflow-tool-port.ts`                              | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/model-request-stream-state.ts`                            | 二档 | 否     | 0.41   | 7          | `apps/zcode-cli/packages/core/src/runtime/methods/model.ts`                                           | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/rewind-conversation-state.ts`                             | 一档 | 否     | 0.71   | 30         | `apps/zcode-cli/packages/core/src/runtime/methods/rewind-message.ts`                                  | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/rewind-workspace-cascade.ts`                              | 一档 | 否     | 0.69   | 17         | `apps/zcode-cli/packages/core/src/runtime/methods/rewind-message.ts`                                  | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/session-fork-atomic.ts`                                   | 一档 | 否     | 0.61   | 18         | `apps/zcode-cli/packages/core/src/runtime/methods/session-fork.ts`                                    | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/session-fork-identities.ts`                               | 二档 | 否     | 0.31   | 4          | `apps/zcode-cli/packages/core/src/runtime/methods/session-fork.ts`                                    | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/session-fork-legacy-goal.ts`                              | 一档 | 否     | 0.57   | 8          | `apps/zcode-cli/packages/core/src/runtime/methods/session-fork.ts`                                    | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/session-fork-notices.ts`                                  | 一档 | 否     | 0.74   | 18         | `apps/zcode-cli/packages/core/src/runtime/methods/session-fork.ts`                                    | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/session-fork-session.ts`                                  | 二档 | 否     | 0.49   | 7          | `apps/zcode-cli/packages/core/src/runtime/methods/session-fork.ts`                                    | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/session-fork-transcript.ts`                               | 二档 | 否     | 0.37   | 6          | `apps/zcode-cli/packages/core/src/runtime/methods/session-fork.ts`                                    | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/session-fork-verifiers.ts`                                | 二档 | 否     | 0.52   | 6          | `apps/zcode-cli/packages/core/src/runtime/methods/session-fork.ts`                                    | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/steering-active.ts`                                       | 一档 | 否     | 0.71   | 8          | `apps/zcode-cli/packages/core/src/runtime/methods/steering.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/steering-admission.ts`                                    | 一档 | 否     | 0.84   | 18         | `apps/zcode-cli/packages/core/src/runtime/methods/steering.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/steering-configuration.ts`                                | 一档 | 否     | 0.93   | 15         | `apps/zcode-cli/packages/core/src/runtime/methods/steering.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/steering-draining.ts`                                     | 一档 | 否     | 0.62   | 11         | `apps/zcode-cli/packages/core/src/runtime/methods/steering.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/steering-editing.ts`                                      | 一档 | 否     | 0.54   | 12         | `apps/zcode-cli/packages/core/src/runtime/methods/steering.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/steering-guides.ts`                                       | 一档 | 否     | 0.60   | 8          | `apps/zcode-cli/packages/core/src/runtime/methods/steering.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/steering-persistence.ts`                                  | 一档 | 否     | 0.73   | 12         | `apps/zcode-cli/packages/core/src/runtime/methods/steering.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/streaming-tool-execution.ts`                              | 一档 | 否     | 0.77   | 9          | `apps/zcode-cli/packages/core/src/runtime/methods/streaming-tool-coordinator.ts`                      | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/subagent-authority.ts`                                    | 二档 | 否     | 0.33   | 6          | `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/subagent-skills.ts`                                       | 一档 | 否     | 0.56   | 11         | `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/turn-command-data.ts`                                     | 一档 | 否     | 0.30   | 11         | `apps/zcode-cli/packages/core/src/runtime/methods/turn.ts`                                            | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/turn-command-operation.ts`                                | 二档 | 否     | 0.22   | 7          | `apps/zcode-cli/packages/core/src/runtime/methods/turn.ts`                                            | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/turn-command-state.ts`                                    | 二档 | 否     | 0.22   | 4          | `apps/zcode-cli/packages/core/src/runtime/methods/turn.ts`                                            | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/turn-model-step-fields.ts`                                | 一档 | 否     | 0.43   | 9          | `apps/zcode-cli/packages/core/src/runtime/methods/turn-model-step.ts`                                 | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/turn-model-step-operation.ts`                             | 二档 | 否     | 0.45   | 7          | `apps/zcode-cli/packages/core/src/runtime/methods/turn-model-step.ts`                                 | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/turn-model-step-records.ts`                               | 一档 | 否     | 0.49   | 16         | `apps/zcode-cli/packages/core/src/runtime/methods/turn-model-step.ts`                                 | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/turn-model-step-recovery.ts`                              | 二档 | 否     | 0.65   | 5          | `apps/zcode-cli/packages/core/src/runtime/methods/turn-model-step.ts`                                 | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/turn-tool-batch-follow-up.ts`                             | 一档 | 否     | 0.73   | 8          | `apps/zcode-cli/packages/core/src/runtime/methods/turn-tools.ts`                                      | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/turn-tool-batch-parts.ts`                                 | 二档 | 否     | 0.21   | 2          | `apps/zcode-cli/packages/core/src/runtime/methods/turn-tools.ts`                                      | M2 CLI |
| `apps/cli/packages/core/src/runtime/methods/usage-observability-projection.ts`                        | 一档 | 否     | 0.42   | 9          | `apps/zcode-cli/packages/core/src/runtime/methods/usage-observability.ts`                             | M2 CLI |
| `apps/cli/packages/core/src/subagent/runner-artifacts.ts`                                             | 二档 | 否     | 0.43   | 5          | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                                 | M2 CLI |
| `apps/cli/packages/core/src/subagent/runner-background.ts`                                            | 二档 | 否     | 0.36   | 6          | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                                 | M2 CLI |
| `apps/cli/packages/core/src/subagent/runner-cancellation.ts`                                          | 二档 | 否     | 0.36   | 7          | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                                 | M2 CLI |
| `apps/cli/packages/core/src/subagent/runner-child.ts`                                                 | 一档 | 否     | 0.40   | 9          | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                                 | M2 CLI |
| `apps/cli/packages/core/src/subagent/runner-foreground.ts`                                            | 二档 | 否     | 0.32   | 5          | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                                 | M2 CLI |
| `apps/cli/packages/core/src/subagent/runner-message.ts`                                               | 一档 | 否     | 0.52   | 9          | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                                 | M2 CLI |
| `apps/cli/packages/core/src/subagent/runner-publication.ts`                                           | 一档 | 否     | 0.48   | 10         | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                                 | M2 CLI |
| `apps/cli/packages/core/src/subagent/runner-state.ts`                                                 | 二档 | 否     | 0.50   | 7          | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                                 | M2 CLI |
| `apps/cli/packages/core/src/subagent/runner-stop.ts`                                                  | 一档 | 否     | 0.44   | 12         | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                                 | M2 CLI |
| `apps/cli/packages/core/src/tool/executor/background-tracker-notification.ts`                         | 一档 | 否     | 0.41   | 10         | `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts`                                  | M2 CLI |
| `apps/cli/packages/core/src/tool/executor/background-tracker-projection.ts`                           | 二档 | 否     | 0.32   | 6          | `apps/zcode-cli/packages/core/src/tool/executor/background-tasks.ts`                                  | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/agent-invocation.ts`                                        | 一档 | 否     | 0.78   | 11         | `apps/zcode-cli/packages/core/src/tool/handlers/agent.ts`                                             | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/agent-projection.ts`                                        | 二档 | 否     | 0.24   | 4          | `apps/zcode-cli/packages/core/src/tool/handlers/agent.ts`                                             | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/ask-user-question-result.ts`                                | 二档 | 否     | 0.24   | 3          | `apps/zcode-cli/packages/core/src/tool/handlers/ask-user-question.ts`                                 | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/collaboration-invocation.ts`                                | 二档 | 否     | 0.32   | 7          | `apps/zcode-cli/packages/core/src/tool/handlers/submit-result.ts`                                     | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/cron-execution.ts`                                          | 一档 | 否     | 0.22   | 8          | `apps/zcode-cli/packages/core/src/tool/handlers/cron.ts`                                              | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/edit-commit.ts`                                             | 二档 | 否     | 0.45   | 7          | `apps/zcode-cli/packages/core/src/tool/handlers/edit.ts`                                              | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/edit-transaction.ts`                                        | 二档 | 否     | 0.31   | 3          | `apps/zcode-cli/packages/core/src/tool/handlers/edit.ts`                                              | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/file-search-runtime.ts`                                     | 二档 | 否     | 0.34   | 6          | `apps/zcode-cli/packages/core/src/tool/handlers/grep.ts`                                              | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/get-workflow-run-activity-program.ts`                       | 二档 | 否     | 0.29   | 5          | `apps/zcode-cli/packages/core/src/tool/handlers/get-workflow-run-format-roster.ts`                    | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/off-peak-execution.ts`                                      | 二档 | 否     | 0.27   | 2          | `apps/zcode-cli/packages/core/src/tool/handlers/off-peak.ts`                                          | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/off-peak-result.ts`                                         | 二档 | 否     | 0.20   | 5          | `apps/zcode-cli/packages/core/src/tool/handlers/off-peak.ts`                                          | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/plan-mode-operation.ts`                                     | 二档 | 否     | 0.28   | 3          | `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts`                                         | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/plan-mode-persistence.ts`                                   | 二档 | 否     | 0.45   | 2          | `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts`                                         | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/plan-mode-projection.ts`                                    | 一档 | 否     | 0.50   | 10         | `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts`                                         | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/read-binary-input.ts`                                       | 二档 | 否     | 0.48   | 6          | `apps/zcode-cli/packages/core/src/tool/handlers/read-image.ts`                                        | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/read-file-suggestion.ts`                                    | 二档 | 否     | 0.23   | 6          | `apps/zcode-cli/packages/core/src/tool/handlers/edit.ts`                                              | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/read-model-content.ts`                                      | 一档 | 否     | 0.94   | 51         | `apps/zcode-cli/packages/core/src/tool/handlers/read.ts`                                              | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/read-session-context-extraction.ts`                         | 二档 | 否     | 0.27   | 3          | `apps/zcode-cli/packages/core/src/tool/handlers/read-session-context.ts`                              | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/read-text-orchestration.ts`                                 | 一档 | 否     | 0.31   | 9          | `apps/zcode-cli/packages/core/src/tool/handlers/read.ts`                                              | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/skill-execution.ts`                                         | 二档 | 否     | 0.22   | 6          | `apps/zcode-cli/packages/core/src/tool/handlers/agent.ts`                                             | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/task-output-request.ts`                                     | 一档 | 否     | 0.44   | 11         | `apps/zcode-cli/packages/core/src/tool/handlers/task-output.ts`                                       | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/task-stop-request.ts`                                       | 二档 | 否     | 0.23   | 3          | `apps/zcode-cli/packages/core/src/tool/handlers/task-stop.ts`                                         | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/webfetch-orchestration.ts`                                  | 二档 | 否     | 0.24   | 5          | `apps/zcode-cli/packages/core/src/tool/handlers/webfetch.ts`                                          | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/websearch-execution.ts`                                     | 二档 | 否     | 0.30   | 4          | `apps/zcode-cli/packages/core/src/tool/handlers/websearch.ts`                                         | M2 CLI |
| `apps/cli/packages/core/src/tool/handlers/write-transaction.ts`                                       | 一档 | 否     | 0.37   | 9          | `apps/zcode-cli/packages/core/src/tool/handlers/write.ts`                                             | M2 CLI |
| `apps/cli/packages/core/src/workflow/lifecycle-seed.ts`                                               | 一档 | 否     | 0.50   | 10         | `apps/zcode-cli/packages/core/src/workflow/lifecycle.ts`                                              | M2 CLI |
| `apps/cli/packages/core/src/workflow/scheduler/collection-planner-admission.ts`                       | 二档 | 否     | 0.42   | 3          | `apps/zcode-cli/packages/core/src/workflow/scheduler/collection-planner.ts`                           | M2 CLI |
| `apps/cli/packages/core/src/workflow/scheduler/graph-helpers.ts`                                      | 一档 | 否     | 0.99   | 126        | `apps/zcode-cli/packages/core/src/workflow/scheduler/graph.ts`                                        | M2 CLI |
| `apps/cli/packages/core/test/candidates/task-registry-20261003/registry.ts`                           | 一档 | 否     | 0.69   | 16         | `apps/zcode-cli/packages/core/src/runtime-task/registry.ts`                                           | M2 CLI |
| `apps/cli/packages/core/test/read-pdf-projection.test.ts`                                             | 一档 | 否     | 0.10   | 8          | `apps/zcode-cli/packages/core/src/tool/handlers/read-pdf.ts`                                          | M2 CLI |
| `apps/cli/packages/core/test/saved-workflow-protocol.test.ts`                                         | 三档 | 是     | 0.15   | 2          | `apps/zcode-cli/packages/core/src/index.ts`                                                           | M2 CLI |
| `apps/cli/packages/cua-plugin/.knorvia-plugin/plugin.json`                                            | 二档 | 否     | 0.17   | 1          | `apps/zcode-cli/packages/browser-use-plugin/.zcode-plugin/plugin.json`                                | M2 CLI |
| `apps/cli/packages/cua-plugin/docs/CUA-LICENSE.txt`                                                   | 一档 | 否     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/cua-plugin/docs/LICENSE-Interface-Agent-MIT.txt`                                   | 一档 | 否     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/cua-plugin/docs/LICENSE-trope-cua-MIT.txt`                                         | 一档 | 否     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/cua-plugin/docs/LICENSE.txt`                                                       | 一档 | 否     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/cua-plugin/docs/THIRD-PARTY-NOTICES-CUA-DRIVER.md`                                 | 一档 | 否     | 0.92   | 200        | `THIRD-PARTY-NOTICES.md`                                                                              | M2 CLI |
| `apps/cli/packages/cua-plugin/package.json`                                                           | 二档 | 否     | 0.38   | 2          | `apps/zcode-cli/package.json`                                                                         | M2 CLI |
| `apps/cli/packages/documents-plugin/.knorvia-plugin/plugin.json`                                      | 二档 | 是     | 0.13   | 1          | `.vscode/launch.json`                                                                                 | M2 CLI |
| `apps/cli/packages/documents-plugin/agents/visual-judge.md`                                           | 二档 | 是     | 0.25   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |
| `apps/cli/packages/documents-plugin/README.md`                                                        | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/documents-plugin/skills/docx/LICENSE.txt`                                          | 一档 | 是     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/documents-plugin/skills/docx/scripts/inspect.py`                                   | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/documents-plugin/skills/docx/SKILL.md`                                             | 三档 | 是     | 0.06   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |
| `apps/cli/packages/dynamic-workflow/src/analysis/operators.ts`                                        | 一档 | 否     | 0.56   | 8          | `apps/zcode-cli/packages/dynamic-workflow/src/analysis/taint.ts`                                      | M2 CLI |
| `apps/cli/packages/dynamic-workflow/src/analysis/placeholder-resolution.ts`                           | 一档 | 否     | 0.63   | 8          | `apps/zcode-cli/packages/dynamic-workflow/src/analysis/state.ts`                                      | M2 CLI |
| `apps/cli/packages/dynamic-workflow/src/engine/ask-journal-projection.ts`                             | 一档 | 否     | 0.42   | 8          | `apps/zcode-cli/packages/dynamic-workflow/src/engine/scheduler.ts`                                    | M2 CLI |
| `apps/cli/packages/dynamic-workflow/src/engine/scheduler-helpers.ts`                                  | 一档 | 否     | 0.89   | 10         | `apps/zcode-cli/packages/dynamic-workflow/src/engine/scheduler.ts`                                    | M2 CLI |
| `apps/cli/packages/dynamic-workflow/src/engine/workflow-error.ts`                                     | 一档 | 否     | 0.84   | 43         | `apps/zcode-cli/packages/dynamic-workflow/src/engine/types.ts`                                        | M2 CLI |
| `apps/cli/packages/node-repl-host/test/runtime.test.mjs`                                              | 三档 | 是     | 0.04   | 2          | `apps/zcode-cli/packages/adapters/src/mcp/index.ts`                                                   | M2 CLI |
| `apps/cli/packages/pdf-plugin/.knorvia-plugin/plugin.json`                                            | 二档 | 是     | 0.13   | 1          | `.vscode/launch.json`                                                                                 | M2 CLI |
| `apps/cli/packages/pdf-plugin/agents/visual-judge.md`                                                 | 二档 | 是     | 0.25   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |
| `apps/cli/packages/pdf-plugin/README.md`                                                              | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/pdf-plugin/skills/pdf/LICENSE.txt`                                                 | 一档 | 是     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/pdf-plugin/skills/pdf/scripts/inspect.py`                                          | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/pdf-plugin/skills/pdf/SKILL.md`                                                    | 三档 | 是     | 0.06   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/.knorvia-plugin/plugin.json`                                 | 二档 | 是     | 0.14   | 1          | `.vscode/launch.json`                                                                                 | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/README.md`                                                   | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/LICENSE.txt`                           | 一档 | 是     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/references/installing-and-updating.md` | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/references/plugin-json-spec.md`        | 三档 | 是     | 0.19   | 1          | `apps/zcode-cli/README.md`                                                                            | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/create-basic-plugin.mjs`       | 三档 | 是     | 0.12   | 1          | `packages/services/src/session/automationRepo.ts`                                                     | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/marketplace-files.mjs`         | 三档 | 是     | 0.10   | 2          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                    | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/scaffold-files.mjs`            | 三档 | 是     | 0.14   | 1          | `.vscode/vite-dev.mjs`                                                                                | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/upsert-dev-marketplace.mjs`    | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/validate-plugin.mjs`           | 三档 | 是     | 0.04   | 1          | `packages/desktop/scripts/packaged-sourcemap-cleanup.mjs`                                             | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/SKILL.md`                              | 三档 | 是     | 0.11   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/test/creator-workflow.test.mjs`                              | 三档 | 是     | 0.02   | 1          | `apps/zcode-cli/packages/adapters/src/config/schema.ts`                                               | M2 CLI |
| `apps/cli/packages/plugin-creator-plugin/test/validate-plugin.test.mjs`                               | 二档 | 是     | 0.11   | 1          | `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`                                         | M2 CLI |
| `apps/cli/packages/presentations-plugin/.knorvia-plugin/plugin.json`                                  | 二档 | 是     | 0.13   | 1          | `.vscode/launch.json`                                                                                 | M2 CLI |
| `apps/cli/packages/presentations-plugin/agents/visual-judge.md`                                       | 二档 | 是     | 0.25   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |
| `apps/cli/packages/presentations-plugin/README.md`                                                    | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/presentations-plugin/skills/pptx/LICENSE.txt`                                      | 一档 | 是     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/presentations-plugin/skills/pptx/scripts/inspect.py`                               | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/presentations-plugin/skills/pptx/SKILL.md`                                         | 三档 | 是     | 0.07   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |
| `apps/cli/packages/skill-creator-plugin/.knorvia-plugin/plugin.json`                                  | 二档 | 是     | 0.14   | 1          | `.vscode/launch.json`                                                                                 | M2 CLI |
| `apps/cli/packages/skill-creator-plugin/README.md`                                                    | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/skill-creator-plugin/skills/skill-creator/LICENSE.txt`                             | 一档 | 是     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/skill-creator-plugin/skills/skill-creator/SKILL.md`                                | 三档 | 是     | 0.11   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |
| `apps/cli/packages/spreadsheets-plugin/.knorvia-plugin/plugin.json`                                   | 二档 | 是     | 0.13   | 1          | `.vscode/launch.json`                                                                                 | M2 CLI |
| `apps/cli/packages/spreadsheets-plugin/agents/visual-judge.md`                                        | 二档 | 是     | 0.25   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |
| `apps/cli/packages/spreadsheets-plugin/README.md`                                                     | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/spreadsheets-plugin/skills/xlsx/LICENSE.txt`                                       | 一档 | 是     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                                       | M2 CLI |
| `apps/cli/packages/spreadsheets-plugin/skills/xlsx/scripts/inspect.py`                                | 三档 | 是     | 0.00   | 0          | —                                                                                                     | M2 CLI |
| `apps/cli/packages/spreadsheets-plugin/skills/xlsx/SKILL.md`                                          | 三档 | 是     | 0.07   | 1          | `.agents/skills/agent-browser/SKILL.md`                                                               | M2 CLI |

### packages/services/src（206）

| 文件                                                                           | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                                                     | 里程碑        |
| ------------------------------------------------------------------------------ | ---- | ------ | ------ | ---------- | -------------------------------------------------------------------------------------------------- | ------------- |
| `packages/services/src/agent-session/importedClaudeSessionRepair.ts`           | 一档 | 是     | 0.63   | 13         | `packages/services/src/zcode-session/importedClaudeSessionRepair.ts`                               | M3 共享与服务 |
| `packages/services/src/agent-session/session.ts`                               | 二档 | 是     | 0.45   | 7          | `packages/services/src/zcode-session/zcodeSession.ts`                                              | M3 共享与服务 |
| `packages/services/src/agent-session/sessionApiRetry.ts`                       | 一档 | 是     | 0.51   | 9          | `packages/services/src/zcode-session/zcodeSessionApiRetry.ts`                                      | M3 共享与服务 |
| `packages/services/src/agent-session/sessionDraftRegistry.ts`                  | 二档 | 是     | 0.57   | 6          | `packages/services/src/zcode-session/zcodeSessionDraftRegistry.ts`                                 | M3 共享与服务 |
| `packages/services/src/agent-session/sessionPreparation.ts`                    | 二档 | 否     | 0.21   | 6          | `packages/services/src/zcode-session/zcodeSessionService.ts`                                       | M3 共享与服务 |
| `packages/services/src/agent-session/sessionService.ts`                        | 二档 | 是     | 0.29   | 4          | `packages/services/src/zcode-session/zcodeSessionService.ts`                                       | M3 共享与服务 |
| `packages/services/src/agent/agent.ts`                                         | 一档 | 是     | 0.54   | 35         | `packages/services/src/zcode-agent/zcodeAgent.ts`                                                  | M3 共享与服务 |
| `packages/services/src/agent/agentBrowserAmbientContext.ts`                    | 一档 | 是     | 0.97   | 55         | `packages/services/src/zcode-agent/zcodeAgentBrowserAmbientContext.ts`                             | M3 共享与服务 |
| `packages/services/src/agent/agentConnectionScope.ts`                          | 一档 | 是     | 0.93   | 151        | `packages/services/src/zcode-agent/zcodeAgentConnectionScope.ts`                                   | M3 共享与服务 |
| `packages/services/src/agent/agentErrors.ts`                                   | 二档 | 是     | 0.36   | 2          | `packages/services/src/zcode-agent/zcodeAgentErrors.ts`                                            | M3 共享与服务 |
| `packages/services/src/agent/agentPluginParams.ts`                             | 一档 | 是     | 0.70   | 9          | `packages/services/src/zcode-agent/zcodeAgentPluginParams.ts`                                      | M3 共享与服务 |
| `packages/services/src/agent/agentPresentationSurface.ts`                      | 一档 | 是     | 0.71   | 8          | `packages/services/src/zcode-agent/zcodeAgentPresentationSurface.ts`                               | M3 共享与服务 |
| `packages/services/src/agent/agentProcessManager.ts`                           | 一档 | 是     | 0.85   | 52         | `packages/services/src/zcode-agent/zcodeAgentProcessManager.ts`                                    | M3 共享与服务 |
| `packages/services/src/agent/agentService.ts`                                  | 一档 | 是     | 0.82   | 85         | `packages/services/src/zcode-agent/zcodeAgentService.ts`                                           | M3 共享与服务 |
| `packages/services/src/agent/agentSpawnCwd.ts`                                 | 一档 | 是     | 0.95   | 17         | `packages/services/src/zcode-agent/zcodeAgentSpawnCwd.ts`                                          | M3 共享与服务 |
| `packages/services/src/agent/agentStderrCollector.ts`                          | 二档 | 是     | 0.25   | 2          | `packages/services/src/zcode-agent/agentStderrCollector.ts`                                        | M3 共享与服务 |
| `packages/services/src/agent/agentWorkflowParams.ts`                           | 二档 | 是     | 0.63   | 7          | `packages/services/src/zcode-agent/zcodeAgentWorkflowParams.ts`                                    | M3 共享与服务 |
| `packages/services/src/agent/configOptions.ts`                                 | 二档 | 是     | 0.53   | 7          | `packages/services/src/zcode-agent/zcodeConfigOptions.ts`                                          | M3 共享与服务 |
| `packages/services/src/agent/cuaOperationTurnTracker.ts`                       | 一档 | 是     | 0.99   | 131        | `packages/services/src/zcode-agent/cuaOperationTurnTracker.ts`                                     | M3 共享与服务 |
| `packages/services/src/agent/independentPlanSupport.ts`                        | 二档 | 是     | 0.88   | 7          | `packages/services/src/zcode-agent/independentPlanSupport.ts`                                      | M3 共享与服务 |
| `packages/services/src/agent/modelTrajectory.ts`                               | 一档 | 是     | 0.60   | 21         | `packages/services/src/zcode-agent/modelTrajectory.ts`                                             | M3 共享与服务 |
| `packages/services/src/agent/modelTrajectoryFileTail.ts`                       | 一档 | 是     | 0.97   | 27         | `packages/services/src/zcode-agent/modelTrajectoryFileTail.ts`                                     | M3 共享与服务 |
| `packages/services/src/agent/pluginReferenceCatalogRequest.ts`                 | 二档 | 是     | 0.52   | 4          | `packages/services/src/zcode-agent/pluginReferenceCatalogRequest.ts`                               | M3 共享与服务 |
| `packages/services/src/agent/protocolClient.ts`                                | 二档 | 是     | 0.32   | 7          | `packages/services/src/zcode-agent/zcodeProtocolClient.ts`                                         | M3 共享与服务 |
| `packages/services/src/agent/protocolTransport.ts`                             | 二档 | 是     | 0.36   | 3          | `packages/services/src/zcode-agent/zcodeProtocolTransport.ts`                                      | M3 共享与服务 |
| `packages/services/src/agent/repairSubagentTaskIndex.ts`                       | 一档 | 是     | 0.92   | 24         | `packages/services/src/zcode-agent/repairSubagentTaskIndex.ts`                                     | M3 共享与服务 |
| `packages/services/src/agent/sessionEventCoalescer.ts`                         | 二档 | 是     | 0.37   | 5          | `packages/services/src/zcode-agent/zcodeSessionEventCoalescer.ts`                                  | M3 共享与服务 |
| `packages/services/src/agent/STDERR-OWNER-SPEC-20261003.md`                    | 二档 | 否     | 0.22   | 1          | `.agents/skills/architecture-governance/SKILL.md`                                                  | M3 共享与服务 |
| `packages/services/src/agent/stdioTapDevConfig.ts`                             | 一档 | 是     | 0.56   | 9          | `packages/services/src/zcode-agent/zcodeStdioTapDevConfig.ts`                                      | M3 共享与服务 |
| `packages/services/src/agent/stdioTransport.ts`                                | 二档 | 是     | 0.34   | 5          | `packages/services/src/zcode-agent/zcodeStdioTransport.ts`                                         | M3 共享与服务 |
| `packages/services/src/agent/storageStartupGate.ts`                            | 一档 | 是     | 0.19   | 9          | `packages/services/src/zcode-agent/zcodeStorageStartupGate.ts`                                     | M3 共享与服务 |
| `packages/services/src/agent/task-index-ingestion/sessionIndexProjection.ts`   | 一档 | 否     | 0.29   | 10         | `packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts`                                        | M3 共享与服务 |
| `packages/services/src/agent/task-index-ingestion/snapshotProjection.ts`       | 一档 | 否     | 0.39   | 11         | `packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts`                                        | M3 共享与服务 |
| `packages/services/src/agent/task-index-ingestion/topicTypes.ts`               | 一档 | 否     | 0.22   | 10         | `packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts`                                        | M3 共享与服务 |
| `packages/services/src/agent/taskIndexSyncer.ts`                               | 一档 | 是     | 0.33   | 9          | `packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts`                                        | M3 共享与服务 |
| `packages/services/src/agent/taskServiceAdapter.ts`                            | 一档 | 是     | 0.88   | 108        | `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`                                     | M3 共享与服务 |
| `packages/services/src/agent/v4HostCommand.ts`                                 | 一档 | 是     | 0.95   | 52         | `packages/services/src/zcode-agent/zcodeV4HostCommand.ts`                                          | M3 共享与服务 |
| `packages/services/src/commands/commandConfig.ts`                              | 二档 | 否     | 0.28   | 3          | `packages/services/src/commands/commandsService.ts`                                                | M3 共享与服务 |
| `packages/services/src/commands/commandDiscovery.ts`                           | 二档 | 否     | 0.25   | 3          | `packages/services/src/commands/commandsService.ts`                                                | M3 共享与服务 |
| `packages/services/src/creation/contract.ts`                                   | 三档 | 是     | 0.09   | 4          | `apps/zcode-cli/packages/contracts/src/events/session.events.ts`                                   | M3 共享与服务 |
| `packages/services/src/creation/creationReference.ts`                          | 三档 | 是     | 0.10   | 2          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                 | M3 共享与服务 |
| `packages/services/src/creation/creationRunDeadline.ts`                        | 二档 | 否     | 0.20   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts`                            | M3 共享与服务 |
| `packages/services/src/creation/creationService.ts`                            | 三档 | 是     | 0.05   | 2          | `packages/services/src/zcode-agent/zcodeAgentService.ts`                                           | M3 共享与服务 |
| `packages/services/src/creation/modelValidation.ts`                            | 三档 | 是     | 0.19   | 3          | `apps/zcode-cli/packages/adapters/src/commands/index.ts`                                           | M3 共享与服务 |
| `packages/services/src/creation/module.ts`                                     | 二档 | 否     | 0.40   | 1          | `packages/services/src/storage/module.ts`                                                          | M3 共享与服务 |
| `packages/services/src/creation/providers.ts`                                  | 三档 | 是     | 0.06   | 2          | `packages/services/src/feedback/feedbackHttpClient.ts`                                             | M3 共享与服务 |
| `packages/services/src/dataLocationOwner.ts`                                   | 二档 | 否     | 0.41   | 3          | `packages/services/src/paths.ts`                                                                   | M3 共享与服务 |
| `packages/services/src/file/fileServiceIndex.ts`                               | 二档 | 否     | 0.28   | 4          | `packages/services/src/file/fileService.ts`                                                        | M3 共享与服务 |
| `packages/services/src/file/fileServiceIO.ts`                                  | 一档 | 否     | 0.50   | 10         | `packages/services/src/file/fileService.ts`                                                        | M3 共享与服务 |
| `packages/services/src/file/FILTER-SPEC-20261002.md`                           | 二档 | 否     | 0.20   | 1          | `.agents/skills/architecture-governance/SKILL.md`                                                  | M3 共享与服务 |
| `packages/services/src/git/CHECKPOINT-SERVICE-SPEC-20261002.md`                | 二档 | 否     | 0.20   | 1          | `.agents/skills/architecture-governance/SKILL.md`                                                  | M3 共享与服务 |
| `packages/services/src/git/gitCommitMessageInvocationPlan.ts`                  | 二档 | 否     | 0.47   | 7          | `packages/services/src/git/gitCommitMessageGenerator.ts`                                           | M3 共享与服务 |
| `packages/services/src/git/gitCommitMessagePromptPlan.ts`                      | 一档 | 否     | 0.52   | 13         | `packages/services/src/git/gitCommitMessageGenerator.ts`                                           | M3 共享与服务 |
| `packages/services/src/git/gitServiceReadProjection.ts`                        | 一档 | 否     | 0.40   | 13         | `packages/services/src/git/gitService.ts`                                                          | M3 共享与服务 |
| `packages/services/src/git/repo/gitCliParsing.ts`                              | 一档 | 否     | 0.32   | 8          | `packages/services/src/git/repo/gitCliHelpers.ts`                                                  | M3 共享与服务 |
| `packages/services/src/git/repo/gitCommitGraphPlan.ts`                         | 一档 | 否     | 0.31   | 8          | `packages/services/src/git/repo/gitCliRepo.ts`                                                     | M3 共享与服务 |
| `packages/services/src/git/repo/gitRepoBranches.ts`                            | 二档 | 否     | 0.32   | 7          | `packages/services/src/git/repo/gitCliRepo.ts`                                                     | M3 共享与服务 |
| `packages/services/src/git/repo/gitRepoCommit.ts`                              | 二档 | 否     | 0.29   | 4          | `packages/services/src/git/repo/gitCliRepo.ts`                                                     | M3 共享与服务 |
| `packages/services/src/git/repo/gitRepoDiff.ts`                                | 二档 | 否     | 0.36   | 7          | `packages/services/src/git/repo/gitCliRepo.ts`                                                     | M3 共享与服务 |
| `packages/services/src/git/repo/gitRepoPush.ts`                                | 二档 | 否     | 0.29   | 3          | `packages/services/src/git/repo/gitCliRepo.ts`                                                     | M3 共享与服务 |
| `packages/services/src/git/repo/gitRepoResolution.ts`                          | 二档 | 否     | 0.37   | 7          | `packages/services/src/git/repo/gitCliRepo.ts`                                                     | M3 共享与服务 |
| `packages/services/src/git/repo/gitRepoStatus.ts`                              | 一档 | 否     | 0.44   | 8          | `packages/services/src/git/repo/gitCliRepo.ts`                                                     | M3 共享与服务 |
| `packages/services/src/git/repo/gitRepoWrites.ts`                              | 二档 | 否     | 0.29   | 2          | `packages/services/src/git/repo/gitCliRepo.ts`                                                     | M3 共享与服务 |
| `packages/services/src/mcp-sync/mcpConfig.ts`                                  | 二档 | 否     | 0.28   | 4          | `packages/services/src/mcp-sync/mcpSyncService.ts`                                                 | M3 共享与服务 |
| `packages/services/src/mcp-sync/mcpDirectories.ts`                             | 二档 | 否     | 0.34   | 5          | `packages/services/src/mcp-sync/mcpSyncService.ts`                                                 | M3 共享与服务 |
| `packages/services/src/media-preview/COMPLETE-OWNER-SPEC-20261002.md`          | 二档 | 否     | 0.20   | 1          | `.agents/skills/architecture-governance/SKILL.md`                                                  | M3 共享与服务 |
| `packages/services/src/model-provider/legacyProviderEndpoints.ts`              | 一档 | 否     | 0.40   | 8          | `packages/services/src/model-provider/legacyModelProviderSerialized.ts`                            | M3 共享与服务 |
| `packages/services/src/model-provider/legacyProviderMigration.ts`              | 一档 | 否     | 0.54   | 17         | `packages/services/src/model-provider/legacyModelProviderSerialized.ts`                            | M3 共享与服务 |
| `packages/services/src/model-provider/legacyProviderModels.ts`                 | 一档 | 否     | 0.70   | 30         | `packages/services/src/model-provider/legacyModelProviderSerialized.ts`                            | M3 共享与服务 |
| `packages/services/src/model-provider/legacyProviderSchemas.ts`                | 二档 | 否     | 0.64   | 7          | `packages/services/src/model-provider/legacyModelProviderSerialized.ts`                            | M3 共享与服务 |
| `packages/services/src/model-provider/legacyProviderTypes.ts`                  | 一档 | 否     | 0.99   | 30         | `packages/services/src/model-provider/legacyModelProviderSerialized.ts`                            | M3 共享与服务 |
| `packages/services/src/plugin-sync/pluginSyncInventory.ts`                     | 二档 | 否     | 0.26   | 5          | `packages/services/src/plugin-sync/pluginSyncService.ts`                                           | M3 共享与服务 |
| `packages/services/src/plugin-sync/pluginSyncMarketplace.ts`                   | 二档 | 否     | 0.22   | 3          | `packages/services/src/plugin-sync/pluginSyncService.ts`                                           | M3 共享与服务 |
| `packages/services/src/plugin-sync/pluginSyncMarketplaceArchive.ts`            | 二档 | 否     | 0.24   | 4          | `packages/services/src/plugin-sync/pluginSyncService.ts`                                           | M3 共享与服务 |
| `packages/services/src/plugins/INDEX-SPEC-20261002.md`                         | 二档 | 否     | 0.33   | 1          | `.agents/skills/architecture-governance/SKILL.md`                                                  | M3 共享与服务 |
| `packages/services/src/remote-sync/LIFECYCLE-SPEC.md`                          | 二档 | 否     | 0.20   | 1          | `.agents/skills/architecture-governance/SKILL.md`                                                  | M3 共享与服务 |
| `packages/services/src/session/automation-repository/claims.ts`                | 二档 | 否     | 0.23   | 3          | `packages/services/src/session/automationRepo.ts`                                                  | M3 共享与服务 |
| `packages/services/src/session/automation-repository/connection.ts`            | 二档 | 否     | 0.42   | 6          | `packages/services/src/session/automationRepo.ts`                                                  | M3 共享与服务 |
| `packages/services/src/session/automation-repository/definitions.ts`           | 二档 | 否     | 0.43   | 7          | `packages/services/src/session/automationRepo.ts`                                                  | M3 共享与服务 |
| `packages/services/src/session/automation-repository/dispatch.ts`              | 二档 | 否     | 0.37   | 4          | `packages/services/src/session/automationRepo.ts`                                                  | M3 共享与服务 |
| `packages/services/src/session/automation-repository/rows.ts`                  | 一档 | 否     | 0.72   | 9          | `packages/services/src/session/automationRepo.ts`                                                  | M3 共享与服务 |
| `packages/services/src/session/automation-repository/runs.ts`                  | 二档 | 否     | 0.46   | 5          | `packages/services/src/session/automationRepo.ts`                                                  | M3 共享与服务 |
| `packages/services/src/session/automationValidation.ts`                        | 一档 | 否     | 0.50   | 15         | `packages/services/src/session/automationService.ts`                                               | M3 共享与服务 |
| `packages/services/src/session/contract.ts`                                    | 二档 | 是     | 0.17   | 1          | `apps/zcode-cli/packages/adapters/src/logging/index.ts`                                            | M3 共享与服务 |
| `packages/services/src/session/task-index-repository/model.ts`                 | 一档 | 否     | 0.60   | 10         | `packages/services/src/session/taskIndexRepo.ts`                                                   | M3 共享与服务 |
| `packages/services/src/session/task-index-repository/store.ts`                 | 一档 | 否     | 0.33   | 10         | `packages/services/src/session/taskIndexRepo.ts`                                                   | M3 共享与服务 |
| `packages/services/src/session/task-index-repository/task-queries.ts`          | 一档 | 否     | 0.16   | 8          | `packages/services/src/session/taskIndexRepo.ts`                                                   | M3 共享与服务 |
| `packages/services/src/session/taskListTypes.ts`                               | 一档 | 是     | 0.61   | 10         | `packages/services/src/session/zcodeTaskListTypes.ts`                                              | M3 共享与服务 |
| `packages/services/src/session/tasksDatabase/agent-identity-v4.ts`             | 二档 | 是     | 0.13   | 1          | `.agents/skills/ai-elements/scripts/terminal.tsx`                                                  | M3 共享与服务 |
| `packages/services/src/session/taskService.ts`                                 | 一档 | 是     | 0.74   | 20         | `packages/services/src/session/zcodeTaskService.ts`                                                | M3 共享与服务 |
| `packages/services/src/setting/dataLocation.ts`                                | 二档 | 是     | 0.22   | 1          | `apps/zcode-cli/packages/adapters/src/browser/index.ts`                                            | M3 共享与服务 |
| `packages/services/src/settings-sync/settingsSyncCatalog.ts`                   | 二档 | 否     | 0.21   | 2          | `packages/services/src/settings-sync/settingsSyncService.ts`                                       | M3 共享与服务 |
| `packages/services/src/settings-sync/settingsSyncSources.ts`                   | 二档 | 否     | 0.20   | 4          | `packages/services/src/settings-sync/settingsSyncService.ts`                                       | M3 共享与服务 |
| `packages/services/src/skill-sync/skillSyncDiscovery.ts`                       | 二档 | 否     | 0.20   | 4          | `packages/services/src/skill-sync/skillSyncService.ts`                                             | M3 共享与服务 |
| `packages/services/src/skills/skillDefinitions.ts`                             | 二档 | 否     | 0.35   | 7          | `packages/services/src/skills/skillsService.ts`                                                    | M3 共享与服务 |
| `packages/services/src/skills/skillDiscovery.ts`                               | 二档 | 否     | 0.31   | 5          | `packages/services/src/skills/skillsService.ts`                                                    | M3 共享与服务 |
| `packages/services/src/skills/skillLocations.ts`                               | 二档 | 否     | 0.30   | 5          | `packages/services/src/skills/skillsService.ts`                                                    | M3 共享与服务 |
| `packages/services/src/skills/skillPluginRoots.ts`                             | 二档 | 否     | 0.25   | 4          | `packages/services/src/skills/skillsService.ts`                                                    | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/builtinEvents.ts`               | 三档 | 是     | 0.13   | 3          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`                    | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/builtinKernel.ts`               | 三档 | 是     | 0.10   | 2          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/acpCatalog.ts`          | 三档 | 是     | 0.04   | 1          | `apps/zcode-cli/packages/adapters/src/exec/execution-command.ts`                                   | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/acpCommands.ts`         | 三档 | 是     | 0.14   | 2          | `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`                                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/acpManifest.ts`         | 三档 | 是     | 0.19   | 2          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/acpMcp.ts`              | 三档 | 是     | 0.16   | 2          | `apps/zcode-cli/packages/adapters/src/exec/bash-shell-provider.ts`                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/acpOptions.ts`          | 三档 | 是     | 0.08   | 2          | `packages/server/src/remote/remoteAssetCache.ts`                                                   | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/acpProtocol.ts`         | 三档 | 是     | 0.07   | 2          | `packages/desktop/src/main/chromeLocalStorageManager.ts`                                           | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/antigravityProtocol.ts` | 三档 | 是     | 0.06   | 3          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`                    | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/claudeCommands.ts`      | 三档 | 是     | 0.10   | 2          | `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`                                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/claudeProtocol.ts`      | 三档 | 是     | 0.06   | 2          | `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/codexProtocol.ts`       | 三档 | 是     | 0.11   | 2          | `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/download.ts`            | 三档 | 是     | 0.15   | 2          | `apps/zcode-cli/packages/adapters/src/mcp/official-auth.ts`                                        | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/executable.ts`          | 三档 | 是     | 0.09   | 2          | `packages/zcode-server-cli/src/packaging/stage.ts`                                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/externalUpdate.ts`      | 三档 | 是     | 0.12   | 2          | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                              | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/grokAuth.ts`            | 三档 | 是     | 0.09   | 1          | `apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts`                                  | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/grokProtocol.ts`        | 三档 | 是     | 0.08   | 2          | `packages/desktop/src/main/browserView/browserGuestManager.ts`                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/installSource.ts`       | 三档 | 是     | 0.07   | 3          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts`                       | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/isolatedInspection.ts`  | 三档 | 是     | 0.11   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`                    | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/kernelRegistry.ts`      | 三档 | 是     | 0.08   | 2          | `packages/services/src/conversation-share/conversationShareService.ts`                             | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/kernelRun.ts`           | 三档 | 是     | 0.09   | 2          | `packages/desktop/src/main/browserView/browserGuestManager.ts`                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/managedKernels.ts`      | 三档 | 是     | 0.08   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts`                            | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/managedPaths.ts`        | 二档 | 是     | 0.24   | 2          | `packages/server/src/remote/remoteAssetCache.ts`                                                   | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/managedVersions.ts`     | 三档 | 是     | 0.12   | 2          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/managementLease.ts`     | 二档 | 是     | 0.28   | 2          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/modelOptions.ts`        | 三档 | 是     | 0.09   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`                        | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/processTransport.ts`    | 三档 | 是     | 0.11   | 3          | `packages/desktop/src/main/browserView/browserGuestManager.ts`                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/publishVersion.ts`      | 二档 | 是     | 0.32   | 3          | `packages/desktop/src/main/browserView/browserGuestManager.ts`                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/README.md`              | 三档 | 是     | 0.00   | 0          | —                                                                                                  | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/remoteAgentIdentity.ts` | 三档 | 是     | 0.15   | 2          | `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts`                                                | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/remoteKernelBridge.ts`  | 三档 | 是     | 0.09   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`                    | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/remoteKernelCatalog.ts` | 三档 | 是     | 0.07   | 1          | `packages/ui/src/hooks/useGroupedTaskView.ts`                                                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/kernels/tarExtract.ts`          | 三档 | 是     | 0.10   | 2          | `packages/services/src/skill-sync/skillSyncArchive.ts`                                             | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/pluginMcpProjection.ts`         | 三档 | 是     | 0.13   | 2          | `packages/services/src/commands/commandsService.ts`                                                | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/sharedCapabilities.ts`          | 三档 | 是     | 0.10   | 2          | `packages/desktop/src/main/chromeLocalStorageManager.ts`                                           | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/studioDatabase.ts`              | 三档 | 是     | 0.09   | 3          | `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/dwf-journal.ts`           | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/temporaryMcpConfig.ts`          | 二档 | 否     | 0.24   | 4          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/workspaceApply.ts`              | 三档 | 是     | 0.08   | 2          | `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`                                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/workspaceFiles.ts`              | 三档 | 是     | 0.12   | 3          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/workspaceJournal.ts`            | 三档 | 是     | 0.09   | 2          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/workspaceLocks.ts`              | 三档 | 是     | 0.19   | 2          | `apps/zcode-cli/packages/adapters/src/device/cli-device-mid.ts`                                    | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/workspaceManager.ts`            | 三档 | 是     | 0.07   | 1          | `packages/desktop/src/host/index.ts`                                                               | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/workspaceRecovery.ts`           | 三档 | 是     | 0.12   | 1          | `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`                                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/adapters/workspaceSnapshot.ts`           | 三档 | 是     | 0.09   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts`                            | M3 共享与服务 |
| `packages/services/src/studio-runtime/agentToolTypes.ts`                       | 二档 | 否     | 0.28   | 3          | `packages/shared/src/zcode-task-types-core.ts`                                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/checkpointStorage.ts`                | 三档 | 是     | 0.12   | 2          | `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/commandAdmission.ts`                 | 三档 | 是     | 0.08   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`                        | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/executionLimiter.ts`                 | 三档 | 是     | 0.17   | 4          | `packages/desktop/src/main/browserView/browserScreenshotActivityController.ts`                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/groupExecutor.ts`                    | 三档 | 是     | 0.06   | 1          | `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`                                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/groupSteering.ts`                    | 三档 | 是     | 0.11   | 2          | `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`                                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/groupSteps.ts`                       | 三档 | 是     | 0.12   | 1          | `packages/services/src/conversation-share/conversationShareService.ts`                             | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/groupWorkspaceIdentity.ts`           | 三档 | 是     | 0.05   | 1          | `apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts`                                  | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/pendingInbox.ts`                     | 三档 | 是     | 0.00   | 0          | —                                                                                                  | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/ports.ts`                            | 三档 | 是     | 0.18   | 2          | `packages/shared/src/zcode-task-types-core.ts`                                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/remoteAdmission.ts`                  | 三档 | 是     | 0.12   | 1          | `packages/services/src/session/taskIndexRepo.ts`                                                   | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/runExecutor.ts`                      | 三档 | 是     | 0.13   | 3          | `packages/desktop/src/host/index.ts`                                                               | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/runQueries.ts`                       | 三档 | 是     | 0.05   | 1          | `apps/zcode-cli/packages/adapters/src/exec/embedded-search-prelude.ts`                             | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/runtimeInteractions.ts`              | 三档 | 是     | 0.10   | 2          | `packages/server/src/remote/remoteAssetCache.ts`                                                   | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/runtimeLifecycle.ts`                 | 三档 | 是     | 0.16   | 3          | `packages/ui/src/v4/conversationProjectionStore.ts`                                                | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/stepInputs.ts`                       | 二档 | 否     | 0.21   | 1          | `apps/zcode-cli/packages/bootstrap/src/app/dynamic-workflow-run-launch.ts`                         | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/storePort.ts`                        | 三档 | 是     | 0.13   | 1          | `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts`                           | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/studioRuntimeService.ts`             | 三档 | 是     | 0.07   | 2          | `packages/services/src/zcode-agent/zcodeAgentService.ts`                                           | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/turnExecutor.ts`                     | 三档 | 是     | 0.09   | 2          | `packages/ui/src/store/automationManagementStore.ts`                                               | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/workflowExecutor.ts`                 | 三档 | 是     | 0.07   | 2          | `packages/desktop/src/host/windowRemoteConnectionRegistry.ts`                                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/workflowSteps.ts`                    | 三档 | 是     | 0.13   | 2          | `packages/desktop/src/host/index.ts`                                                               | M3 共享与服务 |
| `packages/services/src/studio-runtime/app/workspaceReview.ts`                  | 三档 | 是     | 0.11   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts`                            | M3 共享与服务 |
| `packages/services/src/studio-runtime/attentionTypes.ts`                       | 二档 | 否     | 0.28   | 1          | `packages/shared/src/zcode-task-types-core.ts`                                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/contract.example.ts`                     | 三档 | 是     | 0.05   | 1          | `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/dwf-journal-artifacts.ts` | M3 共享与服务 |
| `packages/services/src/studio-runtime/CONTRACT.md`                             | 三档 | 是     | 0.00   | 0          | —                                                                                                  | M3 共享与服务 |
| `packages/services/src/studio-runtime/contract.ts`                             | 三档 | 是     | 0.09   | 1          | `apps/zcode-cli/packages/contracts/src/events/session.events.ts`                                   | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/acpPermission.ts`                 | 二档 | 否     | 0.25   | 1          | `apps/zcode-cli/packages/adapters/src/plugins/helpers.ts`                                          | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/attentionVersion.ts`              | 二档 | 否     | 0.11   | 1          | `apps/zcode-cli/packages/adapters/src/browser/index.ts`                                            | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/condition.ts`                     | 三档 | 是     | 0.07   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`                           | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/groupPolicy.ts`                   | 三档 | 是     | 0.07   | 2          | `apps/zcode-cli/packages/debug/server/analyzer.ts`                                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/groupPrompts.ts`                  | 三档 | 是     | 0.20   | 1          | `apps/zcode-cli/packages/adapters/src/model/model-execution.ts`                                    | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/kernelIdentity.ts`                | 三档 | 是     | 0.06   | 1          | `packages/desktop/src/main/editors.ts`                                                             | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/kernelPolicy.ts`                  | 三档 | 是     | 0.07   | 2          | `apps/zcode-cli/packages/adapters/src/model/failure-ai-sdk-provider-error.ts`                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/kernelUsage.ts`                   | 三档 | 是     | 0.08   | 1          | `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`                                      | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/projectIdentity.ts`               | 二档 | 是     | 0.17   | 1          | `packages/services/src/usage-stats/providers/zcodeMcpQuotaProvider.ts`                             | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/remoteAgentIdentity.ts`           | 三档 | 是     | 0.10   | 1          | `apps/zcode-cli/packages/adapters/src/config/schema.ts`                                            | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/retiredKernels.ts`                | 二档 | 否     | 0.20   | 1          | `apps/zcode-cli/packages/adapters/src/config/file-config.adapter.ts`                               | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/stepReference.ts`                 | 三档 | 是     | 0.00   | 0          | —                                                                                                  | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/validation.ts`                    | 三档 | 是     | 0.14   | 2          | `packages/desktop/src/host/windowHostControllerService.ts`                                         | M3 共享与服务 |
| `packages/services/src/studio-runtime/domain/workflowGraph.ts`                 | 三档 | 是     | 0.10   | 2          | `apps/zcode-cli/packages/core/src/runtime/methods/session-fork.ts`                                 | M3 共享与服务 |
| `packages/services/src/studio-runtime/imageTypes.ts`                           | 二档 | 否     | 0.25   | 2          | `packages/shared/src/platform.ts`                                                                  | M3 共享与服务 |
| `packages/services/src/studio-runtime/kernelTypes.ts`                          | 三档 | 是     | 0.15   | 4          | `apps/zcode-cli/packages/contracts/src/events/session.events.ts`                                   | M3 共享与服务 |
| `packages/services/src/studio-runtime/module.ts`                               | 二档 | 是     | 0.17   | 1          | `.agents/skills/ai-elements/scripts/code-block.tsx`                                                | M3 共享与服务 |
| `packages/services/src/studio-runtime/node.ts`                                 | 三档 | 是     | 0.11   | 2          | `packages/desktop/src/main/desktopLinuxAppImageIcon.ts`                                            | M3 共享与服务 |
| `packages/services/src/studio-runtime/types.ts`                                | 三档 | 是     | 0.20   | 2          | `packages/shared/src/zcode-task-types-core.ts`                                                     | M3 共享与服务 |
| `packages/services/src/studio-runtime/workflowTypes.ts`                        | 二档 | 是     | 0.22   | 2          | `packages/shared/src/platform.ts`                                                                  | M3 共享与服务 |
| `packages/services/src/studio-runtime/workspaceImageTypes.ts`                  | 二档 | 否     | 0.21   | 1          | `apps/zcode-cli/packages/bootstrap/src/app/types.ts`                                               | M3 共享与服务 |
| `packages/services/src/subagents/subagentServiceFiles.ts`                      | 二档 | 否     | 0.45   | 5          | `packages/services/src/subagents/subagentsService.ts`                                              | M3 共享与服务 |
| `packages/services/src/subagents/subagentServicePlugins.ts`                    | 二档 | 否     | 0.32   | 6          | `packages/services/src/subagents/subagentsService.ts`                                              | M3 共享与服务 |
| `packages/services/src/subagents/subagentServiceState.ts`                      | 二档 | 否     | 0.37   | 5          | `packages/services/src/subagents/subagentsService.ts`                                              | M3 共享与服务 |
| `packages/services/src/system/ssh-alias/query.ts`                              | 二档 | 否     | 0.24   | 2          | `packages/services/src/system/sshConfigAlias.ts`                                                   | M3 共享与服务 |
| `packages/services/src/system/ssh-alias/tokens.ts`                             | 二档 | 否     | 0.32   | 6          | `packages/services/src/system/sshConfigAlias.ts`                                                   | M3 共享与服务 |
| `packages/services/src/system/system-probe/contracts.ts`                       | 二档 | 否     | 0.38   | 6          | `packages/services/src/system/systemService.ts`                                                    | M3 共享与服务 |
| `packages/services/src/system/system-probe/defaultAdapters.ts`                 | 二档 | 否     | 0.60   | 6          | `packages/services/src/system/systemService.ts`                                                    | M3 共享与服务 |
| `packages/services/src/system/system-probe/targetLifecycle.ts`                 | 一档 | 否     | 0.88   | 17         | `packages/services/src/system/systemService.ts`                                                    | M3 共享与服务 |
| `packages/services/src/system/systemServiceOwner.ts`                           | 二档 | 否     | 0.43   | 4          | `packages/services/src/system/systemService.ts`                                                    | M3 共享与服务 |
| `packages/services/src/terminal/terminalProfileMacOsDecode.ts`                 | 一档 | 否     | 0.22   | 17         | `packages/services/src/terminal/terminalProfileMacOs.ts`                                           | M3 共享与服务 |
| `packages/services/src/terminal/terminalProfileMacOsPlist.ts`                  | 二档 | 否     | 0.25   | 2          | `packages/desktop/src/main/desktopOAuthDeepLink.ts`                                                | M3 共享与服务 |
| `packages/services/src/terminal/terminalProfilePortableRead.ts`                | 二档 | 否     | 0.27   | 1          | `packages/services/src/terminal/terminalProfile.ts`                                                | M3 共享与服务 |
| `packages/services/src/terminal/terminalServiceLaunchPlan.ts`                  | 一档 | 否     | 0.21   | 9          | `packages/services/src/terminal/terminalService.ts`                                                | M3 共享与服务 |
| `packages/services/src/window-controller/node.ts`                              | 二档 | 否     | 0.25   | 1          | `packages/services/src/index.ts`                                                                   | M3 共享与服务 |
| `packages/services/src/window-controller/windowHostControllerProjection.ts`    | 一档 | 否     | 0.99   | 200        | `packages/desktop/src/host/windowHostControllerProjection.ts`                                      | M3 共享与服务 |
| `packages/services/src/window-controller/windowHostControllerService.ts`       | 一档 | 否     | 0.96   | 164        | `packages/desktop/src/host/windowHostControllerService.ts`                                         | M3 共享与服务 |
| `packages/services/src/window-controller/windowHostSessionsIndexObserver.ts`   | 一档 | 否     | 0.98   | 200        | `packages/desktop/src/host/windowHostSessionsIndexObserver.ts`                                     | M3 共享与服务 |

### packages/ui/src（187）

| 文件                                                                      | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                                            | 里程碑 |
| ------------------------------------------------------------------------- | ---- | ------ | ------ | ---------- | ----------------------------------------------------------------------------------------- | ------ |
| `packages/ui/src/app-shell/NarrowSidebarDrawer.tsx`                       | 二档 | 否     | 0.34   | 3          | `packages/ui/src/settings/SubagentsSection.tsx`                                           | M5 UI  |
| `packages/ui/src/app-shell/useWorkspaceShellState.ts`                     | 一档 | 是     | 0.67   | 13         | `packages/ui/src/app-shell/useWorkspaceShellZCodeState.ts`                                | M5 UI  |
| `packages/ui/src/appearance/appearance.css`                               | 三档 | 是     | 0.14   | 2          | `packages/ui/src/styles.css`                                                              | M5 UI  |
| `packages/ui/src/appearance/AppearanceLayer.tsx`                          | 二档 | 是     | 0.27   | 2          | `packages/ui/src/PreviewPane.tsx`                                                         | M5 UI  |
| `packages/ui/src/appearance/backgroundImage.ts`                           | 三档 | 是     | 0.10   | 1          | `packages/ui/src/components/ai-elements/prompt-input-actions.tsx`                         | M5 UI  |
| `packages/ui/src/appearance/preferences.ts`                               | 三档 | 是     | 0.07   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts`                       | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-antigravity.png`                 | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-claude.png`                      | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-copilot.svg`                     | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-goose.png`                       | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-grok.png`                        | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-hermes.ico`                      | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-icon-sources.json`               | 三档 | 是     | 0.02   | 1          | `packages/ui/src/assets/provider-icons/model-provider-logo-sources.json`                  | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-mistral-vibe.svg`                | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-qoder.png`                       | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/assets/cli-icons/kernel-qwen-code.png`                   | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/assets/knorvia-logo.png`                                 | 三档 | 是     | —      | —          | —                                                                                         | M5 UI  |
| `packages/ui/src/chat-input-toolbar/chatMetrics.ts`                       | 三档 | 是     | 0.07   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`               | M5 UI  |
| `packages/ui/src/chat-input-toolbar/ChatMetricsBar.tsx`                   | 二档 | 是     | 0.29   | 3          | `packages/ui/src/TaskListItem.tsx`                                                        | M5 UI  |
| `packages/ui/src/chat-input-toolbar/NativeChatMetrics.tsx`                | 二档 | 是     | 0.47   | 3          | `packages/ui/src/AssistantCodeCommentCards.tsx`                                           | M5 UI  |
| `packages/ui/src/chat-input-toolbar/ThoughtLevelSlider.tsx`               | 二档 | 否     | 0.33   | 3          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/components/knorvia/KnorviaCompanion.tsx`                 | 二档 | 是     | 0.34   | 4          | `packages/ui/src/components/workflow-timeline/WorkflowRunDigest.tsx`                      | M5 UI  |
| `packages/ui/src/components/knorvia/KnorviaMark.tsx`                      | 二档 | 是     | 0.22   | 2          | `packages/ui/src/components/workflow-timeline/WorkflowTimelineArcs.tsx`                   | M5 UI  |
| `packages/ui/src/components/knorvia/MascotAppearanceSetting.tsx`          | 二档 | 是     | 0.51   | 6          | `packages/ui/src/settingsPageHelpers.tsx`                                                 | M5 UI  |
| `packages/ui/src/components/knorvia/mascotArtwork.ts`                     | 三档 | 是     | 0.00   | 0          | —                                                                                         | M5 UI  |
| `packages/ui/src/components/knorvia/mascotMotion.ts`                      | 三档 | 是     | 0.06   | 2          | `packages/desktop/src/main/browserView/browserCommandPageHandlers.ts`                     | M5 UI  |
| `packages/ui/src/components/knorvia/useKnorviaMotion.ts`                  | 三档 | 是     | 0.04   | 2          | `packages/ui/src/v4/ConversationTimeline.tsx`                                             | M5 UI  |
| `packages/ui/src/components/ui/toast-presentation.tsx`                    | 一档 | 否     | 0.59   | 17         | `packages/ui/src/components/ui/toast.tsx`                                                 | M5 UI  |
| `packages/ui/src/hooks/useAgentService.ts`                                | 二档 | 是     | 0.50   | 3          | `packages/ui/src/hooks/useResolvedRemoteWorkspaceSessionId.ts`                            | M5 UI  |
| `packages/ui/src/hooks/useCliProviderSwitch.ts`                           | 二档 | 否     | 0.32   | 3          | `packages/ui/src/hooks/useGroupedTaskView.ts`                                             | M5 UI  |
| `packages/ui/src/hooks/useConfig.ts`                                      | 一档 | 是     | 0.89   | 26         | `packages/ui/src/hooks/useZCodeConfig.ts`                                                 | M5 UI  |
| `packages/ui/src/hooks/useSessionService.ts`                              | 二档 | 是     | 0.50   | 3          | `packages/ui/src/hooks/useResolvedRemoteWorkspaceSessionId.ts`                            | M5 UI  |
| `packages/ui/src/hooks/useTaskService.ts`                                 | 一档 | 是     | 0.86   | 65         | `packages/ui/src/hooks/useZCodeTaskService.ts`                                            | M5 UI  |
| `packages/ui/src/onboarding/OnboardingStepRail.tsx`                       | 二档 | 否     | 0.44   | 6          | `packages/ui/src/onboarding/OnboardingHeader.tsx`                                         | M5 UI  |
| `packages/ui/src/onboarding/OnboardingWelcomeStep.tsx`                    | 二档 | 否     | 0.32   | 6          | `packages/ui/src/settings/SubagentsSection.tsx`                                           | M5 UI  |
| `packages/ui/src/onboarding/StudioFirstRunGuide.tsx`                      | 二档 | 否     | 0.37   | 6          | `packages/ui/src/GitActionMenu.tsx`                                                       | M5 UI  |
| `packages/ui/src/prompt-editor/ConversationComposerSurface.tsx`           | 二档 | 是     | 0.54   | 3          | `packages/ui/src/command-center/CommandCenterDialog.tsx`                                  | M5 UI  |
| `packages/ui/src/settings/AppearanceMaterials.tsx`                        | 二档 | 是     | 0.30   | 4          | `packages/ui/src/settings/SubagentsSection.tsx`                                           | M5 UI  |
| `packages/ui/src/settings/asyncSettingField.ts`                           | 三档 | 是     | 0.13   | 3          | `packages/ui/src/lib/cuaPermissionStatusStore.ts`                                         | M5 UI  |
| `packages/ui/src/settings/AsyncSettingTextRow.tsx`                        | 二档 | 是     | 0.24   | 4          | `packages/ui/src/feedback/FeatureRequestDialog.tsx`                                       | M5 UI  |
| `packages/ui/src/settings/DataStorageSettings.tsx`                        | 二档 | 是     | 0.30   | 4          | `packages/ui/src/settings/DataBaseDirControl.tsx`                                         | M5 UI  |
| `packages/ui/src/settings/LocalDiagnosticsSettings.tsx`                   | 二档 | 否     | 0.29   | 4          | `packages/ui/src/onboarding/OccupationOnboarding.tsx`                                     | M5 UI  |
| `packages/ui/src/settings/PluginCompatibilitySection.tsx`                 | 二档 | 否     | 0.29   | 4          | `packages/ui/src/v4/ConversationShareConfirmationDock.tsx`                                | M5 UI  |
| `packages/ui/src/settings/PluginSourcesDialog.tsx`                        | 二档 | 是     | 0.39   | 6          | `packages/ui/src/GitActionMenu.tsx`                                                       | M5 UI  |
| `packages/ui/src/settings/ReleaseUpdateSettings.tsx`                      | 二档 | 否     | 0.25   | 4          | `packages/ui/src/settings/AddMarketplaceSourceDialog.tsx`                                 | M5 UI  |
| `packages/ui/src/settings/useSettingsNavCompact.ts`                       | 二档 | 否     | 0.32   | 3          | `packages/ui/src/app-shell/WorkflowRunPhaseList.tsx`                                      | M5 UI  |
| `packages/ui/src/store/appearancePreferenceStore.ts`                      | 三档 | 是     | 0.15   | 1          | `packages/desktop/src/main/browserView/browserGuestManager.ts`                            | M5 UI  |
| `packages/ui/src/store/mascotPreferenceStore.ts`                          | 二档 | 是     | 0.22   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`           | M5 UI  |
| `packages/ui/src/store/sessionStore.ts`                                   | 一档 | 是     | 0.75   | 9          | `packages/ui/src/store/zcodeSessionStore.ts`                                              | M5 UI  |
| `packages/ui/src/store/sessionStoreTaskSlice.ts`                          | 一档 | 是     | 0.95   | 131        | `packages/ui/src/store/zcodeSessionStoreTaskSlice.ts`                                     | M5 UI  |
| `packages/ui/src/store/sessionStoreWorkspaceSlice.ts`                     | 一档 | 是     | 0.94   | 147        | `packages/ui/src/store/zcodeSessionStoreWorkspaceSlice.ts`                                | M5 UI  |
| `packages/ui/src/store/studioAgentStore.ts`                               | 三档 | 是     | 0.11   | 2          | `packages/ui/src/v4/workbenchGroupStore.ts`                                               | M5 UI  |
| `packages/ui/src/store/studioGroupStore.ts`                               | 三档 | 是     | 0.12   | 2          | `packages/ui/src/v4/workbenchGroupStore.ts`                                               | M5 UI  |
| `packages/ui/src/store/studioWorkflowStore.ts`                            | 三档 | 是     | 0.09   | 2          | `packages/ui/src/store/mcpStore.ts`                                                       | M5 UI  |
| `packages/ui/src/studio/agents/agentConfig.ts`                            | 二档 | 是     | 0.23   | 1          | `packages/services/src/session/offPeakMockGateway.ts`                                     | M5 UI  |
| `packages/ui/src/studio/agents/agentDrafts.ts`                            | 三档 | 是     | 0.16   | 3          | `packages/services/src/node.ts`                                                           | M5 UI  |
| `packages/ui/src/studio/agents/chatSelections.ts`                         | 三档 | 是     | 0.13   | 1          | `apps/zcode-cli/packages/adapters/src/mcp/index.ts`                                       | M5 UI  |
| `packages/ui/src/studio/agents/chatSubmission.ts`                         | 三档 | 是     | 0.13   | 1          | `packages/ui/src/LexicalChatInput.tsx`                                                    | M5 UI  |
| `packages/ui/src/studio/agents/CliProviderSwitchCard.tsx`                 | 二档 | 否     | 0.22   | 6          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/agents/conversationList.ts`                       | 三档 | 是     | 0.12   | 1          | `packages/desktop/src/main/browserView/browserTabRecoveryStore.ts`                        | M5 UI  |
| `packages/ui/src/studio/agents/draftUnloadWarning.ts`                     | 三档 | 是     | 0.13   | 2          | `packages/ui/src/v4/WorkbenchPane.tsx`                                                    | M5 UI  |
| `packages/ui/src/studio/agents/HandoffTaskEditor.tsx`                     | 二档 | 否     | 0.28   | 4          | `packages/ui/src/settings/HookForm.tsx`                                                   | M5 UI  |
| `packages/ui/src/studio/agents/messages.ts`                               | 三档 | 是     | 0.00   | 1          | `.agents/skills/ai-elements/scripts/code-block.tsx`                                       | M5 UI  |
| `packages/ui/src/studio/agents/StudioAgentConfigDialog.tsx`               | 一档 | 是     | 0.33   | 13         | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/agents/StudioAgentManagementDialog.tsx`           | 二档 | 是     | 0.37   | 7          | `packages/ui/src/GitActionMenu.tsx`                                                       | M5 UI  |
| `packages/ui/src/studio/agents/StudioAgentProbeDetails.tsx`               | 二档 | 否     | 0.36   | 4          | `packages/ui/src/PermissionDialog.tsx`                                                    | M5 UI  |
| `packages/ui/src/studio/agents/StudioAgentsSection.tsx`                   | 三档 | 是     | 0.18   | 3          | `packages/ui/src/settings/AutomationsSection.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/agents/StudioAgentStatusDetails.tsx`              | 二档 | 是     | 0.37   | 3          | `packages/ui/src/app-shell/WorkflowRunSidePaneSections.tsx`                               | M5 UI  |
| `packages/ui/src/studio/agents/StudioAgentStorageNotice.tsx`              | 二档 | 是     | 0.33   | 4          | `packages/ui/src/remote-connection/RemoteConnectionConnectingStep.tsx`                    | M5 UI  |
| `packages/ui/src/studio/agents/StudioChatModelControls.tsx`               | 三档 | 是     | 0.18   | 4          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/agents/StudioChatPermissionControl.tsx`           | 二档 | 否     | 0.50   | 5          | `packages/ui/src/EmbeddedBrowserPaneParts.tsx`                                            | M5 UI  |
| `packages/ui/src/studio/agents/StudioChatStopControl.tsx`                 | 二档 | 否     | 0.40   | 4          | `packages/ui/src/v4/ConversationRowView.tsx`                                              | M5 UI  |
| `packages/ui/src/studio/agents/StudioDraftProjectMenu.tsx`                | 三档 | 是     | 0.15   | 2          | `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`                                      | M5 UI  |
| `packages/ui/src/studio/agents/StudioExternalChat.tsx`                    | 三档 | 是     | 0.18   | 4          | `packages/ui/src/v4/ConversationComposer.tsx`                                             | M5 UI  |
| `packages/ui/src/studio/agents/StudioExternalDraftList.tsx`               | 二档 | 是     | 0.27   | 5          | `packages/ui/src/v4/ConversationStatusPanel.tsx`                                          | M5 UI  |
| `packages/ui/src/studio/agents/StudioImageAttachments.tsx`                | 二档 | 否     | 0.36   | 4          | `packages/ui/src/v4/ConversationComposer.tsx`                                             | M5 UI  |
| `packages/ui/src/studio/agents/StudioKernelCard.tsx`                      | 二档 | 否     | 0.29   | 4          | `packages/ui/src/settings/AutomationsSection.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/agents/studioKernelCatalog.ts`                    | 三档 | 是     | 0.08   | 2          | `packages/ui/src/v4/sessionsIndexStore.ts`                                                | M5 UI  |
| `packages/ui/src/studio/agents/StudioKernelIcon.tsx`                      | 二档 | 是     | 0.32   | 3          | `packages/ui/src/v4/ConversationDraftEmptyState.tsx`                                      | M5 UI  |
| `packages/ui/src/studio/agents/StudioKernelRail.tsx`                      | 一档 | 否     | 0.42   | 9          | `packages/ui/src/WorkspaceSidebar.tsx`                                                    | M5 UI  |
| `packages/ui/src/studio/agents/StudioKernelSelect.tsx`                    | 二档 | 是     | 0.48   | 6          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/agents/StudioSendRefusalNotice.tsx`               | 二档 | 否     | 0.40   | 4          | `packages/ui/src/app-shell/WorkflowRunSidePaneSections.tsx`                               | M5 UI  |
| `packages/ui/src/studio/agents/StudioSessionActions.tsx`                  | 一档 | 否     | 0.31   | 13         | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/agents/uiAsyncActionGate.ts`                      | 二档 | 否     | 0.22   | 2          | `packages/ui/src/v4/conversationProjectionStore.ts`                                       | M5 UI  |
| `packages/ui/src/studio/agents/useStudioChatOptions.ts`                   | 三档 | 是     | 0.14   | 2          | `packages/ui/src/settings/model-provider-section/useCodingPlanProducts.ts`                | M5 UI  |
| `packages/ui/src/studio/agents/useStudioKernelCatalog.ts`                 | 三档 | 是     | 0.19   | 1          | `apps/zcode-cli/packages/adapters/src/model/model-execution.ts`                           | M5 UI  |
| `packages/ui/src/studio/attention/attentionRead.ts`                       | 二档 | 否     | 0.21   | 3          | `packages/ui/src/app-shell/useWorkspaceTaskNavigation.ts`                                 | M5 UI  |
| `packages/ui/src/studio/attention/StudioAttentionInbox.tsx`               | 二档 | 否     | 0.32   | 2          | `packages/ui/src/WorkspaceSidebar.tsx`                                                    | M5 UI  |
| `packages/ui/src/studio/attention/StudioAttentionInboxView.tsx`           | 二档 | 否     | 0.35   | 4          | `packages/ui/src/v4/ConversationShareConfirmationDock.tsx`                                | M5 UI  |
| `packages/ui/src/studio/creation/CreationFiles.tsx`                       | 二档 | 否     | 0.30   | 3          | `packages/ui/src/feedback/FeedbackScreenshotPicker.tsx`                                   | M5 UI  |
| `packages/ui/src/studio/creation/creationSubmit.ts`                       | 二档 | 否     | 0.21   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-telemetry-facts.ts` | M5 UI  |
| `packages/ui/src/studio/creation/messages.ts`                             | 三档 | 是     | 0.00   | 0          | —                                                                                         | M5 UI  |
| `packages/ui/src/studio/creation/StudioCreationHistory.tsx`               | 二档 | 否     | 0.23   | 4          | `apps/zcode-cli/packages/debug/src/App.tsx`                                               | M5 UI  |
| `packages/ui/src/studio/creation/StudioCreationJobCard.tsx`               | 二档 | 否     | 0.27   | 4          | `packages/ui/src/settings/PluginStoreDetailView.tsx`                                      | M5 UI  |
| `packages/ui/src/studio/creation/StudioCreationModelDialog.tsx`           | 二档 | 是     | 0.29   | 7          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/creation/StudioCreationOutput.tsx`                | 二档 | 是     | 0.32   | 3          | `packages/ui/src/components/ai-elements/attachments.tsx`                                  | M5 UI  |
| `packages/ui/src/studio/creation/StudioCreationPage.tsx`                  | 二档 | 是     | 0.21   | 5          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/groups/GroupComposer.tsx`                         | 一档 | 是     | 0.29   | 11         | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/groups/groupDefinitions.ts`                       | 三档 | 是     | 0.06   | 1          | `apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts`                         | M5 UI  |
| `packages/ui/src/studio/groups/GroupDetailsPanel.tsx`                     | 二档 | 是     | 0.34   | 4          | `packages/ui/src/v4/ConversationStatusPanel.tsx`                                          | M5 UI  |
| `packages/ui/src/studio/groups/GroupEditDialog.tsx`                       | 二档 | 是     | 0.29   | 7          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/groups/GroupMembersField.tsx`                     | 二档 | 是     | 0.30   | 3          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/groups/GroupMetricsBar.tsx`                       | 二档 | 否     | 0.22   | 2          | `packages/ui/src/settings/SkillsSection.tsx`                                              | M5 UI  |
| `packages/ui/src/studio/groups/groupModel.ts`                             | 三档 | 是     | 0.17   | 2          | `packages/services/src/model-provider/legacyModelProviderSerialized.ts`                   | M5 UI  |
| `packages/ui/src/studio/groups/GroupProgressPanel.tsx`                    | 二档 | 否     | 0.26   | 5          | `packages/ui/src/settings/PluginStoreDetailView.tsx`                                      | M5 UI  |
| `packages/ui/src/studio/groups/GroupSettingsFields.tsx`                   | 二档 | 是     | 0.49   | 6          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/groups/groupSubmission.ts`                        | 三档 | 是     | 0.14   | 2          | `packages/ui/src/LexicalChatInput.tsx`                                                    | M5 UI  |
| `packages/ui/src/studio/groups/messages.ts`                               | 三档 | 是     | 0.00   | 0          | —                                                                                         | M5 UI  |
| `packages/ui/src/studio/groups/StudioGroupList.tsx`                       | 二档 | 是     | 0.38   | 3          | `packages/ui/src/settings/SkillsSection.tsx`                                              | M5 UI  |
| `packages/ui/src/studio/groups/StudioGroupsPage.tsx`                      | 二档 | 是     | 0.36   | 7          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/groups/useStudioGroups.ts`                        | 三档 | 是     | 0.06   | 1          | `apps/zcode-cli/packages/adapters/src/plugins/marketplace.ts`                             | M5 UI  |
| `packages/ui/src/studio/messages.ts`                                      | 三档 | 是     | 0.00   | 0          | —                                                                                         | M5 UI  |
| `packages/ui/src/studio/newTaskIntent.ts`                                 | 三档 | 是     | 0.09   | 1          | `packages/ui/src/AssistantCodeCommentCards.tsx`                                           | M5 UI  |
| `packages/ui/src/studio/runtime/studioClient.ts`                          | 三档 | 是     | 0.06   | 2          | `packages/ui/src/v4/SessionPane.tsx`                                                      | M5 UI  |
| `packages/ui/src/studio/runtime/studioInteractionAnswers.ts`              | 三档 | 是     | 0.10   | 1          | `apps/zcode-cli/packages/adapters/src/model/runner-debug.ts`                              | M5 UI  |
| `packages/ui/src/studio/runtime/StudioInteractions.tsx`                   | 二档 | 是     | 0.32   | 4          | `packages/ui/src/GitActionMenu.tsx`                                                       | M5 UI  |
| `packages/ui/src/studio/runtime/StudioMessageImages.tsx`                  | 二档 | 否     | 0.24   | 2          | `packages/ui/src/v4/ConversationRowView.tsx`                                              | M5 UI  |
| `packages/ui/src/studio/runtime/StudioMessageMedia.tsx`                   | 二档 | 否     | 0.30   | 3          | `packages/ui/src/v4/ConversationStatusPanel.tsx`                                          | M5 UI  |
| `packages/ui/src/studio/runtime/studioRunFocus.ts`                        | 二档 | 否     | 0.29   | 1          | `apps/zcode-cli/packages/contracts/src/events/session.events.ts`                          | M5 UI  |
| `packages/ui/src/studio/runtime/StudioRunHistory.tsx`                     | 三档 | 是     | 0.19   | 3          | `packages/ui/src/GitActionMenu.tsx`                                                       | M5 UI  |
| `packages/ui/src/studio/runtime/studioRunHistoryActions.ts`               | 三档 | 是     | 0.08   | 3          | `packages/desktop/src/main/browserView/browserGuestManager.ts`                            | M5 UI  |
| `packages/ui/src/studio/runtime/studioRunStepLabel.ts`                    | 三档 | 是     | 0.08   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`           | M5 UI  |
| `packages/ui/src/studio/runtime/studioScrollAnchor.ts`                    | 三档 | 是     | 0.13   | 1          | `apps/zcode-cli/packages/adapters/src/browser/playwright-command.ts`                      | M5 UI  |
| `packages/ui/src/studio/runtime/StudioTimeline.tsx`                       | 三档 | 是     | 0.20   | 5          | `packages/ui/src/v4/ConversationRowView.tsx`                                              | M5 UI  |
| `packages/ui/src/studio/runtime/studioTimelinePagination.ts`              | 三档 | 是     | 0.07   | 1          | `apps/zcode-cli/packages/adapters/src/auth/cli-oauth.ts`                                  | M5 UI  |
| `packages/ui/src/studio/runtime/StudioWorkspaceApplyControls.tsx`         | 二档 | 否     | 0.41   | 2          | `packages/ui/src/settings/ExternalAgentImportDialog.tsx`                                  | M5 UI  |
| `packages/ui/src/studio/runtime/StudioWorkspaceFeedback.tsx`              | 二档 | 否     | 0.28   | 3          | `packages/ui/src/GitActionMenu.tsx`                                                       | M5 UI  |
| `packages/ui/src/studio/runtime/StudioWorkspaceImageCompare.tsx`          | 二档 | 否     | 0.24   | 5          | `packages/ui/src/PreviewPane.tsx`                                                         | M5 UI  |
| `packages/ui/src/studio/runtime/StudioWorkspaceRuntimeCard.tsx`           | 二档 | 否     | 0.25   | 3          | `packages/ui/src/settings/PluginStoreDetailView.tsx`                                      | M5 UI  |
| `packages/ui/src/studio/runtime/useStudioRuntime.ts`                      | 三档 | 是     | 0.10   | 2          | `apps/zcode-cli/packages/adapters/src/model/model-execution.ts`                           | M5 UI  |
| `packages/ui/src/studio/StudioActivityRail.tsx`                           | 二档 | 否     | 0.27   | 3          | `packages/ui/src/SettingsPage.tsx`                                                        | M5 UI  |
| `packages/ui/src/studio/StudioConversationSwitch.tsx`                     | 二档 | 是     | 0.50   | 3          | `packages/ui/src/settings/SettingsSegmentedTabs.tsx`                                      | M5 UI  |
| `packages/ui/src/studio/StudioPageFrame.tsx`                              | 二档 | 是     | 0.41   | 3          | `packages/ui/src/SettingsPage.tsx`                                                        | M5 UI  |
| `packages/ui/src/studio/StudioWorkspaceFrame.tsx`                         | 二档 | 否     | 0.39   | 4          | `packages/ui/src/WorkspaceHeader.tsx`                                                     | M5 UI  |
| `packages/ui/src/studio/types.ts`                                         | 三档 | 是     | 0.05   | 2          | `apps/zcode-cli/packages/bootstrap/src/plugins.ts`                                        | M5 UI  |
| `packages/ui/src/studio/useStudioNavigation.ts`                           | 三档 | 是     | 0.06   | 2          | `packages/ui/src/WorkspaceGroupedTasksSection.tsx`                                        | M5 UI  |
| `packages/ui/src/studio/workbench/AddToWorkbench.tsx`                     | 二档 | 否     | 0.26   | 2          | `packages/ui/src/onboarding/OccupationOnboarding.tsx`                                     | M5 UI  |
| `packages/ui/src/studio/workbench/WorkbenchAttention.tsx`                 | 二档 | 否     | 0.31   | 2          | `packages/ui/src/v4/ConversationShareReadonlyTimeline.tsx`                                | M5 UI  |
| `packages/ui/src/studio/workbench/WorkbenchConnectionNotice.tsx`          | 二档 | 否     | 0.20   | 1          | `.agents/skills/ai-elements/scripts/prompt-input-cursor.tsx`                              | M5 UI  |
| `packages/ui/src/studio/workbench/WorkbenchConversationPicker.tsx`        | 二档 | 否     | 0.26   | 4          | `packages/ui/src/settings/SubagentsSection.tsx`                                           | M5 UI  |
| `packages/ui/src/studio/workbench/WorkbenchPreview.tsx`                   | 二档 | 否     | 0.20   | 4          | `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`                                     | M5 UI  |
| `packages/ui/src/studio/workbench/WorkbenchTaskList.tsx`                  | 二档 | 否     | 0.25   | 3          | `packages/ui/src/v4/ConversationStatusPanel.tsx`                                          | M5 UI  |
| `packages/ui/src/studio/workbench/WorkbenchTileBody.tsx`                  | 二档 | 否     | 0.29   | 3          | `packages/ui/src/SettingsPage.tsx`                                                        | M5 UI  |
| `packages/ui/src/studio/workbench/WorkbenchTileHeader.tsx`                | 二档 | 否     | 0.44   | 6          | `packages/ui/src/settings/saved-workflows/SavedWorkflowCard.tsx`                          | M5 UI  |
| `packages/ui/src/studio/workbench/WorkbenchTileSetup.tsx`                 | 二档 | 否     | 0.26   | 3          | `packages/ui/src/settings/RemoteMcpSyncDialog.tsx`                                        | M5 UI  |
| `packages/ui/src/studio/workflow/connection.ts`                           | 三档 | 是     | 0.08   | 2          | `apps/zcode-cli/packages/adapters/src/exec/bash-shell-provider.ts`                        | M5 UI  |
| `packages/ui/src/studio/workflow/graph.ts`                                | 三档 | 是     | 0.09   | 2          | `apps/zcode-cli/packages/bootstrap/src/app/dynamic-workflow-import.ts`                    | M5 UI  |
| `packages/ui/src/studio/workflow/messages.ts`                             | 三档 | 是     | 0.00   | 0          | —                                                                                         | M5 UI  |
| `packages/ui/src/studio/workflow/StudioWorkflowPage.tsx`                  | 二档 | 是     | 0.25   | 6          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/workflow/types.ts`                                | 三档 | 是     | 0.10   | 2          | `apps/zcode-cli/packages/bootstrap/src/plugins.ts`                                        | M5 UI  |
| `packages/ui/src/studio/workflow/useStudioWorkflows.ts`                   | 三档 | 是     | 0.11   | 1          | `packages/ui/src/v4/composer/useComposerAttachments.ts`                                   | M5 UI  |
| `packages/ui/src/studio/workflow/useWorkflowExecution.ts`                 | 三档 | 是     | 0.10   | 2          | `packages/ui/src/DirectoryBrowser.tsx`                                                    | M5 UI  |
| `packages/ui/src/studio/workflow/useWorkflowFiles.ts`                     | 二档 | 是     | 0.20   | 2          | `packages/desktop/src/main/browserView/browserPlaywrightLocatorExecutor.ts`               | M5 UI  |
| `packages/ui/src/studio/workflow/useWorkflowText.ts`                      | 二档 | 是     | 0.17   | 1          | `packages/ui/src/GitPane.tsx`                                                             | M5 UI  |
| `packages/ui/src/studio/workflow/workflow.css`                            | 三档 | 是     | 0.00   | 0          | —                                                                                         | M5 UI  |
| `packages/ui/src/studio/workflow/workflowActionScope.ts`                  | 二档 | 是     | 0.35   | 2          | `packages/ui/src/root/accountConnectionRefreshObserver.ts`                                | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowCanvasControls.tsx`              | 二档 | 是     | 0.20   | 2          | `apps/zcode-cli/packages/debug/src/App.tsx`                                               | M5 UI  |
| `packages/ui/src/studio/workflow/workflowDrafts.ts`                       | 三档 | 是     | 0.09   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`               | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowEditor.tsx`                      | 三档 | 是     | 0.10   | 4          | `packages/ui/src/settings/saved-workflows/SavedWorkflowDetailView.tsx`                    | M5 UI  |
| `packages/ui/src/studio/workflow/workflowFiles.ts`                        | 三档 | 是     | 0.12   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`               | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowHistoryPane.tsx`                 | 二档 | 否     | 0.39   | 2          | `packages/ui/src/RemoteConnectionFields.tsx`                                              | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowInspector.tsx`                   | 二档 | 是     | 0.33   | 5          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowInspectorOutputs.tsx`            | 二档 | 否     | 0.21   | 3          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowLibrary.tsx`                     | 二档 | 是     | 0.36   | 5          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowNode.tsx`                        | 二档 | 是     | 0.21   | 3          | `packages/ui/src/components/ui/pptx-preview-viewer.tsx`                                   | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowRunComparison.tsx`               | 二档 | 否     | 0.35   | 6          | `packages/ui/src/settings/HookForm.tsx`                                                   | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowRunDialog.tsx`                   | 二档 | 是     | 0.23   | 6          | `packages/ui/src/GitActionMenu.tsx`                                                       | M5 UI  |
| `packages/ui/src/studio/workflow/workflowRuntimeState.ts`                 | 三档 | 是     | 0.14   | 2          | `apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts`                            | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowScheduleDialog.tsx`              | 二档 | 否     | 0.35   | 7          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/workflow/workflowShortcuts.ts`                    | 二档 | 否     | 0.32   | 2          | `packages/ui/src/ConfirmDialog.tsx`                                                       | M5 UI  |
| `packages/ui/src/studio/workflow/workflowStorage.ts`                      | 三档 | 是     | 0.13   | 1          | `apps/zcode-cli/packages/bootstrap/src/plugins.ts`                                        | M5 UI  |
| `packages/ui/src/studio/workflow/workflowSubmission.ts`                   | 二档 | 是     | 0.20   | 1          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowToolbar.tsx`                     | 二档 | 是     | 0.26   | 5          | `packages/ui/src/settings/AutomationEditView.tsx`                                         | M5 UI  |
| `packages/ui/src/studio/workflow/WorkflowValidationPanel.tsx`             | 二档 | 是     | 0.37   | 3          | `packages/ui/src/GitActionMenu.tsx`                                                       | M5 UI  |
| `packages/ui/src/v4/conversationDraftLayout.ts`                           | 三档 | 是     | 0.00   | 0          | —                                                                                         | M5 UI  |
| `packages/ui/src/v4/NativeSessionActions.tsx`                             | 二档 | 否     | 0.22   | 2          | `packages/ui/src/settings/AutomationsSection.tsx`                                         | M5 UI  |
| `packages/ui/src/workspace-file-tree/fileTreeConsumerResources.ts`        | 二档 | 否     | 0.28   | 3          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-resident-pool.ts`           | M5 UI  |
| `packages/ui/src/workspace-file-tree/fileTreeDataOwner.ts`                | 二档 | 否     | 0.21   | 5          | `packages/ui/src/workspace-file-tree/useWorkspaceFileTreeData.ts`                         | M5 UI  |
| `packages/ui/src/workspace-file-tree/fileTreeRefreshScheduling.ts`        | 二档 | 否     | 0.23   | 4          | `apps/zcode-cli/packages/core/src/subagent/runner.ts`                                     | M5 UI  |
| `packages/ui/src/workspace-file-tree/gitProjection.ts`                    | 二档 | 否     | 0.36   | 5          | `packages/ui/src/workspace-file-tree/model.ts`                                            | M5 UI  |
| `packages/ui/src/workspace-file-tree/pathProjection.ts`                   | 二档 | 否     | 0.28   | 4          | `packages/ui/src/workspace-file-tree/model.ts`                                            | M5 UI  |
| `packages/ui/src/workspace-file-tree/rowProjection.ts`                    | 二档 | 否     | 0.23   | 7          | `packages/ui/src/workspace-file-tree/model.ts`                                            | M5 UI  |
| `packages/ui/src/workspace-file-tree/treeProjectionTypes.ts`              | 一档 | 否     | 0.90   | 19         | `packages/ui/src/workspace-file-tree/model.ts`                                            | M5 UI  |
| `packages/ui/src/workspace-grouped-tasks/groupedCreatedTaskEventLease.ts` | 二档 | 否     | 0.20   | 2          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                                        | M5 UI  |
| `packages/ui/src/workspace-grouped-tasks/groupedDragProjection.ts`        | 二档 | 否     | 0.23   | 2          | `packages/ui/src/WorkspaceGroupedTasksSection.tsx`                                        | M5 UI  |
| `packages/ui/src/workspace-grouped-tasks/groupedOptimisticProjection.ts`  | 二档 | 否     | 0.21   | 3          | `packages/ui/src/hooks/useGroupedTaskView.ts`                                             | M5 UI  |
| `packages/ui/src/workspace-grouped-tasks/viewSelectors.ts`                | 二档 | 否     | 0.27   | 3          | `packages/ui/src/workspace-grouped-tasks/view.ts`                                         | M5 UI  |

### packages/services/test（51）

| 文件                                                                              | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                                   | 里程碑        |
| --------------------------------------------------------------------------------- | ---- | ------ | ------ | ---------- | -------------------------------------------------------------------------------- | ------------- |
| `packages/services/test/agent-identity-migration.test.ts`                         | 三档 | 是     | 0.14   | 4          | `packages/ui/test/nonCliAcpRetirement.test.ts`                                   | M3 共享与服务 |
| `packages/services/test/creation-service.test.ts`                                 | 三档 | 是     | 0.06   | 2          | `packages/desktop/src/main/browserView/browserGuestManager.ts`                   | M3 共享与服务 |
| `packages/services/test/fixtures/ignore-fake-port-20261002.js`                    | 二档 | 否     | 0.22   | 1          | `apps/zcode-cli/packages/adapters/src/model/errors.ts`                           | M3 共享与服务 |
| `packages/services/test/knorviaAccountRemoval.test.ts`                            | 三档 | 是     | 0.09   | 2          | `packages/services/test/providerConfigMigration.test.ts`                         | M3 共享与服务 |
| `packages/services/test/knorviaStorageIsolation.test.ts`                          | 三档 | 是     | 0.17   | 2          | `packages/services/test/providerConfigMigration.test.ts`                         | M3 共享与服务 |
| `packages/services/test/setting-data-location.test.ts`                            | 三档 | 是     | 0.12   | 1          | `apps/zcode-cli/packages/cli/scripts/build-sea.mjs`                              | M3 共享与服务 |
| `packages/services/test/studio-acp-discovery.test.ts`                             | 三档 | 是     | 0.08   | 2          | `packages/services/src/conversation-share/conversationShareService.ts`           | M3 共享与服务 |
| `packages/services/test/studio-acp-slash-commands.test.ts`                        | 三档 | 是     | 0.10   | 1          | `apps/zcode-cli/packages/adapters/src/mcp/stdio-transport.ts`                    | M3 共享与服务 |
| `packages/services/test/studio-antigravity-protocol.test.ts`                      | 三档 | 是     | 0.05   | 1          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                               | M3 共享与服务 |
| `packages/services/test/studio-builtin.test.ts`                                   | 三档 | 是     | 0.04   | 4          | `packages/services/src/conversation-share/conversationShareService.ts`           | M3 共享与服务 |
| `packages/services/test/studio-chat-selection.test.ts`                            | 三档 | 是     | 0.08   | 1          | `packages/services/test/providerConfigMigration.test.ts`                         | M3 共享与服务 |
| `packages/services/test/studio-claude-slash-commands.test.ts`                     | 三档 | 是     | 0.00   | 0          | —                                                                                | M3 共享与服务 |
| `packages/services/test/studio-external-update.test.ts`                           | 三档 | 是     | 0.08   | 1          | `packages/services/test/providerConfigMigration.test.ts`                         | M3 共享与服务 |
| `packages/services/test/studio-image-legacy-schema.integration.test.ts`           | 二档 | 否     | 0.21   | 1          | `packages/services/test/nonCliAcpRetirement.test.ts`                             | M3 共享与服务 |
| `packages/services/test/studio-interaction-history.test.ts`                       | 三档 | 是     | 0.09   | 1          | `packages/zcode-server-cli/scripts/verify-remote-ssh.mjs`                        | M3 共享与服务 |
| `packages/services/test/studio-kernel-expansion.test.ts`                          | 三档 | 是     | 0.04   | 1          | `packages/ui/src/prompt-editor/ChatPromptActionMenu.tsx`                         | M3 共享与服务 |
| `packages/services/test/studio-kernel-usage.test.ts`                              | 三档 | 是     | 0.04   | 1          | `packages/ui/test/nonCliAcpRetirement.test.ts`                                   | M3 共享与服务 |
| `packages/services/test/studio-kernels-management.test.ts`                        | 三档 | 是     | 0.12   | 2          | `scripts/zcode-distribution-smoke.mjs`                                           | M3 共享与服务 |
| `packages/services/test/studio-kernels-model-defaults.test.ts`                    | 三档 | 是     | 0.09   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`      | M3 共享与服务 |
| `packages/services/test/studio-kernels-model-options.test.ts`                     | 三档 | 是     | 0.12   | 2          | `apps/zcode-cli/packages/core/src/runtime/methods/turn.ts`                       | M3 共享与服务 |
| `packages/services/test/studio-kernels-model.fixture.ts`                          | 三档 | 是     | 0.05   | 2          | `apps/zcode-cli/packages/adapters/src/fs/index.ts`                               | M3 共享与服务 |
| `packages/services/test/studio-kernels-probe-lifecycle.test.ts`                   | 三档 | 是     | 0.09   | 1          | `packages/services/src/conversation-share/conversationShareService.ts`           | M3 共享与服务 |
| `packages/services/test/studio-kernels-protocol.test.ts`                          | 三档 | 是     | 0.07   | 2          | `apps/zcode-cli/packages/adapters/src/browser/index.ts`                          | M3 共享与服务 |
| `packages/services/test/studio-kernels-publish.test.ts`                           | 三档 | 是     | 0.06   | 1          | `apps/zcode-cli/packages/adapters/src/exec/node-execution-adapter-lifecycle.ts`  | M3 共享与服务 |
| `packages/services/test/studio-kernels-transport.test.ts`                         | 三档 | 是     | 0.14   | 1          | `scripts/zcode-distribution-smoke.mjs`                                           | M3 共享与服务 |
| `packages/services/test/studio-kernels-versions.test.ts`                          | 三档 | 是     | 0.11   | 2          | `packages/server/src/remote/remoteAssetCache.ts`                                 | M3 共享与服务 |
| `packages/services/test/studio-message-cursors.test.ts`                           | 三档 | 是     | 0.14   | 3          | `packages/services/src/session/tasksDatabase/startup.ts`                         | M3 共享与服务 |
| `packages/services/test/studio-orchestration-continuous.test.ts`                  | 三档 | 是     | 0.05   | 1          | `packages/desktop/src/main/browserView/browserGuestManager.ts`                   | M3 共享与服务 |
| `packages/services/test/studio-orchestration-recovery.test.ts`                    | 三档 | 是     | 0.02   | 1          | `apps/zcode-cli/packages/adapters/src/exec/node-execution-adapter-run.ts`        | M3 共享与服务 |
| `packages/services/test/studio-orchestration-steering.test.ts`                    | 三档 | 是     | 0.05   | 1          | `packages/services/test/providerConfigMigration.test.ts`                         | M3 共享与服务 |
| `packages/services/test/studio-orchestration-support.ts`                          | 三档 | 是     | 0.08   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`      | M3 共享与服务 |
| `packages/services/test/studio-orchestration-workflow.test.ts`                    | 三档 | 是     | 0.01   | 1          | `apps/zcode-cli/packages/adapters/src/exec/node-execution-adapter-run.ts`        | M3 共享与服务 |
| `packages/services/test/studio-orchestration.test.ts`                             | 三档 | 是     | 0.03   | 1          | `packages/ui/test/nonCliAcpRetirement.test.ts`                                   | M3 共享与服务 |
| `packages/services/test/studio-remote-admission.test.ts`                          | 三档 | 是     | 0.05   | 1          | `apps/zcode-cli/packages/adapters/src/storage/session-store/migration-runner.ts` | M3 共享与服务 |
| `packages/services/test/studio-remote-agent-identity.test.ts`                     | 三档 | 是     | 0.00   | 0          | —                                                                                | M3 共享与服务 |
| `packages/services/test/studio-remote-kernel-bridge.test.ts`                      | 三档 | 是     | 0.04   | 1          | `packages/services/src/conversation-share/conversationShareService.ts`           | M3 共享与服务 |
| `packages/services/test/studio-runtime-barriers.test.ts`                          | 三档 | 是     | 0.04   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`      | M3 共享与服务 |
| `packages/services/test/studio-runtime-continuity.test.ts`                        | 三档 | 是     | 0.09   | 1          | `packages/services/src/session/tasksDatabase/startup.ts`                         | M3 共享与服务 |
| `packages/services/test/studio-runtime-lifecycle.test.ts`                         | 三档 | 是     | 0.02   | 1          | `apps/zcode-cli/packages/adapters/src/browser/index.ts`                          | M3 共享与服务 |
| `packages/services/test/studio-runtime-polish.test.ts`                            | 三档 | 是     | 0.07   | 2          | `packages/services/test/nonCliAcpRetirement.test.ts`                             | M3 共享与服务 |
| `packages/services/test/studio-runtime-sequencing.test.ts`                        | 三档 | 是     | 0.06   | 3          | `packages/services/test/nonCliAcpRetirement.test.ts`                             | M3 共享与服务 |
| `packages/services/test/studio-runtime.test.ts`                                   | 三档 | 是     | 0.04   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`      | M3 共享与服务 |
| `packages/services/test/studio-shared-capabilities.test.ts`                       | 三档 | 是     | 0.09   | 2          | `packages/services/src/settings-sync/settingsSyncService.ts`                     | M3 共享与服务 |
| `packages/services/test/studio-workflow-outcomes.test.ts`                         | 三档 | 是     | 0.03   | 1          | `packages/ui/src/v4/telemetry/conversationTelemetrySupervisor.ts`                | M3 共享与服务 |
| `packages/services/test/studio-workspace-history.test.ts`                         | 三档 | 是     | 0.11   | 1          | `packages/zcode-server-cli/scripts/verify-remote-ssh.mjs`                        | M3 共享与服务 |
| `packages/services/test/studio-workspace-recovery.test.ts`                        | 三档 | 是     | 0.03   | 2          | `packages/ui/src/root/useRemoteWorkspaceHistory.ts`                              | M3 共享与服务 |
| `packages/services/test/studio-workspace.test.ts`                                 | 三档 | 是     | 0.04   | 1          | `packages/services/test/nonCliAcpRetirement.test.ts`                             | M3 共享与服务 |
| `packages/services/test/tasks-storage-startup.test.ts`                            | 三档 | 是     | 0.07   | 1          | `packages/services/test/nonCliAcpRetirement.test.ts`                             | M3 共享与服务 |
| `packages/services/test/terminal-profile-macos-contract-fast-20261001.test.ts`    | 一档 | 否     | 0.09   | 16         | `packages/services/src/terminal/terminalProfileMacOs.ts`                         | M3 共享与服务 |
| `packages/services/test/terminal-profile-portable-contract-fast-20261001.test.ts` | 一档 | 否     | 0.08   | 12         | `packages/services/src/terminal/terminalProfile.ts`                              | M3 共享与服务 |
| `packages/services/test/terminal-service-planning-consumer-fast-20261001.test.ts` | 一档 | 否     | 0.02   | 8          | `packages/services/src/terminal/terminalService.ts`                              | M3 共享与服务 |

### packages/shared/src（51）

| 文件                                                                  | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                                  | 里程碑        |
| --------------------------------------------------------------------- | ---- | ------ | ------ | ---------- | ------------------------------------------------------------------------------- | ------------- |
| `packages/shared/src/agent-model-state.ts`                            | 一档 | 是     | 0.46   | 12         | `packages/shared/src/zcode-agent-model-state.ts`                                | M3 共享与服务 |
| `packages/shared/src/agent-policy.ts`                                 | 三档 | 是     | 0.05   | 1          | `packages/shared/src/zcode-agent-policy.ts`                                     | M3 共享与服务 |
| `packages/shared/src/agent-runtime.ts`                                | 一档 | 是     | 0.64   | 9          | `packages/shared/src/zcode-agent-runtime.ts`                                    | M3 共享与服务 |
| `packages/shared/src/api-retry-status.ts`                             | 二档 | 是     | 0.28   | 3          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts` | M3 共享与服务 |
| `packages/shared/src/artifact-uri.ts`                                 | 二档 | 是     | 0.20   | 1          | `packages/shared/src/runtimeEnv.ts`                                             | M3 共享与服务 |
| `packages/shared/src/endpoint.ts`                                     | 一档 | 是     | 0.59   | 10         | `packages/shared/src/zcodeEndpoint.ts`                                          | M3 共享与服务 |
| `packages/shared/src/localDiagnostics.ts`                             | 二档 | 否     | 0.28   | 3          | `packages/shared/src/zcode-protocol/index.ts`                                   | M3 共享与服务 |
| `packages/shared/src/media-policy.ts`                                 | 二档 | 是     | 0.88   | 7          | `packages/shared/src/zcode-media-policy.ts`                                     | M3 共享与服务 |
| `packages/shared/src/network-debug-status.ts`                         | 一档 | 是     | 0.35   | 13         | `packages/shared/src/zcode-network-debug-status.ts`                             | M3 共享与服务 |
| `packages/shared/src/node/knorviaPaths.ts`                            | 二档 | 是     | 0.11   | 1          | `apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts`               | M3 共享与服务 |
| `packages/shared/src/persistedMessageMerge.ts`                        | 二档 | 是     | 0.42   | 7          | `packages/shared/src/zcodePersistedMessageMerge.ts`                             | M3 共享与服务 |
| `packages/shared/src/protocol-legacy-types.ts`                        | 一档 | 是     | 0.82   | 33         | `packages/shared/src/zcode-protocol-legacy-types.ts`                            | M3 共享与服务 |
| `packages/shared/src/protocol-v4/apply.ts`                            | 一档 | 是     | 0.71   | 20         | `packages/shared/src/zcode-protocol-v4/apply.ts`                                | M3 共享与服务 |
| `packages/shared/src/protocol-v4/attachment-faults.ts`                | 一档 | 是     | 0.74   | 23         | `packages/shared/src/zcode-protocol-v4/attachment-faults.ts`                    | M3 共享与服务 |
| `packages/shared/src/protocol-v4/coalesce.ts`                         | 二档 | 是     | 0.35   | 3          | `packages/shared/src/zcode-protocol-v4/coalesce.ts`                             | M3 共享与服务 |
| `packages/shared/src/protocol-v4/command.ts`                          | 一档 | 是     | 0.98   | 185        | `packages/shared/src/zcode-protocol-v4/command.ts`                              | M3 共享与服务 |
| `packages/shared/src/protocol-v4/controller.ts`                       | 一档 | 是     | 1.00   | 172        | `packages/shared/src/zcode-protocol-v4/controller.ts`                           | M3 共享与服务 |
| `packages/shared/src/protocol-v4/core.ts`                             | 一档 | 是     | 0.99   | 83         | `packages/shared/src/zcode-protocol-v4/core.ts`                                 | M3 共享与服务 |
| `packages/shared/src/protocol-v4/index.ts`                            | 二档 | 是     | 0.82   | 6          | `packages/shared/src/zcode-protocol-v4/index.ts`                                | M3 共享与服务 |
| `packages/shared/src/protocol-v4/rows.ts`                             | 一档 | 是     | 1.00   | 187        | `packages/shared/src/zcode-protocol-v4/rows.ts`                                 | M3 共享与服务 |
| `packages/shared/src/protocol-v4/sessions-index-workflow-activity.ts` | 二档 | 是     | 0.42   | 6          | `packages/shared/src/zcode-protocol-v4/sessions-index-workflow-activity.ts`     | M3 共享与服务 |
| `packages/shared/src/protocol-v4/snapshot.ts`                         | 一档 | 是     | 0.98   | 179        | `packages/shared/src/zcode-protocol-v4/snapshot.ts`                             | M3 共享与服务 |
| `packages/shared/src/protocol-v4/telemetry.ts`                        | 一档 | 是     | 0.99   | 148        | `packages/shared/src/zcode-protocol-v4/telemetry.ts`                            | M3 共享与服务 |
| `packages/shared/src/protocol-v4/toolDisplay.ts`                      | 一档 | 是     | 1.00   | 200        | `packages/shared/src/zcode-protocol-v4/toolDisplay.ts`                          | M3 共享与服务 |
| `packages/shared/src/protocol-v4/transport.ts`                        | 一档 | 是     | 1.00   | 200        | `packages/shared/src/zcode-protocol-v4/transport.ts`                            | M3 共享与服务 |
| `packages/shared/src/protocol-v4/wire-assembler.ts`                   | 一档 | 是     | 0.58   | 16         | `packages/shared/src/zcode-protocol-v4/wire-assembler.ts`                       | M3 共享与服务 |
| `packages/shared/src/protocol-v4/wire-binary.ts`                      | 二档 | 是     | 0.30   | 4          | `packages/shared/src/zcode-protocol-v4/wire-binary.ts`                          | M3 共享与服务 |
| `packages/shared/src/protocol-v4/wire-reassembly.ts`                  | 三档 | 是     | 0.19   | 7          | `packages/shared/src/zcode-protocol-v4/wire-reassembly.ts`                      | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-artifacts.ts`               | 一档 | 是     | 1.00   | 193        | `packages/shared/src/zcode-protocol-v4/workflow-artifacts.ts`                   | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-observation-display.ts`     | 一档 | 是     | 1.00   | 200        | `packages/shared/src/zcode-protocol-v4/workflow-observation-display.ts`         | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-row-meta.ts`                | 一档 | 是     | 0.99   | 130        | `packages/shared/src/zcode-protocol-v4/workflow-row-meta.ts`                    | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-run-nodes.ts`               | 二档 | 否     | 0.38   | 7          | `packages/shared/src/zcode-protocol-v4/workflow-runs-reducer.ts`                | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-run-observations.ts`        | 二档 | 否     | 0.44   | 6          | `packages/shared/src/zcode-protocol-v4/workflow-runs-reducer.ts`                | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-run-projection.ts`          | 二档 | 否     | 0.42   | 3          | `packages/shared/src/zcode-protocol-v4/workflow-runs-reducer.ts`                | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-runs-artifacts.ts`          | 二档 | 是     | 0.28   | 5          | `packages/shared/src/zcode-protocol-v4/workflow-runs-artifacts.ts`              | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-runs-concurrency.ts`        | 一档 | 是     | 0.66   | 27         | `packages/shared/src/zcode-protocol-v4/workflow-runs-concurrency.ts`            | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-runs-node-progress.ts`      | 一档 | 是     | 0.77   | 45         | `packages/shared/src/zcode-protocol-v4/workflow-runs-node-progress.ts`          | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-runs-phases.ts`             | 一档 | 是     | 0.65   | 44         | `packages/shared/src/zcode-protocol-v4/workflow-runs-phases.ts`                 | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workflow-runs-reducer.ts`            | 二档 | 是     | 0.73   | 7          | `packages/shared/src/zcode-protocol-v4/workflow-runs-reducer.ts`                | M3 共享与服务 |
| `packages/shared/src/protocol-v4/workspace-config.ts`                 | 一档 | 是     | 0.92   | 30         | `packages/shared/src/zcode-protocol-v4/workspace-config.ts`                     | M3 共享与服务 |
| `packages/shared/src/protocol/index.ts`                               | 一档 | 是     | 0.72   | 57         | `packages/shared/src/zcode-protocol/index.ts`                                   | M3 共享与服务 |
| `packages/shared/src/releaseUpdate.ts`                                | 二档 | 否     | 0.22   | 3          | `packages/desktop/src/main/autoUpdater.ts`                                      | M3 共享与服务 |
| `packages/shared/src/session-task-status.ts`                          | 一档 | 是     | 0.73   | 10         | `packages/shared/src/zcode-session-task-status.ts`                              | M3 共享与服务 |
| `packages/shared/src/session-visible-content.ts`                      | 二档 | 是     | 0.40   | 5          | `packages/shared/src/zcode-session-visible-content.ts`                          | M3 共享与服务 |
| `packages/shared/src/slash-command-help.ts`                           | 一档 | 是     | 0.98   | 100        | `packages/shared/src/zcode-slash-command-help.ts`                               | M3 共享与服务 |
| `packages/shared/src/source-headers.ts`                               | 一档 | 是     | 0.62   | 10         | `packages/shared/src/zcode-source-headers.ts`                                   | M3 共享与服务 |
| `packages/shared/src/task-mode-schema.ts`                             | 二档 | 是     | 0.75   | 3          | `packages/shared/src/zcode-task-mode-schema.ts`                                 | M3 共享与服务 |
| `packages/shared/src/task-types-core.ts`                              | 一档 | 是     | 0.75   | 25         | `packages/shared/src/zcode-task-types-core.ts`                                  | M3 共享与服务 |
| `packages/shared/src/task-types.ts`                                   | 一档 | 是     | 0.58   | 11         | `packages/shared/src/zcode-task-types.ts`                                       | M3 共享与服务 |
| `packages/shared/src/theme-preference.ts`                             | 二档 | 是     | 0.11   | 1          | `.agents/skills/ai-elements/scripts/prompt-input-cursor.tsx`                    | M3 共享与服务 |
| `packages/shared/src/tool-projection-memory.ts`                       | 二档 | 是     | 0.42   | 4          | `packages/shared/src/zcode-tool-projection-memory.ts`                           | M3 共享与服务 |

### packages/ui/test（34）

| 文件                                                         | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                                            | 里程碑 |
| ------------------------------------------------------------ | ---- | ------ | ------ | ---------- | ----------------------------------------------------------------------------------------- | ------ |
| `packages/ui/test/appearance-preferences.test.ts`            | 三档 | 是     | 0.02   | 1          | `packages/desktop/src/main/cuaAccessibilitySettings.ts`                                   | M5 UI  |
| `packages/ui/test/chat-metrics.test.ts`                      | 三档 | 是     | 0.04   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`           | M5 UI  |
| `packages/ui/test/fixtures/workbench-native-draft-probe.tsx` | 二档 | 否     | 0.24   | 1          | `apps/zcode-cli/packages/debug/src/App.tsx`                                               | M5 UI  |
| `packages/ui/test/knorvia-clean-base.test.ts`                | 三档 | 是     | 0.01   | 1          | `apps/zcode-cli/packages/adapters/src/exec/bash-file-output.ts`                           | M5 UI  |
| `packages/ui/test/knorvia-file-citation-protocol.test.ts`    | 三档 | 是     | 0.07   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts`         | M5 UI  |
| `packages/ui/test/knorvia-mascot.test.ts`                    | 三档 | 是     | 0.02   | 1          | `packages/ui/test/nonCliAcpRetirement.test.ts`                                            | M5 UI  |
| `packages/ui/test/onboarding-polish.test.ts`                 | 三档 | 是     | 0.03   | 1          | `apps/zcode-cli/packages/core/src/tool/handlers/edit.ts`                                  | M5 UI  |
| `packages/ui/test/plugin-settings-visibility.test.ts`        | 三档 | 是     | 0.14   | 1          | `packages/services/test/nonCliAcpRetirement.test.ts`                                      | M5 UI  |
| `packages/ui/test/settings-async-field.test.ts`              | 三档 | 是     | 0.03   | 2          | `packages/desktop/src/main/desktopRemoteSessions.ts`                                      | M5 UI  |
| `packages/ui/test/settings-plugin-navigation.test.ts`        | 三档 | 是     | 0.07   | 2          | `packages/ui/src/SettingsPage.tsx`                                                        | M5 UI  |
| `packages/ui/test/studio-agent-store.test.ts`                | 三档 | 是     | 0.05   | 1          | `packages/services/test/providerConfigMigration.test.ts`                                  | M5 UI  |
| `packages/ui/test/studio-backend-ui.test.ts`                 | 三档 | 是     | 0.04   | 1          | `packages/ui/src/hooks/useGroupedTaskView.ts`                                             | M5 UI  |
| `packages/ui/test/studio-chat-options.test.ts`               | 三档 | 是     | 0.02   | 1          | `packages/services/test/nonCliAcpRetirement.test.ts`                                      | M5 UI  |
| `packages/ui/test/studio-chat-pass2.test.ts`                 | 三档 | 是     | 0.04   | 1          | `packages/desktop/src/main/chromeLocalStorageManager.ts`                                  | M5 UI  |
| `packages/ui/test/studio-chat-polish.test.ts`                | 三档 | 是     | 0.06   | 1          | `packages/ui/test/nonCliAcpRetirement.test.ts`                                            | M5 UI  |
| `packages/ui/test/studio-client.test.ts`                     | 三档 | 是     | 0.02   | 1          | `apps/zcode-cli/packages/bootstrap/src/app/process-provider-registry-runtime.ts`          | M5 UI  |
| `packages/ui/test/studio-group-second-pass.test.ts`          | 三档 | 是     | 0.03   | 1          | `packages/ui/test/nonCliAcpRetirement.test.ts`                                            | M5 UI  |
| `packages/ui/test/studio-group-store.test.ts`                | 三档 | 是     | 0.03   | 1          | `packages/ui/src/settings/model-provider-section/ProviderModelMetadata.ts`                | M5 UI  |
| `packages/ui/test/studio-kernel-catalog.test.ts`             | 三档 | 是     | 0.03   | 2          | `apps/zcode-cli/packages/adapters/src/exec/bash-file-output.ts`                           | M5 UI  |
| `packages/ui/test/studio-native-handoff-transport.test.ts`   | 一档 | 否     | 0.35   | 11         | `packages/services/src/zcode-agent/zcodeAgentService.ts`                                  | M5 UI  |
| `packages/ui/test/studio-native-slash.test.ts`               | 二档 | 是     | 0.17   | 1          | `packages/services/test/nonCliAcpRetirement.test.ts`                                      | M5 UI  |
| `packages/ui/test/studio-navigation.test.ts`                 | 三档 | 是     | 0.01   | 1          | `apps/zcode-cli/packages/adapters/src/exec/bash-file-output.ts`                           | M5 UI  |
| `packages/ui/test/studio-orchestration-polish.test.ts`       | 三档 | 是     | 0.03   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-telemetry-facts.ts` | M5 UI  |
| `packages/ui/test/studio-run-history-actions.test.ts`        | 三档 | 是     | 0.05   | 1          | `packages/services/src/git/repo/gitCliRepo.ts`                                            | M5 UI  |
| `packages/ui/test/studio-run-step-label.test.ts`             | 三档 | 是     | 0.12   | 1          | `packages/ui/test/nonCliAcpRetirement.test.ts`                                            | M5 UI  |
| `packages/ui/test/studio-scroll-anchor.test.ts`              | 三档 | 是     | 0.06   | 1          | `packages/services/test/providerConfigMigration.test.ts`                                  | M5 UI  |
| `packages/ui/test/studio-timeline-pagination.test.ts`        | 三档 | 是     | 0.03   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts`           | M5 UI  |
| `packages/ui/test/studio-workflow-action-scope.test.ts`      | 三档 | 是     | 0.02   | 1          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/interaction-registry.ts`         | M5 UI  |
| `packages/ui/test/studio-workflow-submission.test.ts`        | 三档 | 是     | 0.06   | 1          | `apps/zcode-cli/packages/bootstrap/src/app/workspace-hook-review-mutation.ts`             | M5 UI  |
| `packages/ui/test/studio-workflow.test.ts`                   | 三档 | 是     | 0.03   | 2          | `packages/services/test/providerConfigMigration.test.ts`                                  | M5 UI  |
| `packages/ui/test/theme-identity.test.ts`                    | 三档 | 是     | 0.04   | 1          | `apps/zcode-cli/packages/adapters/src/skills/index.ts`                                    | M5 UI  |
| `packages/ui/test/ui-b3-projection-fixtures-20260930.ts`     | 二档 | 否     | 0.21   | 5          | `packages/services/test/importedClaudeRecovery.test.ts`                                   | M5 UI  |
| `packages/ui/test/ui-b4-store-selectors-20260930.test.ts`    | 一档 | 否     | 0.10   | 20         | `packages/ui/src/store/zcodeSessionStoreTypes.ts`                                         | M5 UI  |
| `packages/ui/test/ui-b5-dist-guard-20261001.mjs`             | 二档 | 否     | 0.14   | 1          | `apps/zcode-cli/packages/adapters/src/auth/shared-credentials.ts`                         | M5 UI  |

### packages/server-cli/src（28）

| 文件                                                         | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                     | 里程碑        |
| ------------------------------------------------------------ | ---- | ------ | ------ | ---------- | ------------------------------------------------------------------ | ------------- |
| `packages/server-cli/src/cli.ts`                             | 一档 | 是     | 0.95   | 81         | `packages/zcode-server-cli/src/cli.ts`                             | M3 共享与服务 |
| `packages/server-cli/src/ipc/controlClient.ts`               | 二档 | 是     | 0.27   | 6          | `packages/zcode-server-cli/src/ipc/controlClient.ts`               | M3 共享与服务 |
| `packages/server-cli/src/ipc/controlServer.ts`               | 一档 | 是     | 0.39   | 8          | `packages/zcode-server-cli/src/ipc/controlServer.ts`               | M3 共享与服务 |
| `packages/server-cli/src/ipc/framing.ts`                     | 二档 | 是     | 0.26   | 3          | `packages/zcode-server-cli/src/ipc/framing.ts`                     | M3 共享与服务 |
| `packages/server-cli/src/main.ts`                            | 一档 | 是     | 0.94   | 14         | `packages/zcode-server-cli/src/main.ts`                            | M3 共享与服务 |
| `packages/server-cli/src/packaging/nodeDistMirror.ts`        | 一档 | 是     | 0.90   | 15         | `packages/zcode-server-cli/src/packaging/nodeDistMirror.ts`        | M3 共享与服务 |
| `packages/server-cli/src/packaging/stage.ts`                 | 一档 | 是     | 0.98   | 159        | `packages/zcode-server-cli/src/packaging/stage.ts`                 | M3 共享与服务 |
| `packages/server-cli/src/packaging/stageCli.ts`              | 一档 | 是     | 0.96   | 55         | `packages/zcode-server-cli/src/packaging/stageCli.ts`              | M3 共享与服务 |
| `packages/server-cli/src/platform/serviceManager.ts`         | 一档 | 是     | 0.98   | 132        | `packages/zcode-server-cli/src/platform/serviceManager.ts`         | M3 共享与服务 |
| `packages/server-cli/src/runtime/agentWiring.ts`             | 二档 | 是     | 0.63   | 5          | `packages/zcode-server-cli/src/runtime/agentWiring.ts`             | M3 共享与服务 |
| `packages/server-cli/src/runtime/installationOwnership.ts`   | 一档 | 是     | 0.92   | 35         | `packages/zcode-server-cli/src/runtime/installationOwnership.ts`   | M3 共享与服务 |
| `packages/server-cli/src/runtime/lock.ts`                    | 二档 | 是     | 0.34   | 6          | `packages/zcode-server-cli/src/runtime/lock.ts`                    | M3 共享与服务 |
| `packages/server-cli/src/runtime/manifest.ts`                | 一档 | 是     | 0.91   | 22         | `packages/zcode-server-cli/src/runtime/manifest.ts`                | M3 共享与服务 |
| `packages/server-cli/src/runtime/paths.ts`                   | 一档 | 是     | 0.96   | 38         | `packages/zcode-server-cli/src/runtime/paths.ts`                   | M3 共享与服务 |
| `packages/server-cli/src/runtime/releaseInstaller.ts`        | 一档 | 是     | 0.97   | 67         | `packages/zcode-server-cli/src/runtime/releaseInstaller.ts`        | M3 共享与服务 |
| `packages/server-cli/src/runtime/serviceInstallation.ts`     | 一档 | 是     | 0.99   | 124        | `packages/zcode-server-cli/src/runtime/serviceInstallation.ts`     | M3 共享与服务 |
| `packages/server-cli/src/runtime/shutdownWait.ts`            | 二档 | 是     | 0.28   | 5          | `packages/zcode-server-cli/src/runtime/shutdownWait.ts`            | M3 共享与服务 |
| `packages/server-cli/src/runtime/stableLauncher.ts`          | 一档 | 是     | 0.85   | 11         | `packages/zcode-server-cli/src/runtime/stableLauncher.ts`          | M3 共享与服务 |
| `packages/server-cli/src/runtime/startupRecovery.ts`         | 一档 | 是     | 0.94   | 8          | `packages/zcode-server-cli/src/runtime/startupRecovery.ts`         | M3 共享与服务 |
| `packages/server-cli/src/runtime/statusSnapshot.ts`          | 二档 | 是     | 0.34   | 7          | `packages/zcode-server-cli/src/runtime/statusSnapshot.ts`          | M3 共享与服务 |
| `packages/server-cli/src/runtime/updateCommand.ts`           | 一档 | 是     | 0.98   | 38         | `packages/zcode-server-cli/src/runtime/updateCommand.ts`           | M3 共享与服务 |
| `packages/server-cli/src/runtime/updatePreparation.ts`       | 一档 | 是     | 0.98   | 82         | `packages/zcode-server-cli/src/runtime/updatePreparation.ts`       | M3 共享与服务 |
| `packages/server-cli/src/server-core/core.ts`                | 一档 | 是     | 0.83   | 50         | `packages/zcode-server-cli/src/server-core/core.ts`                | M3 共享与服务 |
| `packages/server-cli/src/server-core/hostCapability.ts`      | 一档 | 是     | 0.97   | 38         | `packages/zcode-server-cli/src/server-core/hostCapability.ts`      | M3 共享与服务 |
| `packages/server-cli/src/server-core/http.ts`                | 一档 | 是     | 0.91   | 49         | `packages/zcode-server-cli/src/server-core/http.ts`                | M3 共享与服务 |
| `packages/server-cli/src/server-core/serverIdentity.ts`      | 二档 | 是     | 0.90   | 5          | `packages/zcode-server-cli/src/server-core/serverIdentity.ts`      | M3 共享与服务 |
| `packages/server-cli/src/server-core/taskActivityTracker.ts` | 一档 | 是     | 0.91   | 31         | `packages/zcode-server-cli/src/server-core/taskActivityTracker.ts` | M3 共享与服务 |
| `packages/server-cli/src/supervisor/supervisor.ts`           | 一档 | 是     | 1.00   | 200        | `packages/zcode-server-cli/src/supervisor/supervisor.ts`           | M3 共享与服务 |

### packages/desktop/src（23）

| 文件                                                             | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                               | 里程碑  |
| ---------------------------------------------------------------- | ---- | ------ | ------ | ---------- | ------------------------------------------------------------ | ------- |
| `packages/desktop/src/host/storageOwnerTestPorts.mjs`            | 一档 | 否     | 0.19   | 8          | `packages/shared/src/database-startup.ts`                    | M4 桌面 |
| `packages/desktop/src/main/dataSizeScanner.ts`                   | 二档 | 是     | 0.36   | 7          | `packages/desktop/src/main/zcodeDataSizeScanner.ts`          | M4 桌面 |
| `packages/desktop/src/main/dataSizeTelemetryState.ts`            | 一档 | 是     | 0.79   | 9          | `packages/desktop/src/main/zcodeDataSizeTelemetryState.ts`   | M4 桌面 |
| `packages/desktop/src/main/dataSizeWorker.ts`                    | 二档 | 是     | 0.85   | 7          | `packages/desktop/src/main/zcodeDataSizeWorker.ts`           | M4 桌面 |
| `packages/desktop/src/main/dataSizeWorkerClient.ts`              | 二档 | 是     | 0.50   | 5          | `packages/desktop/src/main/zcodeDataSizeWorkerClient.ts`     | M4 桌面 |
| `packages/desktop/src/main/desktopDataSizeTelemetry.ts`          | 一档 | 是     | 0.77   | 33         | `packages/desktop/src/main/desktopZCodeDataSizeTelemetry.ts` | M4 桌面 |
| `packages/desktop/src/main/desktopHostProcess/lifecycle.ts`      | 二档 | 否     | 0.29   | 6          | `packages/desktop/src/main/desktopHostProcess.ts`            | M4 桌面 |
| `packages/desktop/src/main/desktopHostProcess/messages.ts`       | 一档 | 否     | 0.87   | 53         | `packages/desktop/src/main/desktopHostProcess.ts`            | M4 桌面 |
| `packages/desktop/src/main/desktopProfile.ts`                    | 三档 | 是     | 0.10   | 1          | `apps/zcode-cli/packages/adapters/src/plugins/index.ts`      | M4 桌面 |
| `packages/desktop/src/main/desktopQuitLifecycle.ts`              | 二档 | 是     | 0.23   | 2          | `packages/desktop/src/main/desktopWindowLifecycle.ts`        | M4 桌面 |
| `packages/desktop/src/main/desktopRemoteSessions/attachments.ts` | 一档 | 否     | 0.81   | 22         | `packages/desktop/src/main/desktopRemoteSessions.ts`         | M4 桌面 |
| `packages/desktop/src/main/desktopRemoteSessions/common.ts`      | 一档 | 否     | 0.64   | 15         | `packages/desktop/src/main/desktopRemoteSessions.ts`         | M4 桌面 |
| `packages/desktop/src/main/desktopRemoteSessions/connections.ts` | 一档 | 否     | 0.60   | 12         | `packages/desktop/src/main/desktopRemoteSessions.ts`         | M4 桌面 |
| `packages/desktop/src/main/desktopRemoteSessions/controls.ts`    | 二档 | 否     | 0.55   | 7          | `packages/desktop/src/main/desktopRemoteSessions.ts`         | M4 桌面 |
| `packages/desktop/src/main/desktopRemoteSessions/lifecycle.ts`   | 一档 | 否     | 0.69   | 11         | `packages/desktop/src/main/desktopRemoteSessions.ts`         | M4 桌面 |
| `packages/desktop/src/main/desktopRemoteSessions/types.ts`       | 一档 | 否     | 0.56   | 13         | `packages/desktop/src/main/desktopRemoteSessions.ts`         | M4 桌面 |
| `packages/desktop/src/main/desktopUnsavedChanges.ts`             | 三档 | 是     | 0.19   | 2          | `packages/desktop/src/main/desktopCommandHandlers.ts`        | M4 桌面 |
| `packages/desktop/src/main/desktopWindowChrome/guest.ts`         | 一档 | 否     | 0.55   | 18         | `packages/desktop/src/main/desktopWindowChrome.ts`           | M4 桌面 |
| `packages/desktop/src/main/desktopWindowGlass.ts`                | 二档 | 是     | 0.36   | 2          | `packages/desktop/src/main/desktopNotifications.ts`          | M4 桌面 |
| `packages/desktop/src/main/desktopWorkspaceDeepLink.ts`          | 一档 | 是     | 0.60   | 21         | `packages/desktop/src/main/desktopOAuthDeepLink.ts`          | M4 桌面 |
| `packages/desktop/src/main/launcher.ts`                          | 三档 | 是     | 0.00   | 0          | —                                                            | M4 桌面 |
| `packages/desktop/src/renderer/public/knorvia-icon.png`          | 三档 | 是     | —      | —          | —                                                            | M4 桌面 |
| `packages/desktop/src/renderer/src/env.d.ts`                     | 三档 | 是     | 0.00   | 0          | —                                                            | M4 桌面 |

### packages/server/src（11）

| 文件                                                                | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                           | 里程碑        |
| ------------------------------------------------------------------- | ---- | ------ | ------ | ---------- | ------------------------------------------------------------------------ | ------------- |
| `packages/server/src/bundledBuiltinProviderConfig.ts`               | 二档 | 是     | 0.35   | 2          | `packages/server/src/bundledZCodeBuiltinProviderConfig.ts`               | M3 共享与服务 |
| `packages/server/src/httpWindowController.ts`                       | 二档 | 否     | 0.40   | 3          | `packages/desktop/src/host/index.ts`                                     | M3 共享与服务 |
| `packages/server/src/remote/agentBundleWrapper.ts`                  | 二档 | 是     | 0.79   | 7          | `packages/server/src/remote/zcodeAgentBundleWrapper.ts`                  | M3 共享与服务 |
| `packages/server/src/remote/agentDeploy.ts`                         | 一档 | 是     | 0.53   | 10         | `packages/server/src/remote/zcodeAgentDeploy.ts`                         | M3 共享与服务 |
| `packages/server/src/remote/agentDevDeploy.ts`                      | 二档 | 是     | 0.37   | 6          | `packages/server/src/remote/zcodeAgentDevDeploy.ts`                      | M3 共享与服务 |
| `packages/server/src/remote/agentOfficialPluginAssets.ts`           | 一档 | 是     | 0.95   | 30         | `packages/server/src/remote/zcodeAgentOfficialPluginAssets.ts`           | M3 共享与服务 |
| `packages/server/src/remote/agentOfficialPluginPermissionRepair.ts` | 二档 | 是     | 0.76   | 5          | `packages/server/src/remote/zcodeAgentOfficialPluginPermissionRepair.ts` | M3 共享与服务 |
| `packages/server/src/remote/agentWrapperDeploy.ts`                  | 一档 | 是     | 0.93   | 9          | `packages/server/src/remote/zcodeAgentWrapperDeploy.ts`                  | M3 共享与服务 |
| `packages/server/src/remote/remoteAssetCacheComponents.ts`          | 二档 | 否     | 0.20   | 2          | `packages/server/src/remote/remoteAssetCache.ts`                         | M3 共享与服务 |
| `packages/server/src/remote/remoteAssetCacheFiles.ts`               | 一档 | 否     | 0.24   | 10         | `packages/server/src/remote/remoteAssetCache.ts`                         | M3 共享与服务 |
| `packages/server/src/remote/remoteAssetCacheModel.ts`               | 二档 | 否     | 0.21   | 6          | `packages/server/src/remote/remoteAssetCache.ts`                         | M3 共享与服务 |

### packages/cua（9）

| 文件                                      | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                 | 里程碑        |
| ----------------------------------------- | ---- | ------ | ------ | ---------- | -------------------------------------------------------------- | ------------- |
| `packages/cua/broker-helper-constants.js` | 三档 | 是     | 0.00   | 0          | —                                                              | M3 共享与服务 |
| `packages/cua/broker-server.d.ts`         | 一档 | 是     | 0.99   | 151        | `packages/zcode-cua/broker-server.d.ts`                        | M3 共享与服务 |
| `packages/cua/broker-server.js`           | 一档 | 是     | 0.97   | 89         | `packages/zcode-cua/broker-server.js`                          | M3 共享与服务 |
| `packages/cua/broker.js`                  | 一档 | 是     | 0.95   | 27         | `packages/zcode-cua/broker.js`                                 | M3 共享与服务 |
| `packages/cua/frame-contract.js`          | 一档 | 是     | 0.95   | 18         | `packages/zcode-cua/frame-contract.js`                         | M3 共享与服务 |
| `packages/cua/host-display-contract.js`   | 二档 | 是     | 0.50   | 1          | `packages/zcode-cua/host-display-contract.js`                  | M3 共享与服务 |
| `packages/cua/README.md`                  | 二档 | 是     | 0.86   | 6          | `packages/zcode-cua/README.md`                                 | M3 共享与服务 |
| `packages/cua/request-access-contract.js` | 二档 | 是     | 0.83   | 5          | `packages/zcode-cua/request-access-contract.js`                | M3 共享与服务 |
| `packages/cua/windows-artifact.d.ts`      | 二档 | 否     | 0.38   | 1          | `apps/zcode-cli/packages/bootstrap/src/app/bundled-plugins.ts` | M3 共享与服务 |

### packages/formal-proof/src（7）

| 文件                                             | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                       | 里程碑       |
| ------------------------------------------------ | ---- | ------ | ------ | ---------- | ------------------------------------ | ------------ |
| `packages/formal-proof/src/decision-policy.ts`   | 二档 | 否     | 0.33   | 4          | `packages/formal-proof/src/model.ts` | 根目录与配置 |
| `packages/formal-proof/src/explorer-shell.ts`    | 一档 | 否     | 0.98   | 106        | `packages/formal-proof/src/main.ts`  | 根目录与配置 |
| `packages/formal-proof/src/graph-canvas.ts`      | 二档 | 否     | 0.37   | 5          | `packages/formal-proof/src/main.ts`  | 根目录与配置 |
| `packages/formal-proof/src/model-catalog.ts`     | 一档 | 否     | 0.99   | 78         | `packages/formal-proof/src/model.ts` | 根目录与配置 |
| `packages/formal-proof/src/model-types.ts`       | 一档 | 否     | 1.00   | 56         | `packages/formal-proof/src/model.ts` | 根目录与配置 |
| `packages/formal-proof/src/trace-enumeration.ts` | 一档 | 否     | 0.42   | 11         | `packages/formal-proof/src/model.ts` | 根目录与配置 |
| `packages/formal-proof/src/trace-graph.ts`       | 一档 | 否     | 0.34   | 17         | `packages/formal-proof/src/main.ts`  | 根目录与配置 |

### packages/provider-node/src（7）

| 文件                                                                 | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                             | 里程碑        |
| -------------------------------------------------------------------- | ---- | ------ | ------ | ---------- | -------------------------------------------------------------------------- | ------------- |
| `packages/provider-node/src/builtin-cache-paths.ts`                  | 一档 | 是     | 0.64   | 8          | `packages/provider-node/src/zcode-builtin-cache-paths.ts`                  | M3 共享与服务 |
| `packages/provider-node/src/builtin-download.ts`                     | 一档 | 是     | 0.59   | 16         | `packages/provider-node/src/zcode-builtin-download.ts`                     | M3 共享与服务 |
| `packages/provider-node/src/builtin-provider-config-materializer.ts` | 一档 | 是     | 0.81   | 12         | `packages/provider-node/src/zcode-builtin-provider-config-materializer.ts` | M3 共享与服务 |
| `packages/provider-node/src/builtin-provider-config-source.ts`       | 二档 | 是     | 0.47   | 7          | `packages/provider-node/src/zcode-builtin-provider-config-source.ts`       | M3 共享与服务 |
| `packages/provider-node/src/builtin-release.ts`                      | 二档 | 是     | 0.44   | 5          | `packages/provider-node/src/zcode-builtin-release.ts`                      | M3 共享与服务 |
| `packages/provider-node/src/builtin-remote-synchronizer.ts`          | 一档 | 是     | 0.60   | 10         | `packages/provider-node/src/zcode-builtin-remote-synchronizer.ts`          | M3 共享与服务 |
| `packages/provider-node/src/endpoint-scoped-builtin-source.ts`       | 二档 | 是     | 0.40   | 6          | `packages/provider-node/src/endpoint-scoped-zcode-builtin-source.ts`       | M3 共享与服务 |

### packages/desktop/test（6）

| 文件                                                     | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                                   | 里程碑  |
| -------------------------------------------------------- | ---- | ------ | ------ | ---------- | -------------------------------------------------------------------------------- | ------- |
| `packages/desktop/test/desktop-file-ipc.test.ts`         | 三档 | 是     | 0.02   | 1          | `packages/desktop/src/main/cuaAccessibilitySettings.ts`                          | M4 桌面 |
| `packages/desktop/test/desktop-unsaved-exit.test.ts`     | 三档 | 是     | 0.03   | 2          | `packages/desktop/src/main/index.ts`                                             | M4 桌面 |
| `packages/desktop/test/knorvia-isolation.test.ts`        | 三档 | 是     | 0.03   | 2          | `packages/ui/test/nonCliAcpRetirement.test.ts`                                   | M4 桌面 |
| `packages/desktop/test/office-plugin-assets.test.mjs`    | 三档 | 是     | 0.06   | 3          | `apps/zcode-cli/packages/core/src/runtime/methods/dynamic-workflow-run-start.ts` | M4 桌面 |
| `packages/desktop/test/official-plugin-staging.test.mjs` | 三档 | 是     | 0.13   | 3          | `scripts/prepare-prebuilds.mjs`                                                  | M4 桌面 |
| `packages/desktop/test/task-realtime-bus.test.ts`        | 三档 | 是     | 0.10   | 2          | `packages/desktop/src/main/taskRealtimeBus.ts`                                   | M4 桌面 |

### packages/desktop/scripts（3）

| 文件                                                      | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                           | 里程碑  |
| --------------------------------------------------------- | ---- | ------ | ------ | ---------- | -------------------------------------------------------- | ------- |
| `packages/desktop/scripts/desktop-product-identity.d.mts` | 三档 | 是     | 0.04   | 1          | `apps/zcode-cli/packages/adapters/src/logging/index.ts`  | M4 桌面 |
| `packages/desktop/scripts/official-plugin-staging.mjs`    | 一档 | 是     | 0.33   | 20         | `packages/desktop/scripts/prepare-agent-node-bundle.mjs` | M4 桌面 |
| `packages/desktop/scripts/windows-asar-integrity.mjs`     | 三档 | 是     | 0.05   | 1          | `apps/zcode-cli/packages/adapters/src/config/index.ts`   | M4 桌面 |

### packages/shared/test（3）

| 文件                                                  | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                  | 里程碑        |
| ----------------------------------------------------- | ---- | ------ | ------ | ---------- | --------------------------------------------------------------- | ------------- |
| `packages/shared/test/artifact-uri.test.ts`           | 三档 | 是     | 0.04   | 1          | `packages/services/test/providerConfigMigration.test.ts`        | M3 共享与服务 |
| `packages/shared/test/attachment-filename.test.ts`    | 三档 | 是     | 0.06   | 1          | `apps/zcode-cli/packages/adapters/src/exec/bash-file-output.ts` | M3 共享与服务 |
| `packages/shared/test/protocol-wire-contract.test.ts` | 一档 | 否     | 0.13   | 8          | `packages/shared/src/zcode-protocol-v4/wire-assembler.ts`       | M3 共享与服务 |

### packages/web/src（3）

| 文件                               | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径              | 里程碑       |
| ---------------------------------- | ---- | ------ | ------ | ---------- | --------------------------- | ------------ |
| `packages/web/src/webAppViews.tsx` | 一档 | 否     | 0.87   | 22         | `packages/web/src/main.tsx` | 根目录与配置 |
| `packages/web/src/webBootstrap.ts` | 二档 | 否     | 0.27   | 6          | `packages/web/src/main.tsx` | 根目录与配置 |
| `packages/web/src/webPlatform.ts`  | 一档 | 否     | 0.23   | 8          | `packages/web/src/main.tsx` | 根目录与配置 |

### packages/provider/docs（2）

| 文件                                                         | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                    | 里程碑        |
| ------------------------------------------------------------ | ---- | ------ | ------ | ---------- | ------------------------------------------------- | ------------- |
| `packages/provider/docs/ACCOUNT-PROJECTION-SPEC-20261003.md` | 二档 | 否     | 0.20   | 1          | `.agents/skills/architecture-governance/SKILL.md` | M3 共享与服务 |
| `packages/provider/docs/MANUAL-FIELDS-SPEC-20261003.md`      | 二档 | 否     | 0.20   | 1          | `.agents/skills/architecture-governance/SKILL.md` | M3 共享与服务 |

### packages/provider/src（2）

| 文件                                                | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                            | 里程碑        |
| --------------------------------------------------- | ---- | ------ | ------ | ---------- | ----------------------------------------- | ------------- |
| `packages/provider/src/config-service-models.ts`    | 一档 | 否     | 0.48   | 8          | `packages/provider/src/config-service.ts` | M3 共享与服务 |
| `packages/provider/src/config-service-providers.ts` | 二档 | 否     | 0.35   | 4          | `packages/provider/src/config-service.ts` | M3 共享与服务 |

### packages/rpc/test（2）

| 文件                                             | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                             | 里程碑        |
| ------------------------------------------------ | ---- | ------ | ------ | ---------- | ------------------------------------------ | ------------- |
| `packages/rpc/test/emitter-reentrancy.test.ts`   | 三档 | 是     | 0.13   | 1          | `packages/server/src/remote/closeEvent.ts` | M3 共享与服务 |
| `packages/rpc/test/knorvia-rpc-protocol.test.ts` | 三档 | 是     | 0.09   | 1          | `packages/rpc/src/channelClient.ts`        | M3 共享与服务 |

### packages/desktop/build（1）

| 文件                                             | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                         | 里程碑  |
| ------------------------------------------------ | ---- | ------ | ------ | ---------- | -------------------------------------- | ------- |
| `packages/desktop/build/installer-shortcuts.nsh` | 二档 | 否     | 0.31   | 2          | `packages/desktop/build/installer.nsh` | M4 桌面 |

### packages/desktop/resources（1）

| 文件                                          | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                  | 里程碑  |
| --------------------------------------------- | ---- | ------ | ------ | ---------- | ----------------------------------------------- | ------- |
| `packages/desktop/resources/creation-mcp.cjs` | 二档 | 是     | 0.20   | 3          | `apps/zcode-cli/packages/core/src/mcp/index.ts` | M4 桌面 |

### packages/server-cli（1）

| 文件                                 | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                             | 里程碑        |
| ------------------------------------ | ---- | ------ | ------ | ---------- | ------------------------------------------ | ------------- |
| `packages/server-cli/tsup.config.ts` | 一档 | 是     | 0.89   | 16         | `packages/zcode-server-cli/tsup.config.ts` | M3 共享与服务 |

### packages/server-cli/scripts（1）

| 文件                                                | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                            | 里程碑        |
| --------------------------------------------------- | ---- | ------ | ------ | ---------- | --------------------------------------------------------- | ------------- |
| `packages/server-cli/scripts/verify-remote-ssh.mjs` | 一档 | 是     | 0.94   | 66         | `packages/zcode-server-cli/scripts/verify-remote-ssh.mjs` | M3 共享与服务 |

### packages/server/test（1）

| 文件                                                       | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                           | 里程碑        |
| ---------------------------------------------------------- | ---- | ------ | ------ | ---------- | -------------------------------------------------------- | ------------- |
| `packages/server/test/posix-shell-literal-safety.test.mjs` | 二档 | 否     | 0.21   | 1          | `packages/services/test/providerConfigMigration.test.ts` | M3 共享与服务 |

### packages/services/docs（1）

| 文件                                                       | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                    | 里程碑        |
| ---------------------------------------------------------- | ---- | ------ | ------ | ---------- | ------------------------------------------------- | ------------- |
| `packages/services/docs/RETRY-TRAJECTORY-SPEC-20261003.md` | 二档 | 否     | 0.22   | 1          | `.agents/skills/architecture-governance/SKILL.md` | M3 共享与服务 |

### packages/web（1）

| 文件                                     | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                             | 里程碑       |
| ---------------------------------------- | ---- | ------ | ------ | ---------- | ------------------------------------------ | ------------ |
| `packages/web/perf-studio-timeline.html` | 二档 | 否     | 0.83   | 5          | `apps/zcode-cli/packages/debug/index.html` | 根目录与配置 |

### packages/web/public（1）

| 文件                                   | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径 | 里程碑       |
| -------------------------------------- | ---- | ------ | ------ | ---------- | -------------- | ------------ |
| `packages/web/public/knorvia-logo.png` | 三档 | 是     | —      | —          | —              | 根目录与配置 |

### 档位说明

| 档位 | 含义                                                       |
| ---- | ---------------------------------------------------------- |
| 一档 | 与上游存在 8 行以上连续相同段，派生证据强                  |
| 二档 | 包含率超 0.2 但没有 8 行连续相同段                         |
| 三档 | 存在于首快照 `7619e41`，按 M0-1 条件 1 不能登记为 original |

## 4. 登记与证据类：上游摘录例外（书面列出）

共 732 个，全部不随产品发布。这些文件是来源核验、清单与规格材料，常成段引用上游代码或文案，因此在与上游比较时被判为相似；按计划书归入书面例外，不作为替换目标，也不因此改写既有声明。

| 文件                                                                                                                                        | 档位 | 首快照 | 包含率 | 最长相同段 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | ------ | ---------- |
| `docs/evidence/agent-runtime-author-20261003/api.d.ts`                                                                                      | 一档 | 否     | 0.78   | 37         |
| `docs/evidence/agent-runtime-author-20261003/draft-01/candidate.ts`                                                                         | 一档 | 否     | 0.82   | 33         |
| `docs/evidence/background-data-author-20261003/background-task-output-api.d.ts`                                                             | 一档 | 否     | 0.88   | 12         |
| `docs/evidence/background-data-author-20261003/workflow-artifact-api.d.ts`                                                                  | 二档 | 否     | 0.54   | 2          |
| `docs/evidence/background-data-draft-20261003/initial/tool/executor/background-task-output.ts`                                              | 一档 | 否     | 0.40   | 12         |
| `docs/evidence/background-data-draft-20261003/initial/tool/executor/workflow-artifact.ts`                                                   | 二档 | 否     | 0.63   | 6          |
| `docs/evidence/background-tracker-author-20261003/api.d.ts`                                                                                 | 二档 | 否     | 0.50   | 4          |
| `docs/evidence/background-tracker-author-20261003/call-api.d.ts`                                                                            | 二档 | 否     | 1.00   | 4          |
| `docs/evidence/background-tracker-author-20261003/dependency-api.d.ts`                                                                      | 一档 | 否     | 0.21   | 13         |
| `docs/evidence/background-tracker-author-20261003/ports.d.ts`                                                                               | 一档 | 否     | 0.99   | 34         |
| `docs/evidence/background-tracker-author-20261003/snapshot-api.d.ts`                                                                        | 一档 | 否     | 0.48   | 44         |
| `docs/evidence/background-tracker-checks-20261003/current/background-tasks.js`                                                              | 二档 | 否     | 0.47   | 7          |
| `docs/evidence/background-tracker-checks-20261003/current/background-tracker-notification.js`                                               | 一档 | 否     | 0.34   | 8          |
| `docs/evidence/background-tracker-checks-20261003/current/background-tracker-projection.js`                                                 | 二档 | 否     | 0.27   | 6          |
| `docs/evidence/background-tracker-draft-20261003/initial-emitted/background-tasks.js`                                                       | 二档 | 否     | 0.28   | 3          |
| `docs/evidence/background-tracker-draft-20261003/initial-emitted/background-tracker-projection.js`                                          | 二档 | 否     | 0.25   | 6          |
| `docs/evidence/background-tracker-draft-20261003/initial/core/src/tool/executor/background-tasks.ts`                                        | 一档 | 否     | 0.33   | 8          |
| `docs/evidence/background-tracker-draft-20261003/initial/core/src/tool/executor/background-tracker-notification.ts`                         | 二档 | 否     | 0.22   | 5          |
| `docs/evidence/background-tracker-draft-20261003/initial/core/src/tool/executor/background-tracker-projection.ts`                           | 二档 | 否     | 0.29   | 6          |
| `docs/evidence/backlog-cli-20261003/final-type-contract-repair.json`                                                                        | 一档 | 否     | 0.11   | 31         |
| `docs/evidence/backlog-ui-20261003/combined-gui-20261003/902/web-production-build.json`                                                     | 二档 | 否     | 0.11   | 1          |
| `docs/evidence/bash-results-author-20261003/bash-model-content-api.d.ts`                                                                    | 二档 | 否     | 0.50   | 4          |
| `docs/evidence/bash-results-author-20261003/bash-output-api.d.ts`                                                                           | 二档 | 否     | 0.25   | 2          |
| `docs/evidence/bash-results-author-20261003/clarification-01.md`                                                                            | 二档 | 否     | 0.22   | 1          |
| `docs/evidence/bash-results-draft-20261003/corrected/tool/handlers/bash-model-content.ts`                                                   | 二档 | 否     | 0.29   | 7          |
| `docs/evidence/bash-results-draft-20261003/corrected/tool/handlers/bash-output.ts`                                                          | 一档 | 否     | 0.71   | 23         |
| `docs/evidence/bash-results-draft-20261003/initial/tool/handlers/bash-model-content.ts`                                                     | 二档 | 否     | 0.27   | 7          |
| `docs/evidence/bash-results-draft-20261003/initial/tool/handlers/bash-output.ts`                                                            | 一档 | 否     | 0.70   | 23         |
| `docs/evidence/client-transport-root-packet-20261003/dependency-api.d.ts`                                                                   | 二档 | 否     | 0.37   | 7          |
| `docs/evidence/client-transport-root-packet-20261003/messageport-public-api.d.ts`                                                           | 二档 | 否     | 0.60   | 3          |
| `docs/evidence/client-transport-root-packet-20261003/remoteServiceAccess-public-api.d.ts`                                                   | 一档 | 否     | 0.80   | 11         |
| `docs/evidence/client-transport-root-packet-20261003/service-accessor-api.d.ts`                                                             | 一档 | 否     | 0.85   | 11         |
| `docs/evidence/client-transport-root-packet-20261003/websocket-public-api.d.ts`                                                             | 二档 | 否     | 0.78   | 7          |
| `docs/evidence/collection-events-prompts-author-packet-20261003/dependency-api.d.ts`                                                        | 一档 | 否     | 0.52   | 15         |
| `docs/evidence/collection-planner-author-packet-20261002/public-api.d.ts`                                                                   | 一档 | 否     | 0.50   | 25         |
| `docs/evidence/collection-planner-counterexamples-20261002/README.md`                                                                       | 二档 | 否     | 0.20   | 1          |
| `docs/evidence/collection-planner-v2-types-20261002/dependency-downloads.json`                                                              | 二档 | 否     | 0.29   | 2          |
| `docs/evidence/core-attachment-plan-author-packet-20261003/artifacts/public-api.d.ts`                                                       | 一档 | 否     | 0.77   | 9          |
| `docs/evidence/core-attachment-plan-author-packet-20261003/artifacts/public-shapes.d.ts`                                                    | 一档 | 否     | 0.37   | 18         |
| `docs/evidence/core-attachment-plan-author-packet-20261003/attachments/dependency-api.d.ts`                                                 | 一档 | 否     | 0.25   | 9          |
| `docs/evidence/core-attachment-plan-author-packet-20261003/attachments/public-api.d.ts`                                                     | 一档 | 否     | 0.82   | 9          |
| `docs/evidence/core-attachment-plan-author-packet-20261003/attachments/public-shapes.d.ts`                                                  | 一档 | 否     | 0.36   | 37         |
| `docs/evidence/core-attachment-plan-author-packet-20261003/paths/public-shapes.d.ts`                                                        | 一档 | 否     | 0.63   | 37         |
| `docs/evidence/core-attachment-plan-author-packet-20261003/persistence/public-api.d.ts`                                                     | 一档 | 否     | 0.57   | 10         |
| `docs/evidence/core-attachment-plan-author-packet-20261003/persistence/public-shapes.d.ts`                                                  | 一档 | 否     | 0.47   | 37         |
| `docs/evidence/core-attachment-plan-author-packet-20261003/plan/dependency-api.d.ts`                                                        | 一档 | 否     | 0.60   | 9          |
| `docs/evidence/core-attachment-plan-author-packet-20261003/plan/public-api.d.ts`                                                            | 二档 | 否     | 0.65   | 6          |
| `docs/evidence/core-attachment-plan-author-packet-20261003/plan/public-shapes.d.ts`                                                         | 一档 | 否     | 0.58   | 9          |
| `docs/evidence/core-compaction-author-packet-20261003/microcompact/dependency-api.d.ts`                                                     | 二档 | 否     | 0.22   | 1          |
| `docs/evidence/core-compaction-author-packet-20261003/microcompact/public-api.d.ts`                                                         | 一档 | 否     | 0.59   | 10         |
| `docs/evidence/core-compaction-author-packet-20261003/policy/public-api.d.ts`                                                               | 一档 | 否     | 0.78   | 38         |
| `docs/evidence/core-compaction-author-packet-20261003/selection/public-api.d.ts`                                                            | 二档 | 否     | 0.68   | 7          |
| `docs/evidence/core-context-provider-author-packet-20261003/builder/context-types.d.ts`                                                     | 一档 | 否     | 0.79   | 12         |
| `docs/evidence/core-context-provider-author-packet-20261003/mid-system/public-api.d.ts`                                                     | 二档 | 否     | 0.70   | 7          |
| `docs/evidence/core-context-provider-author-packet-20261003/mid-system/public-shapes.d.ts`                                                  | 一档 | 否     | 0.83   | 15         |
| `docs/evidence/core-context-provider-author-packet-20261003/origins/public-shapes.d.ts`                                                     | 一档 | 否     | 0.83   | 15         |
| `docs/evidence/core-context-provider-author-packet-20261003/request/public-api.d.ts`                                                        | 二档 | 否     | 0.60   | 3          |
| `docs/evidence/core-context-provider-author-packet-20261003/request/public-shapes.d.ts`                                                     | 二档 | 否     | 0.14   | 1          |
| `docs/evidence/core-context-provider-author-packet-20261003/usage/public-api.d.ts`                                                          | 二档 | 否     | 0.86   | 6          |
| `docs/evidence/core-context-provider-author-packet-20261003/usage/public-shapes.d.ts`                                                       | 一档 | 否     | 1.00   | 8          |
| `docs/evidence/core-error-telemetry-author-packet-20261003/anomaly/public-api.d.ts`                                                         | 一档 | 否     | 0.78   | 14         |
| `docs/evidence/core-error-telemetry-author-packet-20261003/anomaly/public-shapes.d.ts`                                                      | 二档 | 否     | 0.45   | 5          |
| `docs/evidence/core-error-telemetry-author-packet-20261003/business/dependency-api.d.ts`                                                    | 一档 | 否     | 0.76   | 9          |
| `docs/evidence/core-error-telemetry-author-packet-20261003/business/public-api.d.ts`                                                        | 二档 | 否     | 0.67   | 4          |
| `docs/evidence/core-error-telemetry-author-packet-20261003/telemetry/public-api.d.ts`                                                       | 二档 | 否     | 0.50   | 3          |
| `docs/evidence/core-error-telemetry-author-packet-20261003/telemetry/public-shapes.d.ts`                                                    | 一档 | 否     | 0.49   | 37         |
| `docs/evidence/core-history-projection-author-packet-20261003/breakdown/dependency-api.d.ts`                                                | 一档 | 否     | 0.96   | 14         |
| `docs/evidence/core-history-projection-author-packet-20261003/breakdown/public-api.d.ts`                                                    | 一档 | 否     | 0.82   | 23         |
| `docs/evidence/core-history-projection-author-packet-20261003/history/public-api.d.ts`                                                      | 一档 | 否     | 0.73   | 15         |
| `docs/evidence/core-history-projection-author-packet-20261003/history/public-shapes.d.ts`                                                   | 一档 | 否     | 0.68   | 31         |
| `docs/evidence/core-history-projection-author-packet-20261003/manual/public-api.d.ts`                                                       | 一档 | 否     | 0.77   | 30         |
| `docs/evidence/core-history-projection-author-packet-20261003/manual/public-shapes.d.ts`                                                    | 一档 | 否     | 0.57   | 31         |
| `docs/evidence/core-history-projection-author-packet-20261003/media/message-api.d.ts`                                                       | 一档 | 否     | 1.00   | 15         |
| `docs/evidence/core-history-projection-author-packet-20261003/media/public-api.d.ts`                                                        | 二档 | 否     | 0.60   | 3          |
| `docs/evidence/core-history-projection-author-packet-20261003/media/public-shapes.d.ts`                                                     | 一档 | 否     | 0.68   | 31         |
| `docs/evidence/core-hydration-owner-packet-20261003/history/dependency-api.d.ts`                                                            | 一档 | 否     | 0.35   | 31         |
| `docs/evidence/core-hydration-owner-packet-20261003/history/public-api.d.ts`                                                                | 二档 | 否     | 0.81   | 7          |
| `docs/evidence/core-hydration-owner-packet-20261003/history/public-shapes.d.ts`                                                             | 一档 | 否     | 0.76   | 86         |
| `docs/evidence/core-hydration-owner-packet-20261003/media/public-shapes.d.ts`                                                               | 一档 | 否     | 0.47   | 36         |
| `docs/evidence/core-inline-attachment-owner-packet-20261003/dataurl/public-api.d.ts`                                                        | 二档 | 否     | 0.20   | 1          |
| `docs/evidence/core-inline-attachment-owner-packet-20261003/pdf/public-api.d.ts`                                                            | 二档 | 否     | 0.14   | 1          |
| `docs/evidence/core-inline-attachment-owner-packet-20261003/placeholder/public-api.d.ts`                                                    | 二档 | 否     | 0.67   | 4          |
| `docs/evidence/core-inline-attachment-owner-packet-20261003/placeholder/public-shapes.d.ts`                                                 | 一档 | 否     | 0.71   | 24         |
| `docs/evidence/core-inline-attachment-owner-packet-20261003/video/public-api.d.ts`                                                          | 二档 | 否     | 0.17   | 1          |
| `docs/evidence/core-inline-attachment-owner-packet-20261003/video/public-shapes.d.ts`                                                       | 二档 | 否     | 0.57   | 3          |
| `docs/evidence/core-mcp-owner-packet-20261003/bridge/dependency-api.d.ts`                                                                   | 一档 | 否     | 0.26   | 10         |
| `docs/evidence/core-mcp-owner-packet-20261003/bridge/public-api.d.ts`                                                                       | 二档 | 否     | 0.57   | 3          |
| `docs/evidence/core-mcp-owner-packet-20261003/bridge/public-shapes.d.ts`                                                                    | 一档 | 否     | 0.42   | 36         |
| `docs/evidence/core-mcp-owner-packet-20261003/bridge/raw-public-api.d.ts`                                                                   | 二档 | 否     | 0.57   | 3          |
| `docs/evidence/core-mcp-owner-packet-20261003/image/dependency-api.d.ts`                                                                    | 二档 | 否     | 0.22   | 1          |
| `docs/evidence/core-mcp-owner-packet-20261003/image/public-api.d.ts`                                                                        | 二档 | 否     | 0.43   | 6          |
| `docs/evidence/core-mcp-owner-packet-20261003/image/public-shapes.d.ts`                                                                     | 一档 | 否     | 0.42   | 36         |
| `docs/evidence/core-mcp-owner-packet-20261003/image/raw-public-api.d.ts`                                                                    | 二档 | 否     | 0.43   | 6          |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/extraction/dependency-api.d.ts`                                            | 一档 | 否     | 0.29   | 12         |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/extraction/public-api.d.ts`                                                | 二档 | 否     | 0.25   | 2          |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/extraction/public-shapes.d.ts`                                             | 一档 | 否     | 0.63   | 37         |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/memory-agent/dependency-api.d.ts`                                          | 一档 | 否     | 0.66   | 29         |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/memory-agent/public-api.d.ts`                                              | 一档 | 否     | 0.80   | 12         |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/memory-agent/public-shapes.d.ts`                                           | 一档 | 否     | 0.63   | 37         |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/reminders/dependency-api.d.ts`                                             | 二档 | 否     | 0.60   | 7          |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/reminders/public-shapes.d.ts`                                              | 二档 | 否     | 0.58   | 7          |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/resolver/dependency-api.d.ts`                                              | 二档 | 否     | 0.24   | 6          |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/resolver/public-api.d.ts`                                                  | 一档 | 否     | 0.77   | 8          |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/resolver/public-shapes.d.ts`                                               | 一档 | 否     | 0.50   | 37         |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/turn-errors/dependency-api.d.ts`                                           | 一档 | 否     | 0.46   | 9          |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/turn-errors/public-api.d.ts`                                               | 一档 | 否     | 0.67   | 13         |
| `docs/evidence/core-media-memory-reminder-author-packet-20261003/turn-errors/public-shapes.d.ts`                                            | 一档 | 否     | 0.61   | 37         |
| `docs/evidence/core-memory-owner-packet-20261003/extraction/dependency-api.d.ts`                                                            | 二档 | 否     | 0.40   | 4          |
| `docs/evidence/core-memory-owner-packet-20261003/extraction/public-api.d.ts`                                                                | 二档 | 否     | 0.75   | 7          |
| `docs/evidence/core-memory-owner-packet-20261003/extraction/public-shapes.d.ts`                                                             | 一档 | 否     | 0.92   | 86         |
| `docs/evidence/core-memory-owner-packet-20261003/loop/dependency-api.d.ts`                                                                  | 一档 | 否     | 0.40   | 25         |
| `docs/evidence/core-memory-owner-packet-20261003/loop/public-api.d.ts`                                                                      | 二档 | 否     | 0.75   | 7          |
| `docs/evidence/core-memory-owner-packet-20261003/loop/public-shapes.d.ts`                                                                   | 一档 | 否     | 0.63   | 37         |
| `docs/evidence/core-memory-owner-packet-20261003/manifest/public-api.d.ts`                                                                  | 二档 | 否     | 0.50   | 3          |
| `docs/evidence/core-memory-owner-packet-20261003/manifest/public-shapes.d.ts`                                                               | 一档 | 否     | 0.88   | 36         |
| `docs/evidence/core-memory-owner-packet-20261003/path/dependency-api.d.ts`                                                                  | 二档 | 否     | 0.63   | 5          |
| `docs/evidence/core-memory-owner-packet-20261003/path/public-api.d.ts`                                                                      | 二档 | 否     | 0.62   | 4          |
| `docs/evidence/core-model-context-session-owner-packet-20261003/env/public-shapes.d.ts`                                                     | 一档 | 否     | 0.44   | 12         |
| `docs/evidence/core-model-context-session-owner-packet-20261003/parts/public-shapes.d.ts`                                                   | 一档 | 否     | 0.95   | 86         |
| `docs/evidence/core-model-context-session-owner-packet-20261003/session/dependency-api.d.ts`                                                | 二档 | 否     | 0.29   | 5          |
| `docs/evidence/core-model-context-session-owner-packet-20261003/session/public-api.d.ts`                                                    | 一档 | 否     | 0.78   | 20         |
| `docs/evidence/core-model-context-session-owner-packet-20261003/session/public-shapes.d.ts`                                                 | 一档 | 否     | 0.94   | 86         |
| `docs/evidence/core-model-context-session-owner-packet-20261003/skills/public-api.d.ts`                                                     | 二档 | 否     | 0.75   | 3          |
| `docs/evidence/core-model-context-session-owner-packet-20261003/skills/public-shapes.d.ts`                                                  | 一档 | 否     | 0.67   | 10         |
| `docs/evidence/core-model-media-author-packet-20261003/budget/dependency-api.d.ts`                                                          | 二档 | 否     | 0.32   | 7          |
| `docs/evidence/core-model-media-author-packet-20261003/budget/public-api.d.ts`                                                              | 一档 | 否     | 0.68   | 10         |
| `docs/evidence/core-model-media-author-packet-20261003/budget/public-shapes.d.ts`                                                           | 一档 | 否     | 0.69   | 37         |
| `docs/evidence/core-model-media-author-packet-20261003/capability/public-api.d.ts`                                                          | 二档 | 否     | 0.54   | 7          |
| `docs/evidence/core-model-media-author-packet-20261003/capability/public-shapes.d.ts`                                                       | 一档 | 否     | 0.72   | 37         |
| `docs/evidence/core-model-media-author-packet-20261003/errors/dependency-api.d.ts`                                                          | 二档 | 否     | 0.33   | 4          |
| `docs/evidence/core-model-media-author-packet-20261003/errors/public-api.d.ts`                                                              | 二档 | 否     | 0.43   | 4          |
| `docs/evidence/core-model-media-author-packet-20261003/errors/public-shapes.d.ts`                                                           | 一档 | 否     | 0.84   | 37         |
| `docs/evidence/core-model-media-author-packet-20261003/errors/raw-public-extraction.d.ts`                                                   | 二档 | 否     | 0.43   | 4          |
| `docs/evidence/core-model-media-author-packet-20261003/request/dependency-api.d.ts`                                                         | 二档 | 否     | 0.29   | 7          |
| `docs/evidence/core-model-media-author-packet-20261003/request/public-api.d.ts`                                                             | 二档 | 否     | 0.86   | 6          |
| `docs/evidence/core-model-media-author-packet-20261003/request/public-shapes.d.ts`                                                          | 一档 | 否     | 0.65   | 15         |
| `docs/evidence/core-model-media-author-packet-20261003/validation/public-api.d.ts`                                                          | 二档 | 否     | 0.71   | 5          |
| `docs/evidence/core-model-media-author-packet-20261003/validation/public-shapes.d.ts`                                                       | 一档 | 否     | 0.68   | 37         |
| `docs/evidence/core-plugin-reference-owner-packet-20261003/catalog/public-shapes.d.ts`                                                      | 一档 | 否     | 0.98   | 13         |
| `docs/evidence/core-plugin-reference-owner-packet-20261003/references/public-api.d.ts`                                                      | 二档 | 否     | 0.57   | 1          |
| `docs/evidence/core-plugin-reference-owner-packet-20261003/reminder/public-api.d.ts`                                                        | 二档 | 否     | 0.73   | 7          |
| `docs/evidence/core-plugin-reference-owner-packet-20261003/reminder/public-shapes.d.ts`                                                     | 二档 | 否     | 0.92   | 3          |
| `docs/evidence/core-prompt-attachment-owner-packet-20261003/attachment/dependency-api.d.ts`                                                 | 二档 | 否     | 0.42   | 7          |
| `docs/evidence/core-prompt-attachment-owner-packet-20261003/attachment/public-api.d.ts`                                                     | 一档 | 否     | 0.87   | 13         |
| `docs/evidence/core-prompt-attachment-owner-packet-20261003/attachment/public-shapes.d.ts`                                                  | 一档 | 否     | 0.77   | 31         |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/changes/public-api.d.ts`                                           | 二档 | 否     | 0.63   | 5          |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/changes/public-shapes.d.ts`                                        | 一档 | 否     | 0.45   | 11         |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/image/public-api.d.ts`                                             | 二档 | 否     | 0.50   | 3          |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/image/public-shapes.d.ts`                                          | 一档 | 否     | 0.64   | 13         |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/postcompact/public-api.d.ts`                                       | 二档 | 否     | 0.71   | 5          |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/postcompact/public-shapes.d.ts`                                    | 一档 | 否     | 0.60   | 12         |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/reference/public-api.d.ts`                                         | 二档 | 否     | 0.42   | 5          |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/reference/public-shapes.d.ts`                                      | 二档 | 否     | 0.58   | 7          |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/result/public-api.d.ts`                                            | 一档 | 否     | 0.46   | 11         |
| `docs/evidence/core-result-attachment-postcompact-author-packet-20261003/result/public-shapes.d.ts`                                         | 一档 | 否     | 0.53   | 13         |
| `docs/evidence/core-task-notification-owner-packet-20261003/dependency-api.d.ts`                                                            | 一档 | 否     | 0.43   | 12         |
| `docs/evidence/core-task-notification-owner-packet-20261003/public-api.d.ts`                                                                | 一档 | 否     | 0.69   | 13         |
| `docs/evidence/core-workflow-introspection-args-owner-packet-20261003/args/public-api.d.ts`                                                 | 二档 | 否     | 0.29   | 1          |
| `docs/evidence/core-workflow-projection-owner-packet-20261003/format/dependency-api.d.ts`                                                   | 一档 | 否     | 0.59   | 13         |
| `docs/evidence/core-workflow-projection-owner-packet-20261003/frontmatter/dependency-api.d.ts`                                              | 二档 | 否     | 0.14   | 1          |
| `docs/evidence/core-workflow-projection-owner-packet-20261003/frontmatter/public-api.d.ts`                                                  | 二档 | 否     | 0.27   | 3          |
| `docs/evidence/core-workflow-projection-owner-packet-20261003/notes/dependency-api.d.ts`                                                    | 二档 | 否     | 0.25   | 1          |
| `docs/evidence/core-workflow-projection-owner-packet-20261003/notes/public-api.d.ts`                                                        | 二档 | 否     | 0.54   | 3          |
| `docs/evidence/core-workflow-projection-owner-packet-20261003/projection/dependency-api.d.ts`                                               | 二档 | 否     | 0.72   | 4          |
| `docs/evidence/core-workflow-projection-owner-packet-20261003/projection/public-api.d.ts`                                                   | 二档 | 否     | 0.40   | 2          |
| `docs/evidence/critic-loop-author-20261002/api.d.ts`                                                                                        | 二档 | 否     | 0.21   | 4          |
| `docs/evidence/desktop-about-menu-root-packet-20261003/about-public-api.d.ts`                                                               | 一档 | 否     | 0.89   | 33         |
| `docs/evidence/desktop-about-menu-root-packet-20261003/aboutWindow-public-api.d.ts`                                                         | 二档 | 否     | 0.78   | 5          |
| `docs/evidence/desktop-about-menu-root-packet-20261003/desktopApplicationMenu-public-api.d.ts`                                              | 二档 | 否     | 0.36   | 2          |
| `docs/evidence/desktop-about-menu-root-packet-20261003/public-api.d.ts`                                                                     | 一档 | 否     | 0.59   | 33         |
| `docs/evidence/desktop-broadcast-startup-root-packet-20261003/relay/public-api.d.ts`                                                        | 二档 | 否     | 0.30   | 2          |
| `docs/evidence/desktop-broadcast-startup-root-packet-20261003/shared-public-ports.d.ts`                                                     | 二档 | 否     | 0.31   | 2          |
| `docs/evidence/desktop-data-preview-root-packet-20261003/dataSizeScanner-public-api.d.ts`                                                   | 二档 | 否     | 0.45   | 5          |
| `docs/evidence/desktop-data-preview-root-packet-20261003/localMediaPreviewProtocol-public-api.d.ts`                                         | 二档 | 否     | 0.52   | 7          |
| `docs/evidence/desktop-ipc-remote-root-packet-20261003/dependency-api.d.ts`                                                                 | 一档 | 否     | 0.26   | 18         |
| `docs/evidence/desktop-ipc-remote-root-packet-20261003/desktopMainIpcHelpers-public-api.d.ts`                                               | 二档 | 否     | 0.50   | 3          |
| `docs/evidence/desktop-ipc-remote-root-packet-20261003/desktopMainIpcRemote-public-api.d.ts`                                                | 二档 | 否     | 0.36   | 4          |
| `docs/evidence/desktop-ipc-remote-root-packet-20261003/desktopRemoteSessions-public-api.d.ts`                                               | 一档 | 否     | 0.59   | 13         |
| `docs/evidence/desktop-ipc-remote-root-packet-20261003/qualified-return-contracts.d.ts`                                                     | 二档 | 否     | 0.27   | 6          |
| `docs/evidence/desktop-ipc-remote-root-packet-20261003/state-shapes.d.ts`                                                                   | 一档 | 否     | 1.00   | 13         |
| `docs/evidence/desktop-lifecycle-root-packet-20261003/desktopCronScheduler-public-api.d.ts`                                                 | 一档 | 否     | 0.96   | 13         |
| `docs/evidence/desktop-lifecycle-root-packet-20261003/desktopNotifications-public-api.d.ts`                                                 | 二档 | 否     | 0.43   | 3          |
| `docs/evidence/desktop-lifecycle-root-packet-20261003/releaseUpdateCheck-public-api.d.ts`                                                   | 二档 | 否     | 0.11   | 1          |
| `docs/evidence/desktop-lifecycle-root-packet-20261003/scheduler-protocol.d.ts`                                                              | 一档 | 否     | 0.81   | 10         |
| `docs/evidence/desktop-lifecycle-root-packet-20261003/shared-public-types.d.ts`                                                             | 二档 | 否     | 0.21   | 6          |
| `docs/evidence/desktop-platform-host-root-packet-20261003/dependency-api.d.ts`                                                              | 一档 | 否     | 0.11   | 8          |
| `docs/evidence/desktop-platform-host-root-packet-20261003/host-public-api.d.ts`                                                             | 一档 | 否     | 0.87   | 14         |
| `docs/evidence/desktop-platform-host-root-packet-20261003/platform-public-api.d.ts`                                                         | 二档 | 否     | 0.66   | 6          |
| `docs/evidence/desktop-runtime-network-root-packet-20261003/desktopNetworkPolicy-public-api.d.ts`                                           | 二档 | 否     | 0.92   | 6          |
| `docs/evidence/desktop-startup-deeplink-root-packet-20261003/dependency-api.d.ts`                                                           | 一档 | 否     | 0.50   | 8          |
| `docs/evidence/desktop-startup-deeplink-root-packet-20261003/desktopWorkspaceDeepLink-public-api.d.ts`                                      | 二档 | 否     | 0.46   | 5          |
| `docs/evidence/desktop-startup-deeplink-root-packet-20261003/startupWorkspace-public-api.d.ts`                                              | 二档 | 否     | 0.83   | 6          |
| `docs/evidence/desktop-startup-deeplink-root-packet-20261003/startupWorkspaceDeepLinkGate-public-api.d.ts`                                  | 一档 | 否     | 0.87   | 13         |
| `docs/evidence/desktop-window-root-packet-20261003/chrome-public-api.d.ts`                                                                  | 二档 | 否     | 0.61   | 6          |
| `docs/evidence/desktop-window-root-packet-20261003/dependency-api.d.ts`                                                                     | 一档 | 否     | 0.12   | 8          |
| `docs/evidence/desktop-window-root-packet-20261003/lifecycle-public-api.d.ts`                                                               | 一档 | 否     | 0.54   | 10         |
| `docs/evidence/desktop-window-tray-command-root-packet-20261003/desktopCommandHandlers-public-api.d.ts`                                     | 二档 | 否     | 0.60   | 7          |
| `docs/evidence/desktop-window-tray-command-root-packet-20261003/desktopTray-public-api.d.ts`                                                | 二档 | 否     | 0.44   | 4          |
| `docs/evidence/desktop-window-tray-command-root-packet-20261003/primaryWindowCoordinator-public-api.d.ts`                                   | 一档 | 否     | 0.90   | 18         |
| `docs/evidence/desktop-window-tray-command-root-packet-20261003/qualified-return-contracts.d.ts`                                            | 二档 | 否     | 0.13   | 1          |
| `docs/evidence/endpoint-scoped-builtin-source-owner-20261003/candidate-frozen.ts`                                                           | 二档 | 否     | 0.20   | 5          |
| `docs/evidence/endpoint-scoped-builtin-source-owner-20261003/candidate-reviewed.ts`                                                         | 二档 | 否     | 0.39   | 6          |
| `docs/evidence/endpoint-scoped-builtin-source-owner-20261003/dependency-types.d.ts`                                                         | 二档 | 否     | 0.38   | 6          |
| `docs/evidence/endpoint-scoped-builtin-source-owner-20261003/public-api.d.ts`                                                               | 二档 | 否     | 0.38   | 5          |
| `docs/evidence/event-log-author-packet-20261002/public-api.d.ts`                                                                            | 一档 | 否     | 0.60   | 19         |
| `docs/evidence/execution-delivery-author-20261002/draft-exact.json`                                                                         | 二档 | 否     | 0.13   | 1          |
| `docs/evidence/execution-delivery-author-20261002/failures.ts`                                                                              | 一档 | 否     | 0.66   | 20         |
| `docs/evidence/execution-delivery-author-20261002/scheduled-phase.ts`                                                                       | 一档 | 否     | 0.73   | 22         |
| `docs/evidence/lifecycle-definition-author-packet-20261003/lifecycle-public-api.d.ts`                                                       | 一档 | 否     | 0.90   | 45         |
| `docs/evidence/mcp-config-author-20261003/draft-01/corrections/01/config.ts`                                                                | 一档 | 否     | 0.70   | 23         |
| `docs/evidence/mcp-config-author-20261003/draft-01/corrections/01/mcp.ts`                                                                   | 一档 | 否     | 0.68   | 13         |
| `docs/evidence/mcp-config-author-20261003/draft-01/corrections/02/config.ts`                                                                | 一档 | 否     | 0.70   | 23         |
| `docs/evidence/mcp-config-author-20261003/draft-01/corrections/02/mcp.ts`                                                                   | 一档 | 否     | 0.65   | 11         |
| `docs/evidence/mcp-config-author-20261003/draft-01/final/config.ts`                                                                         | 一档 | 否     | 0.70   | 23         |
| `docs/evidence/mcp-config-author-20261003/draft-01/final/mcp.ts`                                                                            | 一档 | 否     | 0.65   | 11         |
| `docs/evidence/mcp-config-author-20261003/draft-01/initial/config.ts`                                                                       | 一档 | 否     | 0.68   | 23         |
| `docs/evidence/mcp-config-author-20261003/draft-01/initial/mcp.ts`                                                                          | 一档 | 否     | 0.59   | 12         |
| `docs/evidence/mcp-config-author-20261003/review-copy/config.ts`                                                                            | 一档 | 否     | 0.83   | 39         |
| `docs/evidence/mcp-config-author-20261003/review-copy/mcp.ts`                                                                               | 一档 | 否     | 0.67   | 11         |
| `docs/evidence/mit-release-boundaries-20261003/dependency-reference-observations.json`                                                      | 二档 | 否     | 0.21   | 1          |
| `docs/evidence/mit-release-boundaries-20261003/native-search-observations.json`                                                             | 二档 | 否     | 0.25   | 2          |
| `docs/evidence/native-source-notices-20261003/microsoft-release-source/config.json`                                                         | 二档 | 否     | 0.25   | 1          |
| `docs/evidence/native-source-notices-20261003/microsoft-release-source/LICENSE`                                                             | 一档 | 否     | 0.88   | 14         |
| `docs/evidence/node-runner-author-packet-20261003/clarification/tracing-public-bindings.md`                                                 | 二档 | 否     | 0.22   | 1          |
| `docs/evidence/node-runner-author-packet-20261003/dependency-api.d.ts`                                                                      | 一档 | 否     | 0.50   | 20         |
| `docs/evidence/node-runner-author-packet-20261003/public-api.d.ts`                                                                          | 二档 | 否     | 0.86   | 6          |
| `docs/evidence/parser-normalization-author-20261002/parsers/critic.ts`                                                                      | 一档 | 否     | 0.52   | 8          |
| `docs/evidence/parser-normalization-author-20261002/parsers/graph-seed.ts`                                                                  | 一档 | 否     | 0.59   | 12         |
| `docs/evidence/parser-normalization-author-20261002/parsers/json.ts`                                                                        | 一档 | 否     | 0.72   | 17         |
| `docs/evidence/parser-normalization-author-20261002/parsers/node-prompts.ts`                                                                | 一档 | 否     | 0.55   | 11         |
| `docs/evidence/parser-normalization-author-20261002/parsers/planner-result.ts`                                                              | 一档 | 否     | 0.83   | 12         |
| `docs/evidence/personal-provider-config-repository-root-packet-20261003/dependency-types.d.ts`                                              | 一档 | 否     | 0.88   | 14         |
| `docs/evidence/personal-provider-config-repository-root-packet-20261003/public-api.d.ts`                                                    | 一档 | 否     | 0.53   | 8          |
| `docs/evidence/personal-provider-config-repository-root-packet-20261003/runtime-ports.d.ts`                                                 | 二档 | 否     | 0.21   | 4          |
| `docs/evidence/phase-runner-author-20261002/api.d.ts`                                                                                       | 二档 | 否     | 0.30   | 7          |
| `docs/evidence/planner-expansion-author-packet-20261002/dependency-api.d.ts`                                                                | 一档 | 否     | 0.63   | 14         |
| `docs/evidence/prompt-rendering-author-20261002/draft-exact.json`                                                                           | 二档 | 否     | 0.13   | 1          |
| `docs/evidence/prompt-rendering-author-20261002/formatters.ts`                                                                              | 一档 | 否     | 0.56   | 9          |
| `docs/evidence/prompt-rendering-author-20261002/prompts.ts`                                                                                 | 一档 | 否     | 0.70   | 14         |
| `docs/evidence/prompt-rendering-author-20261002/red-types.json`                                                                             | 二档 | 否     | 0.25   | 1          |
| `docs/evidence/provider-config-file-codec-root-packet-20261003/dependency-types.d.ts`                                                       | 二档 | 否     | 0.67   | 6          |
| `docs/evidence/provider-config-file-codec-root-packet-20261003/public-api.d.ts`                                                             | 二档 | 否     | 0.20   | 1          |
| `docs/evidence/provider-node-builtin-bottom-root-packets-20261003/dependency-types.d.ts`                                                    | 二档 | 否     | 0.29   | 2          |
| `docs/evidence/provider-node-builtin-bottom-root-packets-20261003/download-api.d.ts`                                                        | 二档 | 否     | 0.56   | 5          |
| `docs/evidence/provider-node-builtin-bottom-root-packets-20261003/release-api.d.ts`                                                         | 二档 | 否     | 0.33   | 3          |
| `docs/evidence/provider-node-cache-paths-owner-screen-20261003/public-api.d.ts`                                                             | 二档 | 否     | 0.36   | 3          |
| `docs/evidence/provider-resolver-root-packet-20261003/dependencies/account-provider-state.d.ts`                                             | 二档 | 否     | 1.00   | 3          |
| `docs/evidence/provider-resolver-root-packet-20261003/dependencies/config-overlay.d.ts`                                                     | 二档 | 否     | 0.71   | 2          |
| `docs/evidence/provider-resolver-root-packet-20261003/dependencies/ids.d.ts`                                                                | 二档 | 否     | 1.00   | 3          |
| `docs/evidence/provider-resolver-root-packet-20261003/dependencies/model-config.d.ts`                                                       | 一档 | 否     | 0.56   | 8          |
| `docs/evidence/provider-resolver-root-packet-20261003/dependencies/provider-config.d.ts`                                                    | 一档 | 否     | 0.60   | 8          |
| `docs/evidence/provider-resolver-root-packet-20261003/public-api.d.ts`                                                                      | 一档 | 否     | 0.72   | 36         |
| `docs/evidence/reconstruction-progress-estimate-20261003/corrected-counts.json`                                                             | 一档 | 否     | 0.01   | 8          |
| `docs/evidence/reconstruction-progress-estimate-20261003/withdrawn-base-tip-counts.json`                                                    | 一档 | 否     | 0.01   | 8          |
| `docs/evidence/remote-asset-cache-author-packet-20261002/public-api.d.ts`                                                                   | 一档 | 否     | 0.73   | 14         |
| `docs/evidence/remote-cdn-network-author-packet-20261003/remoteAssetCdn-public-api.d.ts`                                                    | 二档 | 否     | 0.27   | 3          |
| `docs/evidence/remote-cdn-network-author-packet-20261003/remoteAssetNetwork-public-api.d.ts`                                                | 二档 | 否     | 0.67   | 2          |
| `docs/evidence/root-about-menu-20261003/packet/about-public-api.d.ts`                                                                       | 一档 | 否     | 0.89   | 33         |
| `docs/evidence/root-about-menu-20261003/packet/aboutWindow-public-api.d.ts`                                                                 | 二档 | 否     | 0.78   | 5          |
| `docs/evidence/root-about-menu-20261003/packet/desktopApplicationMenu-public-api.d.ts`                                                      | 二档 | 否     | 0.36   | 2          |
| `docs/evidence/root-network-policy-20261003/packet/desktopNetworkPolicy-public-api.d.ts`                                                    | 二档 | 否     | 0.92   | 6          |
| `docs/evidence/root-personal-provider-repository-20261003/packet/dependency-types.d.ts`                                                     | 一档 | 否     | 0.88   | 14         |
| `docs/evidence/root-personal-provider-repository-20261003/packet/public-api.d.ts`                                                           | 一档 | 否     | 0.53   | 8          |
| `docs/evidence/root-personal-provider-repository-20261003/packet/runtime-ports.d.ts`                                                        | 二档 | 否     | 0.21   | 4          |
| `docs/evidence/root-platform-host-20261003/packet/dependency-api.d.ts`                                                                      | 一档 | 否     | 0.11   | 8          |
| `docs/evidence/root-platform-host-20261003/packet/host-public-api.d.ts`                                                                     | 一档 | 否     | 0.87   | 14         |
| `docs/evidence/root-platform-host-20261003/packet/platform-public-api.d.ts`                                                                 | 二档 | 否     | 0.66   | 6          |
| `docs/evidence/root-provider-resolver-20261003/packet/dependencies/account-provider-state.d.ts`                                             | 二档 | 否     | 1.00   | 3          |
| `docs/evidence/root-provider-resolver-20261003/packet/dependencies/config-overlay.d.ts`                                                     | 二档 | 否     | 0.71   | 2          |
| `docs/evidence/root-provider-resolver-20261003/packet/dependencies/ids.d.ts`                                                                | 二档 | 否     | 1.00   | 3          |
| `docs/evidence/root-provider-resolver-20261003/packet/dependencies/model-config.d.ts`                                                       | 一档 | 否     | 0.56   | 8          |
| `docs/evidence/root-provider-resolver-20261003/packet/dependencies/provider-config.d.ts`                                                    | 一档 | 否     | 0.60   | 8          |
| `docs/evidence/root-provider-resolver-20261003/packet/public-api.d.ts`                                                                      | 一档 | 否     | 0.72   | 36         |
| `docs/evidence/root-remote-cache-20261003/public-api.d.ts`                                                                                  | 一档 | 否     | 0.73   | 14         |
| `docs/evidence/root-upload-progress-20261003/preauthor.json`                                                                                | 二档 | 否     | 0.13   | 1          |
| `docs/evidence/root-window-owners-20261003/packet/chrome-public-api.d.ts`                                                                   | 二档 | 否     | 0.61   | 6          |
| `docs/evidence/root-window-owners-20261003/packet/dependency-api.d.ts`                                                                      | 一档 | 否     | 0.12   | 8          |
| `docs/evidence/root-window-owners-20261003/packet/lifecycle-public-api.d.ts`                                                                | 一档 | 否     | 0.54   | 10         |
| `docs/evidence/rpc-channel-client-root-packet-20261003/dependency-types.d.ts`                                                               | 一档 | 否     | 0.52   | 33         |
| `docs/evidence/rpc-channel-client-root-packet-20261003/public-api.d.ts`                                                                     | 二档 | 否     | 0.20   | 1          |
| `docs/evidence/run-loop-author-20261002/api.d.ts`                                                                                           | 二档 | 否     | 0.20   | 5          |
| `docs/evidence/run-loop-author-20261002/draft-exact.json`                                                                                   | 二档 | 否     | 0.11   | 1          |
| `docs/evidence/runtime-background-author-20261003/api.d.ts`                                                                                 | 二档 | 否     | 0.50   | 4          |
| `docs/evidence/runtime-background-author-20261003/draft-01/background.ts`                                                                   | 一档 | 否     | 0.68   | 22         |
| `docs/evidence/runtime-background-author-20261003/supporting-api.d.ts`                                                                      | 一档 | 否     | 0.89   | 11         |
| `docs/evidence/runtime-background-notifications-author-20261003/api.d.ts`                                                                   | 二档 | 否     | 0.53   | 6          |
| `docs/evidence/runtime-background-notifications-author-20261003/draft-01/background-notifications.ts`                                       | 一档 | 否     | 0.69   | 23         |
| `docs/evidence/runtime-bash-shell-snapshot-author-20261003/api.d.ts`                                                                        | 二档 | 否     | 0.59   | 5          |
| `docs/evidence/runtime-bash-shell-snapshot-author-20261003/supporting.d.ts`                                                                 | 二档 | 否     | 0.92   | 3          |
| `docs/evidence/runtime-commands-author-20261002/red-types.json`                                                                             | 二档 | 否     | 0.13   | 1          |
| `docs/evidence/runtime-commands-author-20261002/retry-state-v2.ts`                                                                          | 一档 | 否     | 0.59   | 12         |
| `docs/evidence/runtime-commands-author-20261002/revision-exact.json`                                                                        | 二档 | 否     | 0.20   | 1          |
| `docs/evidence/runtime-context-author-20261002/api.d.ts`                                                                                    | 一档 | 否     | 0.68   | 15         |
| `docs/evidence/runtime-control-only-turn-author-20261003/api.d.ts`                                                                          | 二档 | 否     | 0.72   | 6          |
| `docs/evidence/runtime-control-only-turn-author-20261003/supporting.d.ts`                                                                   | 二档 | 否     | 0.87   | 6          |
| `docs/evidence/runtime-conversation-author-20261003/api.d.ts`                                                                               | 二档 | 否     | 0.29   | 4          |
| `docs/evidence/runtime-conversation-author-20261003/draft-01/conversation.ts`                                                               | 一档 | 否     | 0.41   | 13         |
| `docs/evidence/runtime-conversation-author-20261003/port-facts.md`                                                                          | 二档 | 否     | 0.26   | 1          |
| `docs/evidence/runtime-conversation-author-20261003/supporting-api.d.ts`                                                                    | 一档 | 否     | 0.57   | 13         |
| `docs/evidence/runtime-events-author-20261003/draft-01/events-durable.ts`                                                                   | 一档 | 否     | 0.78   | 14         |
| `docs/evidence/runtime-events-author-20261003/draft-01/events-session.ts`                                                                   | 一档 | 否     | 0.86   | 18         |
| `docs/evidence/runtime-events-author-20261003/draft-01/events-summary.ts`                                                                   | 二档 | 否     | 0.39   | 6          |
| `docs/evidence/runtime-events-author-20261003/draft-01/events.ts`                                                                           | 一档 | 否     | 0.91   | 16         |
| `docs/evidence/runtime-file-rewind-author-20261003/api.d.ts`                                                                                | 一档 | 否     | 0.88   | 8          |
| `docs/evidence/runtime-file-rewind-author-20261003/supporting.d.ts`                                                                         | 一档 | 否     | 0.52   | 27         |
| `docs/evidence/runtime-goal-stop-five-red-20261003/draft-control-only-turn.d.ts`                                                            | 二档 | 否     | 0.69   | 6          |
| `docs/evidence/runtime-goal-stop-five-red-20261003/draft-control-only-turn.js`                                                              | 一档 | 否     | 0.72   | 11         |
| `docs/evidence/runtime-goal-summary-title-author-20261003/api.d.ts`                                                                         | 二档 | 否     | 0.50   | 4          |
| `docs/evidence/runtime-hooks-author-20261003/api.d.ts`                                                                                      | 二档 | 否     | 0.17   | 1          |
| `docs/evidence/runtime-hooks-author-20261003/draft-01/hooks.ts`                                                                             | 一档 | 否     | 0.72   | 20         |
| `docs/evidence/runtime-message-persistence-author-20261003/api.d.ts`                                                                        | 一档 | 否     | 0.61   | 8          |
| `docs/evidence/runtime-message-persistence-author-20261003/draft-01/message-persistence.ts`                                                 | 一档 | 否     | 0.82   | 42         |
| `docs/evidence/runtime-model-request-author-20261003/draft-01/runtime/methods/model.ts`                                                     | 一档 | 否     | 0.59   | 14         |
| `docs/evidence/runtime-model-request-author-20261003/draft-02/runtime/methods/model-request-stream-state.ts`                                | 二档 | 否     | 0.45   | 7          |
| `docs/evidence/runtime-model-request-author-20261003/draft-02/runtime/methods/model.ts`                                                     | 一档 | 否     | 0.69   | 14         |
| `docs/evidence/runtime-model-request-author-20261003/initial-draft-archive.json`                                                            | 二档 | 否     | 0.11   | 1          |
| `docs/evidence/runtime-model-request-author-20261003/public-shapes-supplement.d.ts`                                                         | 一档 | 否     | 0.42   | 86         |
| `docs/evidence/runtime-model-request-author-20261003/supporting.d.ts`                                                                       | 一档 | 否     | 1.00   | 27         |
| `docs/evidence/runtime-model-status-author-20261003/api.d.ts`                                                                               | 二档 | 否     | 0.60   | 3          |
| `docs/evidence/runtime-model-status-author-20261003/draft-01/model-status.ts`                                                               | 一档 | 否     | 0.75   | 10         |
| `docs/evidence/runtime-model-status-author-20261003/draft-02/model-status.ts`                                                               | 一档 | 否     | 0.43   | 9          |
| `docs/evidence/runtime-model-streaming-event-queue-author-20261003/api.d.ts`                                                                | 二档 | 否     | 0.80   | 4          |
| `docs/evidence/runtime-model-streaming-event-queue-author-20261003/draft-01/model-streaming-event-queue.ts`                                 | 一档 | 否     | 0.45   | 10         |
| `docs/evidence/runtime-permission-draft-checks-20261003/permission-full-access-type-only.ts`                                                | 一档 | 否     | 0.65   | 13         |
| `docs/evidence/runtime-permission-owner-author-20261003/api.d.ts`                                                                           | 二档 | 否     | 0.20   | 2          |
| `docs/evidence/runtime-permission-owner-author-20261003/draft-01/execution-state.ts`                                                        | 一档 | 否     | 0.78   | 13         |
| `docs/evidence/runtime-permission-owner-author-20261003/draft-01/initial/execution-state.ts`                                                | 一档 | 否     | 0.75   | 13         |
| `docs/evidence/runtime-permission-owner-author-20261003/draft-01/initial/permission-full-access.ts`                                         | 一档 | 否     | 0.64   | 13         |
| `docs/evidence/runtime-permission-owner-author-20261003/draft-01/permission-full-access.ts`                                                 | 一档 | 否     | 0.65   | 13         |
| `docs/evidence/runtime-permission-owner-author-20261003/port-types.d.ts`                                                                    | 二档 | 否     | 0.22   | 3          |
| `docs/evidence/runtime-permission-owner-author-20261003/unchanged-dependencies.d.ts`                                                        | 二档 | 否     | 0.27   | 4          |
| `docs/evidence/runtime-persisted-remote-session-path-repair-author-20261003/api.d.ts`                                                       | 二档 | 否     | 0.40   | 2          |
| `docs/evidence/runtime-persisted-remote-session-path-repair-author-20261003/supporting.d.ts`                                                | 一档 | 否     | 0.97   | 27         |
| `docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-bash-shell-snapshot.d.ts`                                         | 二档 | 否     | 0.58   | 5          |
| `docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-bash-shell-snapshot.js`                                           | 一档 | 否     | 0.46   | 11         |
| `docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-file-rewind-planning.d.ts`                                        | 二档 | 否     | 0.60   | 6          |
| `docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-file-rewind-planning.js`                                          | 二档 | 否     | 0.25   | 5          |
| `docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-file-rewind-storage.d.ts`                                         | 二档 | 否     | 0.20   | 2          |
| `docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-file-rewind.d.ts`                                                 | 一档 | 否     | 0.83   | 8          |
| `docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-file-rewind.js`                                                   | 二档 | 否     | 0.58   | 4          |
| `docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-persisted-remote-session-path-repair.d.ts`                        | 二档 | 否     | 0.33   | 2          |
| `docs/evidence/runtime-persistence-recovery-three-failures-20261003/draft-persisted-remote-session-path-repair.js`                          | 二档 | 否     | 0.27   | 3          |
| `docs/evidence/runtime-preparation-five-failures-20261003/draft-target-completion-verification.d.ts`                                        | 二档 | 否     | 0.67   | 3          |
| `docs/evidence/runtime-preparation-five-failures-20261003/draft-target-completion-verification.js`                                          | 一档 | 否     | 0.54   | 8          |
| `docs/evidence/runtime-rewind-author-20261003/rewind-conversation-state.ts`                                                                 | 一档 | 否     | 0.59   | 8          |
| `docs/evidence/runtime-rewind-author-20261003/rewind-message.ts`                                                                            | 一档 | 否     | 0.79   | 13         |
| `docs/evidence/runtime-rewind-author-20261003/rewind-workspace-cascade.ts`                                                                  | 一档 | 否     | 0.65   | 16         |
| `docs/evidence/runtime-rewind-author-20261003/rewind.ts`                                                                                    | 一档 | 否     | 0.78   | 21         |
| `docs/evidence/runtime-session-shell-environment-author-20261003/api.d.ts`                                                                  | 二档 | 否     | 0.42   | 3          |
| `docs/evidence/runtime-session-shell-environment-author-20261003/supporting.d.ts`                                                           | 二档 | 否     | 0.40   | 4          |
| `docs/evidence/runtime-session-title-author-20261003/api.d.ts`                                                                              | 二档 | 否     | 0.46   | 2          |
| `docs/evidence/runtime-session-title-author-20261003/draft-01/session-title.ts`                                                             | 一档 | 否     | 0.66   | 12         |
| `docs/evidence/runtime-streaming-recovery-author-20261003/api.d.ts`                                                                         | 一档 | 否     | 0.67   | 13         |
| `docs/evidence/runtime-streaming-recovery-author-20261003/draft-01/streaming-recovery.ts`                                                   | 一档 | 否     | 0.56   | 8          |
| `docs/evidence/runtime-streaming-recovery-author-20261003/supporting-api.d.ts`                                                              | 二档 | 否     | 0.95   | 4          |
| `docs/evidence/runtime-streaming-tool-coordinator-author-20261003/api.d.ts`                                                                 | 二档 | 否     | 0.64   | 6          |
| `docs/evidence/runtime-streaming-tool-coordinator-author-20261003/draft-01/streaming-tool-coordinator.ts`                                   | 一档 | 否     | 0.67   | 21         |
| `docs/evidence/runtime-streaming-tool-coordinator-author-20261003/draft-01/streaming-tool-execution.ts`                                     | 二档 | 否     | 0.72   | 4          |
| `docs/evidence/runtime-streaming-tool-coordinator-author-20261003/supporting-api.d.ts`                                                      | 二档 | 否     | 0.60   | 7          |
| `docs/evidence/runtime-streaming-tool-ledger-author-20261003/api.d.ts`                                                                      | 一档 | 否     | 0.82   | 18         |
| `docs/evidence/runtime-streaming-tool-ledger-author-20261003/draft-01/streaming-tool-ledger.ts`                                             | 一档 | 否     | 0.87   | 19         |
| `docs/evidence/runtime-subagent-messages-author-20261003/supporting.d.ts`                                                                   | 一档 | 否     | 0.59   | 13         |
| `docs/evidence/runtime-target-author-20261003/api.d.ts`                                                                                     | 二档 | 否     | 0.72   | 6          |
| `docs/evidence/runtime-target-author-20261003/supporting.d.ts`                                                                              | 一档 | 否     | 0.89   | 11         |
| `docs/evidence/runtime-target-completion-verification-author-20261003/api.d.ts`                                                             | 二档 | 否     | 0.75   | 3          |
| `docs/evidence/runtime-title-generation-sidecar-author-20261003/api.d.ts`                                                                   | 二档 | 否     | 0.46   | 4          |
| `docs/evidence/runtime-title-generation-sidecar-author-20261003/draft-01/title-generation-sidecar.ts`                                       | 一档 | 否     | 0.57   | 16         |
| `docs/evidence/runtime-tooling-author-20261003/draft-01/initial.ts`                                                                         | 一档 | 否     | 0.61   | 17         |
| `docs/evidence/runtime-tooling-author-20261003/draft-01/runtime-tools.ts`                                                                   | 一档 | 否     | 0.69   | 17         |
| `docs/evidence/runtime-tooling-author-20261003/review-copy/runtime-tools.ts`                                                                | 一档 | 否     | 0.82   | 21         |
| `docs/evidence/runtime-tooling-author-20261003/type-only-copy/runtime-tools.ts`                                                             | 一档 | 否     | 0.68   | 17         |
| `docs/evidence/runtime-turn-command-author-20261003/additional-public-ports.d.ts`                                                           | 一档 | 否     | 0.44   | 18         |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/representations/formatted-complete-01/turn-command-data.ts`                    | 一档 | 否     | 0.29   | 11         |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/representations/formatted-complete-01/turn-command-state.ts`                   | 二档 | 否     | 0.22   | 4          |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/representations/formatted-complete-01/turn.ts`                                 | 二档 | 否     | 0.51   | 7          |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/representations/initial-complete-01/turn.ts`                                   | 二档 | 否     | 0.35   | 7          |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/representations/initial-partial-01/turn.ts`                                    | 二档 | 否     | 0.35   | 7          |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/representations/pre-scope-final-01/turn-command-data.ts`                       | 一档 | 否     | 0.29   | 11         |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/representations/pre-scope-final-01/turn-command-state.ts`                      | 二档 | 否     | 0.22   | 4          |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/representations/pre-scope-final-01/turn.ts`                                    | 二档 | 否     | 0.51   | 7          |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/turn-command-data.ts`                                                          | 一档 | 否     | 0.30   | 11         |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/turn-command-state.ts`                                                         | 二档 | 否     | 0.22   | 4          |
| `docs/evidence/runtime-turn-command-author-20261003/draft-01/turn.ts`                                                                       | 二档 | 否     | 0.51   | 7          |
| `docs/evidence/runtime-turn-command-author-20261003/port-clarification.d.ts`                                                                | 一档 | 否     | 0.37   | 18         |
| `docs/evidence/runtime-turn-command-author-20261003/runtime-ports.d.ts`                                                                     | 二档 | 否     | 0.25   | 2          |
| `docs/evidence/runtime-turn-command-author-20261003/supporting.d.ts`                                                                        | 一档 | 否     | 0.18   | 86         |
| `docs/evidence/runtime-turn-loop-author-20261003/supporting.d.ts`                                                                           | 二档 | 否     | 0.95   | 7          |
| `docs/evidence/runtime-turn-model-author-20261003/api.d.ts`                                                                                 | 二档 | 否     | 0.14   | 1          |
| `docs/evidence/runtime-turn-model-author-20261003/supporting.d.ts`                                                                          | 二档 | 否     | 0.78   | 6          |
| `docs/evidence/runtime-turn-model-step-author-20261003/api.d.ts`                                                                            | 二档 | 否     | 0.80   | 7          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-01/initial-authored/turn-model-step-failure.ts`                                | 二档 | 否     | 0.23   | 5          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-01/initial-authored/turn-model-step-recovery.ts`                               | 二档 | 否     | 0.39   | 2          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-01/initial-authored/turn-model-step.ts`                                        | 一档 | 否     | 0.46   | 16         |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-01/turn-model-step-recovery.ts`                                                | 二档 | 否     | 0.42   | 2          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-01/turn-model-step.ts`                                                         | 一档 | 否     | 0.46   | 16         |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/final-authored-before-seal/turn-model-step-fields.ts`                       | 一档 | 否     | 0.44   | 9          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/final-authored-before-seal/turn-model-step-operation.ts`                    | 二档 | 否     | 0.44   | 6          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/final-authored-before-seal/turn-model-step-records.ts`                      | 一档 | 否     | 0.48   | 16         |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/final-authored-before-seal/turn-model-step-recovery.ts`                     | 二档 | 否     | 0.65   | 5          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/final-authored-before-seal/turn-model-step.ts`                              | 一档 | 否     | 0.69   | 14         |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/intermediate-before-final-split/turn-model-step-fields.ts`                  | 一档 | 否     | 0.44   | 9          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/intermediate-before-final-split/turn-model-step-operation.ts`               | 一档 | 否     | 0.52   | 11         |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/intermediate-before-final-split/turn-model-step-records.ts`                 | 一档 | 否     | 0.46   | 16         |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/intermediate-before-final-split/turn-model-step-recovery.ts`                | 二档 | 否     | 0.65   | 5          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/intermediate-before-final-split/turn-model-step.ts`                         | 一档 | 否     | 0.69   | 14         |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/pre-format/turn-model-step-records.ts`                                      | 一档 | 否     | 0.50   | 16         |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/pre-format/turn-model-step-recovery.ts`                                     | 二档 | 否     | 0.47   | 3          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/pre-format/turn-model-step.ts`                                              | 二档 | 否     | 0.39   | 7          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/turn-model-step-fields.ts`                                                  | 一档 | 否     | 0.44   | 9          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/turn-model-step-operation.ts`                                               | 二档 | 否     | 0.44   | 6          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/turn-model-step-records.ts`                                                 | 一档 | 否     | 0.48   | 16         |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/turn-model-step-recovery.ts`                                                | 二档 | 否     | 0.65   | 5          |
| `docs/evidence/runtime-turn-model-step-author-20261003/draft-02/turn-model-step.ts`                                                         | 一档 | 否     | 0.69   | 14         |
| `docs/evidence/runtime-turn-model-step-author-20261003/port-clarification-before-format.d.ts`                                               | 一档 | 否     | 0.41   | 15         |
| `docs/evidence/runtime-turn-model-step-author-20261003/port-clarification.d.ts`                                                             | 一档 | 否     | 0.46   | 27         |
| `docs/evidence/runtime-turn-model-step-author-20261003/runtime-ports.d.ts`                                                                  | 二档 | 否     | 0.35   | 1          |
| `docs/evidence/runtime-turn-model-step-author-20261003/supporting.d.ts`                                                                     | 一档 | 否     | 0.24   | 86         |
| `docs/evidence/runtime-turn-model-step-author-20261003/type-only-review-copy/turn-model-step-fields.ts`                                     | 一档 | 否     | 0.43   | 9          |
| `docs/evidence/runtime-turn-model-step-author-20261003/type-only-review-copy/turn-model-step-operation.ts`                                  | 二档 | 否     | 0.44   | 6          |
| `docs/evidence/runtime-turn-model-step-author-20261003/type-only-review-copy/turn-model-step-records.ts`                                    | 一档 | 否     | 0.48   | 16         |
| `docs/evidence/runtime-turn-model-step-author-20261003/type-only-review-copy/turn-model-step-recovery.ts`                                   | 二档 | 否     | 0.65   | 5          |
| `docs/evidence/runtime-turn-model-step-author-20261003/type-only-review-copy/turn-model-step.ts`                                            | 一档 | 否     | 0.69   | 14         |
| `docs/evidence/runtime-turn-persistence-author-20261003/cancelled-stream-persistence.ts`                                                    | 一档 | 否     | 0.90   | 10         |
| `docs/evidence/runtime-turn-persistence-author-20261003/input-intent-persistence.ts`                                                        | 一档 | 否     | 0.97   | 17         |
| `docs/evidence/runtime-turn-persistence-author-20261003/timeline-persistence.ts`                                                            | 一档 | 否     | 0.89   | 35         |
| `docs/evidence/runtime-turn-persistence-author-20261003/tool-part-persistence.ts`                                                           | 一档 | 否     | 0.92   | 29         |
| `docs/evidence/runtime-turn-persistence-author-20261003/workspace-checkpoint-persistence.ts`                                                | 一档 | 否     | 0.74   | 22         |
| `docs/evidence/runtime-turn-stop-author-20261003/api.d.ts`                                                                                  | 二档 | 否     | 0.64   | 6          |
| `docs/evidence/runtime-turn-stop-author-20261003/supporting.d.ts`                                                                           | 一档 | 否     | 0.78   | 8          |
| `docs/evidence/runtime-turn-tool-batch-author-20261003/api.d.ts`                                                                            | 二档 | 否     | 0.75   | 6          |
| `docs/evidence/runtime-turn-tool-batch-author-20261003/draft-01/runtime/methods/turn-tool-batch-follow-up.ts`                               | 二档 | 否     | 0.58   | 5          |
| `docs/evidence/runtime-turn-tool-batch-author-20261003/draft-01/runtime/methods/turn-tool-batch-publication.ts`                             | 一档 | 否     | 0.35   | 8          |
| `docs/evidence/runtime-turn-tool-batch-author-20261003/draft-01/runtime/methods/turn-tools.ts`                                              | 一档 | 否     | 0.46   | 12         |
| `docs/evidence/runtime-turn-tool-batch-author-20261003/draft-02/runtime/methods/turn-tool-batch-follow-up.ts`                               | 一档 | 否     | 0.73   | 8          |
| `docs/evidence/runtime-turn-tool-batch-author-20261003/draft-02/runtime/methods/turn-tool-batch-parts.ts`                                   | 二档 | 否     | 0.21   | 2          |
| `docs/evidence/runtime-turn-tool-batch-author-20261003/draft-02/runtime/methods/turn-tools.ts`                                              | 一档 | 否     | 0.61   | 17         |
| `docs/evidence/runtime-turn-tool-batch-author-20261003/public-shapes-supplement.d.ts`                                                       | 一档 | 否     | 0.31   | 86         |
| `docs/evidence/runtime-turn-tool-batch-author-20261003/supporting.d.ts`                                                                     | 一档 | 否     | 0.66   | 27         |
| `docs/evidence/runtime-usage-observability-author-20261003/api.d.ts`                                                                        | 一档 | 否     | 0.85   | 23         |
| `docs/evidence/runtime-usage-observability-author-20261003/draft-01/usage-observability.ts`                                                 | 一档 | 否     | 0.62   | 32         |
| `docs/evidence/runtime-workspace-checkpoints-author-20261003/api.d.ts`                                                                      | 二档 | 否     | 0.65   | 7          |
| `docs/evidence/runtime-workspace-checkpoints-author-20261003/draft-01/workspace-checkpoints.ts`                                             | 一档 | 否     | 0.66   | 18         |
| `docs/evidence/runtime-workspace-fork-author-20261003/draft-exact.json`                                                                     | 二档 | 否     | 0.11   | 1          |
| `docs/evidence/runtime-workspace-fork-author-20261003/stable-fork-boundary.ts`                                                              | 一档 | 否     | 0.47   | 11         |
| `docs/evidence/runtime-workspace-fork-author-20261003/workspace-fork.ts`                                                                    | 一档 | 否     | 0.78   | 23         |
| `docs/evidence/runtime-workspace-generate-text-author-20261003/api.d.ts`                                                                    | 一档 | 否     | 0.65   | 15         |
| `docs/evidence/runtime-workspace-generate-text-author-20261003/draft-01/workspace-generate-text.ts`                                         | 一档 | 否     | 0.73   | 15         |
| `docs/evidence/shared-preview-merge-root-packet-20261003/media-dependency-api.d.ts`                                                         | 二档 | 否     | 0.83   | 5          |
| `docs/evidence/shared-preview-merge-root-packet-20261003/persisted-message-api.d.ts`                                                        | 二档 | 否     | 0.47   | 4          |
| `docs/evidence/shared-preview-merge-root-packet-20261003/preview-public-api.d.ts`                                                           | 一档 | 否     | 0.77   | 24         |
| `docs/evidence/steering-subagent-author-20261003/correction-01/steering-active.ts`                                                          | 一档 | 否     | 0.71   | 8          |
| `docs/evidence/steering-subagent-author-20261003/correction-01/steering-admission.ts`                                                       | 一档 | 否     | 0.84   | 18         |
| `docs/evidence/steering-subagent-author-20261003/correction-01/steering-configuration.ts`                                                   | 一档 | 否     | 0.93   | 15         |
| `docs/evidence/steering-subagent-author-20261003/correction-01/steering-draining.ts`                                                        | 一档 | 否     | 0.62   | 11         |
| `docs/evidence/steering-subagent-author-20261003/correction-01/steering-editing.ts`                                                         | 一档 | 否     | 0.54   | 12         |
| `docs/evidence/steering-subagent-author-20261003/correction-01/steering-guides.ts`                                                          | 一档 | 否     | 0.60   | 8          |
| `docs/evidence/steering-subagent-author-20261003/correction-01/steering-persistence.ts`                                                     | 一档 | 否     | 0.73   | 12         |
| `docs/evidence/steering-subagent-author-20261003/correction-01/steering.ts`                                                                 | 二档 | 否     | 0.44   | 3          |
| `docs/evidence/steering-subagent-author-20261003/correction-01/subagent-authority.ts`                                                       | 二档 | 否     | 0.33   | 6          |
| `docs/evidence/steering-subagent-author-20261003/correction-01/subagent-skills.ts`                                                          | 一档 | 否     | 0.50   | 11         |
| `docs/evidence/steering-subagent-author-20261003/correction-01/subagent.ts`                                                                 | 一档 | 否     | 0.48   | 9          |
| `docs/evidence/steering-subagent-author-20261003/review-copy/steering-active.ts`                                                            | 一档 | 否     | 0.71   | 8          |
| `docs/evidence/steering-subagent-author-20261003/review-copy/steering-admission.ts`                                                         | 一档 | 否     | 0.84   | 18         |
| `docs/evidence/steering-subagent-author-20261003/review-copy/steering-configuration.ts`                                                     | 一档 | 否     | 0.93   | 15         |
| `docs/evidence/steering-subagent-author-20261003/review-copy/steering-draining.ts`                                                          | 一档 | 否     | 0.62   | 11         |
| `docs/evidence/steering-subagent-author-20261003/review-copy/steering-editing.ts`                                                           | 一档 | 否     | 0.54   | 12         |
| `docs/evidence/steering-subagent-author-20261003/review-copy/steering-guides.ts`                                                            | 一档 | 否     | 0.60   | 8          |
| `docs/evidence/steering-subagent-author-20261003/review-copy/steering-persistence.ts`                                                       | 一档 | 否     | 0.73   | 12         |
| `docs/evidence/steering-subagent-author-20261003/review-copy/steering.ts`                                                                   | 二档 | 否     | 0.44   | 3          |
| `docs/evidence/steering-subagent-author-20261003/review-copy/subagent-authority.ts`                                                         | 二档 | 否     | 0.33   | 6          |
| `docs/evidence/steering-subagent-author-20261003/review-copy/subagent-skills.ts`                                                            | 一档 | 否     | 0.56   | 11         |
| `docs/evidence/steering-subagent-author-20261003/review-copy/subagent.ts`                                                                   | 一档 | 否     | 0.48   | 9          |
| `docs/evidence/steering-subagent-author-20261003/steering/api.d.ts`                                                                         | 二档 | 否     | 0.65   | 7          |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/initial/steering-active.ts`                                              | 二档 | 否     | 0.33   | 6          |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/initial/steering-admission.ts`                                           | 一档 | 否     | 0.38   | 12         |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/initial/steering-configuration.ts`                                       | 二档 | 否     | 0.30   | 2          |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/initial/steering-draining.ts`                                            | 二档 | 否     | 0.20   | 3          |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/initial/steering-editing.ts`                                             | 二档 | 否     | 0.28   | 3          |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/initial/steering-persistence.ts`                                         | 二档 | 否     | 0.35   | 4          |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/steering-active.ts`                                                      | 一档 | 否     | 0.63   | 8          |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/steering-admission.ts`                                                   | 一档 | 否     | 0.82   | 18         |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/steering-configuration.ts`                                               | 一档 | 否     | 0.92   | 15         |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/steering-draining.ts`                                                    | 一档 | 否     | 0.59   | 11         |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/steering-editing.ts`                                                     | 一档 | 否     | 0.54   | 12         |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/steering-guides.ts`                                                      | 一档 | 否     | 0.60   | 8          |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/steering-persistence.ts`                                                 | 一档 | 否     | 0.73   | 12         |
| `docs/evidence/steering-subagent-author-20261003/steering/draft-01/steering.ts`                                                             | 二档 | 否     | 0.44   | 3          |
| `docs/evidence/steering-subagent-author-20261003/subagent/draft-01/initial/subagent-authority.ts`                                           | 二档 | 否     | 0.28   | 3          |
| `docs/evidence/steering-subagent-author-20261003/subagent/draft-01/initial/subagent-skills.ts`                                              | 二档 | 否     | 0.43   | 7          |
| `docs/evidence/steering-subagent-author-20261003/subagent/draft-01/initial/subagent.ts`                                                     | 二档 | 否     | 0.43   | 7          |
| `docs/evidence/steering-subagent-author-20261003/subagent/draft-01/subagent-authority.ts`                                                   | 二档 | 否     | 0.31   | 6          |
| `docs/evidence/steering-subagent-author-20261003/subagent/draft-01/subagent-skills.ts`                                                      | 一档 | 否     | 0.46   | 11         |
| `docs/evidence/steering-subagent-author-20261003/subagent/draft-01/subagent.ts`                                                             | 一档 | 否     | 0.46   | 9          |
| `docs/evidence/steering-subagent-checks-20261003/format-failure.json`                                                                       | 二档 | 否     | 0.17   | 1          |
| `docs/evidence/subagent-profile-author-20261003/api.d.ts`                                                                                   | 一档 | 否     | 0.66   | 27         |
| `docs/evidence/subagent-profile-author-20261003/draft-01/profile.ts`                                                                        | 一档 | 否     | 0.44   | 30         |
| `docs/evidence/subagent-profile-author-20261003/draft-01/representations/profile.001-authored.ts`                                           | 一档 | 否     | 0.37   | 27         |
| `docs/evidence/subagent-profile-author-20261003/draft-01/representations/profile.002-formatted.ts`                                          | 一档 | 否     | 0.44   | 30         |
| `docs/evidence/subagent-profile-author-20261003/supporting.d.ts`                                                                            | 二档 | 否     | 1.00   | 1          |
| `docs/evidence/subagent-runner-author-20261003/api.d.ts`                                                                                    | 一档 | 否     | 0.91   | 20         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/01-initial-complete-unformatted/runner.ts`                          | 一档 | 否     | 0.69   | 20         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/02-before-supplement-corrections/runner.ts`                         | 一档 | 否     | 0.69   | 20         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/03-supplement-unformatted/runner.ts`                                | 一档 | 否     | 0.69   | 20         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner-artifacts.ts`                             | 二档 | 否     | 0.46   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner-background.ts`                            | 二档 | 否     | 0.37   | 6          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner-cancellation.ts`                          | 二档 | 否     | 0.34   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner-child.ts`                                 | 二档 | 否     | 0.34   | 4          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner-foreground.ts`                            | 二档 | 否     | 0.31   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner-message.ts`                               | 一档 | 否     | 0.52   | 9          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner-publication.ts`                           | 二档 | 否     | 0.47   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner-state.ts`                                 | 二档 | 否     | 0.47   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner-stop.ts`                                  | 二档 | 否     | 0.33   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/04-first-formatted/runner.ts`                                       | 一档 | 否     | 0.74   | 29         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner-artifacts.ts`    | 二档 | 否     | 0.46   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner-background.ts`   | 二档 | 否     | 0.37   | 6          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner-cancellation.ts` | 二档 | 否     | 0.34   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner-child.ts`        | 二档 | 否     | 0.34   | 4          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner-foreground.ts`   | 二档 | 否     | 0.31   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner-message.ts`      | 一档 | 否     | 0.52   | 9          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner-publication.ts`  | 二档 | 否     | 0.47   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner-state.ts`        | 二档 | 否     | 0.47   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner-stop.ts`         | 二档 | 否     | 0.34   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/05-stop-notification-supplement-unformatted/runner.ts`              | 一档 | 否     | 0.74   | 29         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner-artifacts.ts`               | 二档 | 否     | 0.46   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner-background.ts`              | 二档 | 否     | 0.37   | 6          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner-cancellation.ts`            | 二档 | 否     | 0.34   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner-child.ts`                   | 二档 | 否     | 0.34   | 4          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner-foreground.ts`              | 二档 | 否     | 0.31   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner-message.ts`                 | 一档 | 否     | 0.52   | 9          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner-publication.ts`             | 二档 | 否     | 0.46   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner-state.ts`                   | 二档 | 否     | 0.49   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner-stop.ts`                    | 二档 | 否     | 0.34   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/06-final-native-gate-unformatted/runner.ts`                         | 一档 | 否     | 0.74   | 29         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner-artifacts.ts`                       | 二档 | 否     | 0.46   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner-background.ts`                      | 二档 | 否     | 0.37   | 6          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner-cancellation.ts`                    | 二档 | 否     | 0.34   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner-child.ts`                           | 二档 | 否     | 0.34   | 4          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner-foreground.ts`                      | 二档 | 否     | 0.31   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner-message.ts`                         | 一档 | 否     | 0.52   | 9          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner-publication.ts`                     | 二档 | 否     | 0.46   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner-state.ts`                           | 二档 | 否     | 0.49   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner-stop.ts`                            | 二档 | 否     | 0.33   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/07-native-gate-formatted/runner.ts`                                 | 一档 | 否     | 0.74   | 29         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner-artifacts.ts`                    | 二档 | 否     | 0.46   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner-background.ts`                   | 二档 | 否     | 0.37   | 6          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner-cancellation.ts`                 | 二档 | 否     | 0.34   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner-child.ts`                        | 二档 | 否     | 0.34   | 4          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner-foreground.ts`                   | 二档 | 否     | 0.31   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner-message.ts`                      | 一档 | 否     | 0.52   | 9          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner-publication.ts`                  | 二档 | 否     | 0.46   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner-state.ts`                        | 二档 | 否     | 0.49   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner-stop.ts`                         | 二档 | 否     | 0.33   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/08-final-launch-unformatted/runner.ts`                              | 一档 | 否     | 0.74   | 29         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner-artifacts.ts`                             | 二档 | 否     | 0.46   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner-background.ts`                            | 二档 | 否     | 0.37   | 6          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner-cancellation.ts`                          | 二档 | 否     | 0.34   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner-child.ts`                                 | 二档 | 否     | 0.34   | 4          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner-foreground.ts`                            | 二档 | 否     | 0.31   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner-message.ts`                               | 一档 | 否     | 0.52   | 9          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner-publication.ts`                           | 二档 | 否     | 0.46   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner-state.ts`                                 | 二档 | 否     | 0.49   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner-stop.ts`                                  | 二档 | 否     | 0.33   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/representations/09-final-formatted/runner.ts`                                       | 一档 | 否     | 0.74   | 29         |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner-artifacts.ts`                                                                | 二档 | 否     | 0.46   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner-background.ts`                                                               | 二档 | 否     | 0.37   | 6          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner-cancellation.ts`                                                             | 二档 | 否     | 0.34   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner-child.ts`                                                                    | 二档 | 否     | 0.34   | 4          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner-foreground.ts`                                                               | 二档 | 否     | 0.31   | 5          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner-message.ts`                                                                  | 一档 | 否     | 0.52   | 9          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner-publication.ts`                                                              | 二档 | 否     | 0.46   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner-state.ts`                                                                    | 二档 | 否     | 0.49   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner-stop.ts`                                                                     | 二档 | 否     | 0.33   | 7          |
| `docs/evidence/subagent-runner-author-20261003/draft-01/runner.ts`                                                                          | 一档 | 否     | 0.74   | 29         |
| `docs/evidence/subagent-runner-author-20261003/review-failures/runner-stop-type-only.ts`                                                    | 二档 | 否     | 0.33   | 7          |
| `docs/evidence/subagent-runner-author-20261003/supporting.d.ts`                                                                             | 一档 | 否     | 0.42   | 17         |
| `docs/evidence/todo-resume-author-20261003/draft-01/resume.ts`                                                                              | 一档 | 否     | 0.63   | 16         |
| `docs/evidence/todo-resume-author-20261003/draft-01/todo.ts`                                                                                | 一档 | 否     | 0.82   | 14         |
| `docs/evidence/todo-resume-author-20261003/resume/api.d.ts`                                                                                 | 二档 | 否     | 0.48   | 2          |
| `docs/evidence/todo-resume-author-20261003/review-copy/resume.ts`                                                                           | 一档 | 否     | 0.68   | 16         |
| `docs/evidence/todo-resume-author-20261003/review-copy/todo.ts`                                                                             | 一档 | 否     | 0.82   | 14         |
| `docs/evidence/turn-control-author-20261003/api.d.ts`                                                                                       | 二档 | 否     | 0.57   | 5          |
| `docs/evidence/turn-control-author-20261003/public-types.d.ts`                                                                              | 一档 | 否     | 0.98   | 33         |
| `docs/evidence/turn-control-draft-20261003/correction/turn-control.ts`                                                                      | 二档 | 否     | 0.58   | 4          |
| `docs/evidence/turn-control-draft-20261003/initial/core/src/tool/executor/turn-control.ts`                                                  | 二档 | 否     | 0.58   | 4          |
| `docs/evidence/turn-machine-author-20261003/api.d.ts`                                                                                       | 一档 | 否     | 0.85   | 11         |
| `docs/evidence/turn-machine-author-20261003/draft-01/candidate.ts`                                                                          | 一档 | 否     | 0.58   | 26         |
| `docs/evidence/turn-machine-author-20261003/state-api.d.ts`                                                                                 | 一档 | 否     | 0.86   | 51         |
| `docs/knorvia-appearance-acceptance-20260923.md`                                                                                            | 三档 | 是     | 0.00   | 0          |
| `docs/knorvia-backend-acceptance-20260923.md`                                                                                               | 三档 | 是     | 0.00   | 0          |
| `docs/knorvia-frontend-validation-20260922.md`                                                                                              | 三档 | 是     | 0.02   | 1          |
| `docs/knorvia-icon-provenance.md`                                                                                                           | 三档 | 是     | 0.13   | 1          |
| `docs/knorvia-mascot-design-20260922.md`                                                                                                    | 三档 | 是     | 0.13   | 1          |
| `docs/knorvia-plugin-license-audit.md`                                                                                                      | 三档 | 是     | 0.00   | 0          |
| `docs/knorvia-stage0-acceptance.md`                                                                                                         | 三档 | 是     | 0.00   | 0          |
| `docs/knorvia-task-registry-author-inputs-20261002/api.d.ts`                                                                                | 一档 | 否     | 0.87   | 24         |
| `docs/knorvia-task-registry-author-inputs-20261002/supporting-types.d.ts`                                                                   | 一档 | 否     | 0.40   | 26         |
| `docs/knorvia-workflow-scheduler-author-inputs-20261002/api.d.ts`                                                                           | 一档 | 否     | 0.85   | 54         |
| `docs/knorvia-workflow-scheduler-author-inputs-20261002/dependencies.d.ts`                                                                  | 一档 | 否     | 0.22   | 16         |
| `docs/knorvia-workflow-scheduler-author-inputs-20261002/supporting-types.d.ts`                                                              | 一档 | 否     | 0.09   | 9          |
| `docs/material-obligation-actions-20261003.json`                                                                                            | 一档 | 否     | 0.28   | 71         |
| `licensing/evidence/cli-browser-dependency-owners-20261003/scoped-lint-config.json`                                                         | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/cli-command-owner-20261003/scoped-lint-config.json`                                                                     | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/cli-config-behavior-owners-20261003/scoped-lint-config.json`                                                            | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/cli-managed-browser-owners-20261003/initial-scoped-lint-config.json`                                                    | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/cli-managed-browser-owners-20261003/scoped-lint-config.json`                                                            | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/cli-media-owners-20261003/scoped-lint-config.json`                                                                      | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/cli-skill-discovery-owners-20261003/scoped-lint-config.json`                                                            | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/desktop-browser-command-capture-owners-20261003/drafts/capture-correction-1.ts`                                         | 二档 | 否     | 0.27   | 6          |
| `licensing/evidence/desktop-browser-command-capture-owners-20261003/drafts/capture-initial.ts`                                              | 二档 | 否     | 0.29   | 6          |
| `licensing/evidence/desktop-browser-command-capture-owners-20261003/drafts/command-correction-1.ts`                                         | 二档 | 否     | 0.67   | 6          |
| `licensing/evidence/desktop-browser-command-capture-owners-20261003/drafts/command-initial.ts`                                              | 二档 | 否     | 0.67   | 6          |
| `licensing/evidence/desktop-browser-command-capture-owners-20261003/ports/view.d.ts`                                                        | 一档 | 否     | 0.83   | 9          |
| `licensing/evidence/desktop-command-owners-20261003/initial-retained-bindings.json`                                                         | 二档 | 否     | 0.31   | 1          |
| `licensing/evidence/desktop-command-owners-20261003/scoped-lint-config.json`                                                                | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/desktop-command-page-chain-owners-20261003/drafts/navigation-initial.ts`                                                | 二档 | 否     | 0.44   | 5          |
| `licensing/evidence/desktop-command-page-chain-owners-20261003/drafts/paste-correction-1.ts`                                                | 二档 | 否     | 0.51   | 4          |
| `licensing/evidence/desktop-command-page-chain-owners-20261003/drafts/paste-initial.ts`                                                     | 二档 | 否     | 0.48   | 4          |
| `licensing/evidence/desktop-command-page-chain-owners-20261003/drafts/retry-initial.ts`                                                     | 一档 | 否     | 0.54   | 11         |
| `licensing/evidence/desktop-command-page-chain-owners-20261003/ports/navigation.d.ts`                                                       | 二档 | 否     | 0.14   | 1          |
| `licensing/evidence/desktop-command-page-chain-owners-20261003/ports/retry.d.ts`                                                            | 二档 | 否     | 0.44   | 4          |
| `licensing/evidence/desktop-command-page-chain-owners-20261003/retry-input-freeze.json`                                                     | 二档 | 否     | 0.11   | 1          |
| `licensing/evidence/desktop-cron-claim-owner-20261003/drafts/cron-correction-1.ts`                                                          | 一档 | 否     | 0.64   | 12         |
| `licensing/evidence/desktop-cron-claim-owner-20261003/drafts/cron-initial.ts`                                                               | 一档 | 否     | 0.64   | 12         |
| `licensing/evidence/desktop-cron-claim-owner-20261003/ports/cron.d.ts`                                                                      | 一档 | 否     | 0.77   | 12         |
| `licensing/evidence/desktop-host-behavior-owners-20261003/final-retained-desktop-bindings.json`                                             | 二档 | 否     | 0.38   | 1          |
| `licensing/evidence/desktop-host-behavior-owners-20261003/initial-retained-desktop-bindings.json`                                           | 二档 | 否     | 0.38   | 1          |
| `licensing/evidence/desktop-host-behavior-owners-20261003/scoped-lint-config.json`                                                          | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/desktop-host-index-owner-20261003/final-retained-desktop-bindings.json`                                                 | 二档 | 否     | 0.38   | 1          |
| `licensing/evidence/desktop-host-index-owner-20261003/initial-retained-desktop-bindings.json`                                               | 二档 | 否     | 0.38   | 1          |
| `licensing/evidence/desktop-host-index-owner-20261003/scoped-lint-config.json`                                                              | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/desktop-host-resource-owners-20261003/final-retained-desktop-bindings.json`                                             | 二档 | 否     | 0.38   | 1          |
| `licensing/evidence/desktop-host-resource-owners-20261003/initial-retained-desktop-bindings.json`                                           | 二档 | 否     | 0.38   | 1          |
| `licensing/evidence/desktop-host-resource-owners-20261003/scoped-lint-config.json`                                                          | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/desktop-playwright-owners-20261003/scoped-lint-config.json`                                                             | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/desktop-preload-owners-20261003/scoped-lint-config.json`                                                                | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/desktop-recording-presentation-owners-20261003/drafts/bootstrap-initial.ts`                                             | 一档 | 否     | 0.86   | 14         |
| `licensing/evidence/desktop-recording-presentation-owners-20261003/drafts/video-initial.ts`                                                 | 一档 | 否     | 0.79   | 15         |
| `licensing/evidence/desktop-recording-presentation-owners-20261003/drafts/webm-correction-1.ts`                                             | 一档 | 否     | 0.39   | 8          |
| `licensing/evidence/desktop-recording-presentation-owners-20261003/drafts/webm-correction-2.ts`                                             | 一档 | 否     | 0.39   | 8          |
| `licensing/evidence/desktop-recording-presentation-owners-20261003/drafts/webm-correction-3.ts`                                             | 一档 | 否     | 0.40   | 8          |
| `licensing/evidence/desktop-recording-presentation-owners-20261003/drafts/webm-initial.ts`                                                  | 一档 | 否     | 0.38   | 8          |
| `licensing/evidence/desktop-recording-presentation-owners-20261003/live-message-validation-freeze.json`                                     | 二档 | 否     | 0.20   | 1          |
| `licensing/evidence/desktop-recording-presentation-owners-20261003/ports/bootstrap.d.ts`                                                    | 一档 | 否     | 0.93   | 15         |
| `licensing/evidence/desktop-recording-presentation-owners-20261003/ports/video.d.ts`                                                        | 一档 | 否     | 0.87   | 11         |
| `licensing/evidence/desktop-screenshot-owners-20261003/drafts/activity-correction-1.ts`                                                     | 一档 | 否     | 0.42   | 9          |
| `licensing/evidence/desktop-screenshot-owners-20261003/drafts/activity-initial.ts`                                                          | 一档 | 否     | 0.41   | 9          |
| `licensing/evidence/desktop-screenshot-owners-20261003/drafts/surface-correction-1.ts`                                                      | 一档 | 否     | 0.61   | 11         |
| `licensing/evidence/desktop-screenshot-owners-20261003/drafts/surface-initial.ts`                                                           | 一档 | 否     | 0.58   | 11         |
| `licensing/evidence/desktop-screenshot-owners-20261003/ports/bootstrap.d.ts`                                                                | 一档 | 否     | 0.93   | 15         |
| `licensing/evidence/desktop-screenshot-owners-20261003/ports/contracts.d.ts`                                                                | 一档 | 否     | 0.91   | 28         |
| `licensing/evidence/desktop-screenshot-owners-20261003/ports/retry.d.ts`                                                                    | 二档 | 否     | 0.17   | 1          |
| `licensing/evidence/desktop-screenshot-owners-20261003/ports/shared.d.ts`                                                                   | 一档 | 否     | 0.90   | 17         |
| `licensing/evidence/desktop-storage-sampler-preparation-owners-20261003/drafts/disk-initial.ts`                                             | 二档 | 否     | 0.49   | 7          |
| `licensing/evidence/desktop-storage-sampler-preparation-owners-20261003/drafts/preparation-correction-1.ts`                                 | 二档 | 否     | 0.41   | 5          |
| `licensing/evidence/desktop-storage-sampler-preparation-owners-20261003/drafts/preparation-initial.ts`                                      | 二档 | 否     | 0.42   | 5          |
| `licensing/evidence/desktop-storage-sampler-preparation-owners-20261003/ports/preparation.d.ts`                                             | 二档 | 否     | 0.54   | 3          |
| `licensing/evidence/desktop-tab-clipboard-owners-20261003/initial-retained-bindings.json`                                                   | 二档 | 否     | 0.31   | 1          |
| `licensing/evidence/desktop-tab-clipboard-owners-20261003/public-policy.d.ts`                                                               | 一档 | 否     | 0.93   | 27         |
| `licensing/evidence/desktop-tab-clipboard-owners-20261003/scoped-lint-config.json`                                                          | 一档 | 否     | 0.71   | 28         |
| `licensing/evidence/desktop-tab-eviction-owner-20261003/drafts/residency-initial.ts`                                                        | 一档 | 否     | 0.85   | 13         |
| `licensing/evidence/desktop-tab-eviction-owner-20261003/ports/residency.d.ts`                                                               | 一档 | 否     | 0.88   | 13         |
| `licensing/evidence/desktop-tab-eviction-owner-20261003/validation-inputs.json`                                                             | 二档 | 否     | 0.17   | 1          |
| `licensing/evidence/parallel-integration-20260930.json`                                                                                     | 一档 | 否     | 0.34   | 41         |
| `licensing/evidence/protocol-nine-file-independent-technical-receipt-20260930-services-6834.json`                                           | 一档 | 否     | 0.01   | 10         |
| `licensing/evidence/remote-deploy-lock-20261002/source-hashes.json`                                                                         | 二档 | 否     | 0.13   | 1          |
| `licensing/evidence/skia-integration-partition-20261002.json`                                                                               | 一档 | 否     | 0.02   | 8          |
| `licensing/evidence/third-party-reconciliation-20260930.json`                                                                               | 一档 | 否     | 0.03   | 18         |
| `licensing/evidence/workflow-projections-20260930.json`                                                                                     | 一档 | 否     | 0.11   | 18         |
| `licensing/MIT.txt`                                                                                                                         | 一档 | 否     | 0.94   | 15         |
| `specs/knorvia-agent-identity.md`                                                                                                           | 三档 | 是     | 0.00   | 0          |
| `specs/knorvia-agent-runtime-composition-20261003.md`                                                                                       | 二档 | 否     | 0.20   | 1          |
| `specs/knorvia-appearance-materials.md`                                                                                                     | 三档 | 是     | 0.03   | 1          |
| `specs/knorvia-backend.md`                                                                                                                  | 三档 | 是     | 0.04   | 1          |
| `specs/knorvia-background-data-owners-20261003.md`                                                                                          | 二档 | 否     | 0.25   | 1          |
| `specs/knorvia-bash-results-owners-20261003.md`                                                                                             | 二档 | 否     | 0.22   | 1          |
| `specs/knorvia-builtin-plugins.md`                                                                                                          | 三档 | 是     | 0.00   | 0          |
| `specs/knorvia-chat-metrics.md`                                                                                                             | 三档 | 是     | 0.03   | 1          |
| `specs/knorvia-clean-base.md`                                                                                                               | 三档 | 是     | 0.04   | 1          |
| `specs/knorvia-cli-expansion.md`                                                                                                            | 三档 | 是     | 0.08   | 1          |
| `specs/knorvia-core-inline-attachment-owner-integration-20261003.md`                                                                        | 二档 | 否     | 0.22   | 1          |
| `specs/knorvia-core-media-memory-reminder-owner-integration-20261003.md`                                                                    | 二档 | 否     | 0.20   | 1          |
| `specs/knorvia-core-plugin-reference-owner-integration-20261003.md`                                                                         | 二档 | 否     | 0.20   | 1          |
| `specs/knorvia-core-prompt-attachment-owner-integration-20261003.md`                                                                        | 二档 | 否     | 0.25   | 1          |
| `specs/knorvia-core-result-attachment-postcompact-owner-integration-20261003.md`                                                            | 二档 | 否     | 0.25   | 1          |
| `specs/knorvia-creation.md`                                                                                                                 | 三档 | 是     | 0.02   | 1          |
| `specs/knorvia-desktop-about-menu-root-handoff-20261003.md`                                                                                 | 二档 | 否     | 0.25   | 1          |
| `specs/knorvia-desktop-isolation.md`                                                                                                        | 三档 | 是     | 0.13   | 1          |
| `specs/knorvia-desktop-platform-host-root-packet-20261003.md`                                                                               | 二档 | 否     | 0.25   | 1          |
| `specs/knorvia-desktop-unsaved-exit.md`                                                                                                     | 三档 | 是     | 0.12   | 1          |
| `specs/knorvia-frontend-shell.md`                                                                                                           | 三档 | 是     | 0.03   | 1          |
| `specs/knorvia-identity-rename.md`                                                                                                          | 三档 | 是     | 0.00   | 0          |
| `specs/knorvia-mascot.md`                                                                                                                   | 三档 | 是     | 0.03   | 1          |
| `specs/knorvia-polish-20260923.md`                                                                                                          | 三档 | 是     | 0.04   | 1          |
| `specs/knorvia-polish-backend-second.md`                                                                                                    | 三档 | 是     | 0.00   | 0          |
| `specs/knorvia-polish-backend.md`                                                                                                           | 三档 | 是     | 0.08   | 1          |
| `specs/knorvia-polish-chat-pass2.md`                                                                                                        | 三档 | 是     | 0.11   | 1          |
| `specs/knorvia-polish-chat.md`                                                                                                              | 三档 | 是     | 0.11   | 1          |
| `specs/knorvia-polish-group-second-pass.md`                                                                                                 | 三档 | 是     | 0.15   | 1          |
| `specs/knorvia-polish-orchestration.md`                                                                                                     | 三档 | 是     | 0.06   | 1          |
| `specs/knorvia-polish-run-history.md`                                                                                                       | 三档 | 是     | 0.13   | 1          |
| `specs/knorvia-polish-settings.md`                                                                                                          | 三档 | 是     | 0.17   | 1          |
| `specs/knorvia-runtime-model-tools-20261003.md`                                                                                             | 二档 | 否     | 0.25   | 1          |
| `specs/knorvia-services-cleanup.md`                                                                                                         | 三档 | 是     | 0.09   | 1          |
| `specs/knorvia-shared-capabilities.md`                                                                                                      | 三档 | 是     | 0.10   | 1          |
| `specs/knorvia-ssh-agents.md`                                                                                                               | 三档 | 是     | 0.08   | 1          |
| `specs/knorvia-stage0.md`                                                                                                                   | 三档 | 是     | 0.00   | 0          |
| `specs/knorvia-steering-subagent-methods-20261003.md`                                                                                       | 二档 | 否     | 0.22   | 1          |
| `specs/knorvia-todo-resume-owners-20261003.md`                                                                                              | 二档 | 否     | 0.22   | 1          |
| `specs/knorvia-turn-machine-owner-20261003.md`                                                                                              | 二档 | 否     | 0.22   | 1          |
| `specs/knorvia-ui-cleanup.md`                                                                                                               | 三档 | 是     | 0.10   | 1          |
| `specs/knorvia-visual-language.md`                                                                                                          | 三档 | 是     | 0.00   | 0          |
| `specs/knorvia-workflow-run-activity-simplification.md`                                                                                     | 二档 | 否     | 0.22   | 1          |
| `third-party/ui/lobe-icons-LICENSE.txt`                                                                                                     | 一档 | 否     | 0.94   | 15         |
| `third-party/upstream/02421fcfbfb1d656ef0b6ff4cd3c39f2946f08c3219fa42db482add7ce1f53ea.txt`                                                 | 一档 | 否     | 0.77   | 17         |
| `third-party/upstream/0d33f8c63be2bd52f40ab4754f0312fa5a510d4a01bd76869254d3b210850d9d.txt`                                                 | 二档 | 否     | 0.30   | 1          |
| `third-party/upstream/12dffc8d88e81ef2fda9bb2142599751cced9564ec87cea683538980b1c42d75.txt`                                                 | 二档 | 否     | 0.35   | 5          |
| `third-party/upstream/1f7dca26d2d328c3dbb9b6fe3b15ec3cda08ffe2288e47b73d617454b256f959.txt`                                                 | 一档 | 否     | 0.89   | 15         |
| `third-party/upstream/23c23145f6eac25c28cdcc03d38506a5712a9a8cffb5bd5301457f6173ea696e.txt`                                                 | 一档 | 否     | 0.95   | 21         |
| `third-party/upstream/368cca1106be99d39ecd32a38d8305585d802a475effb66380b91ffc9bcf709b.txt`                                                 | 一档 | 否     | 0.93   | 14         |
| `third-party/upstream/5285d96f6aa3188193d5fbefd8710ed6a46af185e0a43817c17acee5f4b1ab3d.txt`                                                 | 二档 | 否     | 0.22   | 1          |
| `third-party/upstream/55b223e3f0fdcf0c262d3ff37aeb32ba063d300e53b97d56057bd3a34c8ae989.txt`                                                 | 二档 | 否     | 0.33   | 1          |
| `third-party/upstream/6787208f83f659ccbc2223b2fde952ffa6f7e8aca62f1a8a2bf5bc51bb1b2383.txt`                                                 | 一档 | 否     | 0.94   | 15         |
| `third-party/upstream/866e6fa48cb8810d36d8d85a3085d7aa1c4317d3731f0ef84919428fee87bf71.txt`                                                 | 一档 | 否     | 0.82   | 12         |
| `third-party/upstream/a76c3d70aed9b52b78196199da23e207ae6a01513ade15f40cfffe172b74b345.txt`                                                 | 二档 | 否     | 0.20   | 1          |
| `third-party/upstream/aca9c8fbe556e770221641d454905105c1c9ab7dac5491ceafa9793323ed72a4.txt`                                                 | 二档 | 否     | 0.33   | 1          |
| `third-party/upstream/b6d3d72e3ecc9d33d5de6d6547f68c577c203d623585adb6455d20216cced592.txt`                                                 | 二档 | 否     | 0.29   | 1          |
| `third-party/upstream/ca7047566630aa93a701f06df3817e2b7cfd7f12807281b2e09013b8f9132c70.txt`                                                 | 二档 | 否     | 0.17   | 1          |
| `third-party/upstream/cb95728cc2b4a3502bb8e69c019e0e5f01c0a218a855168e9c19d4df51582cd5.txt`                                                 | 二档 | 否     | 0.27   | 1          |
| `third-party/upstream/cdb6b2a4e60de61211f8759676ea2251ed3a42d0d3d7b4e83eaccf4af1c15472.txt`                                                 | 二档 | 否     | 0.32   | 3          |
| `third-party/upstream/df694330c5856149838d49b822ec23986329fd8413bde5e816874f0ee04d1c56.txt`                                                 | 一档 | 否     | 0.77   | 17         |
| `third-party/upstream/dfe146342f94e1595214e12a377ff40d383db36dadbc09b8cc071ef354114dc3.txt`                                                 | 二档 | 否     | 0.33   | 1          |
| `third-party/upstream/e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96.txt`                                                 | 一档 | 否     | 0.97   | 29         |

## 5. 其他

| 文件                                                                    | 档位 | 首快照 | 包含率 | 最长相同段 | 最相似上游路径                                                                    |
| ----------------------------------------------------------------------- | ---- | ------ | ------ | ---------- | --------------------------------------------------------------------------------- |
| `.agents/skills/feature-boundary-planner/references/feature-graph.yaml` | 一档 | 是     | 0.96   | 138        | `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml`     |
| `.github/workflows/studio-offline.yml`                                  | 三档 | 是     | 0.00   | 0          | —                                                                                 |
| `config/provider/builtin.json`                                          | 一档 | 是     | 1.00   | 200        | `config/provider/zcode-builtin.json`                                              |
| `examples/plugins/document-quality-check/.knorvia-plugin/plugin.json`   | 二档 | 否     | 0.14   | 1          | `apps/zcode-cli/packages/adapters/package.json`                                   |
| `examples/plugins/document-quality-check/LICENSE.txt`                   | 一档 | 否     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                   |
| `examples/plugins/material-organizer/.knorvia-plugin/plugin.json`       | 二档 | 否     | 0.14   | 1          | `apps/zcode-cli/packages/adapters/package.json`                                   |
| `examples/plugins/material-organizer/LICENSE.txt`                       | 一档 | 否     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                   |
| `examples/plugins/project-brief/.knorvia-plugin/plugin.json`            | 二档 | 否     | 0.14   | 1          | `apps/zcode-cli/packages/adapters/package.json`                                   |
| `examples/plugins/project-handoff/.knorvia-plugin/plugin.json`          | 二档 | 否     | 0.14   | 1          | `apps/zcode-cli/packages/adapters/package.json`                                   |
| `examples/plugins/project-handoff/LICENSE.txt`                          | 一档 | 否     | 0.94   | 15         | `scripts/license-texts/MIT.txt`                                                   |
| `FORK-NOTES.md`                                                         | 三档 | 是     | 0.00   | 0          | —                                                                                 |
| `scripts/build.mjs`                                                     | 一档 | 是     | 0.85   | 51         | `scripts/build-zcode.mjs`                                                         |
| `scripts/check-i18n-parity.mjs`                                         | 二档 | 否     | 0.32   | 2          | `scripts/package-native-search-tools.mjs`                                         |
| `scripts/dev/stdio-tap.mjs`                                             | 一档 | 是     | 0.97   | 97         | `scripts/dev/zcode-stdio-tap.mjs`                                                 |
| `scripts/distribution-smoke.mjs`                                        | 一档 | 是     | 0.92   | 74         | `scripts/zcode-distribution-smoke.mjs`                                            |
| `scripts/distribution/assets.mjs`                                       | 一档 | 是     | 0.97   | 80         | `scripts/zcode-distribution/assets.mjs`                                           |
| `scripts/distribution/installer.mjs`                                    | 一档 | 是     | 0.78   | 23         | `scripts/zcode-distribution/installer.mjs`                                        |
| `scripts/distribution/runner.mjs`                                       | 一档 | 是     | 0.94   | 114        | `scripts/zcode-distribution/runner.mjs`                                           |
| `scripts/knorvia-agent-base.test.ts`                                    | 三档 | 是     | 0.09   | 1          | `packages/services/test/providerConfigMigration.test.ts`                          |
| `scripts/office-plugin-assets.test.py`                                  | 三档 | 是     | 0.00   | 0          | —                                                                                 |
| `scripts/preview-knorvia-mascot.mjs`                                    | 三档 | 是     | 0.07   | 2          | `packages/formal-proof/src/main.ts`                                               |
| `scripts/release-immutability.mjs`                                      | 二档 | 否     | 0.20   | 2          | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts` |
| `scripts/test-studio.mjs`                                               | 三档 | 是     | 0.05   | 2          | `apps/zcode-cli/packages/cli/scripts/build-sea.mjs`                               |

## 6. 未覆盖与后续

- 本表只覆盖 `unreviewed` 分类；`upstream-modified`、`upstream-unchanged` 已在分类里体现派生关系，按各自的处理路径走。
- M0-1 第二轮（issue #65）会把其中 `docs/`、`licensing/evidence/`、`specs/` 的一批登记为 original；该分支合并后本表的登记与证据部分的数量会变，判定方法不变。
- 一档里包含率 1.00、最长相同段达到比较上限（200 行）的文件是重命名目录造成的近似逐字保留（例如 `apps/zcode-cli` → `apps/cli`、`zcode-protocol-v4` → `protocol-v4`、`packages/zcode-server-cli` → `packages/server-cli`）。这些文件不是「改过」，而是改写范围里最难的部分，领包时必须按合同重写，不能靠改名交付。
- 分诊不改变任何分类与登记：本 PR 只新增本表与重新生成的 `licensing/current-files.json`。
