# shared-03 接口面（interface.md）

本文件列出 34 个模块路径的**兼容所需**信息：模块路径、公开入口、导出面来源。
它是相似度声明模式（`--declaration --interface <本文件>`）的剔除依据，也是替换阶段
「导出集合与附录一致」脚本比对的口径。逐文件完整导出清单（机器生成）见
[`interface-appendix.md`](interface-appendix.md) / [`interface-appendix.json`](interface-appendix.json)。

## 1. 公开入口（实测口径）

`packages/shared/package.json` 的 `exports` 映射是正式入口面；34 件按入口分四类：

| 入口类                       | 文件                                                                                                                                                                                                                             | 说明                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 根 barrel `@knorvia/shared`  | 22 件                                                                                                                                                                                                                            | `index.ts` `export *` / 具名再导出可达                                                                                             |
| 子路径 `@knorvia/shared/<x>` | `runtime-tool-runtime`、`process-diagnostic`、`workspaceFileSearch`、`workspaceFileEntriesCodec`、`workspace-hook-discovery`、`workspace-hook-mutation`、`workspace-hook-review-monotonicity`、`workspace-hook-trust-store-file` | `exports` 映射直接给出；其中 `workspace-hook-discovery` 星再导出 config+digest → **workspace-hook-config/digest 的公开面即此入口** |
| 协议桶再导出                 | `background-bash-output`、`execution-output-preview`                                                                                                                                                                             | 经 `@knorvia/shared/protocol`、`/protocol-v4` 两桶 `export *` 可达（wire 契约面）                                                  |
| 无独立入口（模块路径兼容面） | `subagent-state-migration`                                                                                                                                                                                                       | 仅 `packages/shared/src/node/**` 内部消费；路径与导出面仍按 B51 守                                                                 |

**注意（实测修正）**：`packages/ui`、`packages/services` 下存在同名 `workspaceFileSearch.ts` shim
（`export * from "@knorvia/shared/workspaceFileSearch"` 等）——真实消费经子路径入口，不是相对直引。

## 2. 模块路径面（34 个）

`packages/shared/src/<相对路径>.ts` 与 `dist/<相对路径>.js` 两侧替换后必须仍然存在
（B 条目口径同 shared-02 B51；内部怎么拆由替换 Agent 定，路径上的导出面必须保持）。

| 组                                  | 文件                                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workspace-hook                      | `workspace-hook-config.ts`、`workspace-hook-digest.ts`、`workspace-hook-discovery.ts`、`workspace-hook-mutation.ts`、`workspace-hook-review-monotonicity.ts`、`workspace-hook-trust-store-file.ts`                     |
| background-task                     | `background-task-controls.ts`、`background-task-notifications.ts`、`background-task-control-merge.ts`、`background-bash-jobs.ts`、`background-bash-output.ts`、`bash-output-display.ts`                                |
| conversation/assistant              | `conversation-message-projection-policy.ts`、`conversation-preview-artifacts.ts`、`conversation-share.ts`、`assistant-message-parts.ts`、`assistant-presentation.ts`                                                   |
| workspaceFile                       | `workspaceFileEntriesCodec.ts`、`workspaceFileSearch.ts`、`workspaceSessionRestore.ts`                                                                                                                                 |
| tool/execution                      | `tool-call-summary.ts`、`tool-identity.ts`、`tool-plan-adapter.ts`、`streaming-tool-input-preview.ts`、`execution-output-preview.ts`、`execution-state.ts`、`permission-request-preview.ts`、`runtime-tool-runtime.ts` |
| process/subagent/task-realtime-core | `process-diagnostic.ts`、`process-names.ts`、`processResourceTelemetry.ts`、`subagent-markdown-selection.ts`、`subagent-state-migration.ts`、`task-realtime-core.ts`                                                   |

## 3. 导出面规则

1. **名字集合不变**：每模块导出名（运行时 + 纯类型）与 `interface-appendix.json` 逐名一致；
   替换阶段用脚本比对，不靠目测。总量：**运行时 195 项 / 纯类型 90 项**。
2. **运行时值取值不变**：`behavior.md` B 条目「语义常量（逐字冻结）」清单 + 金样（fixtures）双重锁定。
3. **签名不变**：参数顺序、返回类型、抛错语义不变（behavior 单列的除外）。
4. **纯类型 90 项**：靠 `pnpm typecheck` 与本附录守住；替换后类型面必须仍可编译出同样消费方式。
5. **具名/星再导出**：`conversation-preview-artifacts` 再导出 `conversationArtifactTypeSchema`；
   `workspace-hook-discovery` 星再导出 config+digest —— 再导出路径与名字同样是兼容面。
6. 声明模式相似度：以上名字（含再导出）即剔除清单；剔除后残留按行/结构两道门槛计分。

## 4. 不在本包的相邻面

`index.ts` 根 barrel（shared-04 末包）；`node/`、`protocol-v4/`（shared-01）；shared-02 的 58 件；
`browser-use/`、`endpoint.ts`、`mcp.ts`、`oauth.ts`、`protocol/**` 等其余（shared-04 或已独立）；
`unreviewed` 51 件（M0-2/M0-3 口径，不入本包）。
