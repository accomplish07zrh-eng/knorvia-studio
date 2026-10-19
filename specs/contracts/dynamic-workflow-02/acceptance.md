# dynamic-workflow-02 验收记录（acceptance.md）

v3 · 2026-10-19 · 分支 `replace/dynamic-workflow-02`（合同基线 `origin/main@3e9505cd`，即 dynamic-workflow-01 合并后的树；重写树提交 `a2af8231`）。

本文记录本包合同阶段（`docs/knorvia-independent-replacement-plan.md`「每包流程」第一~三步）的**实测**证据：范围、旧门、golden、桩替换、预登记差异、门禁、未覆盖项、替换阶段的计分口径。合同在 v1 之内做过三次就地更正——K13（engine-run 驱动表语义与 `args` 归属）、K9（facade 资产改按去注释声明面锁定）、桩替换计数固定为 37——三次都在改完之后重跑了旧门，下面各节的数字对应提交 `7107a48b` 的树。

v2（2026-10-19）只做一件事：按用户裁决把声明模式计分的纯数据常量表在 `interface.md` 中逐条列出键与值（K14）。测试断言未改；旧门在旧实现 `8c9a9e86` 上重跑，结果见第九节与 `gate-old-v2.json`。v1 的旧门记录（第二节、第六节与 `gate-old.json`）保持原样。

v3（2026-10-19）：替换收尾。按计划书「每包流程」第五步删除 `stubs/`（37 个桩 + `build-stubs.mjs` + `targets.txt`），新增 `design.md`，把 41 个重写源文件、合同文件与替换验收文档登记为 `original`，并补 `knip.json` 根 entry。测试断言一字未改；`tests/scope.mjs` 只增加登记后的读数口径（已登记目标按合同基线冻结的 unchanged 名单归位、其余算 modified，新拆模块不进兼容面），使范围断言仍指向原 40 个继承文件。新实现上重跑合同门：源码与 dist 各 420/420。下面各节保留合同阶段的历史数字与历史命令（含桩替换），不再改写。

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

## 九、v2 契约升版：常量表逐条列名（2026-10-19）

### 改了什么

- `interface.md` 里三处声明模式计分文件、五张声明由 `…` 改为逐条键值：`facade/artifact-caps.ts` 的 `ARTIFACT_CAPS`（8 键）、`facade/world-read-caps.ts` 的 `WORLD_READ_CAPS`（9 键）、`facade/registry.ts` 的 `WORLD_READ_REGISTRY`（8 行）与 `ARTIFACT_REGISTRY`（6 行）；`ARTIFACT_ID_PATTERN` 在 v1 已是完整源串，本次格式不变。口径见 `known-differences.md` K14。
- 数值与条目取自**合同断言**：`pure.test.mjs` 的 B22 用例（三张 caps 表的逐字数值与 id 字符集）与 `facade.test.mjs` 的 B29 用例（两张注册表的逐行 deepEqual），不取旧实现。
- `tests/gen-interface.mjs` 增加合同表映射；在契约基线树 `8c9a9e86` 上重新生成 `interface.md`（除本表与三处说明句外，仅 oxfmt 统一了代码块的行尾分号），再 `npx oxfmt`。**没有改任何测试断言**，也没有改兼容面、语料或录制。
- 核查范围：本包按声明模式计分的常量表只有上述三文件五张声明。`facade/report-caps.ts` 的 `REPORT_CAPS` 普通模式 containment 0.000、走正常计分，不在本次范围，其 `interface.md` 条目仍为 `…`。
- README 顶部版本 v1 → v2；`known-differences.md` 新增 K14；v1 的 `gate-old.json` 未改写。本次生成 `gate-old-v2.json`。

### 旧门重跑（旧实现 `8c9a9e86`，Node v24.14.0）

把 v2 合同目录原样拷入 `8c9a9e86` 的临时 worktree，先构建旧包，再跑通用旧门：

```bash
node scripts/contract-gate.mjs --contract specs/contracts/dynamic-workflow-02 \
  --tests "*.test.mjs" --dist-env KNORVIA_DW02_ENTRY=dist \
  --stub-root specs/contracts/dynamic-workflow-02/stubs \
  --stub-targets specs/contracts/dynamic-workflow-02/stubs/targets.txt \
  --json gate-old-v2.json
```

| 入口      | tests | pass | fail | 说明                                                               |
| --------- | ----: | ---: | ---: | ------------------------------------------------------------------ |
| 源码入口  |   420 |  420 |    0 | 15 个测试文件 / 62 suite，`duration_ms 45030.190742`               |
| dist 入口 |   420 |  420 |    0 | 同一组测试走 `KNORVIA_DW02_ENTRY=dist`，`duration_ms 41321.854464` |
| 桩替换    |    15 |    0 |   15 | 37 个重写目标替换后 15 个测试文件全失败，`allFail: true`           |

- `gate-old-v2.json`：`pass: true`，`commit 8c9a9e8686ae6c2a427e0a2b2e920917292ccba1`，`generatedAt 2026-10-19T02:51:44.429Z`，`node v24.14.0`。
- 与 v1 旧门（第二节）的用例数、通过数、桩替换计数逐项一致：v2 只增加合同文档中的常量表列名，不改断言强度与兼容面，因此旧实现的表现必须、也确实不变。

### 当前实现回归（同一 v2 合同）

| 入口      | tests | pass | fail | 说明                                       |
| --------- | ----: | ---: | ---: | ------------------------------------------ |
| 源码入口  |   420 |  420 |    0 | rewrite 树，`duration_ms 24705.512571`     |
| dist 入口 |   420 |  420 |    0 | 先前的构建产物，`duration_ms 25347.485001` |

声明模式计分复测（v2 `interface.md`）：`registry-tables.ts`、`artifact-caps.ts`、`world-read-caps.ts` 均 `residual-lines 0 / containment 0.000 / run 0 / structural 0.000`，`stripped-blocks` 分别为 7 / 2 / 1。

## 十、v3 契约升版：删桩、设计与来源登记（2026-10-19）

### 改了什么

- **删桩**：按计划书「每包流程」第五步与 dw01 #193 先例，删除 `stubs/`（37 个桩 + `build-stubs.mjs` + `targets.txt`）。桩替换的 allFail 证据保留在 `gate-old-v2.json` 的 `stubReplacement`（15 个测试文件全失败），断言未改；v3 起桩路径不再可复跑，两份已提交的旧门记录也不改写。
- **新增 `design.md`**：模块簇 C1–C7（41 个自有/重写文件）、状态所有者表、三条运行时管线（ask/queue/dispatch、world read/replay、run terminal）、关键数据结构（Boundary A/B/C、journal 行、事件轨）、B1–B30 落点与逐文件计分模式。
- **文档读数**：`README.md` 升 v3；`known-differences.md` K12 登记「登记后按合同基线冻结名单归位」的读数口径；`behavior.md` B20 的范围清单真源说明同步。测试断言一字未改。
- **范围读数**：`licensing/current-files.json` 里 41 个源文件登记为 `original` 后，上游关系按重写字节重算。为保持合同断言（40 文件 / 24+13+3 / 37 目标）逐字不变，`tests/scope.mjs` 把已登记目标按合同基线冻结的 24 个 `upstream-unchanged` 模块路径归位、其余算 `upstream-modified`，并跳过 4 个新拆模块（`facade/registry-tables.ts`、`lowering/ast-rewriter.ts`、`schema/definition-scope.ts`、`schema/value-describer.ts`）。
- **程序化登记**：`licensing/reviews.json` 由脚本追加 82 条（41 个源文件 + 39 个合同文件 + 本合同验收记录与替换验收文档），每条带 `normalizedSha256`、实测相似度或旧门证据；`current-files.json` 重新生成。条数 12,262 → 12,344。
- **下游 core 哈希 re-pin（#193 先例）**：`facade/dts.ts` 的模型可见正文重写后，core 的两个工具描述摘要随动——`create-workflow-graph-fold-contract.json` 的 `public`、`eval-workflow-snippet-execution-contract.json` 的 `modelContractSha256` 各更新为新值。只改哈希值，断言一字未动；可逆实验（临时换回旧 `dts.ts` 重建 → 13/13 通过 → 还原重写版并 re-pin → 13/13 通过）确认差异只来自这次有意的 facade 文本重写。
- **knip 入口**：根 workspace entry 补 4 个录制/生成器脚本（`record-golden.mjs`、`gen-interface.mjs`、`record-facade.mjs`、`scan-callers.mjs`）与 3 个测试辅助模块（`harness.mjs`、`scope.mjs`、`exports-ast.mjs`）；全仓输出不再有 `dynamic-workflow-02` 行。仓库既有 knip 基线仍不干净（见 §六）。

### 新实现最终回归（提交 `d98c7737`，Node v24.14.0）

| 入口      | tests | pass | fail | 说明                                                  |
| --------- | ----: | ---: | ---: | ----------------------------------------------------- |
| 源码入口  |   420 |  420 |    0 | 15 个测试文件 / 62 suite，`sourceFrom: "src"`         |
| dist 入口 |   420 |  420 |    0 | 同一组测试走 `KNORVIA_DW02_ENTRY=dist`；先 build 再跑 |

- `gate-final.json`（仓库外 `/workspace/ktools/dw02-gate-final.json`）：`pass: true`，`commit d98c77372a4088bcf51cd38a95d6b913c593143e`，`generatedAt 2026-10-19T03:32:34.019Z`，`stubReplacement: null`（v3 已删桩）。
- 相似度：普通模式 41 个候选 29 通过，声明模式 12 个候选 12 通过（`residual-lines` 全 0，三项指标全 0.000），合计 **41/41**；逐文件数值与理由见 `docs/knorvia-dynamic-workflow-02-acceptance.md`。
- 全仓搜 `not implemented: dynamic-workflow-02` 结果为零。
- **`pnpm test:studio`**：`tests 10103` / `suites 68` / `pass 10091` / `fail 3` / `cancelled 1` / `skipped 8`。4 个未通过项与 dw01 #193 / #198 相同，均为本机环境：3 个 file-watcher 用例撞容器 inotify 限额（`ENOSPC`，其中一个超时），1 个 CLI catalog 用例命中本机 `~/.grok/bin/grok`。隔离复跑分别 3/3（临时提高 inotify 限额后）与 4/4（干净 `HOME`），测试未改；CI 环境以自身结果为准。
