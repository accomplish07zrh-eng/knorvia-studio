# core-02 验收记录（acceptance.md）

## 1. 范围与文件数（继承口径实测）

| 区域                                                      | 继承文件 | 行数      |
| --------------------------------------------------------- | -------- | --------- |
| `apps/cli/packages/core/src/memory`（含 `memory/recall`） | 10       | 852       |
| `apps/cli/packages/core/src/model`                        | 1        | 14        |
| `apps/cli/packages/core/src/permission`                   | 3        | 181       |
| `apps/cli/packages/core/src/plugin-reference`             | 4        | 406       |
| `apps/cli/packages/core/src/runtime-task`                 | 5        | 681       |
| `apps/cli/packages/core/src/session-context`              | 4        | 490       |
| `apps/cli/packages/core/src/subagent`                     | 31       | 3,363     |
| **合计**                                                  | **58**   | **5,987** |

≤60 ✓（无需重切）。`interface.md` 由 TypeScript 类型检查器生成，覆盖 58 个模块、287 个导出条目。

与派活表差异：派活表原写 28（六域），按计划书分包总表口径补入 `subagent` 后为 58；`runtime-task/registry-waits.ts` 已是 `original`（不动），`repo/` 克隆的分类文件已刷新以消除 `unreviewed` 误报。

## 2. 旧门（`scripts/contract-gate.mjs`）

命令（仓库根，Node 24）：

```bash
node scripts/contract-gate.mjs --contract specs/contracts/core-02 --tests "*.test.mjs" \
  --dist-env KNORVIA_CORE_ENTRY=dist \
  --stub-root specs/contracts/core-02/stubs --stub-targets specs/contracts/core-02/stubs/targets.txt
```

| 入口                                                         | tests | pass  | fail  | 结论                                 |
| ------------------------------------------------------------ | ----- | ----- | ----- | ------------------------------------ |
| 源码（`src`，`--import tsx`）                                | 19    | 19    | 0     | 通过                                 |
| dist（`dist`，先 `pnpm --dir apps/cli/packages/core build`） | 19    | 19    | 0     | 通过                                 |
| 桩替换（7 个模块路径）                                       | 5     | **0** | **5** | `allFail=true`：测试确实测到公开行为 |

完整报告见 `gate-old.json`。

## 3. 门禁（本机，Node 24.14.0 + pnpm 10.33.2）

| 检查                                               | 结果         |
| -------------------------------------------------- | ------------ |
| `pnpm --dir apps/cli/packages/core build`          | 0            |
| `pnpm --dir apps/cli/packages/core typecheck`      | 0            |
| `pnpm lint`                                        | 0（0 error） |
| `pnpm fmt:check`                                   | 0            |
| `pnpm provenance:report` / `pnpm provenance:check` | 0 / 0        |

## 4. 未覆盖项（替换阶段自查）

- `subagent/runner-*` 9 个模块的内部状态机与事件序列（合同冻结签名 + B12 覆盖消息投递/完成通知；运行器内部时序属替换阶段自查）。
- `memory/recall/manifest.ts` 的目录扫描细节（依赖 `FileSystemPort`；合同冻结签名与返回形状）。
- `subagent/profile-frontmatter.ts` 的 frontmatter 解析细节（与 `@knorvia/shared` codec 一致性）。
- `runtime-task/notification.ts` 逐字段文案模板（B8 冻结转义与截断界；文案本身属可改范围）。

## 5. 与计划书红线的对照

- 未复制、未改名照搬、未逐行改写任何旧实现（本合同只新增文档、测试、桩与夹具）。
- 未放宽任何断言；桩替换验证证明测试有效（19 → 5 用例全失败）。
- 未改用户数据格式、协议字段、`KNORVIA_` 环境变量与 `.knorvia-studio` 目录。
- 相似度门槛常量（0.2 / 8 / 0.4）未调整。
