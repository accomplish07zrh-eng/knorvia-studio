# Knorvia 独立替换任务计划书

2026-10-10 · 在线版：https://claude.ai/code/artifact/bd736ed1-1eb1-4efc-bddb-c3a7cf8aad41

> 本文件是在线版的同步副本，两者不一致时以在线版为准。

剩余 3,433 个继承自 ZCode 的文件里，3,055 个产品源码文件（约 56 万行）分成 79 个替换包，由执行 Agent 按合同重写；其余文件按类别删除、登记为第三方、登记为自有或重写。不设时间表，按阶段一直做到全部完成。执行只看本书与仓库规则；早先的《Knorvia 自维护执行计划书》已由本书取代。

## 规模与构成

真正要重写的是约 2,770 个源码文件；其余约 660 个继承文件通过删除、核实第三方、登记自有或重新生成来处理。数字取自 main `1ac688f7` 的来源清单（不含 `.agents` 与 `third-party/`）。

| 类别                                                                                  | 文件     | 体量         | 处理                                                                                                                                     |
| ------------------------------------------------------------------------------------- | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 产品源码，需重写                                                                      | 约 2,770 | 约 51 万行   | 按 79 个替换包重写                                                                                                                       |
| 其中：终端交互界面                                                                    | 120      | 1.6 万行     | 保留，按包重写（见“原待定事项：已拍板”）                                                                                                 |
| knip 确认无用的源码                                                                   | 97       | —            | 删除                                                                                                                                     |
| 开发工具（debug、formal-proof、swift-bridge、prompt-trajectory、harness、.vscode 等） | 58       | 1.0 万行     | 删除，不随产品发布                                                                                                                       |
| 第三方来源（shadcn 45、ai-elements 46、VS Code RPC 约 21、Fig 命令注册表 1）          | 113      | 2.2 万行     | 与固定上游版本比对后登记为 third-party；ZCode 改过的部分并入对应替换包重写                                                               |
| 品牌图标（你提供的 Knorvia 图标，放在上游原路径）                                     | 29       | 2.6 MB       | 登记为 original                                                                                                                          |
| 上游残留资产（支付图标、GLM/Z.ai 标志、提示音、dmg 背景、飞书图标）                   | 19       | —            | 无引用的删除（支付图标、Z.svg、dmg 背景等，以全仓搜索为准）；仍在用的 GLM、飞书标志按品牌标志保留登记；提示音换成脚本合成的 Knorvia 音效 |
| 模型供应商标志（Anthropic、OpenAI、DeepSeek 等）                                      | 约 25    | —            | 保留原标志；按 model-provider-logo-sources.json 的官方来源登记为 third-party，用户提供的登记 original                                    |
| 配置（package.json、tsconfig、构建配置、点文件）                                      | 约 105   | —            | 随包手写重建；最终登记为功能配置性质复核                                                                                                 |
| 文档（README、AGENTS、DESIGN、CONTEXT、各包 README）                                  | 约 30    | —            | 用自己的话重写                                                                                                                           |
| 许可正文（LICENSE、NOTICE、scripts/license-texts）                                    | 约 16    | —            | 保留，登记为标准许可正文性质复核                                                                                                         |
| 界面文案（UI 与 CLI 的中英文 locale）                                                 | 4        | 约 72 万字节 | 按包拆分、用自己的话重写                                                                                                                 |
| 生成物（pnpm-lock、THIRD-PARTY-NOTICES）                                              | 3        | —            | 用工具重新生成                                                                                                                           |
| 第三方依赖补丁                                                                        | 3        | —            | ai-sdk 两个按需重写；arms RUM 补丁随该依赖一并删除                                                                                       |
| 原生助手（Swift 窗口尺寸、C# 浏览器导入）                                             | 3        | 约 6 万字节  | 并入桌面包重写                                                                                                                           |
| 继承的测试                                                                            | 4        | —            | 由契约测试替代后删除                                                                                                                     |

**“归零”的口径：** 完成时，继承分类里只允许剩下三类文件，且每个都有记录：已作“功能配置”性质复核的配置、已作“标准许可正文”性质复核的许可正文、冻结证据包里的上游摘录（不随产品发布，书面列出，见 M0-3 与 M0-7）。来源工具对前两类保留上游事实是有意设计，不强行改写；第三类删除会破坏证据完整性检查。

**我们改过的界面为什么仍在重写范围：** 我用与验收相同的算法，实测了约 2,400 个“改过的继承文件”还保留多少 ZCode 代码（不含 .agents 与 third-party/）。结果是 1,532 个保留九成以上，568 个保留五到九成，224 个保留二到五成，只有 48 个（约 3,100 行）已无可测的保留。packages/ui 的 909 个里，767 个保留九成以上：Knorvia 的视觉语言主要靠主题变量和少量改动实现，组件代码本身仍是 ZCode 的。

所以范围按实测定：这 48 个由我逐个复核后登记，不重写（M0-14）；其余按包重写。重写只换代码，不换样子：布局、交互和 Knorvia 的黑白视觉都由截图对比锁定，偏差不超过 2 像素。我们自己写的界面（studio、工作台、创作、群聊等两百多个文件）本来就不在重写范围，在 M0 登记为 original。

## 已定的关键选择

以下 13 条已定，执行中不再讨论；确有新事实推翻时，先更新本书再改做法。

1. **按行为重写，不按文件一一对应。** 新实现只保持对外入口（包的导出、模块路径、协议、命令、事件）与行为不变，内部文件怎么拆由执行 Agent 定。理由：照着旧文件结构重写，最容易变成“改写”而不是独立实现，也得不到更好的设计。
2. **第三方来源核实登记，不重写。** shadcn（MIT）、ai-elements（Apache-2.0）、VS Code RPC 工具（MIT）、Fig 命令注册表（MIT）是 ZCode 从别处复制的开源代码。与固定上游版本逐文件比对，一致的登记为 third-party；被 ZCode 改过的部分并入对应替换包重写。理由：目标是去掉 ZCode 的实现，不是去掉合法的开源依赖。
3. **先删后写。** knip 确认无用的 97 个文件、开发工具、为已移除功能（登录、订阅、支付、上游遥测、GLM 官方账号）服务的残留模块，都直接删除。每个包选包时还要再查一遍无用代码。例外：读取旧用户数据的迁移代码必须保留功能，只能重写。
4. **遥测类模块先查去向。** 桌面端与 UI 里有大量 `*Telemetry`、`arms*`、资源采样模块。数据没有去向（上游后端已移除）的直接删除；只用于本地日志与诊断的，按本地诊断需求重写成更小的实现。
5. **配置文件随包手写重建。** 用自己的结构写最小必要配置，完成后登记为功能配置性质复核，不追求配置文件的相似度归零。理由：配置项由工具决定，写法空间很小。
6. **界面文案按包重写。** 两份各约 35 万字节的 UI 文案文件按替换包拆成命名空间，每个 UI 包负责自己的文案，用自己的话重写，键名可以变。旧条目在最后一个使用者被替换后删除。`pnpm i18n:check` 的中英文键一致校验始终保持通过。
7. **UI 验收以截图和几何为准。** DOM 结构可以变，但 `data-testid`、无障碍名称、快捷键不变；相同状态下与替换前的截图对比，布局偏差不超过 2 像素，明暗两主题、桌面 1360 与 820 宽、手机 390 宽都要过。
8. **数据格式与协议不变。** 会话与设置存储、localStorage 键、stdio/RPC 协议、远程 replay、环境变量与数据目录一律不变。确需变化的在合同中单列，由我裁定，并且必须保证旧数据仍可读。
9. **规则表类代码按公开事实重建。** bash 只读策略、git 子命令分类、命令参数解析等文件本质是规则表。合同只给“哪些命令、哪些参数只读”的判定结果样例，执行 Agent 依据各命令的公开文档自己组织规则，不照搬旧表的结构与顺序。
10. **动态工作流分析器用大量样例做合同。** 它是一个静态分析编译器，合同以“输入脚本 → 分析结果”的 golden 样例为主，不少于 300 个；旧门先证明旧实现对全部样例的输出与合同一致。
11. **品牌图标登记为自有。** 29 个图标文件只是放在 ZCode 的原路径，内容是你提供的 Knorvia 图标；由我登记为 original，依据写明“用户提供的品牌资产”。
12. **不隔离，靠门槛把关。** 执行 Agent 可以读旧代码理解行为，但新代码依据合同写，不复制、不改名照搬、不逐行改写。验收以行相似度与结构相似度两道门槛为准；新文件登记为 original，basis 如实写明作者读过被替换的实现。
13. **新文件统一 Apache-2.0。** 每个新实现文件顶部 `// SPDX-License-Identifier: Apache-2.0`，与根许可一致。

## 原待定事项：已拍板

以下三项已经定下，执行中不再讨论。

**1. 终端交互模式：保留，按包重写（你 2026-10-10 决定）。** tui 包与终端命令中心排在 M2 末尾，和其他包一样写合同、跑旧门、重写。交互、快捷键与斜杠命令行为保持不变。

**2. 不建沙箱，不做隔离（你 2026-10-10 决定）。** 执行 Agent 在主仓工作，可以读旧代码。把关靠合同测试和两道相似度门槛，见“团队、分工与交付方式”。这与仓库规格一致：旧实现可以用来提取行为和对照验收，但不能当逐行重写的模板。

**3. 模型供应商标志：保留，不重画。** 它们是各供应商的品牌，不是 ZCode 的实现。按 `model-provider-logo-sources.json` 记录的官方来源登记为 third-party，用户提供的登记为 original。GLM、飞书等仍在使用的品牌标志同样处理。

### 执行中遇到问题怎么办

- 本书中“我”指负责本计划的 Claude（根 Agent），“你”指用户。
- 常见问题本书已经预先回答：先查“已定的关键选择”、下表和对应章节。
- 本书没覆盖、又会影响功能、数据或范围的问题，直接问用户：写清哪个包、哪条规则、你倾向的做法和理由。
- 小问题按下表的默认裁决先做，并在 PR 描述里写明用了哪一条。

| 遇到的情况                             | 默认裁决                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| 不确定某段代码是否还有用               | 保留并写进合同，不删                                                                    |
| 不确定文件是否第三方原样               | 按“ZCode 改过”处理，进替换包                                                            |
| 接口能不能改                           | 不改                                                                                    |
| 旧行为看起来奇怪                       | 保持原样；只有明显缺陷才登记进 known-differences，并写明理由                            |
| 存储格式、协议字段、环境变量、数据目录 | 一律不变                                                                                |
| 界面文案                               | 意思不变，用自己的话重写；中英文键保持一致                                              |
| 视觉与布局                             | 以当前截图为准，包括 Knorvia 的黑白视觉语言；不恢复 ZCode 原样                          |
| 图标与资产                             | Knorvia 品牌与供应商标志保留；无引用的上游资产删除；仍在用的非品牌资产换成 Knorvia 自制 |
| 平台差异                               | Windows 与 Linux 都必须通过；macOS 写明未实机验证                                       |
| 包太大或依赖成环                       | 按依赖重切，单包不超过 60 个文件；拆不开的环整个作为一包                                |
| 相似度超标                             | 改写到过门槛为止；不调门槛，不申请例外                                                  |
| 人手不够                               | 新开一个执行 Agent 补位，总数最多 6 个；同时进行的包仍不超过 5 个                       |
| 某项检查在 main 上本来就失败           | 不算本包的问题；在 PR 中写明失败项及 main 上的同一失败，照常推进                        |
| 本书前后不一致                         | 以更具体的章节为准；仍不清楚就选更保守的做法：不删功能、不改数据、不放宽测试            |

## 团队、分工与交付方式

不建沙箱、不做隔离：5 个执行 Agent 都在主仓工作，每个包由一个执行 Agent 从头做到尾。我审合同、验收替换、合并 PR，守最后一道门。原来合同组与实现组分开，是为了隔离；不隔离以后再分开只会多一道交接，所以合并。

| 角色       | 人数                              | 做什么                                                                    | 在哪里交付                              | 红线                                                        |
| ---------- | --------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| 执行 Agent | 5 个                              | 一个包从头做到尾：选包、写合同、跑旧门、重写、接入、登记来源              | 主仓 PR：先合同 PR，再替换 PR；都不合并 | 不复制、不改名照搬、不逐行改写旧代码；不放宽测试；不推 main |
| 记账 Agent | 可选；不单独安排时由执行 Agent 做 | M0-1 记账第二轮                                                           | 主仓 PR，不合并                         | 只改来源记录，不动代码                                      |
| 我         | —                                 | 审合同（前 10 个包与高难度包全审，其余抽审）；验收替换 PR；合并；每周汇报 | 主仓                                    | 不写被替换包的生产实现                                      |
| 你         | —                                 | 回答执行中的问题；看每周汇报                                              | —                                       | —                                                           |

**一个包的流转：**

1. 选包：执行 Agent 定边界，删掉包内无用代码。
2. 合同与旧门：写行为规格与契约测试，在旧实现上全部跑通，提合同 PR。我审过后合并，契约测试从此在 CI 里守住旧行为。
3. 重写：先用桩替换目标文件，确认契约测试全部失败；再依据合同写新实现。
4. 接入与登记：删除旧文件，过两道相似度门槛与接入门禁，登记来源，提替换 PR。
5. 我验收；不过就在 PR 上写“哪条合同、哪个测试、期望与实际”，或写超标文件与相同片段的位置，最多 3 轮。
6. CI 在 Linux 与 Windows 上全绿后，我合并。

**旧代码可以看，但只能这样用：** 用来弄清行为、边界和调用方，以及对照验收。写新代码时依据合同：不复制、不改名照搬、不逐行翻写，不开着旧文件逐段对照。验收看两道门槛，超标就退回重写：

- 行相似度：规范化后的包含率 < 0.2，且最长相同段 < 8 行。
- 结构相似度：标识符与字面量统一替换后比较 token 指纹，专门抓改名照搬和逐行翻写。门槛在 M0-8 用已有的隔离重写文件校准。

**来源登记：** 新文件登记为 original，basis 如实写明“作者读过被替换的实现”，并附两道相似度的实测值。independent-replacement 只保留给以前由隔离作者完成的批次，不混用。

**并行规则：** 同时进行的包不超过 5 个，且互不重叠、互不依赖。从合同 PR 开始，到替换 PR 合并为止，包内文件冻结功能改动；紧急修复同步补进合同，并重跑旧门。

## 阶段

不设时间表，按阶段一直做到全部完成。前一阶段的退出条件满足，下一阶段才开始；同一阶段内互不依赖的包可以并行。各阶段的退出条件见“验收清单”中的“里程碑退出”。

1. **M0 收尾、删除与工具**：M0 任务清单全部完成。
2. **M1 试点**：两个试点包按完整流程合并，复盘写回本书，据此调整合同写法与包大小。
3. **M2 CLI 与运行时、M3 共享与服务**：两者可以交错进行。合同可以提前写，M2 的合同在试点期间就可以开始。
4. **M4 桌面、M5 UI**：M3 的 shared 与 services 包合并后开始，两者可以交错。M5 最大，先做 lib、store 与 hooks。
5. **M6 发布闭环**：“最终完成”清单全部打勾，发布新版本。

## 分包总表

共 78 个包（另 1 个证据文件在 M0 处理）。表内按里程碑排序；同一里程碑内的先后见“各区域难点与做法”。范围按目录自动切分，执行 Agent 选包时可按依赖关系重切，但单包不超过 60 个文件，重切后在本表更新。

| 包 ID                                   | 里程碑 | 范围                                                                                                                 | 文件 | 行数   | 难度 | 要点                                                                                                 |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- | ---- | ------ | ---- | ---------------------------------------------------------------------------------------------------- |
| `.vscode-01`                            | M0     | `.vscode`                                                                                                            | 3    | 156    | 低   | 开发配置，删除                                                                                       |
| `dynamic-workflow-03`                   | M0     | `apps/cli/packages/dynamic-workflow` · scratch, scripts                                                              | 3    | 206    | 低   | scratch 与开发脚本，删除                                                                             |
| `core-tool-01`                          | M1     | `apps/cli/packages/core/src/tool` · ., executor                                                                      | 28   | 3,147  | 中   | 试点 2：工具执行器与调度                                                                             |
| `apps-cli-01`                           | M2     | `apps/cli` · scripts, tools/prompt-trajectory/src                                                                    | 14   | 2,811  | 低   | CLI 脚本；prompt-trajectory 删除                                                                     |
| `apps-cli-packages-01`                  | M2     | `apps/cli/packages` · adapters/src, adapters/src/browser, adapters/src/commands, adapters/src/config,                | 53   | 9,861  | 中   | adapters（配置、git 快照、进程探测、图片压缩、会话存储迁移）与 browser-use 插件                      |
| `apps-cli-packages-02`                  | M2     | `apps/cli/packages` · debug/scripts, debug/server, debug/src, dynamic-workflow-runtime/src, i18n/src,                | 34   | 11,030 | 中   | debug 删除；dynamic-workflow-runtime、i18n（文案重写）、node-repl-host、shared-types、telemetry      |
| `bootstrap-01`                          | M2     | `apps/cli/packages/bootstrap/src` · ., lib, protocol, protocol-v4, protocol-v4/commands, protocol-v4/commands/handle | 31   | 4,271  | 中   | app-server v4 协议命令处理；stdio 协议面，兼容关键                                                   |
| `bootstrap-app-01`                      | M2     | `apps/cli/packages/bootstrap/src/app`                                                                                | 60   | 13,540 | 高   | 应用装配、动态工作流运行服务（启动、回放、日志、对账）                                               |
| `bootstrap-app-02`                      | M2     | `apps/cli/packages/bootstrap/src/app`                                                                                | 32   | 7,669  | 高   | 工作流驱动与并发治理、actor 工具                                                                     |
| `cli-02`                                | M2     | `apps/cli/packages/cli/src`                                                                                          | 53   | 7,073  | 中   | CLI 入口、参数、app-server 生命周期、无头模式                                                        |
| `cli-scripts-01`                        | M2     | `apps/cli/packages/cli/scripts`                                                                                      | 15   | 2,789  | 低   | CLI 构建与打包脚本                                                                                   |
| `contracts-01`                          | M2     | `apps/cli/packages/contracts/src` · capabilities, commands, compact, config, events, hooks, interfaces, logging, mod | 58   | 11,651 | 中   | 纯类型与接口为主，按纯声明文件规则；CLI 其余包都依赖它，最先做                                       |
| `contracts-02`                          | M2     | `apps/cli/packages/contracts/src` · ., tools, tracing, workflow                                                      | 49   | 7,258  | 中   | tools、tracing、workflow 类型；同上                                                                  |
| `core-01`                               | M2     | `apps/cli/packages/core/src` · agent, compact, context, context/sections, embedded-search, hooks, mcp                | 52   | 6,426  | 高   | 回合状态机、消息历史、压缩策略、系统提示分段、工作区 Hook 信任；其中 hooks 子目录作为试点 1 先单独做 |
| `core-02`                               | M2     | `apps/cli/packages/core/src` · memory, memory/recall, model, permission, plugin-reference, runtime-task, sessio      | 52   | 5,091  | 中   | 记忆、子 Agent 档案与运行器、通知                                                                    |
| `core-03`                               | M2     | `apps/cli/packages/core/src` · ., workflow, workflow/expert, workflow/expert/parsers, workflow/scheduler             | 35   | 4,940  | 中   | 工作流调度与专家队列                                                                                 |
| `core-runtime-01`                       | M2     | `apps/cli/packages/core/src/runtime`                                                                                 | 13   | 3,050  | 中   | 运行时入口与装配，放在 runtime 各包之后                                                              |
| `core-runtime-helpers-01`               | M2     | `apps/cli/packages/core/src/runtime/helpers`                                                                         | 53   | 6,909  | 高   | 附件与媒体预算、权限中转、子 Agent 中转、steering、提醒                                              |
| `core-runtime-methods-01`               | M2     | `apps/cli/packages/core/src/runtime/methods`                                                                         | 60   | 11,144 | 高   | 压缩、上下文、模型请求与流式、消息持久化；时序与取消最难                                             |
| `core-runtime-methods-02`               | M2     | `apps/cli/packages/core/src/runtime/methods`                                                                         | 37   | 6,552  | 高   | 同上后半                                                                                             |
| `core-tool-handlers-01`                 | M2     | `apps/cli/packages/core/src/tool/handlers`                                                                           | 60   | 10,472 | 高   | bash 执行、只读策略规则表、工作流修订、AskUserQuestion；规则表按公开事实重建                         |
| `core-tool-handlers-02`                 | M2     | `apps/cli/packages/core/src/tool/handlers`                                                                           | 50   | 6,581  | 中   | read/write、webfetch（出网防护）、websearch、todo、plan-mode                                         |
| `core-tool-handlers-saved-workflows-01` | M2     | `apps/cli/packages/core/src/tool/handlers/saved-workflows`                                                           | 4    | 640    | 低   | 并入 core-tool-handlers-02                                                                           |
| `dynamic-workflow-01`                   | M2     | `apps/cli/packages/dynamic-workflow/src` · analysis, compiler                                                        | 53   | 12,738 | 高   | 工作流脚本静态分析（因果图、扇出基数）；≥300 个 golden 样例                                          |
| `dynamic-workflow-02`                   | M2     | `apps/cli/packages/dynamic-workflow/src` · ., engine, facade, lowering, schema                                       | 37   | 7,210  | 高   | 编译降级与执行引擎                                                                                   |
| `packages-01`                           | M3     | `packages` · client/src, cua, formal-proof/src, model-option-map/src, provider/src, provider/                        | 56   | 6,532  | 中   | client SDK、cua、model-option-map、provider；formal-proof 删除                                       |
| `packages-02`                           | M3     | `packages` · provider-node/src, rpc/examples, rpc/src                                                                | 30   | 4,236  | 中   | provider-node 与 rpc；rpc 属 VS Code 派生，核实登记，ZCode 改动部分重写                              |
| `packages-03`                           | M3     | `packages` · server, server-cli/src, server-cli/src/ipc, server-cli/src/packaging, server-cli                        | 59   | 7,685  | 高   | server 与远程部署（SSH、WSL、Docker）、stdio 服务；远程连接兼容关键                                  |
| `services-01`                           | M3     | `packages/services/src` · agent, broadcast, commands, conversation-telemetry, credential, credential/provi           | 60   | 8,165  | 中   | 命令、凭据加密、CUA 权限、文件服务、git 检查点                                                       |
| `services-02`                           | M3     | `packages/services/src` · onboarding, plugin-sync, plugins, process, prompt-attachment-transfer, providers           | 35   | 4,448  | 中   | 引导、插件同步、进程、远程同步                                                                       |
| `services-03`                           | M3     | `packages/services/src` · session, session/claude-native, session/tasksDatabase, setting, settings-sync, s           | 57   | 6,259  | 高   | 自动化 cron、会话存储与迁移、Claude 会话导入；数据兼容关键                                           |
| `services-04`                           | M3     | `packages/services/src` · ., subagents, system, terminal, types, usage-stats, window-controller                      | 26   | 4,297  | 中   | 子 Agent、终端、用量、窗口控制器                                                                     |
| `shared-01`                             | M3     | `packages/shared/src` · node, protocol-v4                                                                            | 27   | 2,601  | 中   | node 工具与 protocol-v4；wire-codec 属 VS Code 派生，核实登记                                        |
| `shared-02`                             | M3     | `packages/shared/src`                                                                                                | 60   | 7,634  | 中   | 共享类型与协议常量；含 coding plan、账号等已移除功能残留，删除                                       |
| `shared-03`                             | M3     | `packages/shared/src`                                                                                                | 60   | 7,743  | 中   | 共享类型与工具                                                                                       |
| `shared-04`                             | M3     | `packages/shared/src`                                                                                                | 19   | 3,826  | 中   | 共享类型与工具                                                                                       |
| `desktop-01`                            | M4     | `packages/desktop/src` · host, preload, renderer, renderer/src                                                       | 57   | 8,601  | 高   | Host 初始化与关停、MessagePort 防护、preload、renderer 入口                                          |
| `desktop-main-01`                       | M4     | `packages/desktop/src/main` · browserView, mcpUserDirectory                                                          | 35   | 11,737 | 高   | 内嵌浏览器视图、MCP 用户目录                                                                         |
| `desktop-main-02`                       | M4     | `packages/desktop/src/main`                                                                                          | 60   | 10,657 | 高   | 关于、崩溃捕获、Chrome 数据导入、CUA 权限面板、菜单                                                  |
| `desktop-main-03`                       | M4     | `packages/desktop/src/main`                                                                                          | 60   | 12,301 | 高   | 窗口生命周期与外观、托盘、日志、本地媒体协议、进程资源采样                                           |
| `desktop-scheduler-01`                  | M4     | `packages/desktop/src/scheduler`                                                                                     | 4    | 539    | 低   | 定时任务调度入口                                                                                     |
| `desktop-scripts-01`                    | M4     | `packages/desktop/scripts`                                                                                           | 22   | 2,791  | 中   | 桌面打包脚本                                                                                         |
| `ui-01`                                 | M5     | `packages/ui/src` · GitPane, WorkspaceHeaderSections, WorkspaceSidebar, browser-use, chat-input-tool                 | 52   | 20,583 | 高   | Git 面板、工作区头部、浏览器视图                                                                     |
| `ui-02`                                 | M5     | `packages/ui/src` · mentions, mentions/components, mentions/nodes, mentions/providers, onboarding, p                 | 59   | 9,013  | 中   | @提及（Lexical 节点）、引导、快速选择                                                                |
| `ui-03`                                 | M5     | `packages/ui/src` · resource-manager, resource-manager/storage, root, settings-sync, shortcuts                       | 38   | 6,364  | 中   | 资源管理器、根布局、快捷键                                                                           |
| `ui-04`                                 | M5     | `packages/ui/src` · store, terminal, workers, workspace-file-search                                                  | 49   | 11,516 | 高   | Zustand store（持久化键不变）、终端、worker、文件搜索                                                |
| `ui-05`                                 | M5     | `packages/ui/src` · workspace-file-tree, workspace-grouped-tasks                                                     | 23   | 2,071  | 低   | 文件树、分组任务                                                                                     |
| `ui-06`                                 | M5     | `packages/ui/src`                                                                                                    | 60   | 22,171 | 高   | App 根、对话框、聊天输入（Lexical）、窗口框架                                                        |
| `ui-07`                                 | M5     | `packages/ui/src`                                                                                                    | 59   | 14,527 | 高   | 任务列表、终端、工作区侧栏与头部                                                                     |
| `ui-ToolCallBlocks-01`                  | M5     | `packages/ui/src/ToolCallBlocks`                                                                                     | 12   | 2,771  | 中   | 工具调用卡片框架                                                                                     |
| `ui-ToolCallBlocks-renderers-01`        | M5     | `packages/ui/src/ToolCallBlocks/renderers`                                                                           | 60   | 12,280 | 中   | 各工具卡片渲染                                                                                       |
| `ui-ToolCallBlocks-renderers-02`        | M5     | `packages/ui/src/ToolCallBlocks/renderers`                                                                           | 2    | 162    | 低   | 并入 renderers-01                                                                                    |
| `ui-app-shell-01`                       | M5     | `packages/ui/src/app-shell`                                                                                          | 51   | 12,552 | 高   | 侧栏与侧面板编排（子 Agent、工作流运行）                                                             |
| `ui-app-shell-workflow-artifacts-01`    | M5     | `packages/ui/src/app-shell/workflow-artifacts` · ., presets                                                          | 15   | 2,748  | 中   | 工作流产物面板                                                                                       |
| `ui-components-01`                      | M5     | `packages/ui/src/components` · ai-elements, icons, lib                                                               | 48   | 12,114 | 中   | ai-elements 46 个核实登记；icons、lib 重写                                                           |
| `ui-components-02`                      | M5     | `packages/ui/src/components` · ui, workflow-graph, workflow-run-line                                                 | 55   | 7,661  | 中   | shadcn 45 个核实登记；workflow-graph、run-line 重写                                                  |
| `ui-components-03`                      | M5     | `packages/ui/src/components` · ., workflow-timeline                                                                  | 42   | 7,582  | 中   | workflow-timeline 等组件                                                                             |
| `ui-hooks-01`                           | M5     | `packages/ui/src/hooks`                                                                                              | 60   | 9,492  | 中   | 服务访问 hooks                                                                                       |
| `ui-hooks-02`                           | M5     | `packages/ui/src/hooks`                                                                                              | 17   | 2,721  | 中   | 服务访问 hooks                                                                                       |
| `ui-lib-01`                             | M5     | `packages/ui/src/lib`                                                                                                | 60   | 7,896  | 中   | 纯逻辑工具；遥测类先查去向                                                                           |
| `ui-lib-02`                             | M5     | `packages/ui/src/lib`                                                                                                | 60   | 7,466  | 中   | 纯逻辑工具                                                                                           |
| `ui-lib-03`                             | M5     | `packages/ui/src/lib`                                                                                                | 60   | 8,597  | 中   | 纯逻辑工具                                                                                           |
| `ui-lib-04`                             | M5     | `packages/ui/src/lib`                                                                                                | 22   | 3,400  | 中   | 纯逻辑工具                                                                                           |
| `ui-settings-01`                        | M5     | `packages/ui/src/settings` · model-provider-section, saved-workflows                                                 | 57   | 9,733  | 中   | 模型供应商、已存工作流；供应商标志保留，不重画                                                       |
| `ui-settings-02`                        | M5     | `packages/ui/src/settings`                                                                                           | 60   | 22,179 | 中   | 自动化、MCP、Hook、插件、记忆、迁移等设置页                                                          |
| `ui-settings-03`                        | M5     | `packages/ui/src/settings`                                                                                           | 38   | 5,738  | 中   | 其余设置页                                                                                           |
| `ui-settings-usage-stats-01`            | M5     | `packages/ui/src/settings/usage-stats`                                                                               | 10   | 1,431  | 低   | 用量统计页                                                                                           |
| `ui-v4-01`                              | M5     | `packages/ui/src/v4` · composer, telemetry                                                                           | 47   | 8,815  | 高   | 输入框与草稿、附件上传、权限授予                                                                     |
| `ui-v4-02`                              | M5     | `packages/ui/src/v4`                                                                                                 | 60   | 25,226 | 高   | 对话时间线与回合渲染：虚拟滚动、流式、选择，全书最难                                                 |
| `ui-v4-03`                              | M5     | `packages/ui/src/v4`                                                                                                 | 60   | 8,789  | 高   | 待发送命令重放、分栏布局、会话数据层                                                                 |
| `ui-v4-04`                              | M5     | `packages/ui/src/v4`                                                                                                 | 1    | 156    | 低   | 并入 ui-v4-03                                                                                        |
| `ui-vite-01`                            | M5     | `packages/ui/vite`                                                                                                   | 1    | 81     | 低   | Vite 插件                                                                                            |
| `scripts-01`                            | M6     | `scripts` · ., architecture, release-it                                                                              | 34   | 5,944  | 低   | 构建、架构检查与发布脚本                                                                             |
| `cli-01`                                | M2     | `apps/cli/packages/cli/src` · command-center, command-center/handlers, internal-search                               | 25   | 2,668  | 中   | 终端命令中心，M2 末尾重写；其中 internal-search 不属终端界面，并入 cli-02                            |
| `tui-01`                                | M2     | `apps/cli/packages/tui/src`                                                                                          | 60   | 9,468  | 中   | 终端界面，M2 末尾重写                                                                                |
| `tui-02`                                | M2     | `apps/cli/packages/tui/src`                                                                                          | 24   | 3,776  | 中   | 终端界面，M2 末尾重写                                                                                |
| `tui-scripts-01`                        | M2     | `apps/cli/packages/tui/scripts`                                                                                      | 1    | 37     | 低   | 终端界面脚本，M2 末尾重写                                                                            |
| `tui-theme-01`                          | M2     | `apps/cli/packages/tui/src/theme`                                                                                    | 6    | 362    | 低   | 终端界面，M2 末尾重写                                                                                |

## 各区域难点与做法

最难的是三处：CLI 运行时的时序、动态工作流分析器、UI 对话时间线。它们的合同必须按下面的做法写，否则契约测试拦不住回归。

### CLI（M2，约 17.9 万行）

**顺序：** contracts → core/tool → core（状态机、压缩、上下文）→ core/runtime（helpers → methods → 入口）→ dynamic-workflow → bootstrap → cli → adapters 与其余小包。

- **运行时时序**（core-runtime-\*、core-01）：流式输出、取消、上下文压缩、并发工具调用、重试交错发生。合同必须用**事件序列断言**：输入一段模拟的模型流（含中途取消、工具并发、压缩触发点），断言发出的协议事件序列与持久化记录。模拟模型服务复用现有模型适配器的测试夹具。
- **协议面兼容**（bootstrap-01、cli-02）：app-server v4 是桌面与 Web 对接 Agent 的唯一通道。旧门阶段用旧实现录制一组真实会话的协议帧，合同要求新实现对同样输入产生等价帧（允许时间戳与 ID 不同）。
- **规则表**（core-tool-handlers-01）：见选择 9。
- **动态工作流分析器**（dynamic-workflow-01/02）：见选择 10。样例来自现有工作流模板、测试脚本，另由执行 Agent 构造边界样例（循环、异步、扇出、异常路径）。`specs/` 下的 causality-_、fanout-cardinality-_ 规格是现成素材。
- **会话存储迁移**（apps-cli-packages-01 的 session-store migrations）：必须继续读旧数据，合同用旧版存储夹具做往返测试。
- `specs/` 里大量 knorvia-core-_、hook-_、edit-_、file-search-_ 规格是以前独立替换留下的，写合同时优先复用。

### 共享、服务与服务端（M3，约 6.3 万行）

**顺序：** shared → rpc 与 provider → services → server、server-cli → web。

- **协议与 wire-codec**：先核实 VS Code 派生部分并登记，再重写 ZCode 的改动；字段与帧格式一字不改。
- **存储与迁移**（services-03）：用脱敏的旧版会话库、设置文件做夹具，“旧写 → 新读 → 新写 → 旧读”往返必须通过。
- **远程部署**（packages-03）：SSH、WSL、Docker 难以离线测试。合同以命令生成、状态机与错误路径为主；实机连接列为人工验收项，未做时如实标注。
- **已移除功能的残留**（coding plan、官方 GLM 账号、订阅）：删除，但对应的旧数据迁移保留。

### 桌面（M4，约 4.7 万行）

**顺序：** host 与 preload → main（按功能族）→ renderer → 脚本与构建。

- **平台行为**：合同以“IPC 输入 → 主进程动作（窗口状态、文件、协议注册）”为主，Electron API 用测试替身。Windows CI 必须绿，每个里程碑末打包安装版与便携版实机启动。
- **Host 不变量**：owner/lease、workspace identity、stale run 防护、desktop-continuous 与 web-remote-replayable 两条链路的区别，都要写进合同并各有测试。
- **原生助手**：C# 浏览器导入读取 Chrome 用户数据，合同用夹具 profile；Swift 窗口尺寸只用于 macOS，当前不在发布平台，重写后标注“未实机验证”。
- **遥测与资源采样**：见选择 4。

### UI（M5，约 26.6 万行）

**顺序：** lib → store 与 hooks → components（先核实第三方）→ ToolCallBlocks → mentions 与 workspace-\* → v4 → settings → app-shell → 根目录页面。

- **对话时间线**（ui-v4-02，全书最难）：虚拟滚动、流式追加、回合分组、选择引用。合同必须覆盖：滚动锚定、流式追加不跳动、加载更早消息后位置不变、长会话性能（万条消息滚动帧率基准）。拆成 2–3 个子包。
- **Lexical 输入框与 @提及**（ui-06、ui-02、ui-v4-01）：键盘细节多（输入法、粘贴、快捷键、草稿恢复），合同用 Playwright 交互测试覆盖。
- **store 与广播**（ui-04）：持久化键不变；主题、语言等广播同步字段必须防回环。
- **截图基线先行**：M5 开始前，用现有冒烟脚本与页面爬取建立“替换前基线”：全部页面 × 明暗 × 三种宽度，之后每包对比。截图对比工具是 M0 任务。
- **文案与资产**：见选择 6；供应商标志保留，上游残留资产按 M0-5 处理。

## M0 任务清单

M0 不写任何替换实现，只做四件事：把账记完、把该删的删掉、把工具做好、把试点合同写出来。工具没就绪就开第一个包，等于让试点替工具踩坑。表中“执行 1–5”是 5 个执行 Agent 的编号。

| 编号  | 任务                                                                                                                                | 负责                                  | 产出                                                              | 完成标准                                                                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0-1  | 记账第二轮：文档与证据的“替换”字样规则修订（约 2,900）、64 个许可正文补头、37 个 7-Zip/LZMA 声明、`third-party/` 下 96 个未审查文件 | 记账 Agent 或执行 Agent（按本书附录） | 主仓 PR 与 `docs/knorvia-provenance-bookkeeping-round2-<日期>.md` | 我抽查复核后合并；7-Zip 一律 `LicenseRef-Public-Domain`                                                                                                    |
| M0-2  | 1,130 个只因“替换”字样被拦的代码文件补登                                                                                            | 我                                    | `licensing/reviews.json` 记录                                     | 按首次加入的 345 个提交归入历史批次：有隔离作者与验收证据的登记 independent-replacement；其余按两道相似度实测，过门槛的登记 original，不过的并入对应替换包 |
| M0-3  | 首快照约 730、与上游相似约 815 个文件分诊                                                                                           | 我                                    | 分诊表                                                            | 派生的视同继承，并入替换包；冻结证据里的上游摘录书面列为例外                                                                                               |
| M0-4  | 删除 `.agents/`（240 个文件）及其第三方登记                                                                                         | 执行 1                                | 主仓 PR                                                           | 按下方步骤；来源检查与第三方审计测试通过                                                                                                                   |
| M0-5  | 删除 knip 确认无用的 97 个文件、58 个开发工具文件、无引用的上游残留资产                                                             | 执行 2                                | 主仓 PR，每批不超过 20 个文件                                     | 每批全量门禁通过；仍有引用的品牌标志保留登记，提示音换成脚本合成的 Knorvia 音效                                                                            |
| M0-6  | 第三方核实：shadcn 45、ai-elements 46、VS Code RPC 约 21、Fig 1、material-icons 8                                                   | 执行 3                                | 主仓 PR 与逐文件比对表                                            | 每个文件写明上游地址、固定版本、规范化比对结果                                                                                                             |
| M0-7  | 29 个品牌图标登记 original；`docs/evidence` 中 1 个上游类型摘录归入例外                                                             | 我                                    | `licensing/reviews.json` 记录                                     | 依据写“用户提供的 Knorvia 品牌资产”                                                                                                                        |
| M0-8  | 相似度工具 `scripts/provenance/similarity.mjs`（行相似度与结构相似度）                                                              | 执行 1 写，我审                       | 工具、测试与校准报告                                              | 见下方要求                                                                                                                                                 |
| M0-10 | `pnpm test:studio` 收录 `specs/contracts/*/tests`，让已合并的合同在 CI 里持续守住旧行为                                             | 执行 1                                | 主仓 PR                                                           | 没有合同时空跑通过                                                                                                                                         |
| M0-11 | UI 截图基线工具 `scripts/ui-baseline/`（capture 与 compare）                                                                        | 执行 5 写，我审                       | 工具、测试与首批页面清单                                          | 见下方要求                                                                                                                                                 |
| M0-12 | 记录替换前基线：继承文件数、`pnpm perf:baseline`、Electron 侧栏与布局冒烟、工作台冒烟                                               | 我                                    | `docs/knorvia-replacement-baseline-<日期>.md`                     | 写明主仓提交号，数字可复现                                                                                                                                 |
| M0-13 | M0 任务做完后写两个试点包的合同（试点 1：core/hooks；试点 2：core-tool-01）                                                         | 先做完 M0 任务的两个执行 Agent        | 合同 PR                                                           | M1 开始当天可以动手重写                                                                                                                                    |
| M0-14 | 48 个已无可测保留表达的继承文件逐个复核；供应商标志按来源清单登记                                                                   | 我                                    | `licensing/reviews.json` 记录                                     | 每个文件写明两道相似度实测值；结构仍沿用上游的退回替换包                                                                                                   |

### 删除 .agents 的确切步骤

上次只删了目录，第三方审计因 220 个输入缺失而失败。这次按顺序做完全部步骤，再一起提交。

1. 删除仓库根 `.agents/` 整个目录。**不要动**产品里扫描用户工作区 `.agents/skills` 的代码：`packages/shared/src/skill-scan-policy.ts`、`packages/services/src/skills/`、桌面 `mcpUserDirectory`、设置页 MCP 部分、`apps/cli/packages/bootstrap/src/builtin-prompt-command.ts` 等。那些指用户项目里的目录，是产品功能。
2. `third-party/inventory.json`：
   - 删除 `inputs` 中 220 个以 `.agents/` 开头的键。
   - `copied` 里的 ai-elements 只去掉 `.agents/skills/ai-elements` 这个 root 及其逐文件条目，保留 `packages/ui/src/components/ai-elements`。
   - 整条删除 “agent-browser skills (including dogfood and electron)” 与 “React Best Practices skill”。
3. `third-party/copied-components.json`：做同样三处修改（共 118 处引用）。
4. 查这两个组件独有的许可正文与 `third-party/upstream` 文件，没有其他使用者的一并删除。
5. 运行 `node scripts/licenses.mjs notices` 重新生成 `THIRD-PARTY-NOTICES.md`，不手改生成物。`noticesSha256` 等摘要如果不随之更新，用来源工具现有的指纹函数重算，不手填。
6. `AGENTS.md` 中“代码改动使用 `.agents/skills/architecture-governance/SKILL.md`…”一行改为：“代码改动先运行 `pnpm architecture:check --changed`，再用 `pnpm architecture:context <module-id>` 读取目标模块的受控上下文。”
7. `knip.json` 的 ignore 去掉 `.agents/**`；`.oxlintrc.json` 的忽略列表去掉 `.agents/skills`。
8. 依次运行 `pnpm provenance:report`、`pnpm provenance:check`、`scripts/provenance/` 下的全部 `*.test.mjs`，再跑全量门禁。`licensing/reviews.json` 只追加，已删文件的旧记录不删；检查若对已删路径报错，按工具对已删文件的现有处理方式走。

### 第三方核实的做法

- **定位上游版本。** shadcn 没有逐组件版本号：在 shadcn-ui/ui 仓库中，取 ZCode 引入时间前后的提交逐个比较，选规范化差异最小的提交并记下哈希。已有 `referenceRevision` 的（ai-elements 等）直接用；VS Code RPC 比对 microsoft/vscode 对应文件；Fig 比对 withfig/autocomplete；material-icons 用现有的 `scripts/provenance/material-icons.mjs`。
- **结果分三种：**
  - 与上游完全一致：登记 third-party，写来源地址与固定版本。
  - ZCode 改过：M0 只登记比对结果并分到对应 UI 包（ui-components-01/02）。到该包时，先换回原版文件，产品需要的差异写进合同，在原版之上重新实现。最终登记为 third-party，依据写明 Knorvia 的修改。
  - 找不到上游对应：视同 ZCode 代码，并入替换包重写。
- **拿不准一律按“ZCode 改过”处理。** 宁可多写一些，也不误登。

### 工具要求

**相似度工具**（`scripts/provenance/similarity.mjs`）

- 比较对象：被替换的旧文件（主仓指定提交），以及整个上游固定提交 zai-org/ZCode@872ad960。上游树下载到仓库外的缓存目录，不进主仓。
- **行相似度**（与记账同一算法）：
  - 规范化：去首尾空白、空行、纯括号或分隔符行、import 与 re-export 行，注释保留；只与同类文件比较。
  - 门槛：不少于 10 行的，包含率 < 0.2 且最长相同段 < 8；少于 10 行的，包含率为 0。
  - 纯声明文件：先按 `interface.md` 列出的名字剔除兼容行，再按上面的门槛。
- **结构相似度**（专抓改名照搬与逐行翻写）：
  - 用仓库已有的 TypeScript 词法分析器切 token，标识符换成同一占位符，字符串、数字、模板字面量各自换成同一占位符，去掉注释与 import。
  - 用 winnowing 取指纹：每 25 个 token 一个哈希，窗口 20。
  - 指标：新文件指纹落在同一个比较文件里的比例，取最大值。
  - 校准：在已登记的 439 个 independent-replacement 文件上计算该指标。门槛取能让它们全部通过的最小值，向上取到 0.05 的整数倍；这个值高于 0.4 时取 0.4，把超过 0.4 的历史文件列入替换队列。再用若干个只改了名字的 upstream-modified 文件验证它们会被拦下。校准结果写进工具常量与校准报告，之后不再调。
- 输出 JSON：每个文件的行数、最高包含率及对应文件、最长段、结构相似度及对应文件。退出码表示通过与否。
- 测试：
  - 行门槛边界：恰好 10 行，最长段 7 与 8，包含率 0.19 与 0.2。
  - 结构门槛：只改名的副本必须被拦下，独立写法必须通过。
  - 声明剔除、二进制跳过、Windows 换行。
- 合同文件与新代码都用它查。合入后先对 439 个历史替换文件全跑一遍。

**UI 截图基线工具**（`scripts/ui-baseline/`）

- 环境：用 Playwright（Chromium 已预装，不下载浏览器）启动 Web 开发服务器，配固定夹具。固定时间与字体，关闭动画，用种子数据。
- 页面清单 `pages.json`：每项写路由或打开步骤、需要的夹具、要比较几何的 `data-testid`。
  - M0 先覆盖主界面、工作台、单聊与群聊、设置各页。
  - 之后每个 UI 包写合同时把自己的页面补进清单，并在旧实现上先截基线。
- 比较：每页都截明暗两套主题、1360/820/390 三种宽度。像素差异与关键元素几何（按 `data-testid` 取包围盒，偏差不超过 2 像素）都要看：只看像素会被字体抗锯齿误报，只看几何会漏掉颜色。
- 基线存放在主仓孤立分支 `ui-baseline`，不进 main，因为截图体积大。每张图记录生成时的 main 提交。
- 测试：同一提交连续截两次必须零差异，以此证明结果确定。截图不稳定的页面先修夹具，不加容差。

### M0 退出条件

- unreviewed 只剩书面列出、各有理由的例外。
- `.agents`、无用文件、开发工具已删，远端 CI 在 Linux 与 Windows 上全绿，桌面打包实测通过。
- 第三方比对表完成：一致的已登记，改过的已分到 UI 包。
- 相似度工具（含校准报告）、截图工具与 `test:studio` 收录改动已合入 main，各自测试通过。
- 试点 1 的合同已合并：契约测试在旧实现上全过，在桩上全失败。
- 替换前基线文档已写。

## 执行做法

执行 Agent 在主仓 issue 里认领 M0 任务或包，已被认领的不碰，一次只领一项。下面是 M0 任务和每个包的具体做法。

### M0 任务做法

- 每个任务单独开主仓分支 `m0/<编号>-<简名>`，单独提 PR，标题以「M0-<编号>」开头。
- 删除类任务每批不超过 20 个文件；M0-4 一次做完。
- 提 PR 前跑：`pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`、`pnpm architecture:check`、`pnpm build:cli-packages`、`pnpm test:studio`、`pnpm knip`、`pnpm provenance:check`。
- 工具类任务先写测试再写工具，测试用 node:test；路径、换行、大小写兼容 Windows 与 POSIX。
- 删除前用 `pnpm dep:refs` 与全仓搜索确认无引用。
- 第三方核实的比对表放 `docs/knorvia-third-party-verification-<日期>.md`，列：文件、上游仓库、固定提交或版本、规范化差异行数、结论（一致 / ZCode 改过 / 无上游）。

### 每包流程

领到一个包后照下面做。

```text
包 <包 ID>：从头做到尾——写合同、跑旧门、按合同重写、删除旧实现、登记来源。全部经主仓 PR 交付。

一、选包与边界（主仓分支 contract/<包 ID>）
1. 列出目标文件及其继承分类（licensing/current-files.json）。
2. 用 pnpm architecture:context <module-id> 与 pnpm dep:refs --list-exports <file>
   列出全部对外导出与调用方。
3. 先查无用代码：knip 与 dep:refs 确认无引用的文件和导出，在本包内直接删除
   （单独一个提交），不写进合同。没有去向的遥测模块同样删除（任务书选择 4）。
4. 写清不在范围的相邻文件。接口默认不可变；确需变化的单列，写清调用方怎么改。
5. 单包不超过 60 个文件。重切时在 PR 描述里给出分包总表的新行。

二、合同（specs/contracts/<包 ID>/）
文件：README.md、behavior.md、interface.md、callers.md、tests/、fixtures/、
known-differences.md、acceptance.md、stubs/。
- stubs/：每个将被删除的模块路径一个最小桩，只含 interface.md 列出的导出与签名，
  函数体抛出 Error("not implemented: <包 ID>")。
- 用自己的话写行为，不贴旧代码。interface.md 只列兼容所需的模块路径、导出名、参数与返回类型。
- behavior.md 每条写：输入、输出、错误语义、时序与并发、幂等、资源释放、平台差异、
  状态所有者、日志级别。编号 B1、B2…，发布后编号不重用。
- 契约测试只通过公开入口做黑盒断言；node:test；能分别对源码入口和 dist 入口运行。
  README 末尾放“条目 → 测试”对照表，每条至少一个断言。
- 异步与时序用事件序列断言，不用 sleep 和超时凑结果。协议类包先在旧实现上录制帧，
  断言新实现产生等价帧（允许时间戳与 ID 不同）。
- 涉及存储、配置、会话记录：必须有“旧写 → 新读 → 新写 → 旧读”往返测试。
- 平台：路径、大小写、换行、主目录同时兼容 Windows 与 POSIX。
- UI 包：把本包页面补进 scripts/ui-baseline/pages.json，在旧实现上截好基线；
  列出必须保持的 data-testid、无障碍名称、快捷键。
- 规则表类代码按各命令的公开文档重新组织，合同只给判定结果样例（任务书选择 9）。
- 夹具不得含真实用户数据、凭据、内部地址。

三、旧门与合同 PR
1. 在旧实现上跑契约测试：源码入口与 dist 入口（先构建对应包）。
2. 必须全过。失败只有两种处理：合同写错就改测试；旧实现确有缺陷或有意改进，
   登记进 known-differences.md，每条写理由与对应测试。不得为了通过而放宽断言。
3. 生成 gate-old.json（用例数、通过、失败、预登记差异、两种入口各自结果、主仓提交号）。
   README 顶部写版本号；此后合同任何改动都要重跑旧门并升版本。
4. 提主仓 PR「contract: <包 ID> v<版本>」，只含 specs/contracts/<包 ID>/ 与本包的无用代码删除。
   描述贴旧门结果与对照表。审过合并后再进入下一步。

四、重写（从合同合并后的最新 main 开分支 replace/<包 ID>）
1. 先用 stubs/ 替换目标文件，跑契约测试：必须全部失败。有通过的说明测试没测到东西，
   回到合同补测试。
2. 写 specs/contracts/<包 ID>/design.md：状态所有者、模块划分、关键数据结构、事件顺序
   （涉及异步与时序的用 mermaid 画图），以及每条 B 在哪里实现。
3. 实现。内部怎么拆文件自己定，不必跟旧文件结构一致；interface.md 列出的模块路径与导出都要在。
   每个新文件第一行 // SPDX-License-Identifier: Apache-2.0（其他语言用各自的注释语法）。
   为内部逻辑写自己的单元测试。
4. 遵守 AGENTS.md：架构边界、状态唯一所有者、异步 IO、跨平台、日志规则、修 bug 时的中文注释。
   不用 sleep、固定超时去凑时序；不加“万一”的兜底分支。

五、接入与登记（同一分支）
1. 删除全部旧文件和桩，不留回退路径。
2. 契约测试移入对应包的 test/，接入 pnpm test:studio；合同其余文件留在 specs/contracts/<包 ID>/。
3. 跑 node scripts/provenance/similarity.mjs，对被替换的旧文件和上游固定提交检查。
   行与结构两道门槛都要过；没过就改写，不调门槛。
4. 跑任务书验收清单里的“接入门禁”。失败先判定是合同漏写还是实现问题：
   合同漏写就补测试、重跑旧门、升合同版本，再修实现。不得为了变绿而删或放宽测试。
5. 每个新文件在 licensing/reviews.json 登记 original：license 按文件头 SPDX；
   evidence 写 specs/contracts/<包 ID>/README.md 与 docs/knorvia-<包 ID>-acceptance.md；
   basis 用下面的模板填实数：
   Knorvia rewrite of <包 ID> against contract v<版本> (behavior, interface and black-box
   tests). The author was allowed to read the replaced implementation to understand behavior;
   no code was copied, renamed or rewritten line by line. Old gate <n>/<n>; new implementation
   <n>/<n>; max line containment <x>, longest identical run <y>, structural similarity <z>
   against the replaced files and the upstream baseline.
6. 合同与契约测试同样登记 original。
7. 写 docs/knorvia-<包 ID>-acceptance.md：范围、旧门与新实现结果、两道相似度实测、
   门禁输出摘要、首次失败与修正、未覆盖的内容。
8. pnpm provenance:report && pnpm provenance:check。
9. 提主仓 PR「replace: <包 ID>（继承 -<n>）」，描述含继承文件数前后变化、相似度实测与
   门禁输出摘要。

退回：审核意见会写“哪条合同、哪个测试、期望与实际”，或写相似度超标的文件与片段位置。
在同一 PR 继续推送；3 轮仍不通过的，修订合同或拆包。
```

## 验收清单

一个包只有同时满足以下五条才算完成：已在主仓合并、旧文件已删、门禁全过、来源已登记、远端 CI 双平台全绿。下面四张清单依次卡住合同、替换、接入和里程碑。

### 合同审查（我，在合同 PR 上）

前 10 个包与高难度包逐项全审。其余包至少核对对照表与旧门结果，其他项抽查。

- [ ] 范围、不在范围的相邻文件、可变接口都写清楚；`callers.md` 覆盖 `dep:refs` 的全部结果
- [ ] `behavior.md` 每条都有测试，对照表没有空行；测试只走公开入口
- [ ] 时序类用事件序列断言，测试里没有 sleep 或固定超时
- [ ] 存储、配置、会话类有往返测试；协议类有录制帧对比
- [ ] 旧门在两种入口上全过；每条预登记差异都有理由和对应测试
- [ ] UI 包：页面已进截图清单，旧实现基线已截
- [ ] 桩只含签名

### 替换验收（我，在替换 PR 上；任何一项不过即退回）

- [ ] 在干净检出上重放：契约测试两种入口 100% 通过、0 跳过
- [ ] 用桩替换时契约测试全部失败的记录在 PR 里
- [ ] 两道相似度对被替换的旧文件与上游固定提交都通过（纯声明文件按 `interface.md` 剔除后再算）
- [ ] 我抽看新旧文件：函数切分与顺序没有和旧文件一一对应，注释不是旧注释的改写
- [ ] 导出集合与 `interface.md` 完全一致，用脚本比对，不靠目测
- [ ] 每个新文件都有 Apache-2.0 SPDX 头
- [ ] 旧文件与桩全部删除，全仓搜 `not implemented: <包 ID>` 为零，没有回退路径
- [ ] 代码审查通过：
  - 架构边界与状态唯一所有者；
  - 没有隐藏的全局状态；
  - 没有用超时掩盖时序；
  - 日志级别与错误语义符合合同。
- [ ] `design.md` 与实现一致
- [ ] 来源登记与验收文档齐全，basis 里的数字与实测一致

退回只用两种格式：“B7 / tests/cancel.test.ts『取消后不再写入持久化』：期望 0 条新记录，实际 1 条。”，或“相似度超标：新文件 A 第 40–90 行与旧文件 B 第 12–60 行结构相同。”

### 接入门禁（执行 Agent 跑，我在替换 PR 上核）

| 检查                                                    | 所有包 | 桌面相关 | UI 相关 |
| ------------------------------------------------------- | ------ | -------- | ------- |
| `pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`         | ✓      | ✓        | ✓       |
| `pnpm architecture:check`（全量）                       | ✓      | ✓        | ✓       |
| `pnpm build:cli-packages` 与 `pnpm test:studio`（全量） | ✓      | ✓        | ✓       |
| `pnpm knip` 不新增未使用文件或导出                      | ✓      | ✓        | ✓       |
| `pnpm provenance:report` 与 `pnpm provenance:check`     | ✓      | ✓        | ✓       |
| 两道相似度门槛                                          | ✓      | ✓        | ✓       |
| `pnpm perf:baseline` 不比替换前慢 10% 以上              | ✓      | ✓        | ✓       |
| 远端 CI：Linux 与 Windows 全绿                          | ✓      | ✓        | ✓       |
| 工作台冒烟 `scripts/task-workbench-smoke.mjs`           |        | ✓        | ✓       |
| Electron 侧栏与布局冒烟                                 |        | ✓        | ✓       |
| 截图对比：本包页面 × 明暗 × 1360/820/390                |        |          | ✓       |

### 里程碑退出

- [ ] **M0**：见“M0 任务清单”的退出条件。
- [ ] **M1**：两个试点包合并。复盘写回本书：合同规模与测试数、退回轮数与原因、两道相似度分布，并据此调整合同写法与包大小。
- [ ] **M2**：`apps/cli` 继承文件归零（含终端交互模式）。桌面与 Web 用新 CLI 跑通工作台冒烟与外部内核冒烟。打一次 Windows 安装版与便携版，用 `scripts/desktop-release-acceptance.mjs` 验收。桌面端依赖打包后的 CLI，所以从 M2 起就要打包实测。
- [ ] **M3**：共享、服务、RPC、服务端目录归零。手机远控的 web-remote-replayable 恢复链路冒烟通过。SSH、WSL、Docker 远程连接的人工验收项做完；未做的如实标注。
- [ ] **M4**：`packages/desktop` 归零；安装版、便携版实机启动通过；Electron 冒烟全部通过。
- [ ] **M5**：`packages/ui` 归零；全部页面截图对比通过。我目视检查关键页面（你想看随时可以看，不阻塞）：主界面、工作台、单聊与群聊、工作流、创作、设置、插件管理。

### 最终完成（M6）

- [ ] `licensing/current-files.json` 的继承分类只剩“归零”口径允许的例外，每个都有记录
- [ ] 产物来源核对：用打包器的 metafile 或 manifest 列出进入三类产物的全部源文件，逐个对照来源分类，继承文件为零（npm 第三方依赖按 third-party 计）。三类产物是：
  - CLI 包；
  - 桌面主进程与 renderer；
  - Web。
- [ ] 相似度工具对本计划登记的全部新文件和已有 independent-replacement 文件再全量跑一次，零违规
- [ ] 重新生成 `THIRD-PARTY-NOTICES.md`
- [ ] 按真实来源更新以下内容；“已完成替换”的表述此时才可以写：
  - LICENSE、NOTICE.md；
  - README 中英文；
  - 官网。
- [ ] 发布新版本：Windows 安装版与便携版验收通过；发布说明写明替换范围
- [ ] 性能不劣于替换前基线 10% 以上

### 进度怎么算

- 只按上面的“完成”口径计数。合同写完、实现写完、只改了标签，都不算。
- 我每周向你汇报一次：
  - 继承文件数、unreviewed 数、本计划重写并登记的文件数的前后对比，数字取自 `licensing/current-files.json` 的 summary 与 reviews.json；
  - 本周完成的包与在途的包；
  - 退回轮数与首次失败的原因；
  - 回归事件；
  - 下一步要做的包。

## 风险与应对

第一条是取消隔离以后最需要盯的风险。

| 风险                                                 | 早期信号                                                   | 应对                                                                                                      | 负责           |
| ---------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------- |
| **允许看旧代码后，重写变成改名或逐行翻写**           | 结构相似度接近门槛；新文件的函数切分与顺序和旧文件一一对应 | 两道相似度门槛；我验收时抽看新旧结构；超标直接退回重写，不调门槛                                          | 我             |
| 合同漏掉隐性行为（时序、竞态、平台差异）             | 接入后 CI 或冒烟失败，尤其是只在 Windows 上失败            | 旧门先过；协议录帧；Windows CI。失败先补合同测试再修实现                                                  | 执行 Agent     |
| 最难的三处拖期：运行时时序、工作流分析器、对话时间线 | 第 2 轮退回时仍有大量失败                                  | 提前拆成子包；分析器至少 300 个 golden 样例；时间线加帧率基准。3 轮仍不过就由我修订合同或拆包，不放宽测试 | 我             |
| UI 视觉或交互回归                                    | 截图差异、几何偏差、交互测试失败                           | 截图覆盖明暗与三种宽度；Playwright 交互测试；我目视检查关键页面。截图不稳定先修夹具，不加容差             | 执行 Agent     |
| 用户数据损坏或旧数据读不出                           | 往返测试失败                                               | 往返测试必需；不改数据目录与格式；迁移代码只重写不删除；发布前用脱敏的旧版数据实机升级一遍                | 执行 Agent、我 |
| 第三方版本判断错（shadcn 没有版本号）                | 比对差异不为零却登记为一致                                 | 拿不准就按“ZCode 改过”处理；比对表进 PR，由我抽查                                                         | 执行 Agent     |
| 5 个包并行带来的合并冲突                             | 替换 PR 反复需要解冲突                                     | 只并行互不依赖的包；接入前先合并最新 main；冲突按 main 的行为调整，合同语义不变                           | 执行 Agent     |
| 与功能开发冲突                                       | 冻结中的文件出现功能改动                                   | 同时最多冻结 5 个包。紧急修复先在主仓修，同步进合同并重跑旧门                                             | 我             |
| Agent 额度或中断（此前遇到过限流）                   | 报限流，或长时间没有产出                                   | 每个阶段都留下可接续的产物：PR 与跟踪 issue 状态行。换人可以接着做，不依赖对话记忆                        | 我             |
| 权限误用：有人推了 main 或自行合并 PR                | 主仓出现非预期的推送或合并                                 | 只有我合并 PR；goal 写明不推 main、不合并；合并前我核对提交来源                                           | 我             |
| 进度虚高                                             | 汇报的“完成”与 summary 数字对不上                          | 只按完成口径计数，数字一律取自来源报告                                                                    | 我             |
| 性能退化                                             | `perf:baseline` 慢 10% 以上；长会话滚动掉帧                | 每包跑基线；时间线单列万条消息的帧率基准                                                                  | 执行 Agent     |
| 某个包卡住                                           | 反复退回，或长时间没有进展                                 | 包过大就拆；卡住的包先放下，接下一个不依赖它的包；3 轮退回仍不过由我修订合同                              | 我             |

## 附录：M0-1 记账第二轮做法

第一轮的结果见仓库 `docs/knorvia-provenance-bookkeeping-20261010.md`。第二轮只处理下面四类，只改 `licensing/reviews.json`（只追加），不动代码。交付一个主仓 PR 与 `docs/knorvia-provenance-bookkeeping-round2-<日期>.md`，结构同第一轮。

**登记为 original 的四条条件**（第一轮规则，第二轮照用）：

1. 首次加入晚于首快照 `7619e41`：用 `git log --follow --diff-filter=A` 找首次加入的提交，找不到或就是 `7619e41` 的交还。
2. 不是从上游路径改名或复制来的：`git log --follow --name-status` 里有改名或复制记录，且来源路径在 `licensing/upstream-baseline.json` 里的，交还。
3. 与上游不相似（仅文本文件）：算法与门槛同本书“行相似度”，上游为固定提交 zai-org/ZCode@872ad960。二进制文件跳过本条。
4. 不是“替换上游实现”：首次加入的提交信息或同时改动的 `specs/*.md` 里出现 replace、rebuild、rewrite、reimplement、independent、替换、重写、重实现、独立 任一词的，交还。**第二轮修订：本条只适用于产品源码**（`packages/*/src`、`apps/cli/packages/*/src`、两者的 `test/`、`scripts/`）；`docs/`、`licensing/evidence/`、`specs/` 不受本条限制。

basis 模板：

> Created by Knorvia commit <短哈希> (<日期>) after the first snapshot 7619e41; not renamed or copied from an upstream path. Max normalized-line containment against fixed upstream 872ad960 is \<x.xx> (<最相似上游路径或 none>), longest identical run \<n> lines, below the 0.2 / 8-line thresholds. Bookkeeping review only; not a claim of independent replacement of any upstream implementation.

第二轮因第 4 条修订而通过的文件，basis 末尾追加：`Replacement wording in the commit describes the documented work, not this file's origin.` evidence 写 `["git:<完整首次提交哈希>", "licensing/upstream-baseline.json"]`，首次提交改动了 `specs/*.md` 的把该规格也加上。

**第二轮的四类文件：**

1. 第一轮只因条件 4 被交还的文档与证据（约 2,900 个）：按修订后的条件 4 重新判。
2. 64 个缺少 `Publisher-declared license` 与 `Evidence` 头部行的 `third-party/upstream/*.txt`：从 SPDX 官方 license-list-data 仓库的固定 tag 取许可正文，合并空白、去首尾空行后与文件正文比对。完全一致才登记 third-party，license 写该 SPDX 标识，evidence 写 SPDX 正文地址；不一致的继续交还。
3. 37 个 7-Zip/LZMA 公有领域声明：登记 third-party，license 写 `LicenseRef-Public-Domain`，basis 写明正文只声明公有领域。
4. `third-party/` 下 96 个未审查文件：按上面四条条件判；属于第三方材料的，按所属组件的许可正文登记 third-party，清单数据（`SHA256SUMS`、`sources.json` 等）不登记。

交还的文件在报告里逐个写明原因。完成后跑 `pnpm provenance:report` 与 `pnpm provenance:check`。
