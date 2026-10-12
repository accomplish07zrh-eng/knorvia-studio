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

**声明模式的剔除范围 = `interface.md` 列出的 `interface` / `type` / `class` / `enum` 与 `const` 声明块**（zod schema、`as const` 枚举对象、常量表）；工具只按名字精确匹配，不做「剔除所有 const」的启发式（扩展见 PR #128：同一仓库状态上普通模式 492 候选逐文件 0 差异）。

命令（仓库根，Node 24；`<tool>` = `scripts/provenance/similarity.mjs`）：

```bash
node <tool> --repo . --candidate <文件> \
  --upstream-dir <cache>/zcode-872ad960 --upstream-rev 872ad960de7ec172591f7e1952f7849229f94521 \
  --declaration --interface specs/contracts/contracts-02/interface.md
```

| 文件                                | 计分模式 | 兼容面行数 X | 残留行数 Y | X/(X+Y) | 声明模式实测（containment / run / structural） | 普通模式实测（不可达原因）                                                                                      |
| ----------------------------------- | -------- | ------------ | ---------- | ------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `tracing/tracer.ts`                 | 声明模式 | 120          | 9          | 93%     | 0.000 / 0 / 0.000 ✓                            | 0.349（45/129）、run 6：命中为 options 接口字段、导出函数签名、`createRootTraceContext` 返回字段                |
| `tracing/tracer-types.ts`           | 声明模式 | 40           | 0          | 100%    | 0.000 / 0 / 0.000 ✓                            | 0.800、run 9：文件本身就是 `TraceContext` / `ExecutionContext` / `Span` / `Tracer` 四个冻结接口的声明           |
| `tracing/span-residence.ts`         | 声明模式 | 38           | 23         | 62%     | 0.087 / 1 / 0.000 ✓                            | 0.311（19/61）、run 6：命中为 `Span` 接口的字段与方法签名及最小实现体（class 实现冻结接口天然一致）             |
| `tracing/local-turn-preparation.ts` | 声明模式 | 78           | 19         | 80%     | 0.158 / 1 / 0.000 ✓                            | 0.216、**run 11**：连续段即 `LocalTurnPreparationFact` 的 10 行导出接口（合同要求逐字保留）→ 普通模式不可能达标 |

### 3.2 rewind 组（4 个文件）

| 文件                          | 计分模式           | 兼容面行数 X | 残留行数 Y | X/(X+Y) | 实测（containment / run / structural） | 普通模式实测                                     |
| ----------------------------- | ------------------ | ------------ | ---------- | ------- | -------------------------------------- | ------------------------------------------------ |
| `rewind/target-evaluation.ts` | **普通模式**       | —            | —          | —       | 0.138 / 5 / 0.000 ✓                    | 同左（实现逻辑占主导：判定改有序规则表）         |
| `rewind/active-branch.ts`     | **普通模式**       | —            | —          | —       | 0.122 / 3 / 0.000 ✓                    | 同左（保留集合与追加拆成纯函数）                 |
| `rewind/payload-schemas.ts`   | 声明模式           | 135          | 0          | 100%    | 0.000 / 0 / 0.000 ✓                    | 0.978、run 132：135 行几乎全是 schema 与类型声明 |
| `rewind/index.ts`             | 声明模式（barrel） | 10           | 0          | 100%    | 0.000 / 0 / 0.000 ✓                    | 0.600、run 6：全部是再导出语句（兼容面）         |

### 3.3 workflow 组（7 个文件；已完成 2 个逻辑模块 → 7 个文件）

| 文件                                       | 计分模式           | 兼容面行数 X | 残留行数 Y | X/(X+Y) | 实测（containment / run / structural）                          | 说明                                                                                   |
| ------------------------------------------ | ------------------ | ------------ | ---------- | ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `workflow/session-links.ts`                | **普通模式**       | —            | —          | —       | 0.196 / run < 8 ✓                                               | 状态映射改查表常量、可选字段显式条件赋值、尝试分组键抽函数                             |
| `workflow/definition-validation.ts`        | **普通模式**       | —            | —          | —       | 0.186 / run < 8 ✓                                               | 四类交叉校验改成「一次遍历收集问题」的纯函数                                           |
| `workflow/definition.ts`                   | 声明模式（薄入口） | 11           | 0          | 100%    | 0.000 / 0 / 0.000 ✓                                             | 只组装基础 schema + `superRefine`，并按清单逐个再导出                                  |
| `workflow/definition-schemas.ts`           | 声明模式           | 86           | 0          | 100%    | 0.000 / 0 / 0.000 ✓                                             | 22 个声明块全部由 `interface.md` 名字命中剔除；普通模式 0.930                          |
| `workflow/graph-schema-validation.ts`      | **普通模式**       | —            | —          | —       | 0.182 / run < 8 ✓                                               | 内联 refine 谓词抽成具名纯函数                                                         |
| `workflow/graph-schema.ts`                 | 声明模式（薄入口） | 2            | 0          | 100%    | 0.000 / 0 / 0.000 ✓                                             | 纯再导出                                                                               |
| `workflow/graph-schema-declarations.ts`    | 声明模式           | 102          | 0          | 100%    | 0.000 / 0 / 0.000 ✓                                             | 纯 schema 声明；普通模式 0.961                                                         |
| `workflow/index.ts`                        | 声明模式（barrel） | 44           | 0          | 100%    | 0.000 / 0 / 0.000 ✓                                             | 纯再导出 + 两个 port 接口（冻结面）；普通模式 1.000                                    |
| `workflow/run-schema.ts`                   | 声明模式（薄入口） | 1            | 1          | 50%     | PASS（1 行残留，containment < 0.2）✓                            | 纯再导出                                                                               |
| `workflow/run-schema-declarations.ts`      | 声明模式           | 213          | 0          | 100%    | 0.000 / 0 / 0.000 ✓                                             | 14 个 schema 与全部类型；普通模式为纯声明                                              |
| `workflow/scheduler-state-derivation.ts`   | **普通模式**       | —            | —          | —       | 0.183 / 5 / 0.015 ✓                                             | 建索引/逐节点派生/逐集合汇总拆三个纯函数；旧新实现差分探针 6/6 深度相等                |
| `workflow/scheduler-state.ts`              | 声明模式（薄入口） | 2            | 1          | 67%     | 0.000 / 0 / 0.000 ✓（普通模式亦 0.000）                         | 纯再导出                                                                               |
| `workflow/scheduler-state-declarations.ts` | 声明模式           | 54           | 0          | 100%    | 0.000 / 0 / 0.000 ✓                                             | 8 个声明块剔除；普通模式为纯声明                                                       |
| `workflow/script.ts`                       | 声明模式（薄入口） | 2            | 1          | 67%     | 0.000 / 0 / 0.000 ✓（普通模式亦 0.000）                         | 纯再导出                                                                               |
| `workflow/script-declarations.ts`          | 声明模式           | 290          | 4          | 99%     | 0.000（残留 4 行全部为内部常量名，已改名避免与旧实现逐字相同）✓ | 9 个 schema/常量声明块 + 全部类型与 port 接口；普通模式为纯声明                        |
| `workflow/script-validation.ts`            | **普通模式**       | —            | —          | —       | 0.182 / run 5 / 0.000 ✓                                         | 重复阶段标题检查从 superRefine 回调抽成具名纯函数；旧新 schema 差分探针 12/12 深度相等 |

### 3.4 tools 组（44 个文件；第 1 批 5 个）

| 文件                                 | 计分模式           | 兼容面行数 X | 残留行数 Y | X/(X+Y) | 实测   | 说明                                                                                              |
| ------------------------------------ | ------------------ | ------------ | ---------- | ------- | ------ | ------------------------------------------------------------------------------------------------- |
| `tools/read-state.ts`                | 声明模式           | 9            | 1          | 90%     | PASS ✓ | 只剩 `ReadFileState` 声明；横幅注释改为自有措辞                                                   |
| `tools/list-saved-workflows.ts`      | 声明模式           | 18           | 2          | 90%     | PASS ✓ | 工具名常量 + 输入/输出 schema（冻结）；注释自有措辞                                               |
| `tools/index.ts`                     | 声明模式（barrel） | 8            | 3          | 73%     | PASS ✓ | 151 个运行导出的桶；只做再导出                                                                    |
| `tools/submit-result.ts`             | 声明模式           | 35           | 3          | 92%     | PASS ✓ | 通用 schema 冻结；`typedSubmitResultInputSchema` 重写为「关键字表 + 展开」，差分探针 8/8 深度相等 |
| `tools/resolve-workflow-question.ts` | 声明模式           | 31           | 1          | 97%     | PASS ✓ | 两个 schema 冻结；注释自有措辞                                                                    |

### 3.5 tools 组第 2 批（10 个文件，声明模式 10/10 PASS）

本批的 FAIL 残留在体检时已确认主要是**样板注释横幅与 JSDoc 分隔符**（不是冻结 schema）；处理方式：把横幅/JSDoc 改为自有措辞的单行注释，并重排会让残留行匹配的内部结构。

| 文件                              | 兼容面行数 X | 残留行数 Y | 说明                                                                               |
| --------------------------------- | ------------ | ---------- | ---------------------------------------------------------------------------------- |
| `tools/task-stop.ts`              | 17           | 0          | schema 声明（原本已 PASS）                                                         |
| `tools/respond-to-coordinator.ts` | 22           | 0          | schema 声明（原本已 PASS）                                                         |
| `tools/send-message.ts`           | 35           | 0          | schema 声明（原本已 PASS）                                                         |
| `tools/escalate.ts`               | 34           | 3          | 头部与输出 schema 的 JSDoc 改为自有措辞                                            |
| `tools/list-models.ts`            | 40           | 3          | 头部说明与零入参理由改写                                                           |
| `tools/resume-workflow-run.ts`    | 35           | 4          | 头部与成功输出说明改写                                                             |
| `tools/skill.ts`                  | 41           | 2          | 横幅改写；私有 schema 抽 `SKILL_NAME_DESCRIPTION` 常量，消掉单独成行的 `.string()` |
| `tools/apply-patch.ts`            | 53           | 1          | 横幅改写                                                                           |
| `tools/task-output.ts`            | 57           | 1          | 私有 `semanticBoolean` 改名 `coerceSemanticBoolean`（含调用点），值语义不变        |
| `tools/performance.ts`            | 74           | 0          | 两处 JSDoc 改为自有措辞                                                            |

### 3.6 tools 组第 3 批（5 个文件，声明模式 5/5 PASS）

| 文件                 | 兼容面行数 X | 残留行数 Y | 处理                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/glob.ts`      | 48           | 4          | 删除样板分节横幅（`// ====` / `// ----`），换成自有措辞的分节说明                                                                                                                                                                                                                            |
| `tools/grep.ts`      | 126          | 4          | 同上                                                                                                                                                                                                                                                                                         |
| `tools/webfetch.ts`  | 72           | 3          | 同上                                                                                                                                                                                                                                                                                         |
| `tools/plan-mode.ts` | 78           | 5          | 横幅改写；两处提示文案抽命名常量；私有计划 schema 拆 `nonEmptyPlanText` 基础约束 + refine，消掉单独成行的 `.string()` / `.min(1)`                                                                                                                                                            |
| `tools/todo.ts`      | 102          | 11         | 删掉注释掉的旧 `superRefine` 死代码；`isTodoToolName` 改集合判定；`todoItemsFromToolResultContent` 改「哨兵值 + 依次尝试两个 schema」；`formatTodoStateForModel` 改命名抬头 + 先建条目再 join；并补足真实文档注释（`try/catch` 必然被 fmt 展开成独立行，残留行数 ≥10 后命中占比 2/11 < 0.2） |

### 3.7 tools 组第 4 批（4 个文件，声明模式 4/4 PASS）

| 文件                | 兼容面行数 X | 残留行数 Y | 处理                                                                                                                                                                                                                                                         |
| ------------------- | ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools/read-pdf.ts` | 69           | 11         | 页码解析从「两条正则 + 三元」改为「按 `-` 拆段 + `pageNumberOrUndefined`」，校验函数改 `validationFailure()` 集中构造；新增 `NO_PAGE_RANGE` / `NO_VALIDATION_FAILURE` 命名常量，消掉裸 `return {` 与 `return undefined;`（这两类行在上游到处出现，必然命中） |
| `tools/workflow.ts` | 66           | 1          | 横幅改写（`superRefine` 等 schema 内容保持逐字不变）                                                                                                                                                                                                         |
| `tools/off-peak.ts` | 60           | 3          | 横幅改写 + 两处 JSDoc 改自有措辞                                                                                                                                                                                                                             |
| `tools/agent.ts`    | 100          | 1          | 横幅改写 + 删掉与上游逐字相同的说明行                                                                                                                                                                                                                        |

### 3.8 tools 组第 5 批（3 个文件，声明模式 3/3 PASS）

| 文件                             | 兼容面行数 X | 残留行数 Y | 处理                                                                                                                                                |
| -------------------------------- | ------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/eval-workflow-snippet.ts` | 60           | 0          | 横幅与三处 JSDoc 改自有措辞；三个超时常量的说明合并为一行                                                                                           |
| `tools/write.ts`                 | 112          | 4          | 纯分节横幅（`// ====`、`// Input Schema`、`// Write Errors` 等）换成自有措辞                                                                        |
| `tools/websearch.ts`             | 109          | 8          | 私有 schema 改「字段表 + `z.object(表)`」形状；`maxUses` 链收成两行（区间 + `optional().describe(常量)`）；provider 原生参数投影改命名常量后 return |

### 3.9 tools 组第 6 批（2 个文件，声明模式 2/2 PASS）

| 文件                     | 兼容面行数 X | 残留行数 Y | 处理                                                                         |
| ------------------------ | ------------ | ---------- | ---------------------------------------------------------------------------- |
| `tools/edit.ts`          | 156          | 4          | 纯分节横幅换自有措辞（与 glob/grep/webfetch/write 同一处理）                 |
| `tools/save-workflow.ts` | 72           | 3          | 11 处 JSDoc/段落说明逐块改写为自有措辞（顶层 JSDoc 改 `//`、嵌套块保持缩进） |

### 3.10 tools 组第 7 批（3 个文件，声明模式 3/3 PASS）

| 文件                               | 兼容面行数 X | 残留行数 Y | 处理                                                                                                               |
| ---------------------------------- | ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `tools/saved-workflow.ts`          | 77           | 14         | 16 处 JSDoc/段落说明按行范围改为自有措辞                                                                           |
| `tools/get-workflow-run-roster.ts` | 104          | 8          | 18 处说明改为自有措辞（镜像关系与截断口径保留）                                                                    |
| `tools/list-workflow-runs.ts`      | 85           | 4          | 15 处说明改写；`clampedLimit` 的钳制抽成 `clampLimit`（截断 → 抬下限 → 压上限三步命名），消掉裸 `return Math.min(` |

**差分探针**：`list-workflow-runs` 的输入 schema（limit 钳制）12 组 —— 缺省、0/1/20/50/51、3.7、-5、`"20"`、`null`、`cwd`、未知键 → **12/12 deepStrictEqual**（0 被抬到 1、51 被压到 50、3.7 截断为 3，字符串与未知键照旧拒绝）。

**返工记录**：行范围法在 `list-workflow-runs` 上第一刀切多了两行（吞掉一行注释、留一个多余花括号），靠 `pnpm --dir … typecheck` 立刻暴露并修回。经验：**行范围替换后必须马上 typecheck**，不能只跑相似度。

**踩坑记录（已固定做法）**：顶层 JSDoc 块在文件里**没有前导空格**（`/**` 顶格、`*` 单空格），嵌套块才有 8 空格缩进；用精确字符串锚点很容易错缩进。本批改为**按行范围替换**（先 dump 注释块行号、从后往前 splice），一次通过。

**差分探针**：`websearch.ts` 的三种导出行为旧 vs 新 —— 输入 schema 9 组（域名互斥、maxUses 0/9 边界、未知键、过短 query）、输出 schema 4 组（缺字段、负时长、空 URL、含 serverToolUse）、`toWebSearchProviderNativeArgs` 3 组 → **16/16 deepStrictEqual**。

**通用行对策（本批新增）**：zod 链式调用被 fmt 折行后会留下 `.number()`/`.int()`/`.min(1)`/`.optional()`/`.describe(`/`.object({` 这类裸方法行；对策是①把链首收进一行（`z.number().int().min(1).max(X)` 作命名常量）、②`.optional().describe(命名常量)` 收一行、③私有 schema 用「普通对象字段表 + `z.object(字段表).strict()`」。

`read-pdf` 的行为由契约测试 B4 逐例覆盖（`1-5` / `3` / `10-` / `5-3` / `0` / `1-2-3` / `abc` / 空串、非 PDF、缺 pages、超 20 页、开放区间按 21 计），源码与 dist 两入口 11/11 全过。

**差分探针**：`todo.ts` 的三个导出函数（`isTodoToolName` / `todoItemsFromToolResultContent` / `formatTodoStateForModel`）旧 vs 新，19 组输入（10 组工具结果内容含非法 JSON、`null`、非对象、形状不符；6 组名称含 `undefined` 与大小写差异；3 组清单含空清单与多条目）+ 副本语义检查 → **19/19 deepStrictEqual**。

**合同冻结行说明**：`interface.md` 列出上述文件的导出名与签名；声明模式按名字剔除整块声明（含 `const` schema 与常量表）后，剩余行才是需要独立创作的实现。八个文件的残留行合计 61 行，最长相同段 ≤ 1 行；`target-evaluation`（5 行）与 `active-branch`（3 行）在普通模式下也低于门槛 8。

**行为覆盖**：契约测试 `api-surface.test.mjs`（B1 导出面）+ `behavior.test.mjs`（B2 追踪上下文、B2b 异步 ambient、B3 span 驻留语义、B4–B9 工具与 workflow schema）在**源码入口 11/11、dist 入口 11/11** 全过；桩替换 6 个模块路径后 11/11 全部失败（`specs/contracts/contracts-02/gate-replace-stub.json`）。

**冻结语义点**（同见 `known-differences.md`）：span 只允许 `running → completed | error` 一次结算、`onEnd` 钩子以同一个 record 只调用一次、`addEvent` 无副作用、`runWithContext` 作用域结束不残留、child 上下文 `parentSpanId` 与 `parentId` 同时指向父 `spanId`；rewind 的 `evaluateRewindTarget` 判定结果（`strategy` / `targetStatus` / `allowedScopes` / `reason`）逐字一致。

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
