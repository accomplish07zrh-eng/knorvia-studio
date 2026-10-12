# contracts-02 替换验收（docs/knorvia-contracts-02-acceptance.md）

计划书「五、接入与登记」第 7 条要求：范围、旧门与新实现结果、两道相似度实测、逐文件计分模式与算式、未覆盖项、复现命令。本文件按组累积，替换完成时补齐全部 56 个文件。

## 1. 范围

`contracts-02` = `@knorvia/contracts` 的 `tools`（44 继承）、`tracing`（4）、`workflow`（7）、`rewind`（1），共 **56 个继承文件**（合同 `specs/contracts/contracts-02/`，合同 PR #127 已合并）。替换分支 `replace/contracts-02`。

## 2. 计分口径（Lead 2026-10-12 裁决）

- **默认**：实现逻辑占主导的文件走**普通模式**（行 + 结构两道门槛，常量 0.2 / 8 / 0.4 未动）。
- **例外**：冻结声明占主导、普通模式**数学上不可达**的文件走 `--declaration --interface specs/contracts/contracts-02/interface.md`。
- 判定顺序：① 先抽可移动的声明块到别的文件 → ② 用薄壳 + 内部模块把真实实现行数做大 → ③ 只有兼容面本身占比高、且普通模式不可达时才走声明模式。
- 每个走声明模式的文件必须在本文件写出算式：`兼容面行数 X / 残留行数 Y = Z%`，并说明哪些行是合同冻结、为什么普通模式不可达。
- 所有文件的行为都由契约测试黑盒覆盖（`specs/contracts/contracts-02/tests/`，源码 + dist 两入口）。

## 3. 逐文件计分模式与算式（按组累积）

### 3.1 tracing 组（4 个文件，提交 `f7e2f759`）

命令（仓库根，Node 24；`<tool>` = `wt/tool-m08/scripts/provenance/similarity.mjs`）：

```bash
node <tool> --repo . --candidate apps/cli/packages/contracts/src/tracing/<文件> \
  --upstream-dir <cache>/zcode-872ad960 --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521 \
  --declaration --interface specs/contracts/contracts-02/interface.md
```

| 文件                                | 计分模式 | 兼容面行数 X | 残留行数 Y | X/(X+Y) | 声明模式实测（containment / run / structural） | 普通模式实测（不可达原因）                                                                                      |
| ----------------------------------- | -------- | ------------ | ---------- | ------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `tracing/tracer.ts`                 | 声明模式 | 107          | 22         | 83%     | 0.091 / 1 / 0.000 ✓                            | 0.349（45/129）、run 6：命中为 options 接口字段、导出函数签名、`createRootTraceContext` 返回字段                |
| `tracing/tracer-types.ts`           | 声明模式 | 40           | 0          | 100%    | 0.000 / 0 / 0.000 ✓                            | 0.800、run 9：文件本身就是 `TraceContext` / `ExecutionContext` / `Span` / `Tracer` 四个冻结接口的声明           |
| `tracing/span-residence.ts`         | 声明模式 | 38           | 23         | 62%     | 0.087 / 1 / 0.000 ✓                            | 0.311（19/61）、run 6：命中为 `Span` 接口的字段与方法签名及最小实现体（class 实现冻结接口天然一致）             |
| `tracing/local-turn-preparation.ts` | 声明模式 | 75           | 22         | 77%     | 0.100 / 1 / 0.000 ✓                            | 0.216、**run 11**：连续段即 `LocalTurnPreparationFact` 的 10 行导出接口（合同要求逐字保留）→ 普通模式不可能达标 |

**合同冻结行说明**：`interface.md` 的 `tracing/*` 段落列出上述文件的导出名与签名；声明模式按名字剔除整块声明（`interface`/`type`/`class`/`enum`）后，剩余行才是需要独立创作的实现。四个文件的残留行合计 67 行，其中不含任何逐字照搬的实现逻辑（最长相同段 ≤ 1 行）。

**行为覆盖**：契约测试 `api-surface.test.mjs`（B1 导出面）+ `behavior.test.mjs`（B2 追踪上下文、B2b 异步 ambient、B3 span 驻留语义）在**源码入口 11/11、dist 入口 11/11** 全过；桩替换 6 个模块路径后 11/11 全部失败（`specs/contracts/contracts-02/gate-replace-stub.json`）。

**冻结语义点**（同见 `known-differences.md`）：span 只允许 `running → completed | error` 一次结算、`onEnd` 钩子以同一个 record 只调用一次、`addEvent` 无副作用、`runWithContext` 作用域结束不残留、child 上下文 `parentSpanId` 与 `parentId` 同时指向父 `spanId`。

## 4. 旧门与新实现结果

| 阶段                               | 源码入口 | dist 入口 | 桩替换                      |
| ---------------------------------- | -------- | --------- | --------------------------- |
| 旧实现（合同 PR，`gate-old.json`） | 11/11    | 11/11     | 6 文件替换后 11/11 失败     |
| 替换后 tracing 组                  | 11/11    | 11/11     | —（桩仍在，替换完成时删除） |

## 5. 未覆盖项

见 `specs/contracts/contracts-02/acceptance.md` §5（各工具文件逐键 schema、投影函数、`workflow/script.ts` 与 `scheduler-state.ts` 常量、`evaluateRewindTarget` 其余分支）。替换实现按「接受/拒绝集合不放宽」自查，逐项结果在后续组完成后补入本文件。

## 6. 复现命令

```bash
# 契约测试（源码 / dist）
node --import tsx --test specs/contracts/contracts-02/tests/*.test.mjs
pnpm --dir apps/cli/packages/contracts build
KNORVIA_CONTRACTS_ENTRY=dist node --import tsx --test specs/contracts/contracts-02/tests/*.test.mjs

# 旧门 + 桩门
node scripts/contract-gate.mjs --contract specs/contracts/contracts-02 --tests "*.test.mjs" \
  --dist-env KNORVIA_CONTRACTS_ENTRY=dist \
  --stub-root specs/contracts/contracts-02/stubs --stub-map specs/contracts/contracts-02/stubs/targets.txt

# 门禁
pnpm typecheck && pnpm lint && pnpm fmt:check && pnpm provenance:report && pnpm provenance:check
```
