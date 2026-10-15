# core-tool-handlers-workflow-01 行为条目（behavior.md）

版本 v1。本包 = `apps/cli/packages/core/src/tool/handlers` 下 **工作流修订/创作 20 + AskUserQuestion 2 = 22 个继承文件**。行为用**自己的话**写，不贴旧代码。编号族在本包内唯一，发布后不重用：

| 族         | 覆盖                                     | 文件                                                                                                                              |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| B-cw-1..17 | CreateWorkflow 入参归一化、启动与确认门  | `create-workflow.ts`、`create-workflow-source.ts`                                                                                 |
| B-aw-1..17 | AmendWorkflow 修订语义与前驱握手         | `amend-workflow.ts`、`amend-workflow-source.ts`、`amend-workflow-resolve.ts`                                                      |
| B-sw-1..9  | SaveWorkflow 保存语义                    | `save-workflow.ts`（含 `save-workflow-description.ts` 文案面）                                                                    |
| B-ev-1..5  | EvalWorkflowSnippet 实验通道             | `eval-workflow-snippet.ts`（含 `eval-workflow-snippet-description.ts`）                                                           |
| B-df-1..6  | 工作流草稿写入                           | `workflow-drafts.ts`                                                                                                              |
| B-fl-1..8  | 脚本文件读取与金样往返                   | `workflow-path-source.ts`（往返含 SaveWorkflow 写入面）                                                                           |
| B-an-1..10 | 分析记忆、显示图有界投影、阶段边折叠     | `workflow-script-analysis.ts`、`workflow-analysis-display.ts`、`create-workflow-graph-bounds.ts`、`create-workflow-graph-fold.ts` |
| B-nt-1..3  | 模型面脚本文案                           | `workflow-script-notes.ts`                                                                                                        |
| B-in-1..5  | 运行内省助手                             | `workflow-run-introspection.ts`                                                                                                   |
| B-au-1..4  | AskUserQuestion 交互握手                 | `ask-user-question.ts`、`ask-user-question-result.ts`                                                                             |
| B-tp-1..5  | 五个工具声明（元数据、权限、预算、描述） | 五个 `*-description.ts` 与五个工具入口文件                                                                                        |

**通用字段（纯函数/投影簇共用）**：B-cw-1..6/15..17、B-aw-1..5、B-sw-1..3、B-ev-1、B-df-2/6、B-fl-1..6、B-an-1..10、B-nt-1..3、B-in-1..5、B-tp-1..5 是纯函数或常量面——无状态所有者、无 IO、幂等、并发安全（无共享可变状态；B-an-1 的单槽记忆除外，见该条）、无资源释放、不写日志。逐条只写**特有**字段（输入/输出/错误语义/平台差异），共用字段不重复。

**通用字段（工具生命周期簇共用）**：B-cw-8..14、B-aw-6..16、B-sw-4..8、B-ev-2..5、B-df-1/3..5、B-fl-7/8、B-au-1..4 运行在 executor 的 `validateInput → resolveInput → prepareApproval → handler` 生命周期上：状态所有者是调用方（executor / 会话），本包不藏全局状态（B-an-1 记忆槽除外）；文件 IO 只落会话工作目录下的 `.knorvia-studio/`；写失败按各条的错误语义冒泡或降级；不写日志（工具层日志由 executor 统一记录，级别 debug）；测试用端口替身记录调用序列断言时序（无 sleep、无固定超时）。幂等性与平台差异逐条写。

---

## CreateWorkflow（B-cw-1..17）

- **B-cw-1 来源三选一**：输入模型入参；输出 `{result:true}` 或业务失败（码 400）；`script`/`saved`/`path` 恰好给一个，多给或不给回 `CREATE_WORKFLOW_SOURCE_ERROR` 定型文案。schema 之外的形状透传放行（XOR 只对模型入参成立）。测试 `workflow-create.test.ts` B-cw-1。
- **B-cw-2 `args` 与 `path` 绑定**：顶层 `args` 只跟 `path` 走；跟内联/`saved` 给出即失败（`CREATE_WORKFLOW_ARGS_WITHOUT_PATH_ERROR`）；`saved.args` 由 saved 块自带，不受此限。测试 B-cw-2。
- **B-cw-3 并发钳制**：输入正整数与可选天花板；输出 `[1, 天花板]` 内的数——超界**压低**不拒绝，天花板未知只保下界 1。错误语义：不抛。测试 B-cw-3。
- **B-cw-4 内联恒等**：无可改写字段时 `resolveCreateWorkflowInput` 原对象返回（strictEqual 同一对象），保证「零回归」可测。测试 B-cw-4。
- **B-cw-5 内联改写**：只改写钳过的 `max_concurrency` 与归一后的 `subagent_model`；其余字段逐字不动。测试 B-cw-5。
- **B-cw-6 模型名归一**：目录缺席且字段在场 → 定型失败 `SUBAGENT_MODEL_UNAVAILABLE`；名字解不出 → 整次失败带解析诊断（什么都没启动、窗不开）；解得出回规范形（含默认推理档后缀，如 `prov/mod$high`）。测试 B-cw-6。
- **B-cw-7 path 来源归一化**：输入相对/绝对路径；输出 `{script, path(绝对), args?, script_line_offset?}`——元数据块剥掉、实参按块声明校验并补齐默认值、偏移=块行数；**不写草稿**（文件已是工作副本）。测试 B-cw-7。
- **B-cw-8 path 实参边界**：无块文件给 `args` → 点名文件的拒绝（「declares no arguments」）；声明校验失败 → 错误逐条 + 声明复述（`- pr (string, required)` 式）。测试 B-cw-8。
- **B-cw-9 saved 来源归一化**：解析定义→校验实参补默认→写**全文件**工作副本（含块，逐字节同源文件）→ 回填 `{name, script, saved:{name,args,path,scope,draft}, script_line_offset?}`；未给展示名取保存名。顶层 `args` 不设（实参住 `saved.args`）。测试 B-cw-9。
- **B-cw-10 saved 解析失败文案**：invalid_name/parse_error/read_error 各自点名；not_found 分两档（给了 scope 说「该作用域下没有」）并列出两档实际可用名字（带 `(project)`/`(global)` 标签）；空档案给「还没有保存的 workflow」引导。测试 B-cw-10。
- **B-cw-11 编译失败路径**：坏脚本回 `{diagnostics, ok:false, response}`——首句按来源分（内联「The workflow script has errors:」/saved 点名定义）；诊断行按文件坐标；NOTE 按有无文件分三态（`workflow-script-notes.ts`）；**草稿照写**（坏脚本也要有可编辑的文件）；不提交、不建 run。测试 B-cw-11。
- **B-cw-12 端口缺席占位**：干净脚本 + 无 `dynamicWorkflowRunPort` → ok:true，response =「compiled cleanly」+ `EXECUTION_UNAVAILABLE_NOTE`（明说只 typecheck 没执行，不假装启动）。测试 B-cw-12。
- **B-cw-13 提交载荷与启动文案**：端口在场 → 恰好一次 `port.submit`，载荷含 `scriptText/cwd/name?/args?/parentSessionId/toolCallId/phaseNames?/phaseAlongside?/maxConcurrency?/subagentModel?/scriptPath?/trace`（缺席字段不造空壳键）；输出 `status:"backgrounded"`、`backgroundTaskId=runId`、文案给 ID + 显式劝阻轮询 + 并发句（只在设了上界时）+ 模型句 + 脚本文件句。时序：submit 与输出同一次调用内完成（事件序列断言）。测试 B-cw-13。
- **B-cw-14 提交失败冒泡**：`port.submit` 抛错向上冒泡成工具调用失败，绝不吞成带 ID 的成功输出。测试 B-cw-14。
- **B-cw-15 确认门两态**：干净脚本 → `{gate:"ask", display}`（display kind `create_workflow`，图为主体）；schema 失败或编译不过 → `{gate:"proceed"}` 放行给 handler 回诊断（不打断改错回路）。测试 B-cw-15。
- **B-cw-16 并发文案**：`describeWorkflowConcurrencyLimit` 只在设了上界时给句；恰等于天花板时点明「this machine's maximum」。测试 B-cw-16。
- **B-cw-17 trace 合成**：`context.traceContext` 在场原样用；缺席按离散字段（traceId/spanId/parentSpanId/sessionId/turnId）合成端口要的整体。测试 B-cw-17。

## AmendWorkflow（B-aw-1..17）

- **B-aw-1 修订脚本至多一个**：`script` 与 `path` 同给 → 业务失败（400 + `AMEND_WORKFLOW_SOURCE_ERROR`）；两个都不给是合法「沿用前驱」。测试 `workflow-amend.test.ts` B-aw-1。
- **B-aw-2 错误码表**：`AMEND_WORKFLOW_ERROR_CODE` = AMEND_UNAVAILABLE 21 / MISSING_BOUNDARIES 22 / SUBAGENT_MODEL 23 / SCRIPT_UNCHANGED 24 / SCRIPT_FILE 25 / SCRIPT_UNAVAILABLE 26，两处再导出同一对象。测试 B-aw-2。
- **B-aw-3 无脚本可沿用**：`host`（端口无 getScript）与 `record`（记录里没有脚本）同一判别键 `workflow_amend_script_unavailable`，文案各点原因并给出下一步（交 `script`/`path`），都写明「Nothing was stopped or created」。测试 B-aw-3。
- **B-aw-4 并发三态**：数=钳到 `[1,天花板]`；`null`=解除（键消失）；省略=沿用前驱值**再钳一次**（前驱可能起自另一台机器）；三态只活在归一化，之后只有「一个数或没有」。测试 B-aw-4。
- **B-aw-5 模型三态**：`null`=解除；字符串=解析成规范形；省略=沿用前驱**并重新解析**（模型可能已被删）。目录缺席分两种：模型自己给的字符串拒绝（`SUBAGENT_MODEL_UNAVAILABLE`），沿用的原样带过（不把宿主缺口记到用户头上）。沿用解析失败的诊断带「inherited」措辞。测试 B-aw-5。
- **B-aw-6 path 来源**：读文件剥块（**声明忽略**——修订不带实参），回 `{script, path, script_line_offset?}`；读失败 → `SCRIPT_FILE`（25），`workflow_script_file_unreadable:` 前缀 + 「Nothing was stopped or created」。测试 B-aw-6。
- **B-aw-7 沿用前驱脚本**：端口无 getScript → host 失败；存档为空 → record 失败；在场则逐字沿用并 `inherited:true`。测试 B-aw-7。
- **B-aw-8 认家**（`resolveKeptScriptFile`）：前驱脚本文件此刻读出的正文仍等于沿用字节 → 新 run 继续记该文件（含块偏移）；任何一处对不上（没记过/文件没了/被改过）→ 不认家，调用方照「不来自文件」写新草稿。测试 B-aw-8。
- **B-aw-9 `script_unchanged` 预检**：只网「模型给了 `path` 且字节与前驱相同且本次没改任何设定」的提交；同时设 `max_concurrency`/`subagent_model`（含 `null`）、内联脚本、端口无 getScript 一律跳过。失败文案点名文件、给出三条出路、写明「Nothing was stopped or created」。测试 B-aw-9。
- **B-aw-10 端口读序**：`getTask`（前驱查找，失败即 `run_not_found` 收口）→ 落定脚本（读文件或 `getScript`）→ 比字节（`getScript`）。顺序保证「指向不存在 run 的调用」不会先报文件错误。事件序列断言，无 sleep。测试 B-aw-10。
- **B-aw-11 前驱事实块**：由快照算出（`name?/status/stop_reason?/owned_by_this_session`，status 取 `runStatus ?? "running"`；归属按 `parentSessionId === 会话`）**并无条件覆盖**模型伪造；沿用脚本时盖 `script_inherited:true`。测试 B-aw-11。
- **B-aw-12 端口缺席**：伪造的 `predecessor`/`script_line_offset`/`subagent_model` 全部剥掉，`null` 塌成缺席，模型给的数原样过（无天花板可钳）。测试 B-aw-12。
- **B-aw-13 编译失败文案**：修订态首句「The revised workflow script has errors:」，沿用态首句点明脚本是继承来的；诊断行按文件坐标（草稿写不下时退回 `L#:C#`）；NOTE 三态同 B-cw-11，末尾恒补「Run <id> was not touched.」。测试 B-aw-13。
- **B-aw-14 能力缺口**：干净脚本 + 无端口 → 占位文案（同 CreateWorkflow）；端口无 `amend` → `AMEND_UNAVAILABLE`（21）结构化失败。测试 B-aw-14。
- **B-aw-15 端口拒绝三分**：`run_not_found` → 复用内省文案（errorCode 2）；`missing_boundaries` → 22，点明 journal 缺边界并建议改用 CreateWorkflow；未知 reason → 22 通用拒绝文案带原词。都写明「Nothing was stopped or created」。测试 B-aw-15。
- **B-aw-16 成功路径**：`supersededRunId` 缺席 →「had already settled; imported as cache」；在场 →「stopped and superseded … will not send a notification of its own」。启动句按沿用/修订分（「started unchanged」/「The revised script started」）；后缀依次为劝阻轮询句、并发句（只在设了）、模型句（只在设了）、修订脚本文件句。输出 `status:"backgrounded"` + 新 runId。测试 B-aw-16。
- **B-aw-17 确认门**：与 CreateWorkflow 同一段两态逻辑；display kind 仍 `create_workflow`（UI 一份实现），「这是修订」由工具名与 `run_id`/`predecessor` 说出。测试 B-aw-17。

## SaveWorkflow（B-sw-1..9）

- **B-sw-1 名字合法性**：`isValidSavedWorkflowName` 判据（字母/数字/`.`/`-`/`_`，1–64 字符），非法名在入参校验拒绝并给出可用字符集文案。测试 `workflow-save-eval.test.ts` B-sw-1。
- **B-sw-2 正文二选一**：`script`/`script_path` 恰好一个，否则 `SAVE_WORKFLOW_SOURCE_ERROR`。测试 B-sw-2。
- **B-sw-3 块拒绝仅限内联**：内联 `script` 首个非空行是元数据标记 → `SAVE_WORKFLOW_SENTINEL_IN_SCRIPT_ERROR`（不做「检测到就替换」的聪明合并）；`script_path` 指向带块文件是正常用法（块在归一化丢弃）。测试 B-sw-3。
- **B-sw-4 `script_path` 归一化**：文件读成正文（块丢弃——元数据以本次调用字段为准），回填 `path`（落点）、`overwrite`（目标存在性）、`shadowing?`。测试 B-sw-4。
- **B-sw-5 遮蔽事实**：存项目档而全局档同名 → `hides_global`；存全局档而项目档同名 → `hidden_by_project`；两档都无同名 → 键缺席。全局档根按产品数据根（测试经 `KNORVIA_DATA_BASE_DIR` 重定向到临时目录）。测试 B-sw-5。
- **B-sw-6 编译失败不落盘**：回 `{name, scope, path(本该写到), diagnostics, ok:false, response}`——诊断行 + `DIAGNOSTICS_NOT_SAVED_NOTE`；`overwritten` 键缺席（没写成谈不上覆盖）；一个字节都不写。测试 B-sw-6。
- **B-sw-7 落盘与四态文案**：干净脚本写 `.knorvia-studio/workflows/<name>.dwf.ts`（格式见 B-fl-7 金样）；`overwritten` 在**写的那一刻**重判（入参上的 `overwrite` 只是展示事实，hook 改写不影响自述）；响应按 作用域 × 新建/覆盖 四态措辞 + `saved: { name: "…" }` 调用引导。测试 B-sw-7（`workflow-file-io.test.ts`、`fixtures.test.ts`）。
- **B-sw-8 确认门**：干净脚本 → `{gate:"ask"}` **不带 display**（落点/覆盖/遮蔽都在入参，各客户端版本可见）；编不过 → proceed。测试 B-sw-8。
- **B-sw-9 模型面输出**：`formatModelContent` 只回 `response` 文本；坏输出回「SaveWorkflow returned an invalid result.」。测试 B-sw-9。

## EvalWorkflowSnippet（B-ev-1..5）

- **B-ev-1 片段二选一**：`code`/`path` 恰好一个，否则 `EVAL_WORKFLOW_SNIPPET_SOURCE_ERROR`。测试 B-ev-1。
- **B-ev-2 path 来源整文件即代码**：不解析元数据块（`parseFrontmatter:false` 语义），`code` = 文件原文，`path` 归一成绝对路径。测试 B-ev-2。
- **B-ev-3 端口缺席**：诚实的未执行失败 `{ok:false, diagnostics:[], logs:[], response: UNAVAILABLE_NOTE, durationMs: 0}`——绝不假装执行过。测试 B-ev-3。
- **B-ev-4 端口三态输出**：`diagnostics` → 「The snippet has errors:」+ 文件/正文坐标 + `NOT_EXECUTED_NOTE`；`failed` → 「The snippet failed (code): message」+ logs 渲染（`- … (logs truncated)` 尾注）；`completed` → 「The snippet completed in Nms.」+ 「Return value:」序列化产物（无值说「It returned no value.」）。墙钟缺省 60s（`EVAL_WORKFLOW_SNIPPET_DEFAULT_TIMEOUT_MS`），显式值原样传；trace 同 B-cw-17；`durationMs` 非负。时序：每次调用恰好一次 `evalSnippet`（事件序列断言）。测试 B-ev-4。
- **B-ev-5 确认门三态**：携带 `world.run` 站点的干净片段 → ask；纯读/纯计算片段 → proceed；编译不过 → proceed（handler 经端口回诊断）。测试 B-ev-5。

## 草稿写入（B-df-1..6）

- **B-df-1 逐字落盘**：`writeWorkflowDraft` 把 `source` 逐字节写进 `<cwd>/.knorvia-studio/workflow-drafts/<铸名>.dwf.ts`，返回绝对路径。测试 `workflow-file-io.test.ts` B-df-1/B-df-2。
- **B-df-2 铸名规则**：空白连成 `-`；Unicode 字母/数字与 `_ . -` 之外的字符（含路径分隔符与 Windows 保留字符）丢弃；截 64 个码点（不切代理对）；首尾的 `.`/`-` 剥掉；空或只剩点落到 `workflow`。中文等 Unicode 字母保留。测试 B-df-1/B-df-2（金样见夹具）。
- **B-df-3 撞名顺延**：同名按 `-2`、`-3`… 顺延，用 `wx` 独占创建——取名与占名是同一个原子动作，绝不覆盖已有草稿。测试 B-df-3。
- **B-df-4 目录 `.gitignore`**：草稿目录自带 `*\n`，只在缺席时写一次（`wx`）；用户改过就不再动，项目自己的 `.gitignore` 一个字不碰。测试 B-df-4。
- **B-df-5 尽力而为**：`cwd` 缺席/空串、目录建不出（`.knorvia-studio` 是普通文件）等一切写失败 → 返回 `undefined` 不抛；调用方退回旧文案。测试 B-df-5。
- **B-df-6 命名兜底链**：`resolveWorkflowDraftName` 显式名（非空白）→ 脚本第一个有名字的阶段 → `workflow`。测试 B-df-6。

## 脚本文件读取与金样往返（B-fl-1..8）

- **B-fl-1 带块文件**：`readWorkflowScriptFile` 剥 `/* knorvia-workflow` 块 → `{meta, script=正文, bodyLineOffset=块行数}`，`source` 仍是原文逐字节。测试 B-fl-1/B-sw-7。
- **B-fl-2 无块文件**：整个文件是脚本，偏移 0，`meta` 缺席，`source === script`。测试 B-fl-2。
- **B-fl-3 `parseFrontmatter:false`**：整文件即片段，带块样式的第一行也不剥（EvalWorkflowSnippet 用）。测试 B-fl-3。
- **B-fl-4 块判定**：首个非空行（trim 后）等于 `/* knorvia-workflow` 或旧 `/* zcode-workflow` 才算块；块前允许空行；正文里的标记不算。测试 B-fl-4。
- **B-fl-5 失败文案**：读不出（点名文件 + 原因 + 「Pass `path` for a file that exists」）；块坏（点名文件 + 括号内原因 `unterminated_frontmatter`/`invalid_yaml`/`invalid_metadata` + 细节 + 修复指引）。测试 B-fl-5。
- **B-fl-6 路径解析**：相对路径按会话工作目录 resolve，绝对路径 normalize；`described` 见 B-nt 簇（工作区下给相对写法）。测试 B-fl-6。
- **B-fl-7 金样往返（旧写 → 新读 → 新写 → 旧读）**：夹具 `fixtures/workflow-file-goldens.json` 的文件字节是旧写入面（SaveWorkflow 落盘）录制；新读解析视图（meta/script/偏移）与录制一致；新写产出与旧写**逐字节相同**；再读视图不变。保存文件格式：`/* knorvia-workflow\n<YAML 元数据>*/\n<正文>`，YAML 字段序 description → whenToUse → args。测试 `fixtures.test.ts` B-fl-7、`workflow-file-io.test.ts` B-sw-7。
- **B-fl-8 夹具完整性**：金样/铸名/`.gitignore` 均在册并被往返用例真实消费。测试 `fixtures.test.ts` B-fl-8。

## 分析与显示图（B-an-1..10）

- **B-an-1 单槽记忆**：`analyzeScript` 对同一段脚本紧邻两次返回**同一个结果对象**（一次编译折叠成一次）；换文重算，槽只留最近一次（共享可变状态即此一条，单线程调用点，无并发写）。测试 `workflow-graph.test.ts` B-an-1。
- **B-an-2 分析投影两态**：`boundGraphOfAnalysis` 编译失败（无因果图）→ undefined；在场 → 有界显示图。测试 B-an-2。
- **B-an-3 display 投影**：`displayOfAnalysis` 产出 `{kind:"create_workflow", ok, errorCount, diagnostics, causalityGraph}`；`toolName` 只是入参不改 kind（UI 一份实现）。测试 B-an-3。
- **B-an-4 裁剪顺序与引用完整性**：step 源序截 64 → 按 step 引用收敛 lane（截 32）→ 丢掉无存活 lane 的 step → 卡片要存活成员、交接边要两端卡片存活（自环不拦）→ sink 只留存活 step。宁可少画，不发指向不存在节点的 id；超限置 `truncated:true`。测试 B-an-4/B-an-5。
- **B-an-5 lane 收敛连带裁剪**：lane 表外的 lane 不画，连带它的 step 与无存活成员的卡片；指向被裁卡片的交接边不画。测试 B-an-5。
- **B-an-6 代理对安全截断**：id 64 / 名字 128 字符上限按码元截断，截断点落在高位代理后则丢弃半字符。测试 B-an-6。
- **B-an-7 阶段层**：`alongside` 去自身、去重复、去未知 id，截到阶段上限；阶段边只留「阶段→阶段」（entry/abort 语义边剔除，指向 sink 的记为 exits）；`step.phase` 不在词汇表就**不发该键**。测试 B-an-7。
- **B-an-8 阶段层超限整层缺席**：阶段数 >32 或折叠后边数 >128 → `phases/phaseEdges/exits` 整体缺席并置 `truncated:true`，step 的 phase 键随之不发。测试 B-an-8。
- **B-an-9 unphased 归档**：卡片的 phase 不在最终词汇表（或阶段层缺席）→ 归 `unphased` 一档。测试 B-an-9。
- **B-an-10 阶段边折叠**（`foldPhaseEdges`）：同一有序对折叠成一条（首见序，`back` 是合取——存在前向事实即按前向），自环丢弃；归约跑在**前向边强连通分量的缩点**上（同分量的边无条件留，跨分量按 (分量对, 回边) 去重后做贪心不可约归约），输出保持输入序——保证环上的见证路径不误删分支边。测试 B-an-10。

## 模型面文案（B-nt-1..3）

- **B-nt-1 诊断行**：无文件 `L<行>:C<列> <消息>`；有文件 `<described>:L<正文行+偏移>:C<列> <消息>`（行号可直接粘进 Edit）。测试 `workflow-notes.test.ts` B-nt-1。
- **B-nt-2 编不过的 NOTE 三句**：草稿（「The script is saved at …」）、文件（「The script file is …」）、保存定义工作副本（点名定义与拷贝、提示 `args` 再传、改定义走 SaveWorkflow）。共同尾句是「Edit that file in place and resubmit with `path: "…"`」类引导。测试 B-nt-2。
- **B-nt-3 启动/修订句**：启动句按草稿/文件分身份并指向 AmendWorkflow；修订句「The revision's script is at …; edit it there for a further revision.」。测试 B-nt-3。

## 运行内省助手（B-in-1..5）

- **B-in-1 两个结构化失败**：能力缺口 `errorCode:1`（`workflow_introspection_unavailable:`，「a capability gap, not an empty project」）；run 不存在 `errorCode:2`（`run_not_found:` + ListWorkflowRuns 引导）。测试 B-in-1。
- **B-in-2 引导文案**：`WORKFLOW_RUN_INTROSPECTION_STEERING` 两行——劝阻轮询（结果以通知回来）+ 三个正当用途（用户问进度 / 回看历史 / 通知被截断）。测试 B-in-2。
- **B-in-3 时间戳**：有限值 → ISO 8601；NaN/Infinity → `String()`；超出 Date 范围的有限值（toISOString 抛错）→ `String()`。测试 B-in-3。
- **B-in-4 时长与年龄**：`<60s`「Ns」；`<60m`「Nm SSs」（秒补零）；`<24h`「Nh M m」（分补零）；其余「Nd Nh」。负数/NaN 折 0；相对年龄 =「<时长> ago」（at 缺席/非有限 → undefined）；瞬时 =「ISO (age)」。测试 B-in-4。
- **B-in-5 计数与属性行**：计数非有限值原样 `String()`，其余截断取整加千分位（负号保留）；属性行 `name="value"`——值内空白折叠成单空格并 trim，再做 XML 转义（`< > & ' "` 五字符）；`escapeWorkflowRunText` 即该转义的再导出。测试 B-in-5。

## AskUserQuestion（B-au-1..4）

- **B-au-1 门握手事件序列**：未答 → 拒绝；空白答案 → 拒绝（点名问题）；答案到位 → 执行回投影。三次调用零共享状态、顺序即「问 → 门 → 答 → 执行」，无 sleep/固定超时。测试 `ask-user-question.test.ts` B-au-1。
- **B-au-2 未答拒绝**：抛 `CoreError`——`message`「AskUserQuestion requires user answers before execution」、`type:"tool_execution_failed"`、`recoverable:true`、`context:{issues:[{message:"Answers have not been collected yet", path:["answers"]}], toolCallId, toolName:"AskUserQuestion"}`。测试 B-au-2。
- **B-au-3 空白答案**：逐条点名（`Blank answer is not allowed for question: <问题文本>`，path `["answers", <问题文本>]`），其余已答问题不报。测试 B-au-3。
- **B-au-4 通过投影**：输出恰含 `questions → answers → annotations?` 三块（键序即转录面事实）；`answers` 缺席字段补 `{}`；`annotations` 缺席整键省略；入参 `metadata` 是跟踪专用字段，**不进**结果投影（未知字段不保留）；问题的 `multiSelect` 缺省补 `false`（默认值显式在场）。测试 B-au-4。

## 工具声明与描述文案（B-tp-1..5）

- **B-tp-1 CreateWorkflow**：`readOnly:false`、`concurrentSafe:true`、15s/24KB、`needsApproval`、权限 `createWorkflow` **alwaysAsk** + 会话内可「Always allow」（`allowAlways:"session"`）、不支持取消、trace 必带并传适配器。描述含三选一来源、阶段必填、修订路由（改已有 run 走 AmendWorkflow）、facade 声明块。测试 B-tp-1。
- **B-tp-2 AmendWorkflow**：同门同预算（权限复用 `createWorkflow`，输出复用 CreateWorkflow schema）；描述含「省略即沿用」三条、`script_unchanged`、缓存语义、确认豁免规则。测试 B-tp-2。
- **B-tp-3 SaveWorkflow**：`sideEffectScope:"workspace"`、`riskLevel:"medium"`、`concurrentSafe:false`、`allowAlways:false`（永久免确认会把这道确认关死）；描述含「NEVER unsolicited」、文件格式、覆盖语义、参数声明。测试 B-tp-3。
- **B-tp-4 EvalWorkflowSnippet**：`sideEffectScope:"workspace"`、660s 外层兜底（`allowCallOverride:false`，内层墙钟走 `timeoutMs` ≤600s）、取消 supported/bestEffort、文案「Snippet evaluation cancelled」；描述含实验台定位、NOT for orchestration、facade 声明块。测试 B-tp-4。
- **B-tp-5 AskUserQuestion**：`readOnly:true`、`requiresUserInteraction:true`、30s/100KB、`sideEffectScope:"userInteraction"`、权限 `userInteraction.askQuestion`（`patternSources:["toolName","input"]`、`denyPriority:"beforeAsk"`）、预算 truncate/head、取消有用户可见文案、trace 必带**不**传适配器。描述含使用门槛（blocked on a decision）、Other 自动提供、multiSelect、`(Recommended)` 约定、plan mode 提示、preview 侧栏规则。测试 B-tp-5。

---

## 未覆盖

- **真实子进程/沙箱执行**（EvalWorkflowSnippet 的 `port.evalSnippet` 真执行、CreateWorkflow 的 engine submit 之后的 run 生命周期）：IO 重且属执行面（dynamic-workflow 包），本包契约只钉端口契约与三态终态文案；模块路径与导出仍在 `interface.md`，接口默认不可变。
- **`renderAnsweredQuestion`**（`ask-user-question-narration.ts`）：该文件分类为 original（已独立、不替换），其转录面不在本合同范围。
- **持久化副作用**（保存定义的原子性、跨设备 rename 回落）：存储层在 `saved-workflows/**`（归 core-tool-handlers-02）；本包钉住的是经工具入口可观察的落点、字节与四态文案。
