# dynamic-workflow-02 既存差异（known-differences.md）

v2。本文件记录**不在本包范围的相邻事实**与**旧行为里看起来奇怪但必须原样保留**的特征。重写时不得「顺手修掉」K1–K8；K9–K14 是合同口径与登记条目（K9 是 facade 锁定口径，K10–K13 是替换阶段需要知道的既存事实，K14 是 v2 的常量表列名口径），不要求实现侧去「修正」旧行为。

## 1. 不在本包范围的相邻文件

| 相邻面                                                                                        | 归属                                        | 说明                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/analysis/*.ts`（54 文件）、`src/compiler/compile.ts`                                     | dynamic-workflow-01（已完成 v3）            | 本包**不碰**，但两者都 import 本包的 `facade/dts.js` 与 `facade/registry.js`（见 `callers.md` B 节）：**相对路径与导出名是双向兼容面**。                                                                                                                                                                                                        |
| `src/compiler/libs.generated.ts`                                                              | 构建期生成物（`scripts/generate-libs.mjs`） | 不进合同覆盖范围。但它决定 `createWorkflowProgram` 看到的 lib 注释文本，因此间接影响本包 B27 的 schema `description`（见 K3）。                                                                                                                                                                                                                 |
| `apps/cli/packages/dynamic-workflow/test/ask-scheduler-{contract.test.ts,fixture.ts}`         | 本包自身的旧测试（`pnpm test:studio` 跑）   | 按相对路径深 import `engine/{scheduler,hash,journal-memory,types,scheduler-types,imported-cache}.js`，是这些模块路径的冻结消费者（`callers.md` C 节）。                                                                                                                                                                                         |
| `engine/ask-journal-projection.ts`、`engine/scheduler-helpers.ts`、`engine/workflow-error.ts` | `unreviewed`（M0-2/M0-3 复核范围）          | 分类为 unreviewed → **不进重写目标清单**（37 = 40 − 3），不重写、不删（同 shared-01 与 dw01 §1 口径）。见 K12。                                                                                                                                                                                                                                 |
| `fixtures/entry-exports.json`（dw01 的）、`fixtures/corpus.mjs`（dw01 的 324 例语料）         | dynamic-workflow-01                         | 本包的 `surface.test.mjs` 与 `golden.test.mjs` **跨合同读取**这两件资产做对照（入口桶运行时集合逐字一致、语料 expect 分类自检）。这是有意的跨合同复用，代价是 dw01 语料被本包测试依赖，因此 `corpus.mjs` 里有 `dw01CorpusPin`（条数 + 逐条摘要的硬校验，不随环境开关关闭）：上游语料一变就抛，逼一次重录与升版本（见 `acceptance.md` 第三节）。 |
| `@knorvia/dynamic-workflow` 与 `.../projections` 的 exports map                               | 包配置（`package.json`）                    | 只有两项，包外无法按子路径 import。两个入口桶文件本身**在本包范围内**（scope 的 `""` 桶 2 个文件）——dw01 的 `README.md` §1 把它们写成「不重写」，实际归属本包，本包 `surface.test.mjs` 的 B20/B30 负责钉住其再导出面与浏览器安全不变式。                                                                                                        |

## 2. 旧行为特征（保持原样，勿「修」）

### K1 `phase` 的名字质量不是 lowering 的地盘：非字面量与全空白一律降级成 `void 0`

facade 注释写着「Two rules the compiler enforces. The name must be a compile-time string literal … and non-empty」（`facade/dts.ts` 的 `phase` 段）。这条**是**由 `analysis/phases.ts` 的 9004 诊断强制的（dw01 范围），但 **lowering 一侧完全不检查**：非字面量、全空白、被别名引用的 phase 名统统改写成 `void 0;`。

- 证据：`lowering.test.mjs`「phase 名去两端空白；名字缺席（非字面量或全空白）退回 void 0 而不是残留自由标识符」、「phase 的名字质量是 analyze 的地盘：lowering 一律放行成 void 0」；golden `lowering` 族同形例。
- 为什么必须保持：`void 0` 是**下限保证**——沙箱里绝不能残留一个自由标识符 `phase`（那会在运行期炸成 ReferenceError，把一个静态可诊断的问题变成一次不可解释的 run 失败）。名字质量问题在管线的上游（analyze）已经给出 9004，lowering 不参与判断。
- 重写不得：在 lowering 里新增名字合法性检查（会改变降级代码文本，golden 即红），也不得改成保留原表达式（残留自由标识符）。

### K2 简写属性里的 `args` 不改写：代价是留一个自由标识符

`const sh = { args };` 降级别动——把 `{ args }` 改成 `{ args: __host.args }` 是另一回事（改了就写出非法/不同形状的语法）。于是这份降级代码里**确实**留着一个不存在的自由标识符 `args`。

- 证据：`lowering.test.mjs`「简写属性里的 args 不改写（改了会写出非法语法），代价是留一个自由标识符」，断言降级文本为 `const sh = { args };`，并用 `new vm.Script(...)` 证明它仍可解析。
- 为什么必须保持：这是「改写只碰能安全碰的位置」这条规则的必然结果，同一条规则还解释了 `function f(args) {...}` 的参数名不改写。
- 重写不得：为了「不留自由标识符」而改写简写属性（golden 红），也不得改成编译期报错（那条规则归 analyze，且 analyze 也不报）。

### K3 泛型实例化的根 `description` 抢的是 **lib 符号**的英文注释，脚本自己的注释抢不到

`await a.ask<MyRecord>("t")` 且 `type MyRecord = Record<string, number>` 时，合成 schema 的根 `description` 是 `"Construct a type with a set of properties K of type T"`——TypeScript `lib.es2022.d.ts` 里 `Record` 的 JSDoc 原文；脚本写在 `type MyRecord` 上方的「我自己的说明」被忽略。而 `interface Boxed` 的注释正常拿到。

- 证据：`schema.test.mjs`「根 description 取类型自己的 aliasSymbol：泛型实例化的别名是库符号，脚本注释抢不到」（两侧逐字节 deepEqual）。
- 原因所在：发射器按**类型自己的 aliasSymbol** 取顶部注释；泛型实例化的别名解析到 lib 符号，不是脚本符号。
- 为什么必须保持：这段文本会进发给模型的 prompt（`buildAskSpecs` 的产物），重写「修好」它 = 改变发送给模型的内容，也改变本包断言。
- **附带风险（登记，不处理）**：这条断言把**已安装 typescript 版本的 lib 注释文本**钉进了合同；升级 TS 若改动该注释，`schema.test.mjs` 会红。同一类版本敏感性见 K11 与 `README.md` 待决事项（facade 声明锁依赖 `ts.createPrinter` 的输出形状）。

### K4 `integer` 出现在 union 的 `type` 数组里时，整数性检查整个消失

`{ type: "integer" }` 校验 1.5 → 报 `$: expected integer, got number 1.5`。`{ type: ["integer", "string"] }` 校验 1.5 → **不报**（通过）。判定式是 `schema.type === "integer"` 的**精确等于**，数组形态永远不满足。

- 证据：`schema.test.mjs`「integer 的类型匹配放过任何有限数，整数性单独检查」＋「integer 出现在 union type 里时整数性检查整个消失（判定式是精确等于）」。
- 为什么必须保持：这是校验器的既存宽松面。合同把它钉住而不是「修」它，是因为**已录制的行为比设计意图更有约束力**：宿主与脚本作者可能已经依赖 union 里的 integer 不报。要收紧得先立规格再升合同版本，不在本合同里做。
- 重写不得：顺手改成「数组里含 integer 就检查」——那会让本条断言红，也让既有 run 的校验结果改变。

### K5 journal 的终态写入不对称：失败三件套整体改写，产物「缺席即不触碰」且 `null` 是合法产物

`updateRunStatus(runId, status, settlement)` 在终态时：

- `failure` / `stopReason` / `supersededBy` 三件**整体改写**——本次没带就等于「没有」（上一次的停止原因必须消失）。
- `result`（产物）**相反**：缺席即不触碰，前一次结算的产物保留；`null` 是合法产物值（键在场、值为 null）。产物还能**活过终态翻转**：`errored` 的结算袋不带产物不等于「删掉产物」。
- 非终态（`pending`/`running`）则把失败三件套**与产物一起清空**——running 的行不能同时说「已失败」。

证据：`journal.test.mjs`「结算袋的三种写入规则」describe 下的「非终态一律清空失败三件套与产物…」「终态：失败三件套整体改写，缺席即没有失败」「终态：产物相反，缺席即不触碰，null 是合法产物」、「pending 与 running 同一条清空规则」。

为什么必须保持：这一条决定 `dwf_run` 的读侧语义（resume、UI 快照、导入缓存重建）；改成对称规则会让「带 undefined 的一次补写」被读成「产物被删除」。

### K6 同一次信号里，空闲重置与 cap 裁决**互斥**（类注释说的「会是 2 条」不可达）

`engine/concurrency.ts` 的类注释（第 15 行）说信号方法返回的变化列表「通常 0 或 1 条；空闲重置紧接着一次限流时会是 2 条」。**实测不可达**：`idleReset` 在自己的入口处把 `epoch += 1`，紧随其后的 `if (epoch !== this.epoch) return changes` 必然把这批 429/成功判成陈旧——于是这一次信号只带 **1 条**（`idle_reset`），cap 裁决被挡在门外。

- 证据：`concurrency.test.mjs`「一次信号里空闲重置与 cap 裁决互斥：重置翻走的 epoch 把这批 429 挡成陈旧」（`deepEqual(..., [一条 idle_reset])`）、「任一信号都会顺带做空闲检查，不只是 observe」（`waiters`/`failedTransient`/`ended` 各 1 条）。合同另用 `node --import tsx` 探针复算过：`throttled(T0+IDLE, 旧 epoch, "rate_limited")` 返回长度 1。
- 为什么必须保持：这是**批次阻尼**的另一半——空闲重置意味着「从零重新学习」，同一批请求的 429 评价的是重置前的 cap，让它参与裁决会把刚抬回天花板的闸门立刻砍下去。
- 重写不得：让一次信号返回 2 条变化（阻尼语义改变），也不得把注释里的「会是 2 条」当规格去实现——注释文字不进锁（见 K9），实现以本条与测试为准。替换阶段若重写 `concurrency.ts` 的注释，应把它改成「一次信号只会带一条变化：空闲重置会把同批的裁决挡成陈旧」。

### K7 `world.run` 的三个名字各归各处：站点 id 前缀 `world-read#`、op `run`、节点 kind `world-run`

`world.run(...)` 降级成 `__host.worldRead("world-read#N", "run", [...])`——站点 id 与其余七个世界读**共用 `world-read#` 前缀和同一个递增序**；op 是 `"run"`；引擎落 node 行时 kind 是 `"world-run"`。三者不同名，也不能合并。

- 证据：`lowering.test.mjs`「world 读取与 git 观察一律收成 worldRead(siteId, op, [实参])，实参按位置打包」（八行里 `"world-read#1"` 配 op `"run"`）；`engine-world.test.mjs`「world.run 单列一种 kind（效应不是读），并在派发前关掉导入缓存」（`nodeRow(...).kind === "world-run"`）；`facade.test.mjs`「snippet 姿态下世界读仍然成站点」（`["world-read#2", "run", 1]`）。
- 为什么必须保持：站点 id 是 journal 与 resume 缓存的**身份键**，kind 是展示与投影的分支键；把 id 前缀改成 `world-run#` 会让同一 run 内世界读站点的序号分配与既有行错位（`callers.md` A1：adapters 把字段名当表 schema 用）。
- 重写不得：统一这三处命名，也不得让引擎去解析 siteId 的前缀（引擎对 siteId 无感，只照原样入库）。

### K8 两条上限通道的方向相反：`WorldReadCapExceeded` 是节点级拒绝，`ReportCapExceeded` 是 run 级失败

同样一件事（「超过某个数值上限」）在这个联合类型里落在**两侧**，分界线不是严重程度而是**有没有可 catch 的通道**：世界读取返回脚本能 `catch` 的 promise，所以超限是 node 级拒绝（「缩窄 pattern 或加个 glob」是脚本真能走的路）；`report` 返回 `void`，没有任何可以拒绝进去的地方，所以同样的事实只能是 failRun。两个数字也因此必须宽到讲道理的脚本永远碰不到（`report`：单 run 256 条、单条 item 序列化 32KB）。两者都刻意**不**折进 `DriverError`。

- 证据：`pure.test.mjs`「B22 上限常量表」（`WORLD_READ_CAPS` / `REPORT_CAPS` / `ARTIFACT_CAPS` 三张表的逐字数值）；`engine-report.test.mjs`「item 不是 JSON（undefined / 函数 / symbol）⇒ failRun DriverError，不落行」、「item 带环 ⇒ failRun DriverError（探针先于 canonicalJson，否则是爆栈而不是一次可读失败）」；`engine-world.test.mjs`「driver 抛 WorkflowError 时原样保留，不折进 DriverError」（样本正是 `WorldReadCapExceeded`：节点级、脚本可 catch、run 仍活着）；`engine-artifact.test.mjs` 两侧同事不同道——内容族「第二个 id 想当 primary ⇒ 节点级 ArtifactPrimaryConflict（排在上限之前）」「同一 id 的第 17 版 ⇒ ArtifactVersionCapExceeded」「第 33 个新 id ⇒ ArtifactCapExceeded；复用已有 id 不受影响」，预置族「第二个 id 想当 primary ⇒ ArtifactPrimaryConflict 让 run 失败」。
- 为什么必须保持：这是本包错误分类的**结构规则**（通道按成员族分裂），流程判断一律用码，绝不匹配 message 文本（`engine/types.ts` 的联合类型注释即此意）。
- 重写不得：为了「一致性」把两条并到同一个级别，也不得把任何一条折进 `DriverError`。

## 3. 合同口径与登记条目（不要求实现侧动作）

### K9 facade 资产的锁定口径：声明清单与签名行逐字节锁定，**注释文字不进锁**

（用户批准，2026-10-19。本条目是合同口径，不要求实现侧动作。）

**规则**：两份 facade 资产（`FACADE_DTS` 生产、`SNIPPET_FACADE_DTS` 片段子集）按 **`ts.createPrinter({ removeComments: true })` 打印出来的声明文本**逐字节锁定；原文里的讲解性注释（`/** … */` 与 `// …`）**不进锁**。

**理由**：

1. **重写时注释必须由 Knorvia 自己写**。计划书「独立实现」口径：改名或逐行改写不算独立实现；把旧实现 16 KB 的散文原样搬进新文件，等于把一段不受本方案约束的内容当资产继承。dw01 已经撞过一次同样的冲突，收尾方式是把归档里的注释换成自写文字、类型签名逐字节不变（dw01 `known-differences.md` K10）。本合同从一开始就按这个口径设计，不留 re-pin 作业。
2. **逐字节锁仍然完整保留在真正需要它的地方**。facade 是脚本作者**唯一能看见的 API 面**：声明清单（顺序即文本顺序）、签名行的每个字符、`Node<T>` 是 `PromiseLike` 而非 `Promise`、四个 snippet 里消失的名字怎么变成 2304——这些决定「同一份脚本编出来是不是同一个东西」，必须逐字节。而注释只是给模型和人看的讲解。
3. **注释恰恰是最常改错又最难发现改错的部分**：facade 原文 19,067 字符里约 16 KB 是注释，声明部分只有 2,777 字符（snippet 7,289 → 1,063）。若整份文本逐字节锁，重写要么照抄旧散文（违反 1），要么每改一个字就红一次；若完全不锁，重写可能悄悄丢掉一条签名。按「去注释后的声明」锁，两边都成立。

**测试确实如此**（`facade.test.mjs` describe「B29 facade 声明面逐字节锁定（注释文字不进锁）」，四条断言）：

- 「两份 facade 的去注释声明文本与录制逐字节一致」——与 `fixtures/facade/{production,snippet}-declarations.txt`（由 `tests/record-facade.mjs` 录制）逐字节比对。
- 「锁里没有注释：声明文本比原文小一个量级且不含任何注释标记」——反向保证：若打印器哪天没剥干净，这条会先红；同时断言原文确实以注释为主（否则比例断言是空转）。
- 「注释怎么写都不碰锁：换文字、加行注释、加块注释，声明文本逐字节不变」——把原文第一处块注释整段换掉、在顶部追加自写的行注释与块注释，声明文本必须与基线一致。**这条就是重写时自写注释的许可本身。**
- 「签名动一个字就碰锁」——把 `declare function log(message: string): void` 的返回类型改成 `number`、或整行删掉，声明文本必须变化。**这条证明上一节的宽松没有把该锁的东西放掉。**

**边界**：不进锁的只有注释**文字**。注释里的**结构化内容**仍由条目断言锁定——例如 `ask<T = string>` 的默认值、`ArtifactRef`/`ChartSpec` 等接口的成员与顺序、`SNIPPET_FACADE_DTS` 是生产文本的**子集**（每条 declare 行逐字节出现在生产文本里，而不是改写版）。K1 里那句「Two rules the compiler enforces」是注释散文，重写可以（也应该）自写成不误导的说法；9004 的实际归属由 `lowering.test.mjs` 那两条钉住，与注释无关。

### K10 golden 里钉住了旧实现的**错误消息文本**（登记，并列为待决）

`fixtures/golden/engine-run.json` 的 26 例把 `WorkflowErrorJson` 整条录进回放，其中含 **21 处** `message` 字符串（例如 repair 预算耗尽、世界读上限、校验反复失败这三类的旧文案）。合同同时规定「流程判断一律用码，绝不匹配错误文本」（`engine/types.ts` 的联合类型注释、K8）。

- 影响：重写实现若要产出不同的 message 文本，这 26 例即红——这是本合同里**唯一**一处「以 message 文本作为判据」的地方，与「文本不是判据」的设计意图相冲。
- 现状处理：**不放宽断言**（红线），本条目把它登记为既存张力，列入 `README.md` 待决事项：由 Lead 裁定是（a）把 message 从 golden 的比对载荷里摘掉、只留 `code` 与结构化字段（需要升合同版本并明确说明强度变化），还是（b）要求重写实现复用旧文案（与「注释须自写」的口径不一致）。合同阶段两者都不擅自执行。
- 静态那一半不受影响：`fixtures/golden/lowering.json` 的 350 例录的是 `diagnostics[].message`（编译诊断文本，由 `typescript` 与 dw01 的 analyze 侧产生）与降级代码文本，不含引擎错误 message。

### K11 入口桶再导出中有 4 个符号全仓零消费者（保留 + 登记，不在合同阶段删除）

`artifactFamilyOf`、`formatViolations`、`serializeSchema`、`synthesizeWorkflowSchemas` 由 `src/index.ts` 再导出，但**全仓（`apps` + `packages`）没有任何引用点**；`knip --include=exports,nsExports,types,nsTypes -W @knorvia/dynamic-workflow` 输出为空（入口文件的再导出按公共 API 处理，不计未用导出），所以「无用代码核查」不会把它们报出来。

- 处理：本合同**保留**这四个导出（`interface.md` 照列，`surface.test.mjs` 的归属面断言照钉），不删、也不因此放宽任何断言。它们不是「包外兼容压力」，但也不是本包可以静默消失的导出——删除属实现变更，要走「无用代码单独提交」那条流程与证据，本阶段没有做也没有必要做（用户批准的删除清单为空）。
- 替换阶段若要删，判据是：`surface.test.mjs` 的入口集合断言、`interface.md` 的对应声明块、以及 dw01 侧无引用（已核对：四个名字在 `analysis/`、`compiler/` 里也无人用）。

### K12 三个 `unreviewed` 文件不进重写目标

`engine/ask-journal-projection.ts`、`engine/scheduler-helpers.ts`、`engine/workflow-error.ts` 在 `licensing/current-files.json` 里分类为 `unreviewed`（M0-2/M0-3 复核范围）：本包**不重写、不删**，重写目标 = 40 − 3 = **37**（v1/v2 的 `stubs/targets.txt` 与桩替换验证都按 37 走；v3 已删桩，证据留在 `gate-old-v2.json`）。

- 注意这三件里包含 `engine/workflow-error.ts`（`WorkflowError` 的定义文件，被 12 个文件引用）——不重写不等于不重要：它的行为由 B1/B4/B10/B18/B19 等条目**从公开面**钉住，重写实现必须继续以同样的构造与 `toJSON()` 形状使用它。
- 分类与计数唯一真源是 `tests/scope.mjs`（读 `licensing/current-files.json`），`surface.test.mjs` 与 `README.md` 的完成度表都从它取数。v3 登记后，37 个重写目标的 `classification` 变成 `original`、4 个新拆模块（无 upstream）进册，`scope.mjs` 因此把已登记目标按合同基线冻结的 `upstream-unchanged` 名单归位、其余算 `upstream-modified`，并跳过新拆模块——范围断言仍指向原 40 个继承文件、分类计数仍是 24 / 13 / 3，断言本身一字未改。若未来审计把某个 `unreviewed` 复核成继承分类或新增继承文件，先改合同口径与 `interface.md`，`surface.test.mjs` 会先红，不会静默漏。

### K13 合同自身的一处更正：engine-run 的驱动语义（夹具头部注释，已就地改对）

录制 engine-run 族时，`tests/harness.mjs` 与 `fixtures/families/engine-run.mjs` 的头部注释最初把驱动表写成「引擎在 repair 时会重新调用 `startAsk`」。**实测不是这样**：repair / nudge 在**同一次派发**上重试，引擎不再调 `startAsk`；所以一个驱动条目在**派发时**消耗一次、在**每次 reject/nudge 裁决后**再消耗一次。两处头部已按实测改写，`async-helper-keeps-ordinals` 的驱动表也从「两个站点各一条」改成「同一个 `ask#1` 两条」。

- 这不是实现侧差异，而是**合同侧文档的一次就地更正**；登记在此是为了让按早期草稿评审的人知道判据变了哪一句。
- 同批更正：`args` 不在 Boundary A / 引擎上。`WorkflowEngine` 没有 `args` 成员——它由沙箱子级垫片注入（`dynamic-workflow-runtime/src/child-source.ts`），`EngineConfig.args` 只落 `RunRecord.args`。装配夹具因此显式构造 `{ 8 个 Boundary A 成员 + args }` 的垫片，并断言 `WorkflowEngine` 确实**没有** `args`（少一层假设就少一处可能的错判）。

### K14 interface.md 逐条列出声明模式常量表的键与值（v2，用户裁决）

（用户裁决，2026-10-19。本条目是合同口径，不改行为、不改测试断言。）

**规则**：键名与数值由合同写死的纯数据常量表，`interface.md` 必须逐条列出每个条目的键与值，不得把初始值截成 `…`。替换阶段按声明模式计分的文件恰为三处、五张声明：

| 文件                        | 声明                  | 条目                                                   |
| --------------------------- | --------------------- | ------------------------------------------------------ |
| `facade/artifact-caps.ts`   | `ARTIFACT_CAPS`       | 8 个键，数值见 B22                                     |
| `facade/artifact-caps.ts`   | `ARTIFACT_ID_PATTERN` | 源串 `^[A-Za-z0-9_.-]+$`，无标志（B22；v1 已完整列出） |
| `facade/world-read-caps.ts` | `WORLD_READ_CAPS`     | 9 个键，数值见 B22                                     |
| `facade/registry.ts`        | `WORLD_READ_REGISTRY` | 8 行 × `container`/`member`/`op`（B29）                |
| `facade/registry.ts`        | `ARTIFACT_REGISTRY`   | 6 行 × `container`/`member`/`op`/`family`（B29）       |

- 来源是**合同断言**而不是旧实现：`pure.test.mjs`「`WORLD_READ_CAPS` 恰好这九个键与这些数字」「`REPORT_CAPS` 与 `ARTIFACT_CAPS` 的键集合」「产物 id 字符集：非空的 `[A-Za-z0-9_.-]`，且不带 g 标志」与 `facade.test.mjs`「world 表：八行，op 命名不与成员名强绑」「artifact 表：六行，op 与成员同名，族别住在同一行里」。测试断言零改动。
- `REPORT_CAPS` 经核查不走声明模式（普通模式 containment 0.000），因此不在本次补充范围，其 `interface.md` 条目仍是 `…`。
- 生成方式：`tests/gen-interface.mjs` 增加合同表映射，在契约基线树（`8c9a9e86`）上重新生成 `interface.md`，除本表与说明句外仅 oxfmt 统一了代码块的行尾分号；随后 `npx oxfmt`。替换实现内部如何拆文件（例如两张表迁到 `registry-tables.ts`）不受本条约束——`interface.md` 只钉合同面。
- 旧门重跑结果见 `acceptance.md` 第九节与 `gate-old-v2.json`；v1 的 `gate-old.json` 保持原样。

## 4. 替换阶段需要知道的既有作业（本阶段不做）

- **无 sha256 / 字符串路径 re-pin**：与 dw01 不同，本包范围没有任何按字符串路径 import 并 pin 哈希的夹具（已核对，见 `callers.md`）。替换阶段不需要 GATE-PLAYBOOK D 节那类 re-pin。
- **本包自身 `test/` 的深 import**：`engine/{scheduler,hash,journal-memory,types,scheduler-types,imported-cache}.js` 的文件名与导出名必须继续可解析（或与本包测试一起改，属替换阶段决定）。
- **facade 资产的 re-record**：重写后跑 `node --import tsx specs/contracts/dynamic-workflow-02/tests/record-facade.mjs` 之前，先确认 `facade.test.mjs` 里那四条「注释怎么写都不碰锁」通过——新注释是自由面，声明面必须与录制逐字节相同。
- **K10 的 message 文本裁定**：需要 Lead 定（a）或（b），未定之前本合同不动 golden。
