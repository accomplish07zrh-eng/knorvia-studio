# shared-04 调用方（callers.md）

静态 import 扫描口径（2026-10-19）：全仓 `(?:import|export) … from "…"`，包含
类型导入、再导出、根 barrel 具名导入、`@knorvia/shared/<子路径>` 与相对直引；
池内 44 件共 **550 处 / undefined 个文件**（`docs/evidence` 不计），
与 `pnpm dep:refs --list-exports` 抽样一致。

## 1. 逐模块统计

| 模块                           | 次数 | 文件 | 入口                                               |
| ------------------------------ | ---- | ---- | -------------------------------------------------- |
| `mcp.ts`                       | 101  | 51   | `@knorvia/shared`、`@knorvia/shared/mcp`、相对直引 |
| `database-startup.ts`          | 51   | 23   | `@knorvia/shared`、相对直引                        |
| `localTtft.ts`                 | 42   | 17   | `@knorvia/shared`、相对直引                        |
| `node.ts`                      | 37   | 37   | `@knorvia/shared/node`                             |
| `rendererActionTrace.ts`       | 29   | 11   | `@knorvia/shared`、相对直引                        |
| `memoryDiagnostics.ts`         | 27   | 8    | `@knorvia/shared`、相对直引                        |
| `remote-workspace-identity.ts` | 18   | 16   | `@knorvia/shared`、相对直引                        |
| `official-mcp-auth.ts`         | 16   | 11   | `@knorvia/shared`、相对直引                        |
| `plugin-marketplaces.ts`       | 15   | 13   | `@knorvia/shared`、相对直引                        |
| `intranetProbe.ts`             | 14   | 5    | `@knorvia/shared`、相对直引                        |
| `skill-scan-policy.ts`         | 14   | 6    | `@knorvia/shared`、相对直引                        |
| `update.ts`                    | 13   | 4    | `@knorvia/shared`、相对直引                        |
| `launchMarks.ts`               | 12   | 6    | `@knorvia/shared`、相对直引                        |
| `model-config.ts`              | 11   | 10   | `@knorvia/shared/model-config`、相对直引           |
| `session-debug.ts`             | 11   | 8    | `@knorvia/shared`、相对直引                        |
| `plugin-display-name.ts`       | 10   | 5    | `@knorvia/shared`、相对直引                        |
| `remoteUsageTelemetry.ts`      | 10   | 6    | `@knorvia/shared`、相对直引                        |
| `sessionCreateTelemetry.ts`    | 10   | 9    | `@knorvia/shared`、相对直引                        |
| `onboardingRecord.ts`          | 9    | 4    | `@knorvia/shared`、相对直引                        |
| `desktopMenu.ts`               | 8    | 5    | `@knorvia/shared`、相对直引                        |
| `oauth.ts`                     | 8    | 4    | `@knorvia/shared`、相对直引                        |
| `server-remote.ts`             | 8    | 6    | `@knorvia/shared`、相对直引                        |
| `wslUserValidation.ts`         | 8    | 5    | `@knorvia/shared`、相对直引                        |
| `pluginStoreOrdering.ts`       | 7    | 5    | `@knorvia/shared`、相对直引                        |
| `lineChangeStat.ts`            | 6    | 6    | `@knorvia/shared`、相对直引                        |
| `markdown-artifact-images.ts`  | 6    | 5    | `@knorvia/shared`、相对直引                        |
| `pluginStoreOrder.ts`          | 6    | 5    | `@knorvia/shared`、相对直引                        |
| `serviceAuthority.ts`          | 6    | 6    | `@knorvia/shared`、相对直引                        |
| `app-runtime-preferences.ts`   | 5    | 4    | `@knorvia/shared`、相对直引                        |
| `dynamic-workflow-feature.ts`  | 5    | 4    | `@knorvia/shared`、相对直引                        |
| `official-mcp-tool-error.ts`   | 5    | 5    | `@knorvia/shared`、相对直引                        |
| `remote-sync.ts`               | 5    | 5    | `@knorvia/shared`、相对直引                        |
| `remoteAppConfig.ts`           | 3    | 2    | 相对直引                                           |
| `e2e-test-bridge.ts`           | 2    | 2    | `@knorvia/shared`、相对直引                        |
| `feedbackPrivacy.ts`           | 2    | 2    | `@knorvia/shared`、相对直引                        |
| `model-execution.ts`           | 2    | 2    | 相对直引                                           |
| `clientConfig.ts`              | 1    | 1    | 相对直引                                           |
| `endpointHostname.ts`          | 1    | 1    | 相对直引                                           |
| `feedback.ts`                  | 1    | 1    | 相对直引                                           |
| `helpAppConfig.ts`             | 1    | 1    | 相对直引                                           |
| `intranetDefaults.ts`          | 1    | 1    | 相对直引                                           |
| `openrouter-attribution.ts`    | 1    | 1    | 相对直引                                           |
| `plan-identity.ts`             | 1    | 1    | 相对直引                                           |
| `provider-provisioning.ts`     | 1    | 1    | 相对直引                                           |

## 2. 重消费方

| 消费方                                | 典型引用                                                                                                                                                                               | 说明                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `packages/shared/src/index.ts`        | 38 件的运行时导出                                                                                                                                                                      | 根桶，本包末批单独处理   |
| `apps/cli`（adapters/bootstrap/core） | `mcp`（MCP 传输/官方插件/计算机使用策略）、`database-startup`（会话库迁移错误）、`localTtft`（协议 v4 跟踪）、`node`（37 处文件/路径/锁）、`official-mcp-auth`（连接与 OAuth 租约）    | 运行时签名敏感           |
| `packages/desktop`                    | `database-startup`（Host 启动协调）、`rendererActionTrace`（主进程 broker/rollout）、`localTtft`（导出与 span）、`remote-workspace-identity`（远控会话）                               | 跨进程 wire 字段         |
| `packages/services`                   | `remote-workspace-identity`（agent/session/task-index）、`memoryDiagnostics`（服务层采样）、`plugin-marketplaces`（命令/技能/子代理发现）、`intranetProbe`（系统探测契约）             | 服务层状态所有者         |
| `packages/ui`                         | `plugin-marketplaces`（商店/提及/能力投影）、`rendererActionTrace`（用户动作遥测）、`intranetProbe`（useSystemService）                                                                | 只经 hook/服务           |
| `packages/shared/src/*` 包内          | `remoteUsageTelemetry → remote-workspace-identity`、`helpAppConfig → remoteAppConfig`、`clientConfig → pluginStoreOrder`、`pluginStoreOrdering → plugin-marketplaces/pluginStoreOrder` | 5 条内部边，拆包不拆语义 |

## 3. 结论

- 44 件全部有真实消费方或经根桶/子路径可达，无「零调用」模块；
- 替换阶段必须逐条核对导出仍可用（`surface.test.mjs` B27 逐名断言 + 金样）；
- `node.ts` 的 37 处消费全部走 `@knorvia/shared/node`，不得改成相对直引；
- `model-config` 的 11 处消费全部走 `@knorvia/shared/model-config`，根桶不可达是既有兼容面。
