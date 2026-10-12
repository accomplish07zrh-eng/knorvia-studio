# contracts-03 合同（`@knorvia/contracts`：skills / telemetry / time / 包根 `index.ts`）

**合同版本：v1**（旧门基线：主仓 `02f2212e`；此后合同任何改动都要重跑旧门并升版本）

本目录是 `@knorvia/contracts` 第 6 个包的**兼容合同**：先冻结公开行为与签名，再按合同独立实现（替换阶段见计划书「每包流程」四、五）。

- 范围：`apps/cli/packages/contracts/src` 下 `skills`（1 个继承文件）、`telemetry`（2）、`time`（1）与包根 `index.ts`（1），共 **5 个继承文件**（`lead/scope-report.mjs` 实测：skills 1/1、telemetry 2/2、time 1/1、`index.ts` 1/1；单包 ≤60）。
- 不在本包：`capabilities`/`commands`/`compact`/`config`/`events`/`hooks`/`interfaces`/`logging`/`model`/`network`/`path`/`plugins`（`contracts-01`，合同 #118 已合并、替换 #129 已合并）；`tools`/`tracing`/`workflow`/`rewind`（`contracts-02`，合同阶段进行中）；`errors/`（已登记 `independent-replacement`，不动）。
- 重切记录：计划书原口径 61 > 60，按「单包继承文件 ≤60」重切为 56 + 5，本包即切出的 5 个文件（issue #108 / #126 记录）。认领 issue：#130。
- 无用代码核对：`pnpm knip` 与 `dep:refs`/文本搜索确认本包 5 个文件都有真实去向，**没有**需要在本包内直接删除的无用代码（见 `acceptance.md` §4）。

## 文件

| 文件                   | 内容                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `README.md`            | 本文件：范围、条目 → 测试对照表、旧门结论                                                               |
| `behavior.md`          | B1–B7：输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别 + 可测断言              |
| `interface.md`         | 模块路径 + 5 个文件的导出名与签名（相似度工具声明模式的剔除依据）                                       |
| `callers.md`           | 三个公开入口的全仓调用点（文本搜索）+ `dep:refs` 抽样与工具假阴性说明                                   |
| `tests/`               | 契约测试（只走公开入口；`entry.mjs` 支持源码/dist 两入口）                                              |
| `fixtures/`            | `query-source-mapping.json`：B3 的 `querySource` → `(operation, actorKind)` 冻结表                      |
| `stubs/`               | 每个模块路径一个最小桩（`stubs/src/**` + `targets.txt` 映射），函数体抛 `not implemented: contracts-03` |
| `known-differences.md` | 与旧实现已知差异（当前无预登记差异；登记三处必须保留的既有语义）                                        |
| `acceptance.md`        | 验收记录：旧门两入口、桩替换、覆盖表、首次失败与修正、未覆盖项                                          |
| `gate-old.json`        | 旧门报告（`scripts/contract-gate.mjs` 生成）                                                            |

## 条目 → 测试对照表

| 条目                                      | 测试                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 公开入口导出面                         | `tests/api-surface.test.mjs`「每个公开子路径都能载入并导出 interface.md 列出的运行时名字」「包根再导出的每个模块路径都能载入」「包根对本包自有导出与 @knorvia/shared 转发都是真实取值」 |
| B2 模型 API 取值表与恒等映射              | `tests/behavior.test.mjs`「B2 模型 API operation / actor / failure 取值表与恒等映射」                                                                                                   |
| B3 querySource 映射与归一                 | `tests/behavior.test.mjs`「B3 querySource 映射表、observation 覆盖与 logicalCallId 兜底」                                                                                               |
| B4 telemetry schema 与 agent operation 表 | `tests/behavior.test.mjs`「B4 telemetry schema 版本与 agent operation 取值表」                                                                                                          |
| B5 本地 ISO 日期                          | `tests/behavior.test.mjs`「B5 本地 ISO 日期：补零、本地时区语义、年不补零」                                                                                                             |
| B6 类型面                                 | `tests/types.test.mjs`「B6 类型面：正向用例通过编译、反向用例必须报错」                                                                                                                 |
| B7 `@knorvia/shared` 取值转发             | `tests/behavior.test.mjs`「B7 包根对 @knorvia/shared 的取值转发」、`tests/api-surface.test.mjs`「包根对本包自有导出与 @knorvia/shared 转发都是真实取值」                                |

B1–B7 全部有条目且都有测试（无空行）。未被行为条目覆盖的导出（纯类型、没有包外调用方的端口类型）在 `acceptance.md` §6「未覆盖项」中列出。

## 旧门（旧实现上的结论）

`node scripts/contract-gate.mjs --contract specs/contracts/contracts-03 --tests "*.test.mjs" --dist-env KNORVIA_CONTRACTS_ENTRY=dist --stub-root specs/contracts/contracts-03/stubs --stub-map specs/contracts/contracts-03/stubs/targets.txt`：

- 源码入口：tests=**9** pass=**9** fail=0
- dist 入口：tests=**9** pass=**9** fail=0
- 桩替换（5 个目标文件）：tests=9 **pass=0 fail=9** → 契约测试确实测到公开行为
- 旧门基线提交 `02f2212e`；详细输出见 `gate-old.json`

## 计分口径（替换阶段）

- 运行时/实现文件（`telemetry/index.ts` 的运行时代码、`time/local-date.ts`）：相似度工具**普通模式**（行 + 结构两道门槛）。
- 纯声明/桶文件（`src/index.ts`、`skills/index.ts`、`telemetry/agent-execution.ts`、`telemetry/index.ts` 的声明部分）：`--declaration --interface specs/contracts/contracts-03/interface.md`，门槛常量不调。
- `interface.md` 同时列出包根再导出的 54 个模块路径：包根是纯再导出桶，模块路径是它的兼容面，声明模式据此剔除。
- `errors/` 等已登记 `independent-replacement` 的文件不在范围内，替换阶段不动。

## 替换阶段（replace/contracts-03）

- 契约测试已移入 `apps/cli/packages/contracts/test/`（`contracts-03-api-surface|behavior|types|internals.test.mjs`），随 `pnpm test:studio` 在 CI 双平台常驻；本目录只留合同文档、`fixtures/` 与 `gate-old.json`。
- `stubs/` 已按流程删除（不留回退路径）；桩替换检查的结果记在 `acceptance.md` §7.1。
- 实现与相似度实测、receipt 重固定、门禁摘要见 `acceptance.md` §7；设计见 `design.md`。
