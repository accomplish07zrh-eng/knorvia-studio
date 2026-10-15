# shared-03 调用方（callers.md）

静态 import 扫描口径（2026-10-15，`import … from "…/<模块>.js"` 全仓 ripgrep）：
34 件范围内共 **73 处 import**。扫描结果与 `pnpm dep:refs --list-exports` 抽样一致。

## 1. 重消费方（按工作区）

| 消费方 | 典型引用 | 说明 |
| --- | --- | --- |
| `apps/cli/packages/core/src/runtime/**` | `execution-state`（8 处：methods/config、turn-model、turn-guide-drain、session-fork-*、events-session、session-mode-port、permission-full-access） | 运行时执行状态读写，**签名敏感** |
| `packages/ui/src/workspace-file-search/**` | `workspaceFileSearch`（filter backend、worker） | worker 线程消费打分函数 |
| `packages/services/src/file/**` | `workspaceFileSearch`（fileService、fileServiceIndex） | Host 文件搜索候选 |
| `packages/shared/src/protocol/index.ts`、`protocol-v4/index.ts` | `bash-output-display`、`background-bash-output`、`execution-output-preview`、`process-diagnostic` 再导出 | **协议面**（B30/B17/B18/B37 的 schema 是 wire 契约） |
| `packages/shared/src/index.ts` | 34 件全部经 barrel 再导出（34+ 行 `export *`） | 根桶（shared-04）依赖本包导出面 |
| `packages/shared/src/*`（包内） | workspace-hook 组内部 5 边、background-task 组 2 边、assistant 1 边、subagent 1 边、task-realtime-core ← validation、tool-projection-memory ← streaming-tool-input-preview、task-types-core ← background-task-controls、session-visible-content ← conversation-message-projection-policy | 包内依赖（拆包不拆语义） |
| `packages/shared/src/node/subagentMarkdownMigration.ts` | `subagent-markdown-selection`、`subagent-state-migration` | shared-01 存活面消费本包 |
| `docs/evidence/**` | `execution-state`（5 处） | 证据副本，**非真实调用方**（replace/合同断言不统计） |

## 2. 结论

- 无「零调用」模块（34 件全部有真实消费方或经协议桶/根桶可达）；
- `docs/evidence/**` 的 5 处按证据副本剔除后，真实调用面 = **68 处**；
- 替换阶段必须逐条核对导出仍然可用（B49/B50/B51 断言 + UI 包另有 M5 截图门槛）。
