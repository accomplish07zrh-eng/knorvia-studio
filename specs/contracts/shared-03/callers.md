# shared-03 调用方（callers.md）

静态 import 扫描口径（2026-10-15，`import … from "…/<模块>.js"` 全仓 ripgrep）：
34 件范围内共 **73 处 import**。扫描结果与 `pnpm dep:refs --list-exports` 抽样一致。

## 1. 重消费方（按工作区）

| 消费方 | 典型引用 | 说明 |
| --- | --- | --- |
| `apps/cli/packages/core/src/runtime/**` | `execution-state`（8 处：methods/config、turn-model、turn-guide-drain、session-fork-*、events-session、session-mode-port、permission-full-access） | 运行时执行状态读写，**签名敏感** |
| `packages/ui`（经子路径入口） | `@knorvia/shared/workspaceFileEntriesCodec`（useWorkspaceFileSearchIndex、workspaceFileSearchFilterBackend、worker、fetchWorkspaceFileEntries、CommandCenterDialog）、`@knorvia/shared/workspaceFileSearch`（fileMentionProvider 的 DISPLAY_CAP、`workspace-file-search/workspaceFileSearch.ts` 为 `export *` shim） | UI 文件树/搜索消费 |
| `packages/services`（经子路径入口） | `@knorvia/shared/workspaceFileEntriesCodec`（fileServiceIndex 的 pack、file/workspaceFileSearch.ts 的 unpack）、`@knorvia/shared/workspaceFileSearch`（fileService 的 DISPLAY_CAP、同目录 shim） | Host 文件服务 |
| `packages/shared/src/protocol/index.ts`、`protocol-v4/index.ts` | `bash-output-display`、`background-bash-output`、`execution-output-preview`、`process-diagnostic` 再导出 | **协议面**（B30/B17/B18/B37 的 schema 是 wire 契约） |
| `packages/shared/src/index.ts` | 22 件经根 barrel 再导出 | 根桶（shared-04）依赖本包导出面 |
| `packages/shared/src/*`（包内） | workspace-hook 组内部 5 边、background-task 组 2 边、assistant 1 边、subagent 1 边、task-realtime-core ← validation、tool-projection-memory ← streaming-tool-input-preview、task-types-core ← background-task-controls、session-visible-content ← conversation-message-projection-policy | 包内依赖（拆包不拆语义） |
| `packages/shared/src/node/subagentMarkdownMigration.ts` | `subagent-markdown-selection`、`subagent-state-migration` | shared-01 存活面消费本包 |
| `docs/evidence/**` | `execution-state`（5 处） | 证据副本，**非真实调用方**（replace/合同断言不统计） |

**实测修正（2026-10-15）**：首轮扫描的「73 处 import」把 ui/services 下的**同名 shim**
（`workspace-file-search/workspaceFileSearch.ts`、`file/workspaceFileSearch.ts`，均为 `export *`/转引）
与真实相对直引混算；真实消费一律经 `@knorvia/shared/<子路径>` 入口或根 barrel。

## 2. 结论

- 无「零调用」模块（34 件全部有真实消费方或经协议桶/根桶可达）；
- `docs/evidence/**` 的 5 处按证据副本剔除后，真实调用面 = **68 处**；
- 替换阶段必须逐条核对导出仍然可用（B49/B50/B51 断言 + UI 包另有 M5 截图门槛）。
