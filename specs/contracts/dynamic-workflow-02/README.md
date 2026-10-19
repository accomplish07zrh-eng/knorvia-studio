# dynamic-workflow-02 合同（README）

**v3 · 2026-10-19 · 分支 `replace/dynamic-workflow-02`（合同分支基线 `origin/main@3e9505cd`）**

v3（2026-10-19）：替换收尾，按计划书「每包流程」第五步删除 `stubs/`（37 个桩 + `build-stubs.mjs` + `targets.txt`），新增 `design.md`，登记合同文件与替换实现的来源。测试断言一字未改；`tests/scope.mjs` 只增加「登记后按合同基线冻结的 unchanged 名单归位、新拆模块不进兼容面」的读数口径，使范围断言在 `licensing/current-files.json` 重生成后仍指向原 40 个继承文件。新实现上重跑合同门：源码与 dist 各 420/420。桩替换的 allFail 证据留在 `gate-old.json` / `gate-old-v2.json`，不再可复跑，也不作为回退路径。

v2（2026-10-19）：按用户裁决，把声明模式计分的纯数据常量表在 `interface.md` 中逐条列出键与值，替换原来的 `…`；测试断言未改，旧门对旧实现 `8c9a9e86` 重跑并记录在 `acceptance.md` 第九节与 `gate-old-v2.json`（v1 的 `gate-old.json` 保持原样）。

本目录是 `@knorvia/dynamic-workflow` 运行时侧的替换合同：重写这个包时必须保住的行为、兼容面、调用方、夹具与证据。合同阶段只做计划书「每包流程」的前三步（选包与边界 → 合同八件套 → 在旧实现上跑旧门），**不含**重写实现、不含 `licensing/reviews.json` / `knip.json` 登记（第五步）。

合同版本号约定：任何语料、录制、断言强度或兼容面的变动都要升这里的第一行版本，并在 `acceptance.md` 追加一节说明改了什么、为什么；已提交的 `gate-old.json` 不被后续版本改写（它是 v1 旧实现的记录）。

## 范围与边界

- **在范围**：`apps/cli/packages/dynamic-workflow/src/` 下 **`analysis/` 与 `compiler/` 之外**的全部 .ts —— 根的两个入口桶、`engine/`、`facade/`、`lowering/`、`schema/`，共 **40 文件 / 7,341 行 / 329,075 字节**、**537 项顶层导出**。这 40 个文件是引擎运行时、facade 资产、降层与 schema 合成/校验的全部所有权所在。
- **不在范围**：`analysis/`（54 文件）与 `compiler/compile.ts` 属 [dynamic-workflow-01](../dynamic-workflow-01/README.md) 合同（静态分析 + TS 程序装配）。两包共享同一对入口桶：入口桶文件本身归本包（因此本包的 B20 钉它的归属面与运行时集合），而桶里再导出的**符号**有 40 项定义在 dw01 范围文件里——这条分工的口径差异记在 `known-differences.md` 第 1 节。
- 继承分类：upstream-unchanged 24 + upstream-modified 13 = **37 个重写目标**；3 个 `unreviewed`（`engine/ask-journal-projection.ts`、`engine/scheduler-helpers.ts`、`engine/workflow-error.ts`）本阶段不重写也不删（K12）。真源是 `tests/scope.mjs`（读 `licensing/current-files.json`），文档和测试都从它取数，不各写一份。
- 三条边界（behavior.md 全部条目都按它组织）：
  - **Boundary A** `WorkflowHostApi`：脚本够得着的 8 个方法（`ask` / `createActor` / `declareArtifact` / `enterPhase` / `log` / `publishArtifact` / `report` / `worldRead`）。**`args` 不属于这一层**，也不在 `WorkflowEngine` 上——它由沙箱子级垫片注入（K13）。
  - **Boundary B** `WorkflowDriver`：宿主效应面（`createActorSession` / `startAsk` / `respondToSubmit` / `cancelAsk` / `executeWorldRead` / 可选 `executeArtifactPublish` / `journal` / `emit` / 可选 `dispose`）。生产实现住在 `dynamic-workflow-runtime` 与 bootstrap，本包只以夹具 driver 断言效应序列。
  - **Boundary C** `RunEvent`：事件轨词汇表，journal 与 `emit` 两条轨逐条同序列。

## facade 资产的锁定口径（重要，先读这条）

`facade/dts.ts` 里的两份 `.d.ts`（`FACADE_DTS` 生产、`SNIPPET_FACADE_DTS` 片段子集）是脚本作者与模型唯一能看见的 API 面。本合同按 **`ts.createPrinter({ removeComments: true })` 打印出来的声明文本**逐字节锁定（2,777 / 1,063 字节，录制在 `fixtures/facade/`），**注释文字不进锁**。

理由（详见 `known-differences.md` K9）：

1. 重写时注释必须由 Knorvia 自己写——把旧实现约 16 KB 的散文原样搬进新文件不算独立实现。dw01 已经撞过一次同样的冲突，收尾方式是把归档里的注释换成自写文字、签名逐字节不变（dw01 K10）；本包从一开始就按这个口径设计，不留 re-pin 作业。
2. 逐字节锁留在真正需要它的地方：声明清单与顺序、每个签名行的字符、`Node<T>` 是 `PromiseLike` 而非 `Promise`、snippet 里消失的名字如何变成 2304——这些决定「同一份脚本编出来是不是同一个东西」。注释只是讲解。
3. 注释恰恰是最常改错又最难发现改错的部分。锁声明面、放注释面，两个风险同时被压住。

测试确实如此（不是文档承诺）：`facade.test.mjs` 的 describe「B29 facade 声明面逐字节锁定（注释文字不进锁）」有四条——录制逐字节一致、锁里没有注释标记（反向保证打印器真的剥干净了）、「注释怎么写都不碰锁」（换块注释文字、追加自写行注释与块注释，声明文本不变）、以及「签名动一个字就碰锁」（改一个返回类型或删一行，声明文本必变）。最后一条保证宽松没有把该锁的东西放掉。注释里的**结构化内容**仍由条目断言锁定：`ask<T = string>` 的默认值、接口成员与顺序、`SNIPPET_FACADE_DTS` 是生产文本的**子集**（逐条 declare 行原样出现）。

## 完成度

| 件                              | 文件                                                     | 状态 | 备注                                                                                                                   |
| ------------------------------- | -------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| 说明                            | `README.md`（本文件）                                    | v3   | v3 删桩、加 `design.md`、登记来源                                                                                      |
| 行为                            | `behavior.md`                                            | v1   | B1–B30，每条九项                                                                                                       |
| 设计与状态所有者                | `design.md`                                              | v3   | 模块簇、状态所有者、关键数据结构、B1–B30 落点                                                                          |
| 接口                            | `interface.md`                                           | v1   | 机器生成，勿手改；B20 的 oracle                                                                                        |
| 调用方                          | `callers.md`（+ `callers-raw.txt`）                      | v1   | 扫描脚本 `tests/scan-callers.mjs`                                                                                      |
| 测试                            | `tests/`（15 个 `.test.mjs` + 9 个辅助）                 | v1   | 420 例 / 62 suite，源码与 dist 双入口各全过                                                                            |
| 夹具                            | `fixtures/`（语料 + 2 份 golden + 2 份 facade 录制）     | v1   | 350 例 lowering + 26 例整轮运行                                                                                        |
| 预登记差异                      | `known-differences.md`                                   | v1   | K1–K13；K12 的读数口径按 v3 登记状态更新                                                                               |
| 验收                            | `acceptance.md`（+ `gate-old.json`、`gate-old-v2.json`） | v3   | 旧门 `pass: true`；新实现源码与 dist 各 420/420                                                                        |
| 桩（仅服务旧门的 allFail 证明） | `stubs/`（37 个桩 + `targets.txt`）                      | v1   | **v3 已删除**；证据留 `gate-old-v2.json` 的 `stubReplacement`，不再可复跑                                              |
| 无用代码删除                    | ——                                                       | 空   | `npx knip -W @knorvia/dynamic-workflow --include=exports,types,files` 退出码 0 且空输出；4 个零消费者再导出按 K11 保留 |

## 运行契约测试

```bash
export PATH=~/.local/node24/bin:$PATH            # Node 24.14.0（本合同在这个版本实测）

# 源码入口
node --import tsx --test --test-timeout=60000 "specs/contracts/dynamic-workflow-02/tests/*.test.mjs"

# dist 入口（先构建）
pnpm --dir apps/cli/packages/dynamic-workflow build
KNORVIA_DW02_ENTRY=dist node --import tsx --test --test-timeout=60000 \
  "specs/contracts/dynamic-workflow-02/tests/*.test.mjs"
```

入口切换集中在 `tests/entry.mjs`：默认源码，`KNORVIA_DW02_ENTRY=dist` 走产物；深层模块用 `importDeep()`，同一入口两侧写法一致。dist 入口红一次就说明编译产物与源码行为不一致。离线回归 `pnpm test:studio` 会自动收录这些 `.test.mjs`（M0-10 机制）。

重新录制（只在旧实现上、只在语料或实现真变了时做；录完必须格式化）：

```bash
node --import tsx specs/contracts/dynamic-workflow-02/tests/record-golden.mjs   # 显式拒绝 dist 入口
node --import tsx specs/contracts/dynamic-workflow-02/tests/record-facade.mjs
node --import tsx specs/contracts/dynamic-workflow-02/tests/gen-interface.mjs   # 重新生成 interface.md
npx oxfmt specs/contracts/dynamic-workflow-02/fixtures specs/contracts/dynamic-workflow-02/interface.md
DWF02_CORPUS_CHECK=1 node --import tsx specs/contracts/dynamic-workflow-02/fixtures/corpus.mjs  # 语料规模自检
```

跑旧门（**v1/v2 历史命令**，当时用于生成 `gate-old.json` / `gate-old-v2.json`；v3 起 `stubs/` 已删除，桩替换这一段不再可复跑，两份已提交的旧门记录也不改写。`--build` 那步是 Windows PowerShell 路径，Linux 侧先单独 build）：

```bash
node scripts/contract-gate.mjs \
  --contract specs/contracts/dynamic-workflow-02 --tests "*.test.mjs" \
  --dist-env KNORVIA_DW02_ENTRY=dist \
  --stub-root specs/contracts/dynamic-workflow-02/stubs \
  --stub-targets specs/contracts/dynamic-workflow-02/stubs/targets.txt \
  --json specs/contracts/dynamic-workflow-02/gate-old.json
```

当前实现 / 替换后的回归门（不带桩替换，报告写到合同目录以外）：

```bash
node scripts/contract-gate.mjs \
  --contract specs/contracts/dynamic-workflow-02 --tests "*.test.mjs" \
  --dist-env KNORVIA_DW02_ENTRY=dist \
  --json ../ktools/dw02-gate-current.json
```

桩替换会把桩覆盖到工作树的真实文件（tmpdir 备份 + `finally` 还原），**只在 `git status` 干净的树上跑**（历史命令；v3 起桩已删除）。

## 旧门尾部输出（v1，提交 `7107a48b`，Node v24.14.0）

```
contract-gate: 源码入口（15 个测试文件）…
  tests=420 pass=420 fail=0 skipped=0 exit=0
contract-gate: dist 入口…
  tests=420 pass=420 fail=0 skipped=0 exit=0
contract-gate: 桩替换 37 个目标文件后重跑源码入口…
  tests=15 pass=0 fail=15 allFail=true
contract-gate: 报告写入 specs/contracts/dynamic-workflow-02/gate-old.json
```

`gate-old.json`：`pass: true`，`generatedAt` `2026-10-18T18:37:08.667Z`，源码 `ℹ duration_ms 35780.082636`、dist `ℹ duration_ms 34071.828047`。其余门禁结果（fmt / lint / typecheck / architecture / knip）见 `acceptance.md` 第六节。

## 替换实现回归（v3，提交 `a2af8231`，Node v24.14.0）

```
contract-gate: 源码入口（15 个测试文件）…
  tests=420 pass=420 fail=0 skipped=0 exit=0
contract-gate: dist 入口…
  tests=420 pass=420 fail=0 skipped=0 exit=0
```

不带桩替换（v3 已删桩）；源码与 dist 各 420/420、62 suite。详细验收见 `docs/knorvia-dynamic-workflow-02-acceptance.md`。

## 条目 → 测试对照表（B1–B30）

| 条目 | 标题（behavior.md）                                 | 测试文件                      | 该条所在的 describe / test 标题                                                                                                                                                                                                                               |
| ---- | --------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1   | 实例身份 = 站点 × 每站点序号                        | `engine-ask.test.mjs`         | 「B1 实例身份 = 站点 × 每站点序号」                                                                                                                                                                                                                           |
| B2   | actor 身份、persona 规范化与重名                    | `engine-ask.test.mjs`         | 「B2 actor 身份、persona 规范化与重名」                                                                                                                                                                                                                       |
| B3   | ask 准入的两条硬错误                                | `engine-ask.test.mjs`         | 「B3 ask 准入的两条硬错误」                                                                                                                                                                                                                                   |
| B4   | typed ask 的 submit 裁决（repair 预算）             | `engine-ask.test.mjs`         | 「B4 typed ask 的 submit 裁决」（`REPAIR_ATTEMPTS === 3` 的第 4 次越线用例）                                                                                                                                                                                  |
| B5   | untyped 结算与 typed 的 nudge 预算                  | `engine-ask.test.mjs`         | 「B5 untyped 结算与 typed 的 nudge 预算」（含 `NUDGE_ATTEMPTS === 1`）                                                                                                                                                                                        |
| B6   | 每 actor FIFO、actorSeq 与并发上限                  | `engine-ask.test.mjs`         | 「B6 每 actor FIFO、actorSeq 与并发上限」                                                                                                                                                                                                                     |
| B7   | ask 的 journal 行与事件序列                         | `engine-ask.test.mjs`         | 「B7 ask 的 journal 行与事件序列」                                                                                                                                                                                                                            |
| B8   | ask 的进度与用量观察                                | `engine-observation.test.mjs` | 「B8 ask 的进度与用量观察」                                                                                                                                                                                                                                   |
| B9   | 展示通道与 run 级观察                               | `engine-observation.test.mjs` | 「B9 展示通道：log 与 phase 标记」+「B9 自适应并发与 run 级观察」                                                                                                                                                                                             |
| B10  | driver 侧不可恢复错误结算该 ask                     | `engine-ask.test.mjs`         | 「B10 driver 侧不可恢复错误结算该 ask」                                                                                                                                                                                                                       |
| B11  | 世界读取：准入、结算与 replay                       | `engine-world.test.mjs`       | 「B11 世界读取：准入、结算与 replay」                                                                                                                                                                                                                         |
| B12  | 世界读取的有界输入                                  | `engine-world.test.mjs`       | 「B12 世界读取的有界输入」                                                                                                                                                                                                                                    |
| B13  | resume：同一 runId 的第二世                         | `engine-resume.test.mjs`      | 「B13 resume：同一 runId 的第二世」                                                                                                                                                                                                                           |
| B14  | amend-resume 的导入缓存                             | `engine-resume.test.mjs`      | 「B14 amend-resume 的导入缓存」                                                                                                                                                                                                                               |
| B15  | report 的发布路径                                   | `engine-report.test.mjs`      | 「B15 report 的发布路径」                                                                                                                                                                                                                                     |
| B16  | 内容族：发布是效应                                  | `engine-artifact.test.mjs`    | 「B16 内容族：发布是效应」                                                                                                                                                                                                                                    |
| B17  | 预置族：声明不是效应                                | `engine-artifact.test.mjs`    | 「B17 预置族：声明不是效应」                                                                                                                                                                                                                                  |
| B18  | 结算时对在飞 ask 的中止                             | `engine-settlement.test.mjs`  | 「B18 结算时对在飞 ask 的中止」                                                                                                                                                                                                                               |
| B19  | 三条终态路径                                        | `engine-settlement.test.mjs`  | 「B19 三条终态路径」                                                                                                                                                                                                                                          |
| B20  | 兼容面（范围清单 / interface.md 同步 / 根桶归属面） | `surface.test.mjs`            | 三个 describe：「B20 范围清单…」「B20 interface.md 与源码同步」「B20 根桶的归属面」                                                                                                                                                                           |
| B21  | 确定性哈希（canonicalJson / fnv1a / inputHash）     | `pure.test.mjs`               | 三个 describe：「B21 canonicalJson…」「B21 fnv1a…」「B21 inputHash…」                                                                                                                                                                                         |
| B22  | 上限常量表                                          | `pure.test.mjs`               | 「B22 上限常量表」                                                                                                                                                                                                                                            |
| B23  | journal 内存端口                                    | `journal.test.mjs`            | 五个 describe：「B23 run 行的建立与未知 run」「B23 深拷贝边界」「B23 行的身份与 upsert」「B23 结算袋的三种写入规则」「B23 事件轨：sequence、时刻与分页」                                                                                                      |
| B24  | 自适应并发控制器                                    | `concurrency.test.mjs`        | 六个 describe：「B24 初始状态与闸门」「B24 乘性减少」「B24 加性递增与 lastGood」「B24 其它信号」「B24 空闲重置」「B24 reason 词汇表」                                                                                                                         |
| B25  | lowering：facade 调用按站点身份改写                 | `lowering.test.mjs`           | 四个 describe：「B25 站点改写的形状」「B25 可选链的短路保留」「B25 输出契约…」「B25 脏脚本不降级」                                                                                                                                                            |
| B26  | golden 回放（350 例 lowering + 26 例整轮运行）      | `golden.test.mjs`             | 该文件按**族**回放，标题不带 B 号：「golden 回放（source 入口）：语料与录制清单一一对应」+「…：lowering 族 350 例」+「…：engine-run 族 26 例」                                                                                                                |
| B27  | schema 合成                                         | `schema.test.mjs`             | 十个 describe（「B27 typed 判定…」「B27 发射器：标量…」「B27 发射器：union…」「B27 发射器：递归…」「B27 JSDoc 约束与描述」「B27 拒绝诊断…」「B27 report 实参…」「B27 一站式入口与短路」「B27 buildAskSpecs…」「B27 submit profile」「B27 serializeSchema…」） |
| B28  | schema 校验器与违规模型                             | `schema.test.mjs`             | 四个 describe：「B28 校验器：许可式空 schema 与关键字优先级」「B28 校验器：对象、数组与字符串/数值约束」「B28 校验器：$ref 解析域」「B28 违规模型：formatViolation 与 formatViolations」                                                                      |
| B29  | facade 资产与两张注册表                             | `facade.test.mjs`             | 四个 describe：「B29 facade .d.ts 文本面」「B29 facade 声明面逐字节锁定（注释文字不进锁）」「B29 两张注册表」「B29 身份按声明判定，不按拼写」                                                                                                                 |
| B30  | projections 桶：浏览器安全子集                      | `surface.test.mjs`            | 「B30 projections 桶：浏览器安全子集（source）」（dist 入口同名一条）                                                                                                                                                                                         |

> B26 的号位在测试里不挂标签：`golden.test.mjs` 用 `test()` 平铺、按族命名，所以对照表引的是它的三条真实标题。其余条目号在 `describe` 标题里逐字可见，`node --test` 的输出可以直接对着这张表读。

## 待决事项（不在合同阶段擅自执行）

1. **K10 的 message 文本**：`fixtures/golden/engine-run.json` 把 21 处引擎错误 `message` 录进了回放载荷，而合同另一处口径是「流程判断一律用码，绝不匹配错误文本」。需 Lead 裁定：（a）把 `message` 从比对载荷里摘掉（要升版本并说明强度变化），还是（b）要求重写实现复用旧文案。红线是不放宽断言，本阶段两者都不做。
2. ~~**`facade/dts.ts` 的相似度计分**~~（v3 已定）：替换实现的注释全部自写，普通模式实测 containment 0.1225 / longest run 2 / structural 0.0909，三项门槛全过；无需另开声明模式口径。逐文件数值见 `docs/knorvia-dynamic-workflow-02-acceptance.md`。
3. ~~**第五步登记**~~（v3 已完成）：41 个重写源文件（37 个继承目标 + 4 个新拆模块）、合同文件与验收文档已登记为 `original`；`knip.json` 根 entry 已补本包 4 个录制/生成器脚本。
4. **Windows 腿**：本地只在 Linux 实测；本阶段不 push、不开 PR，`studio-offline.yml` 的 Windows 结果尚未取得。
5. **符号级引用回溯**：`pnpm dep:refs` 在 537 项导出规模下 V8 OOM，替换阶段按需对单文件跑；当前的兼容面判断建立在语法级扫描 + 字符串路径人工核对（本包命中为零）之上。
