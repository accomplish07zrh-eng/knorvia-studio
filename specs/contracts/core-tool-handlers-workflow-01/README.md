# core-tool-handlers-workflow-01 合同（v1）

版本 **v1**（2026-10-15）。`apps/cli/packages/core/src/tool/handlers` 下 **工作流修订/创作 20 + AskUserQuestion 2 = 22 个继承文件** 的替换合同：工作流文件读写与金样往返、修订语义边界（三态字段、前驱握手、未知字段策略）、创作/保存/实验三工具与 AskUserQuestion 交互时序。计划书「每包流程」第二步的产物，按 issue #158 的 handlers 分包裁决顺序执行（bash-01 已合并 → 本包 → workflow-runs-01 → -02）。

- 分支：`contract/core-tool-handlers-workflow-01`（检出点 origin/main `829fe57e`）
- 状态：**合同完成（v1）**。旧门 `scripts/contract-gate.mjs`：源码入口 94/94、dist 入口 94/94，22 桩替换后 0/94 通过（`gate-old.json`）。

## 范围与边界

**在范围**（重写与删除范围 = `licensing/current-files.json` 里分类为继承的 22 个文件 / 3,294 行，实测）：

- **工作流修订/创作（20）**：
  - 启动与归一化：`create-workflow.ts`、`create-workflow-source.ts`、`create-workflow-description.ts`
  - 修订：`amend-workflow.ts`、`amend-workflow-source.ts`、`amend-workflow-resolve.ts`、`amend-workflow-description.ts`
  - 保存与实验：`save-workflow.ts`、`save-workflow-description.ts`、`eval-workflow-snippet.ts`、`eval-workflow-snippet-description.ts`
  - 文件与草稿：`workflow-drafts.ts`、`workflow-path-source.ts`
  - 分析/显示图：`workflow-script-analysis.ts`、`workflow-analysis-display.ts`、`create-workflow-graph-bounds.ts`、`create-workflow-graph-fold.ts`
  - 模型面与内省：`workflow-script-notes.ts`、`workflow-script-path.ts`、`workflow-run-introspection.ts`
- **AskUserQuestion（2）**：`ask-user-question.ts`、`ask-user-question-result.ts`

继承分类实测：`upstream-modified` 19 / `upstream-unchanged` 2（`amend-workflow-description.ts`、`workflow-script-path.ts`）/ `unreviewed` 1（`ask-user-question-result.ts`）。**无无用代码可删**：22 文件经 `dep:refs` 同源分析全部有引用（无零引用文件或导出），故本包不含删除提交。

**不在范围的相邻文件**（归其它 handlers 包，勿动）：

- `index.ts`（barrel，导入全部 handler）→ 归**最后一个** handlers 替换包。
- `saved-workflows/**`（4，保存定义存储层）与 `model-reference*.ts`（模型目录解析）→ `core-tool-handlers-02`；本包经公开入口消费它们（前向依赖，路径与导出不变）。
- `ask-user-question-narration.ts`（original，已独立）不动。
- 工作流运行/发现 11（`get-workflow-run*`、`list-*`、`resume-workflow-run`、`resolve-workflow-question`）→ `core-tool-handlers-workflow-runs-01`。

向上依赖仅已替换/冻结包：`@knorvia/contracts`（工具 schema 与错误面）、`@knorvia/dynamic-workflow`（编译与图投影）、`../types`（工具入口类型）、`../executor/result-display`（display 构造）。

## 完成度

| 产物                                                                         | 状态 |
| ---------------------------------------------------------------------------- | ---- |
| 选包与边界（继承 22 文件 / 3,294 行；无用代码 0）                            | 完成 |
| `interface.md`（22 模块、57 导出，机器生成）                                 | 完成 |
| `callers.md`（覆盖 `dep:refs` 全部结果：57 导出、47 处包外引用）             | 完成 |
| `stubs/`（22 桩 + targets.txt，import 即抛 `not implemented: …`）            | 完成 |
| `behavior.md`（B-cw/aw/sw/ev/df/fl/an/nt/in/au/tp 共 89 条，九项字段）       | 完成 |
| `tests/`（7 文件、94 例；源码 + dist 双入口各 94/94）                        | 完成 |
| `fixtures/`（`workflow-file-goldens.json`：旧写金样 + 铸名，被往返实测消费） | 完成 |
| `known-differences.md`（K-fl-1..2、K-au-1、K-an-1，各有对应用例）            | 完成 |
| `acceptance.md` / `gate-old.json`（contract-gate 两入口 + 22 桩全失败）      | 完成 |

## 运行契约测试（两个入口）

```text
# 前置：Node 24.14.0（mise.toml）；先 pnpm build:cli-packages 构建 @knorvia/core 及其依赖
$env:TSX_TSCONFIG_PATH = "<repo>/packages/ui/tsconfig.json"
$env:KNORVIA_ENV = "test"

# 统一旧门（源码 + dist + 桩替换，写 gate-old.json）
node <node24> scripts/contract-gate.mjs --contract specs/contracts/core-tool-handlers-workflow-01 \
  --env KNORVIA_ENV=test --env TSX_TSCONFIG_PATH=<abs>/packages/ui/tsconfig.json \
  --dist-loader specs/contracts/core-tool-handlers-workflow-01/dist-entry-loader.mjs \
  --stub-root specs/contracts/core-tool-handlers-workflow-01/stubs \
  --stub-targets specs/contracts/core-tool-handlers-workflow-01/stubs/targets.txt
```

当前结果（旧实现，v1 旧门 2026-10-15）：源码入口 94/94、dist 入口 94/94；22 桩替换后 0/94 通过（`allFail=true`）；预登记差异 4 条（`known-differences.md`，各有用例钉住）。

## 注意事项

1. **金样往返是本合同的锚（B-fl-7/8）。** `fixtures/workflow-file-goldens.json` 的文件字节与草稿铸名由旧实现的**真实写入面**（SaveWorkflow handler 落盘、`writeWorkflowDraft`）录制；替换实现必须复现同一保存文件格式（`/* knorvia-workflow` 块 + YAML 字段序 description → whenToUse → args + 逐字正文）与铸名规则，「新写 = 旧写」按逐字节断言。
2. **修订语义边界逐条钉住（B-aw-4/5/11、K-fl-1、K-au-1）**：三态字段（数=设定并钳制 / `null`=解除 / 省略=沿用前驱并重算）、前驱事实块无条件覆盖模型伪造、未知字段策略（元数据块未知键整块判错，见 K-fl-1；入参 `metadata` 不进结果投影，见 B-au-4）。
3. **语义常量、默认值与文案显式入条目（M1 教训）**：错误码表（B-aw-2）、超时常量（B-tp-4、B-ev-4）、`multiSelect` 默认值（B-au-4）、全部面向模型的定型文案（B-cw-11/12/16、B-aw-3/9/13/15/16、B-sw-6/7、B-ev-3/4、B-nt-1..3、B-in-1/2）都有断言。
4. **时序用事件序列断言**：端口替身记录 `submit`/`getTask`/`getScript`/`amend`/`evalSnippet` 的调用序与次数（B-cw-13、B-aw-10/16、B-ev-4、B-au-1），测试里没有 sleep 与固定超时。
5. **IO 重的执行路径不黑盒覆盖**（沙箱真执行、存储层原子性），见 `behavior.md`「未覆盖」节；其模块路径与导出仍在 `interface.md`，接口默认不可变。
6. **平台**：路径断言用 `path.join`/`path.relative` 在宿主上复原（Windows 反斜杠与 POSIX 斜杠均成立）；金样与铸名与平台无关；全局档测试经产品环境变量 `KNORVIA_DATA_BASE_DIR` 重定向到临时目录，绝不触碰真实用户数据目录。源码与 dist 双入口均在 Windows 实测通过，Linux 由远端 CI 复核。

## 条目 → 测试对照表

| 条目      | 测试                                                                                                                                                                                  | 状态 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B-cw-1    | `workflow-create.test.ts`「B-cw-1 来源三选一是模型入参级校验，违规回固定文案」                                                                                                        | 通过 |
| B-cw-2    | `workflow-create.test.ts`「B-cw-2 args 只跟 path 走；schema 之外的形状照常放行」                                                                                                      | 通过 |
| B-cw-3    | `workflow-create.test.ts`「B-cw-3 并发上界钳到 [1, 天花板]，超界压低而不是拒绝」                                                                                                      | 通过 |
| B-cw-4    | `workflow-create.test.ts`「B-cw-4 内联来源无事可做时逐字节恒等放行」                                                                                                                  | 通过 |
| B-cw-5    | `workflow-create.test.ts`「B-cw-5 内联来源只改写钳过的并发与归一后的模型名」                                                                                                          | 通过 |
| B-cw-6    | `workflow-create.test.ts`「B-cw-6 子代理模型：目录缺席明确拒绝，解不出来整次失败」                                                                                                    | 通过 |
| B-cw-7    | `workflow-create.test.ts`「B-cw-7 path 来源：剥块、验实参、记偏移，且不写草稿」                                                                                                       | 通过 |
| B-cw-8    | `workflow-create.test.ts`「B-cw-8 path 来源实参边界：无块拒实参，错实参给声明复述」                                                                                                   | 通过 |
| B-cw-9    | `workflow-create.test.ts`「B-cw-9 saved 来源：读定义、验实参、写全文件草稿、回填来龙去脉」                                                                                            | 通过 |
| B-cw-10   | `workflow-create.test.ts`「B-cw-10 saved 解析失败列可用名，找不到按作用域分档」                                                                                                       | 通过 |
| B-cw-11   | `workflow-create.test.ts`「B-cw-11 编译失败：回诊断与点名文件的 NOTE，草稿照写不误」                                                                                                  | 通过 |
| B-cw-12   | `workflow-create.test.ts`「B-cw-12 端口缺席：干净脚本只 typecheck，占位文案明说没执行」                                                                                               | 通过 |
| B-cw-13   | `workflow-create.test.ts`「B-cw-13 端口在场：一次 submit，载荷逐字段，输出 backgrounded」                                                                                             | 通过 |
| B-cw-14   | `workflow-create.test.ts`「B-cw-14 提交失败向上冒泡，不吞成带 ID 的成功」                                                                                                             | 通过 |
| B-cw-15   | `workflow-create.test.ts`「B-cw-15 确认门：干净脚本弹窗带 display，编不过直接放行」                                                                                                   | 通过 |
| B-cw-16   | `workflow-create.test.ts`「B-cw-16 并发文案只在设了上界时出现，压到本机上限时点破」                                                                                                   | 通过 |
| B-cw-17   | `workflow-create.test.ts`「B-cw-17 trace 合成：离散字段拼出端口要的整体，整体在场原样用」                                                                                             | 通过 |
| B-aw-1    | `workflow-amend.test.ts`「B-aw-1 修订脚本至多给一个；两个都不给是合法的『沿用』」                                                                                                     | 通过 |
| B-aw-2    | `workflow-amend.test.ts`「B-aw-2 错误码表是显式语义常量，两处再导出同一对象」                                                                                                         | 通过 |
| B-aw-3    | `workflow-amend.test.ts`「B-aw-3 无脚本可沿用的两种原因同一判别键，文案各自点名」                                                                                                     | 通过 |
| B-aw-4    | `workflow-amend.test.ts`「B-aw-4 并发上界三态：数=钳制，null=解除，省略=沿用（再钳一次）」                                                                                            | 通过 |
| B-aw-5    | `workflow-amend.test.ts`「B-aw-5 子代理模型三态：null=解除，字符串=解析，省略=沿用并重解」                                                                                            | 通过 |
| B-aw-6    | `workflow-amend.test.ts`「B-aw-6 path 来源：块剥掉（声明忽略）、记偏移，读不出点名原因」                                                                                              | 通过 |
| B-aw-7    | `workflow-amend.test.ts`「B-aw-7 沿用前驱脚本：端口缺席/记录缺席各自失败，在场则原样沿用」                                                                                            | 通过 |
| B-aw-8    | `workflow-amend.test.ts`「B-aw-8 认家：文件此刻的字节仍是这份脚本才继续记它」                                                                                                         | 通过 |
| B-aw-9    | `workflow-amend.test.ts`「B-aw-9 script_unchanged 预检只网住『忘了编辑』的 path 提交」                                                                                                | 通过 |
| B-aw-10   | `workflow-amend.test.ts`「B-aw-10 前驱不存在先收口；端口读序是 getTask → getScript」                                                                                                  | 通过 |
| B-aw-11   | `workflow-amend.test.ts`「B-aw-11 前驱事实块由快照算出并覆盖伪造，沿用时盖 script_inherited」                                                                                         | 通过 |
| B-aw-12   | `workflow-amend.test.ts`「B-aw-12 端口缺席：伪造字段全部剥掉，模型给的数原样过」                                                                                                      | 通过 |
| B-aw-13   | `workflow-amend.test.ts`「B-aw-13 编译失败文案分沿用/修订两态，前驱未动写明」                                                                                                         | 通过 |
| B-aw-14   | `workflow-amend.test.ts`「B-aw-14 端口缺席回占位；端口无 amend 能力回能力缺口」                                                                                                       | 通过 |
| B-aw-15   | `workflow-amend.test.ts`「B-aw-15 端口拒绝理由各自配可操作文案，未知理由也回结构化失败」                                                                                              | 通过 |
| B-aw-16   | `workflow-amend.test.ts`「B-aw-16 成功路径：被替代者两种结局、沿用/修订两套引导」                                                                                                     | 通过 |
| B-aw-17   | `workflow-amend.test.ts`「B-aw-17 确认门与 CreateWorkflow 同一段：编不过放行，干净弹窗带修订名 display」                                                                              | 通过 |
| B-sw-1    | `workflow-save-eval.test.ts`「B-sw-1 名字不合法在入参校验收口，文案给出可用字符集」                                                                                                   | 通过 |
| B-sw-2    | `workflow-save-eval.test.ts`「B-sw-2 保存正文二选一；schema 之外的形状照常放行」                                                                                                      | 通过 |
| B-sw-3    | `workflow-save-eval.test.ts`「B-sw-3 自带元数据块的内联正文拒绝；script_path 的块照常被丢」                                                                                           | 通过 |
| B-sw-4    | `workflow-save-eval.test.ts`「B-sw-4 script_path 读成正文（块丢弃），落点与覆盖判定一并回填」                                                                                         | 通过 |
| B-sw-5    | `workflow-save-eval.test.ts`「B-sw-5 遮蔽事实按另一档是否有同名算出，供确认窗展示」                                                                                                   | 通过 |
| B-sw-6    | `workflow-save-eval.test.ts`「B-sw-6 编译失败：回诊断且一个字节都不落盘」                                                                                                             | 通过 |
| B-sw-7    | `workflow-save-eval.test.ts`「B-sw-7 全局档保存四态文案（作用域 × 新建/覆盖）」+ `workflow-file-io.test.ts`/`fixtures.test.ts` 金样落盘与覆盖重判                                     | 通过 |
| B-sw-8    | `workflow-save-eval.test.ts`「B-sw-8 确认门：干净脚本弹窗（不带 display），编不过放行」                                                                                               | 通过 |
| B-sw-9    | `workflow-save-eval.test.ts`「B-sw-9 保存输出的模型面只回 response 文本，坏输出回兜底句」                                                                                             | 通过 |
| B-ev-1    | `workflow-save-eval.test.ts`「B-ev-1 片段二选一在入参校验收口」                                                                                                                       | 通过 |
| B-ev-2    | `workflow-save-eval.test.ts`「B-ev-2 path 来源整文件即片段，连元数据块样式的第一行也不剥」                                                                                            | 通过 |
| B-ev-3    | `workflow-save-eval.test.ts`「B-ev-3 端口缺席：诚实的未执行失败，不假装跑过」                                                                                                         | 通过 |
| B-ev-4    | `workflow-save-eval.test.ts`「B-ev-4 端口在场：诊断/失败/完成三种终态各自成文，超时缺省 60s」                                                                                         | 通过 |
| B-ev-5    | `workflow-save-eval.test.ts`「B-ev-5 确认门只落在携带 world.run 的干净片段上」                                                                                                        | 通过 |
| B-df-1..2 | `workflow-file-io.test.ts`「B-df-1/B-df-2 草稿逐字落盘并按铸名规则命名」                                                                                                              | 通过 |
| B-df-3    | `workflow-file-io.test.ts`「B-df-3 同名草稿按 -2、-3 顺延，绝不覆盖已有草稿」                                                                                                         | 通过 |
| B-df-4    | `workflow-file-io.test.ts`「B-df-4 草稿目录 .gitignore 只写一次，用户改过就不再动」                                                                                                   | 通过 |
| B-df-5    | `workflow-file-io.test.ts`「B-df-5 尽力而为：写不成返回 undefined 而不是抛错」                                                                                                        | 通过 |
| B-df-6    | `workflow-file-io.test.ts`「B-df-6 草稿名兜底链：显式名 → 第一个阶段名 → workflow」                                                                                                   | 通过 |
| B-fl-1    | `workflow-file-io.test.ts`「B-fl-1/B-sw-7 旧写金样被读回同一视图（旧写 → 新读）」                                                                                                     | 通过 |
| B-fl-2    | `workflow-file-io.test.ts`「B-fl-2 无块文件整个是脚本，偏移 0 且无元数据」                                                                                                            | 通过 |
| B-fl-3    | `workflow-file-io.test.ts`「B-fl-3 parseFrontmatter:false 整个文件都是片段，带块也不剥」                                                                                              | 通过 |
| B-fl-4    | `workflow-file-io.test.ts`「B-fl-4 块判定看首个非空行，兼容旧 zcode 标记」                                                                                                            | 通过 |
| B-fl-5    | `workflow-file-io.test.ts`「B-fl-5 失败与坏块都点名文件，坏块带原因与细节」                                                                                                           | 通过 |
| B-fl-6    | `workflow-file-io.test.ts`「B-fl-6 相对路径按会话工作目录解析，绝对路径原样归一」                                                                                                     | 通过 |
| B-fl-7    | `fixtures.test.ts`「B-fl-7 金样往返四步闭合：旧写 → 新读 → 新写 → 旧读」+ `workflow-file-io.test.ts` 草稿往返                                                                         | 通过 |
| B-fl-8    | `fixtures.test.ts`「B-fl-8 夹具完整性：金样、铸名与 .gitignore 都在册」                                                                                                               | 通过 |
| B-an-1    | `workflow-graph.test.ts`「B-an-1 分析单槽记忆：紧邻重复命中同一结果，换文重算」                                                                                                       | 通过 |
| B-an-2    | `workflow-graph.test.ts`「B-an-2 分析投影两态：无因果图缺席，有则有界」                                                                                                               | 通过 |
| B-an-3    | `workflow-graph.test.ts`「B-an-3 display 投影只有一份 kind，工具名只是入参」                                                                                                          | 通过 |
| B-an-4    | `workflow-graph.test.ts`「B-an-4 裁剪顺序固定：step 先截、lane 按引用收敛，引用完整性优先」                                                                                           | 通过 |
| B-an-5    | `workflow-graph.test.ts`「B-an-5 lane 收敛连带裁掉引用它的 step 与卡片」                                                                                                              | 通过 |
| B-an-6    | `workflow-graph.test.ts`「B-an-6 文本限长对代理对安全：截断不落半个字符」                                                                                                             | 通过 |
| B-an-7    | `workflow-graph.test.ts`「B-an-7 阶段层：同名跨环折叠在语义层，alongside 去重去自身」                                                                                                 | 通过 |
| B-an-8    | `workflow-graph.test.ts`「B-an-8 阶段层超限时整层缺席并计入截断标记」                                                                                                                 | 通过 |
| B-an-9    | `workflow-graph.test.ts`「B-an-9 未命名/未知阶段的卡片归到 unphased 一档」                                                                                                            | 通过 |
| B-an-10   | `workflow-graph.test.ts`「B-an-10 阶段边折叠：同对合取、自环丢弃、环上见证不成立」                                                                                                    | 通过 |
| B-nt-1    | `workflow-notes.test.ts`「B-nt-1 诊断行：无文件给正文行号，有文件给文件行号（正文行 + 偏移）」                                                                                        | 通过 |
| B-nt-2    | `workflow-notes.test.ts`「B-nt-2 编不过的 NOTE 按来源分三句，动词各说各的事实」                                                                                                       | 通过 |
| B-nt-3    | `workflow-notes.test.ts`「B-nt-3 启动句与修订句：草稿/文件两种身份，后续动作指向 AmendWorkflow」                                                                                      | 通过 |
| B-in-1    | `workflow-notes.test.ts`「B-in-1 两个结构化失败形状固定：能力缺口 errorCode 1，不存在 errorCode 2」                                                                                   | 通过 |
| B-in-2    | `workflow-notes.test.ts`「B-in-2 内省引导文案劝阻轮询并给出三个正当用途」                                                                                                             | 通过 |
| B-in-3    | `workflow-notes.test.ts`「B-in-3 时间戳：有限值给 ISO，非有限值原样字符串」                                                                                                           | 通过 |
| B-in-4    | `workflow-notes.test.ts`「B-in-4 时长分四档进位，相对年龄与瞬时是它的组合」                                                                                                           | 通过 |
| B-in-5    | `workflow-notes.test.ts`「B-in-5 计数千分位、属性行空白折叠加 XML 转义」                                                                                                              | 通过 |
| B-au-1    | `ask-user-question.test.ts`「B-au-1 门握手：答案没到位就拒绝，到位才执行；三次调用零共享状态」                                                                                        | 通过 |
| B-au-2    | `ask-user-question.test.ts`「B-au-2 未回答的拒绝是结构化 CoreError：可恢复、带问题清单与调用关联」                                                                                    | 通过 |
| B-au-3    | `ask-user-question.test.ts`「B-au-3 空白答案逐条点名，错误路径定位到问题文本」                                                                                                        | 通过 |
| B-au-4    | `ask-user-question.test.ts`「B-au-4 通过后的投影只带三块：questions → answers → annotations，缺省按契约补/省」                                                                        | 通过 |
| B-tp-1    | `workflow-create.test.ts`「B-tp-1 CreateWorkflow 工具声明：昂贵、总要确认、会话内可放行」+「B-tp-1 工具描述点明三选一、阶段必填、修订路由与常量文案」                                 | 通过 |
| B-tp-2    | `workflow-amend.test.ts`「B-tp-2 AmendWorkflow 工具声明：与 CreateWorkflow 同门，输出同形」                                                                                           | 通过 |
| B-tp-3    | `workflow-save-eval.test.ts`「B-tp-3 SaveWorkflow 工具声明：写仓库的动作，永不持久免确认」                                                                                            | 通过 |
| B-tp-4    | `workflow-save-eval.test.ts`「B-tp-4 EvalWorkflowSnippet 工具声明：瞬态实验通道，取消 bestEffort」                                                                                    | 通过 |
| B-tp-5    | `ask-user-question.test.ts`「B-tp-5 AskUserQuestion 工具声明：用户交互工具，30s 预算，取消有用户可见文案」+「B-tp-5 工具描述点明使用门槛、Other、multiSelect、推荐项与 preview 规则」 | 通过 |

共 89 条行为（B-cw-1..17、B-aw-1..17、B-sw-1..9、B-ev-1..5、B-df-1..6、B-fl-1..8、B-an-1..10、B-nt-1..3、B-in-1..5、B-au-1..4、B-tp-1..5）、88 行对照，每行都有对应用例（无空行）。
