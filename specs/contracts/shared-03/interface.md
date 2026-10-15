# shared-03 接口面（interface.md）

本文件列出 34 个模块路径的**兼容所需**信息：模块路径、公开入口、导出面来源。
它是相似度声明模式（`--declaration --interface <本文件>`）的剔除依据，也是替换阶段
「导出集合与附录一致」脚本比对的口径。逐文件完整导出清单（机器生成）见
[`interface-appendix.md`](interface-appendix.md) / [`interface-appendix.json`](interface-appendix.json)。

## 1. 公开入口

本包 34 件全部经根 barrel `@knorvia/shared`（`index.ts`，**不在本包**，归 shared-04 末包）可达；
另有两条既有子路径间接面：

| 入口 | 说明 |
| --- | --- |
| `@knorvia/shared`（根 barrel） | 34 件的运行时导出全部 `export *` 或具名再导出可达（B 条目口径） |
| `@knorvia/shared/protocol`、`/protocol-v4` | `bash-output-display`、`background-bash-output`、`execution-output-preview`、`process-diagnostic` 经这两桶再导出（协议面） |
| 模块路径直引 | `packages/services`、`packages/ui`、`apps/cli` 存在相对/别名直引（见 callers.md） |

## 2. 模块路径面（34 个）

`packages/shared/src/<相对路径>.ts` 与 `dist/<相对路径>.js` 两侧替换后必须仍然存在
（B 条目口径同 shared-02 B51；内部怎么拆由替换 Agent 定，路径上的导出面必须保持）。

| 组 | 文件 |
| --- | --- |
| workspace-hook | `workspace-hook-config.ts`、`workspace-hook-digest.ts`、`workspace-hook-discovery.ts`、`workspace-hook-mutation.ts`、`workspace-hook-review-monotonicity.ts`、`workspace-hook-trust-store-file.ts` |
| background-task | `background-task-controls.ts`、`background-task-notifications.ts`、`background-task-control-merge.ts`、`background-bash-jobs.ts`、`background-bash-output.ts`、`bash-output-display.ts` |
| conversation/assistant | `conversation-message-projection-policy.ts`、`conversation-preview-artifacts.ts`、`conversation-share.ts`、`assistant-message-parts.ts`、`assistant-presentation.ts` |
| workspaceFile | `workspaceFileEntriesCodec.ts`、`workspaceFileSearch.ts`、`workspaceSessionRestore.ts` |
| tool/execution | `tool-call-summary.ts`、`tool-identity.ts`、`tool-plan-adapter.ts`、`streaming-tool-input-preview.ts`、`execution-output-preview.ts`、`execution-state.ts`、`permission-request-preview.ts`、`runtime-tool-runtime.ts` |
| process/subagent/task-realtime-core | `process-diagnostic.ts`、`process-names.ts`、`processResourceTelemetry.ts`、`subagent-markdown-selection.ts`、`subagent-state-migration.ts`、`task-realtime-core.ts` |

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
