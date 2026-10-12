# contracts-02 合同（`@knorvia/contracts`：tools / tracing / workflow / rewind）

**合同版本：v1**（旧门基线：主仓 `9ac5fa3f`；此后合同任何改动都要重跑旧门并升版本）

本目录是 `@knorvia/contracts` 第二个包的**兼容合同**：先冻结公开行为与签名，再按合同独立实现（替换阶段见计划书「每包流程」四、五）。

- 范围：`apps/cli/packages/contracts/src` 下 `tools`（44 个继承文件）、`tracing`（4）、`workflow`（7）、`rewind`（1），共 **56 个继承文件**（`lead/scope-report.mjs` 实测：tools 46 全部/44 继承、tracing 4/4、workflow 7/7、rewind 1/1；单包 ≤60）。
- 不在本包：`capabilities`/`commands`/`compact`/`config`/`events`/`hooks`/`interfaces`/`logging`/`model`/`network`/`path`/`plugins`（`contracts-01`，合同 PR #118 已合并）；`skills`/`telemetry`/`time`/包根 `index.ts`（`contracts-03`，5 个继承文件）；`errors/`（已登记 `independent-replacement`，不动）；`tools/node-repl.ts`（已登记 `independent-replacement`，不在范围）。
- 重切记录：计划书原口径 61 > 60，按「单包继承文件 ≤60」重切为 56 + 5（issue #108 记录）。

## 文件

| 文件                     | 内容                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`              | 本文件：范围、条目 → 测试对照表、旧门结论                                                                                                                    |
| `behavior.md`            | B1–B9：输入/输出/错误语义/时序与并发/幂等/资源释放/平台差异/状态所有者/日志级别 + 可测断言                                                                   |
| `interface.md`           | 模块路径 + 56 个文件的导出名与签名（相似度工具声明模式的剔除依据）                                                                                           |
| `callers.md`             | 六个公开入口的全仓调用点（文本搜索）+ `dep:refs` 抽样核对                                                                                                    |
| （测试位置）             | 契约测试住在包内 `apps/cli/packages/contracts/test/contracts-02-*.test.mjs`，随 `pnpm test:studio` 跑；本目录保留 `interface.md` 与 `fixtures/` 作为断言依据 |
| `tests/run-old-gate.mjs` | 替换阶段的无桩入口：跑包内契约测试的源码与 dist 两入口（`--entry dist` 需先构建本包）                                                                        |
| `fixtures/`              | 见下                                                                                                                                                         |
| `known-differences.md`   | 与旧实现已知差异                                                                                                                                             |
| `acceptance.md`          | 验收记录：旧门两入口、桩替换、门禁、替换阶段终态                                                                                                             |
| `gate-old.json`          | 旧门报告（`scripts/contract-gate.mjs` 生成）                                                                                                                 |

## 条目 → 测试对照表

| 条目                              | 测试                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| B1 公开入口导出面                 | `tests/api-surface.test.mjs`「每个公开子路径都能载入并导出 interface.md 列出的运行时名字」「包根入口覆盖本包四个区的关键导出」 |
| B2 追踪上下文                     | `tests/behavior.test.mjs`「B2 追踪上下文：root/child 字段与 ambient 语义」「B2b 异步 ambient 上下文与 createSpan 继承」        |
| B3 span 驻留语义                  | `tests/behavior.test.mjs`「B3 span 驻留语义：状态、属性、单次结算与 onEnd 钩子」                                               |
| B4 Read PDF 契约                  | `tests/behavior.test.mjs`「B4 Read PDF：常量、分页解析与校验失败」                                                             |
| B5 Read 常量与错误码              | `tests/behavior.test.mjs`「B5 Read 常量与错误码取值」                                                                          |
| B6 goal/target schema             | `tests/behavior.test.mjs`「B6 goal/target schema 与文案」                                                                      |
| B7 rewind 契约                    | `tests/behavior.test.mjs`「B7 rewind 常量、payload 解析与目标判定」                                                            |
| B8 CreateWorkflow 契约            | `tests/behavior.test.mjs`「B8 CreateWorkflow 常量与输入 schema」                                                               |
| B9 workflow canonical/Expert 别名 | `tests/behavior.test.mjs`「B9 workflow canonical schema 与 Expert 别名」                                                       |

B1–B9 全部有条目且都有测试（无空行）。未被行为条目覆盖的导出（纯类型与未被本包运行时路径触达的 schema）在 `acceptance.md` 的「未覆盖项」中列出。

## 旧门（旧实现上的结论）

`node scripts/contract-gate.mjs --contract specs/contracts/contracts-02 --tests "*.test.mjs" --dist-env KNORVIA_CONTRACTS_ENTRY=dist --stub-root specs/contracts/contracts-02/stubs --stub-map specs/contracts/contracts-02/stubs/targets.txt`：

- 源码入口：tests=11 pass=11 fail=0
- dist 入口：tests=11 pass=11 fail=0
- 桩替换（6 个目标文件）：tests=11 **pass=0 fail=11** → 契约测试确实测到公开行为
- 详细输出见 `gate-old.json`

## 计分口径（替换阶段）

- 运行时/实现文件：相似度工具**普通模式**（行 + 结构两道门槛）。
- 纯声明/桶文件（`index.ts`、`*-types.ts` 等）：`--declaration --interface specs/contracts/contracts-02/interface.md`。
- 已登记 `independent-replacement` 的文件不在范围内，替换阶段不动。

## 替换阶段（终态）

56 个继承文件全部就地重写（或在合同允许范围内拆成更小的模块）：导出名、签名、常量取值、schema 接受/拒绝集合与模型可见文案保持不变，注释与内部组织为自有实现。逐文件计分模式、算式与差分探针见 `docs/knorvia-contracts-02-acceptance.md`。

- 合同桩已退役：`stubs/` 删除；`lead/verify-replace.mjs` 的「全仓无 `not implemented: contracts-02`」与「桩目录已删除」两项为 0 问题。
- 契约测试已移入包内（见上表），两种入口各 11/11；无桩入口 `tests/run-old-gate.mjs` 供 `verify-replace` 自动跑。
- 相似度：56 个文件按各自计分模式全部 PASS（实现文件普通模式含结构门槛；声明/桶文件声明模式，`containment` 与最长连续段都低于门槛）。
- 登记：替换后的实现文件与测试/入口文件在 `licensing/reviews.json` 登记为 `original`，摘要与文件一致。
