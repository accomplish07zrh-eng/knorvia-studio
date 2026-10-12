# contracts-02 验收记录（acceptance.md）

## 1. 范围与文件数（`lead/scope-report.mjs` 实测）

| 目录                                       | 全部文件 | 继承   | 分类                                                                     |
| ------------------------------------------ | -------- | ------ | ------------------------------------------------------------------------ |
| `apps/cli/packages/contracts/src/tools`    | 46       | 44     | upstream-unchanged 24 / upstream-modified 20 / independent-replacement 2 |
| `apps/cli/packages/contracts/src/tracing`  | 4        | 4      | upstream-modified 2 / unreviewed 2                                       |
| `apps/cli/packages/contracts/src/workflow` | 7        | 7      | unreviewed 5 / upstream-modified 1 / upstream-unchanged 1                |
| `apps/cli/packages/contracts/src/rewind`   | 1        | 1      | upstream-unchanged 1                                                     |
| **合计**                                   | 58       | **56** | ≤60 ✓                                                                    |

`interface.md` 覆盖全部 56 个文件、1602 个导出条目。

## 2. 旧门（`scripts/contract-gate.mjs`，PR #121 提供）

命令（仓库根，Node 24）：

```bash
node scripts/contract-gate.mjs --contract specs/contracts/contracts-02 --tests "*.test.mjs" \
  --dist-env KNORVIA_CONTRACTS_ENTRY=dist \
  --stub-root specs/contracts/contracts-02/stubs \
  --stub-map specs/contracts/contracts-02/stubs/targets.txt
```

| 入口                                         | tests | pass  | fail   | 结论                                    |
| -------------------------------------------- | ----- | ----- | ------ | --------------------------------------- |
| 源码（`src`，`--import tsx`）                | 11    | 11    | 0      | 通过                                    |
| dist（`dist`，先 `pnpm build:cli-packages`） | 11    | 11    | 0      | 通过                                    |
| 桩替换（6 个模块路径）                       | 11    | **0** | **11** | 契约测试全部失败 → 测试确实测到公开行为 |

完整报告见 `gate-old.json`（含每个入口的输出尾部与桩替换结果）。

说明：`pnpm build:cli-packages` 在本机因 `@knorvia/cua-plugin` 构建需要联网拉取官方驱动而失败（`fetch failed` / TLS 中断），但 `@knorvia/contracts` 的 `tsc` 构建已完成；dist 入口验证用的是该次构建产物（`dist/tools/target.js` 已不含被删除的 `Target*` 别名）。

## 3. 门禁（本机，Node 24.14.0 + pnpm 10.33.2）

| 检查                                               | 结果         |
| -------------------------------------------------- | ------------ |
| `pnpm --dir apps/cli/packages/contracts typecheck` | 0            |
| `pnpm typecheck`                                   | 0            |
| `pnpm lint`                                        | 0（0 error） |
| `pnpm fmt:check`                                   | 0            |
| `pnpm provenance:report` / `pnpm provenance:check` | 0 / 0        |
| `pnpm architecture:check`                          | 0            |

## 4. 合同前单独提交

- `edc59645`：删除 `tools/target.ts` 末尾 26 个 `Target*` 兼容别名（knip 未使用导出 + 全仓 rg 每个名字 0 处文件外引用），401 → 370 行。`workflow/definition.ts`、`workflow/run-schema.ts` 的 `Expert*` 别名虽被 knip 报未使用，但 `apps/cli/packages/core/test/workflow-graph-boundary.test.ts` 明确断言其与 canonical 名相等 → 保留。

## 5. 未覆盖项（替换阶段需自查）

- 各工具文件（`tools/bash.ts`、`tools/glob.ts`、`tools/grep.ts`、`tools/edit.ts`、`tools/read.ts` 等）的输入/输出 schema：合同只断言导出面（B1）与少数关键 schema（B4/B6/B8），其余 schema 的逐键解析未逐条断言 → 替换阶段按「接受/拒绝集合不放宽」自查，并在替换 PR 中列出。
- `tools/tool-result-metadata.ts`、`tools/workflow-observation-display.ts` 的投影函数（各 8–10 个运行时导出）：合同只断言导出面；替换阶段需保持投影字段名与限长常量。
- `workflow/script.ts`、`workflow/scheduler-state.ts` 的常量与 schema：同上。
- `rewind` 的 `evaluateRewindTarget` 在「covered_by_compact」「file_only」「fork_required」分支与 `checkpointCreatedPayloadSchema`/`workspaceCheckpointArtifactSchema` 的完整矩阵：合同断言了主路径与非法 payload，未穷举全部分支。

## 6. 与计划书红线的对照

- 未复制、未改名照搬、未逐行改写任何旧实现（本合同只新增文档、测试、桩与删除无引用别名）。
- 未放宽任何断言；桩替换验证证明测试有效（11/11 失败）。
- 未改用户数据格式、协议字段、`KNORVIA_` 环境变量与 `.knorvia-studio` 目录。
- 相似度门槛常量（0.2 / 8 / 0.4）未调整。
