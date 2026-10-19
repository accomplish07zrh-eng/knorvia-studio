# dynamic-workflow-02 验收记录（acceptance.md）

v1 · 2026-10-19 · 分支 `contract/dynamic-workflow-02`（基线 `origin/main@3e9505cd`，即 dynamic-workflow-01 合并后的树）。

本文记录本包合同阶段（`docs/knorvia-independent-replacement-plan.md`「每包流程」第一~三步）的**实测**证据：范围、旧门、golden、桩替换、预登记差异、门禁、未覆盖项、替换阶段的计分口径。合同在 v1 之内做过三次就地更正——K13（engine-run 驱动表语义与 `args` 归属）、K9（facade 资产改按去注释声明面锁定）、桩替换计数固定为 37——三次都在改完之后重跑了旧门，下面各节的数字对应提交 `7107a48b` 的树。

## 一、范围

- 在范围：`apps/cli/packages/dynamic-workflow/src/` 下 **`analysis/` 与 `compiler/` 之外**的全部 .ts（那两目录是 dynamic-workflow-01 的范围）= **40 文件 / 7,341 行 / 329,075 字节**。
- 分桶（文件数 / 行数 / 字节数，行按换行数计）：

| 桶                 | 文件 |    行 |    字节 |
| ------------------ | ---: | ----: | ------: |
| `""`（两个入口桶） |    2 |   362 |   9,371 |
| `engine/`          |   24 | 4,675 | 211,666 |
| `facade/`          |    5 |   839 |  43,881 |
| `lowering/`        |    2 |   383 |  20,066 |
| `schema/`          |    7 | 1,082 |  44,091 |

- 继承分类（唯一真源 `tests/scope.mjs` 读 `licensing/current-files.json`）：upstream-unchanged **24** + upstream-modified **13** = **37 个重写目标**；另有 **3 个 unreviewed**（`engine/ask-journal-projection.ts`、`engine/scheduler-helpers.ts`、`engine/workflow-error.ts`）不重写不删（K12）。37 ≤ 60，不拆包。
- 兼容面规模：**40 个模块 / 537 项顶层导出**，机器生成的 `interface.md` 89,001 字节（B20 的 oracle）。
- 调用方：全仓扫描 11,427 个源文件，包外调用文件 **56**（**51** 引用本包范围符号、5 只引用 dw01 分析符号），去重具名符号 **85**（本包 68 + dw01 17）；同包非范围调用方 5 个（全部指向 `facade/`）；深层模块路径消费者 2 个（本包自身 `test/`）。详见 `callers.md`。
- 无用代码核查：`npx knip -W @knorvia/dynamic-workflow --include=exports,types,files` 退出码 0、输出为空（与 dw01 同一口径）。**本阶段删除清单为空**——没有单独提交，因为没有可删的东西。唯一可疑的是 4 个零消费者的入口桶再导出（`artifactFamilyOf`、`formatViolations`、`serializeSchema`、`synthesizeWorkflowSchemas`），核查过 `analysis/`、`compiler/` 与包外均无引用点，knip 因「入口文件再导出算公共 API」不报它们；按 K11 保留 + 登记，删除属实现变更，不在合同阶段执行。

## 二、旧门结果（scripts/contract-gate.mjs）

| 入口      | tests | pass | fail | skipped | todo | 说明                                                       |
| --------- | ----: | ---: | ---: | ------: | ---: | ---------------------------------------------------------- |
| 源码入口  |   420 |  420 |    0 |       0 |    0 | 含 350 例 lowering golden + 26 例整轮运行 golden 回放      |
| dist 入口 |   420 |  420 |    0 |       0 |    0 | 前置 `pnpm --dir apps/cli/packages/dynamic-workflow build` |
| 桩替换    |    15 |    0 |   15 |       0 |    0 | 37 个重写目标文件替换后 15 个测试文件全失败，allFail=true  |

- `gate-old.json`：`pass: true`，commit `7107a48b86d1705f9ef499c528ca8ffdb1d97ae6`，node v24.14.0，`generatedAt` `2026-10-18T18:37:08.667Z`，15 个测试文件 / 62 个 suite。
- 源码入口末尾：`ℹ tests 420` / `ℹ suites 62` / `ℹ pass 420` / `ℹ fail 0` / `ℹ skipped 0` / `ℹ todo 0` / `ℹ duration_ms 35780.082636`
- dist 入口末尾：同一组计数，`ℹ duration_ms 34071.828047`，环境 `KNORVIA_DW02_ENTRY=dist`。
- 命令（仓库根，Node 24.14.0）：
  `node scripts/contract-gate.mjs --contract specs/contracts/dynamic-workflow-02 --tests "*.test.mjs" --dist-env KNORVIA_DW02_ENTRY=dist --stub-root specs/contracts/dynamic-workflow-02/stubs --stub-targets specs/contracts/dynamic-workflow-02/stubs/targets.txt --json specs/contracts/dynamic-workflow-02/gate-old.json`
- `contract-gate.mjs --build` 里的构建步骤写死了 Windows PowerShell 路径，Linux 侧改为先单独执行 build（退出码 0），与本包 dw01 的处置一致。

## 三、golden 样例与录制

- 语料：`fixtures/corpus.mjs`，**350 样例 / 17 族**（≥300 ✓，计划书选择 10）。其中 324 条按计划书「行为直接复用已有 specs/contracts/\*」以相对路径 import dynamic-workflow-01 的同一份语料（不复制第二份真相），另加本包自有的 `engine-run` 族 26 条。族分布：legacy 13 / basic 39 / phases 21 / fanout 45 / joins 13 / async 24 / loops 14 / control 14 / world 26 / artifacts 27 / actors 14 / misuse 19 / taint 19 / errors 19 / combined 12 / settle 5 / engine-run 26。
- 上游语料防漂移：`corpus.mjs` 里 `dw01CorpusPin = { count: 324, sha256: "3c79bc18…4fe1cf7a" }`，对每条 `id\u0000expect\u0000script` 连接后取摘要做**无环境开关的硬校验**，不一致就抛（防止上游语料在无人重录 golden 时变动）。
- expect 分类：clean 299 / diagnostics 51；自检命令 `DWF02_CORPUS_CHECK=1 node --import tsx specs/contracts/dynamic-workflow-02/fixtures/corpus.mjs`。
- 录制：`tests/record-golden.mjs` 在旧实现上一次性录制，显式挡掉 `KNORVIA_DW02_ENTRY=dist`（产物自证不算基准），输出两份：
  - `fixtures/golden/lowering.json`（138,819 字节 / 350 例）：`ok`、诊断四字段（code/line/column/message，按输出顺序）、站点表 `siteIds`、降级后的代码文本。
  - `fixtures/golden/engine-run.json`（92,046 字节 / 26 例）：`RunRecord` 结局、事件轨（Boundary C，取 `sequence` + 事件体）、`dwf_node` / `dwf_actor` 行、driver 收到的每一次效应（Boundary B）。静态那一半不在这里重复录第二份。
- 回放：`tests/golden.test.mjs` 用与录制**同一个**载荷构造函数（`tests/harness.mjs`），逐字节比对，两侧形状不可能分叉；族清单、下限（lowering ≥300、engine-run ≥25）与语料↔录制的 id 一一对应都断言。
- volatile 面排除：`runId` 固定为 `run-golden` 并从每行删掉；`timeCreated` 只在事件轨的存储层，回放取的是 `sequence` + 事件体；JSON 往返一次消掉 `undefined` 键与 `{}` 的形状差。
- facade 资产另有两份去注释声明录制（`fixtures/facade/{production,snippet}-declarations.txt`，2,777 / 1,063 字节，源自 19,067 / 7,289 字符原文），由 `tests/record-facade.mjs` 录制，见 K9。
- 收尾必跑 `npx oxfmt specs/contracts/dynamic-workflow-02/fixtures/golden/*.json`：`JSON.stringify(…, 2)` 不会把短数组并成一行，与本仓库 oxfmt 规则不同形，漏了它 `pnpm fmt:check` 就红。格式化只动文本，回放比对的是 parse 后的对象。

## 四、桩替换验证

- `stubs/build-stubs.mjs` 按 `tests/scope.mjs` 生成 37 个重写目标的 import 即抛桩（`stubs/targets.txt` 37 行，与 §一 的重写目标数一致）。
- 旧门在桩替换后重跑源码入口：15 个测试文件全失败（pass 0 / fail 15 / `allFail: true` / exit 1），证明契约测试确实测到公开行为而不是自证。
- `contract-gate.mjs` 的桩替换会覆盖工作树里的真实文件（tmpdir 备份 + `finally` 还原），因此**只在 `git status` 干净的树上跑**；本轮跑完后 `git status` 仍干净，实现源码零改动。
- 与 dw01 的差别：dw01 在 v2 删掉了桩目录、把 B20 的 oracle 改指 `interface.md`；本包从一开始就是「`interface.md` 做 B20 的 oracle」，桩目录只服务旧门的 allFail 证明，不当 oracle，因此不需要那一步 re-pin。

## 五、预登记差异（known-differences.md K1–K13）

K1–K8 是旧实现行为特征（每条都有对应测试或语料）；K9–K13 是合同口径与登记项，不要求实现侧动作。

| 差异                                                                                            | 对应测试/语料                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1 `phase` 非字面量/全空白一律降级成 `void 0`（9004 归 analyze）                                | `lowering.test.mjs` 两条同名族用例 + golden `lowering` 族同形例                                                                                                                    |
| K2 简写属性 `{ args }` 不改写，代价是留自由标识符                                               | `lowering.test.mjs`「简写属性里的 args 不改写…」，并用 `vm.Script` 证明仍可解析                                                                                                    |
| K3 泛型实例化的根 `description` 抢 lib 符号的英文注释                                           | `schema.test.mjs`「根 description 取类型自己的 aliasSymbol…」                                                                                                                      |
| K4 `integer` 出现在 union 的 `type` 数组里时整数性检查消失                                      | `schema.test.mjs` 两条（精确等于判据）                                                                                                                                             |
| K5 journal 终态写入不对称：失败三件套整体改写 / 产物缺席即不触碰、`null` 合法、能活过终态翻转   | `journal.test.mjs` describe「B23 结算袋的三种写入规则」下四条                                                                                                                      |
| K6 同一次信号里空闲重置与 cap 裁决互斥（类注释「会是 2 条」不可达）                             | `concurrency.test.mjs`「一次信号里空闲重置与 cap 裁决互斥…」「任一信号都会顺带做空闲检查…」+ `tsx` 探针复算                                                                        |
| K7 `world.run` 三个名字各归各处：站点前缀 `world-read#` / op `run` / 节点 kind `world-run`      | `lowering.test.mjs`、`engine-world.test.mjs`「world.run 单列一种 kind…」、`facade.test.mjs`「snippet 姿态下世界读仍然成站点」                                                      |
| K8 两条上限通道方向相反：`WorldReadCapExceeded` 节点级可 catch / `ReportCapExceeded` run 级失败 | `pure.test.mjs`「B22 上限常量表」、`engine-report.test.mjs` 两条 failRun 用例、`engine-world.test.mjs`「driver 抛 WorkflowError 时原样保留…」、`engine-artifact.test.mjs` 两族对照 |
| K9 facade 资产按去注释声明面逐字节锁定，注释文字不进锁（合同口径，用户批准）                    | `facade.test.mjs` describe「B29 facade 声明面逐字节锁定（注释文字不进锁）」四条 + 两份录制                                                                                         |
| K10 golden 钉住旧实现的 21 处引擎错误 `message` 文本（列为待决，需 Lead 裁定）                  | `fixtures/golden/engine-run.json`；lowering 那 350 例不含引擎错误文本                                                                                                              |
| K11 入口桶 4 个零消费者再导出保留不删                                                           | `surface.test.mjs` 的根桶归属面断言、`interface.md` 对应声明块                                                                                                                     |
| K12 3 个 `unreviewed` 文件不进重写目标（37 = 40 − 3）                                           | `tests/scope.mjs` + `surface.test.mjs` 的范围断言 + `stubs/targets.txt` 计数                                                                                                       |
| K13 合同自身就地更正：驱动表按派发/裁决消耗、`args` 不在引擎上                                  | `tests/harness.mjs` 与 `fixtures/families/engine-run.mjs` 头部；夹具 `async-helper-keeps-ordinals` 的驱动表                                                                        |

## 六、门禁（本地，Node v24.14.0）

| 门禁             | 命令                                                                                                   | 结果                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 构建             | `pnpm --dir apps/cli/packages/dynamic-workflow build`                                                  | 退出码 0（`generate-libs.mjs && tsc`）                                                       |
| 契约测试（源码） | `node --import tsx --test --test-timeout=60000 "specs/contracts/dynamic-workflow-02/tests/*.test.mjs"` | 420/420 通过                                                                                 |
| 契约测试（dist） | 同上 + `KNORVIA_DW02_ENTRY=dist`                                                                       | 420/420 通过                                                                                 |
| 旧门             | `node scripts/contract-gate.mjs …`（见 §二）                                                           | `pass: true`，写入 `gate-old.json`                                                           |
| 格式             | `pnpm fmt:check`                                                                                       | `All matched files use the correct format.`（8,413 文件）                                    |
| Lint             | `pnpm lint`                                                                                            | `Found 217 warnings and 0 errors.`（3,834 文件）——warning 全部是既有基线，不在本包改动文件里 |
| 类型检查         | `pnpm typecheck`                                                                                       | 退出码 0；`i18n:check` 先行通过（en-US / zh-CN 5,573 键一致）                                |
| 架构检查         | `pnpm architecture:check --changed`                                                                    | `architecture: OK` / violations 0 / baseline 0 / new 0                                       |
| 选包收尾         | `npx knip -W @knorvia/dynamic-workflow --include=exports,types,files`                                  | 退出码 0、输出为空                                                                           |

- `pnpm knip`（全仓）不干净是既有基线：333 个 unused files、676 个 unused exports、20 条配置提示，其中命中本合同目录的是 4 个录制/生成器脚本（`gen-interface.mjs`、`record-facade.mjs`、`record-golden.mjs`、`scan-callers.mjs`）与 harness 内部导出——根因是 `knip.json` 根 workspace 的 entry glob 只收 `specs/contracts/*/tests/*.test.ts`，dw01 靠逐条列 entry 解决。本阶段的 `knip.json` 与 `licensing/reviews.json` 登记属计划书第五步，未动（见 §七）。
- 离线回归 `pnpm test:studio` 会自动收录 `specs/contracts/dynamic-workflow-02/tests/*.test.mjs`（M0-10 机制），实跑结果与耗时记在 README 的旧门一节。

## 七、未覆盖项

- **符号级 dep:refs findReferences 内存溢出**：537 项导出 × 全仓 11,427 文件的引用回溯在本机 V8 OOM。替代方案：语法级 import 扫描（`tests/scan-callers.mjs`，覆盖全部静态可见 import）+ 字符串路径人工核对（本包命中为零）+ 分文件跑 `pnpm dep:refs --list-exports`。符号级全量回溯留待替换阶段按需对单文件跑。
- **跨实现的「旧写新读 / 新写旧读」进程交接**：`engine-resume.test.mjs`（B13/B14）用的是**旧实现自己录进 journal 的行**（内存端口 + 预制行），覆盖的是「同实现跨世」；真正的跨实现交接（旧实现落库 → 新实现 resume）由调用方（bootstrap/runtime + SQLite 仓储）负责，不在本包合同内，本包只保证 `dwf_*` 行与事件轨的逐字节形状。
- **真实 driver 不在范围内**：Boundary B 的生产实现住在 `dynamic-workflow-runtime`（2 个文件）与 bootstrap，本包只以夹具 driver 断言效应序列；driver 侧行为由那两个包自己的合同管。
- **K10 的 message 文本裁定**：21 处引擎错误 `message` 进了 golden 载荷，与「流程判断只看码」的设计意图相冲。不擅自放宽断言，等 Lead 定（a）摘掉 message 或（b）要求重写复用旧文案。
- **本包自身 `test/` 的深 import 面**：`engine/{scheduler,hash,journal-memory,types,scheduler-types,imported-cache}.js` 的文件名与导出名由本包自己的旧测试依赖，契约测试只把它们当兼容性证据读（`callers.md` C 表），不重写那些测试。
- **`licensing/reviews.json` 与 `knip.json` 登记**：计划书第五步（合同文件的来源登记与 knip 入口登记），本阶段不提交，避免与合同门同时改配置。
- **Windows 侧**：本地只在 Linux 实测；`studio-offline.yml` 在推 PR 时另跑 Windows 腿（夹具涉及路径/大小写/主目录处已按跨平台写）。本阶段不 push、不开 PR，故 Windows 结果尚未取得。
- **UI / E2E**：本包是纯库，无 UI 面，无 E2E 场景需要补。

## 八、计分口径（替换阶段）

与 `docs/knorvia-independent-replacement-plan.md` 及 `specs/contracts/dynamic-workflow-01/acceptance.md` 第九节同一口径（Lead 裁定 2026-10-12），接口路径换成本合同：

- **运行时/实现文件用普通模式**（行 + 结构），门槛常量 **0.2 / 8 / 0.4 不改**；报告值取 `--old-rev origin/main` 与上游固定树两侧的最大值。本包 37 个重写目标里，`engine/*`、`lowering/*`、`schema/*`、两个入口桶的运行时部分都走这一侧。
- **纯声明/桶文件用 `--declaration --interface specs/contracts/dynamic-workflow-02/interface.md`**。当「兼容面行数本身 ≥ 残留归一化行数的 20%」时普通模式数学上不可达，该文件按声明模式计分；工具字段 `declaration-lines` = 被剔除行数，`residual-lines` = 残留归一化行数。`engine/types.ts`（Boundary A/B/C 与全部 record 类型）与两个入口桶是主要适用对象。
- **`facade/dts.ts` 需要单独定调**：它的「内容」就是那两份 `.d.ts` 文本，而 K9 已把锁定面收窄成去注释声明面。重写后注释是 Knorvia 自写的自由面，若仍按整文件逐字节相似度计分，会把「允许自写」与「必须相似」混在一起。建议替换阶段对该文件按声明面（2,777 / 1,063 字符）测相似、按注释散文不计分——此判断需 Lead 确认，本阶段只登记不执行。
- 三个 `unreviewed` 文件（K12）不参与重写计分，仍留在树里。
- 本节只记录计分模式，不改行为、不改 `gate-old.json`。
