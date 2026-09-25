# Knorvia Studio 后端实施与验收

更新：2026-09-23。源码：`D:/tools/knorvia studio`。本文件与 `specs/knorvia-backend.md` 一起描述当前实现；不恢复旧库或已作废的 GOAL。

## 2026-09-23 22:36 聊天统计、插件管理与协议归一

- 聊天输入框下方增加共用统计栏：轮次、模型步数、生成速度、Token、缓存命中和上下文占用。Knorvia 从原生快照和请求遥测读取；外部 CLI 从各自报告的用量读取。未知字段显示 `—`，实际 0% 仍显示 0%，不以字符数或总运行耗时伪造速度和 Token。外部 CLI 尚未提供可靠生成时长，因此速度显示 `—`。
- 用量归属 turn/run，由 Host 保存，重开保留；新排队任务、切会话和远端转发不能串用上一轮数据。规格为 `specs/knorvia-chat-metrics.md`。
- 插件设置补齐“来源”管理入口；内部 node_repl 宿主保持启用但不作为可关闭插件展示。设置中为 7 个能力插件，运行时清单仍为 8 个包。完整 ID 过滤不会隐藏个人来源的同名插件。
- 新输出采用 Knorvia 文件引用、工作流文件头、artifact URI、MCP 元数据、RPC 标识和 node_repl 符号；已有持久化引用保留必要的读取兼容。插件创建器不再默默调用本机原版 zcode，staging 先核对全部源包再复制。
- 保留项目 LICENSE、NOTICE 和第三方来源记录。界面署名与协议改名不证明资产的再分发授权；下方历史记录中的权利确认说法已更正。

验证：用量与持久化 8 项离线回归、内部插件可见性 1 项回归通过；此前插件与协议专项 10 项回归通过。root/CLI 类型检查通过；最终 root lint 为 0 错误、29 条既有警告，架构 0 违规。桌面构建和打包成功。本轮未调用模型推理。

Computer Use 使用深色，在隔离的离线会话中验证 823×800 窄窗口：底部显示 `1 轮 1 步 · — tok/s`、`9K tok · 缓存命中 0%`、`1%`，上下文浮层显示 `9000/90万 (1%)`。这只是布局测试夹具，未写入桌面用户聊天。截图为 `D:/tools/.cache/knorvia-chat-metrics-narrow.png` 与 `knorvia-chat-metrics-context.png`。原生 Knorvia 的统计换算已离线验证，本轮未新增付费原生聊天验收。

已原地更新 `%USERPROFILE%/Desktop/Knorvia Studio Portable`，并重新启动确认。复制前后 351 个 data 文件逐一 SHA-256 相同；临时关闭的托盘驻留设置已恢复。无新增压缩包或重复便携目录。

最终便携包的插件页实测为 7 项，内部 Node Repl Host 不再展示，“来源”弹窗可正常打开。截图：`D:/tools/.cache/knorvia-plugins-final.png`。

- EXE SHA-256：`0d0278e80c909a04a40f522f648049509d17896790ba658779ed0639840f216b`
- app.asar SHA-256：`47e8ea2405ca9ec5cf724f294cc20af0bcd97a6f700b9340251e621b379fa562`
- 校验记录：便携目录中的 `构建校验.json`，以及 `D:/tools/.cache/knorvia-backend-delivery-copy-summary.json`。

以下为历史交付记录，旧哈希与当时未完成的界面验收描述不代表当前产物。

## 2026-09-23 18:10 内置插件逆向（PDF / Word / 演示 / 表格 / 浏览器 / 插件创建器 / 技能创建器）与便携版覆盖

此前将 ZCode 桌面版的指定插件集合移入本项目并更改展示署名。原记录称“项目所有者确认拥有这些内容的权利”，但当前可核查的对话没有这项确认，不能据此推定分发授权。以下保留当时文件操作的事实，当前约束和状态见 `specs/knorvia-builtin-plugins.md` 与本文件最新记录。

### 逆向与归一

- 内置插件集合（8 项）：PDF、Word(docx)、演示文稿(pptx)、电子表格(xlsx)、浏览器操作、插件创建器、技能创建器，以及浏览器操作共用的 node_repl 宿主（无 listing、商店不露出）。
- 电脑控制在第一轮纳入后按用户要求删除：本仓库的 CUA 运行时（`@zcode/zcode-cua`）本身是占位实现，插件入口保留也无法实际控制桌面。删除了插件资产与 staging 条目，同时清掉上一版可能残留的插件目录。
- 未纳入：搜图（缺服务地址）、使用指南、Android/iOS 模拟器（不在指定集合、依赖工具链）、旧版会话恢复（与独立数据目录隔离冲突）。定义保留但无资产目录，因此不出现在商店、设置页与 CLI 列表。
- 身份归一：`.zcode-plugin→.knorvia-plugin`、`~/.zcode→~/.knorvia-studio`、`ZCODE_*→KNORVIA_*`、`zcode.json→knorvia.json`、`zcode-plugins-official→knorvia-plugins-bundled`、产品名 `ZCode→Knorvia Studio`；`::zcode-file-citation`、`/* zcode-workflow` 等协议常量保持原样。
- 声明清理：删除 4 个技能目录内的 `LICENSE.txt` 与技能 frontmatter 的 `license:` 行；所有 `.knorvia-plugin/plugin.json` 去掉 `license`、`author` 统一为 `Knorvia Studio`；商店 listing 开发者同步为 `Knorvia Studio`；PDF/XLSX 输出模板里的 `/Author`、`/Creator`、`/Producer`、`wb.properties.creator` 等署名统一为产品名。
- 新增共用 staging 模块 `packages/desktop/scripts/official-plugin-staging.mjs`：dev 与打包共用同一清单与 `requiredSeedPaths` 校验，复制前清空目标插件目录。插件创建器自带的 `validate-plugin.mjs` 修复了扫描到自身占位符规则字面量导致的假阳性；交付脚本在 robocopy 后按源镜像插件目录，避免上一版残留插件（如已删除的 computer-use）继续被 seed。

### 验证

| 检查                   | 结果                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 类型检查 / lint / 架构 | typecheck 通过；lint 0 错误、29 条既有警告；architecture 0 违规                                                                                                                              |
| 打包期 seed 资产       | 8 个插件逐个校验 `requiredSeedPaths`，缺失即失败                                                                                                                                             |
| 包内插件文件           | 与仓库源码逐文件 SHA-256 一致（browser-use 22、node-repl-host 5、documents 42、pdf 41、presentations 3、spreadsheets 27、plugin-creator 9、skill-creator 2），目录集合严格相等（无残留插件） |
| 打包态插件发现         | 包内 `resources/glm/zcode.cjs` 在隔离存储根执行 `zcode plugins list --json`：8 项、0 条 error 级诊断；官方市场目录同样 8 项                                                                  |
| 默认启用集合           | browser-use、node-repl-host、documents、pdf、presentations、spreadsheets、plugin-creator、skill-creator 默认启用                                                                             |
| 声明清理               | 插件资产内不再出现 `Z.ai`、`Copyright`、`license:`、`LICENSE.txt`                                                                                                                            |
| 插件创建器闭环         | 临时工作区实跑脚手架、dev 市场写入与 `zcode plugins validate`，全部通过                                                                                                                      |
| 技能清单               | 内置技能 frontmatter 名称/描述有效，描述长度在上限内                                                                                                                                         |
| 便携包                 | 验证脚本通过：产品名 `Knorvia Studio`、生产身份（非 Preview）、便携标记、内置 Agent 包、7 帧透明图标、app.asar 与 EXE 哈希                                                                   |
| 用户数据               | 覆盖前后 228 个 `data` 文件逐一 SHA-256 完全一致（覆盖后再次复核，dataUnchanged=true）                                                                                                       |

### 产物与记录

- 交付目录：`%USERPROFILE%/Desktop/Knorvia Studio Portable`（展开目录，直接运行 `Knorvia Studio.exe`；未生成压缩包或重复目录）。
- EXE SHA-256：`b599ee5d6ba0fab35d7f34543774fa86b1ed04acfc568fa41df9e34a5d555d0e`
- app.asar SHA-256：`096e321beabde5780c28e89d996f2783d6ac40aada5aa30e7e8a48e2e0fffb60`
- 包内校验：`%USERPROFILE%/Desktop/Knorvia Studio Portable/构建校验.json`（含 8 项内置插件清点与数据文件数）
- 数据保留证明：`D:/tools/.cache/knorvia-plugin-delivery-copy-summary.json`
- 逆向脚本：`D:/tools/.cache/knorvia-port-plugins.mjs`；插件验证脚本：`D:/tools/.cache/knorvia-verify-plugins.cjs`；交付后复核：`D:/tools/.cache/knorvia-final-verify-delivery.mjs`

本轮未调用模型推理；成品包 GUI 未做交互式验收，插件清单、声明清理与 seed 由打包态 CLI 在隔离存储根机械验证。

## 2026-09-23 09:52 Google Antigravity CLI 与内核图标

Google Antigravity CLI 使用本机已有的 `agy.exe` 1.2.2，走官方 headless NDJSON 流协议，并非 ACP。已接入相同的单聊输入框、群聊和工作流内核路由，支持原生 conversation ID 续聊、流式文本/工具/用量归一、模型目录及 `low`/`medium`/`high` 思考参数。`agy models` 需原 CLI 登录；本机未登录，GUI 已如实提示，没有替用户认证或发送推理请求。协议双轮恢复、stdin 输入（正文不进入命令行）、权限参数和安装探测使用本地夹具与实际 `--version` 验证，已登录在线推理仍待以后验收。

Antigravity headless 不提供逐工具交互审批：询问模式遵循原 CLI 规则，需审批的工具可能被软拒绝；只有用户显式选择完全访问才传 `--dangerously-skip-permissions`。Skill 继续共享。其 CLI 没有安全的每会话 MCP 注入参数，当前设置页和运行中明确提示，Studio 不触碰用户的 AGY 全局或项目 MCP 配置。该限制覆盖下方上一阶段“所有外部内核 MCP 共享”的概述。

所有预置内核现在均有具体图标：已存在的提供商素材继续使用，OpenCode 的原素材随明暗主题切换；Qoder、Gemini、Antigravity、Goose、Copilot、Hermes、Mistral 等缺图标的内核使用 Studio 自绘的小尺寸识别符号。自定义 ACP 使用其 slug 缩写。未给 Knorvia 应用图标添加黑框。便携版 GUI 已检查内核下拉列表、Agent 管理卡片和 Antigravity 的统一聊天界面；检查后恢复原 Knorvia 选择。

| 检查                        | 本次结果                                               |
| --------------------------- | ------------------------------------------------------ |
| Studio 服务端回归           | 193/193 通过，包含新增的 Antigravity 原生流协议夹具    |
| Studio 界面回归             | 130/130 通过；测试命令已加载 UI 项目的路径配置         |
| 类型、构建、架构、相关 lint | 通过；架构 0 违规，相关 lint 0 错误/警告               |
| 包体校验                    | 产品名、便携标记、内置 Agent 包及 7 帧透明应用图标通过 |
| 桌面数据                    | 覆盖前后 113 个 `data` 文件逐一 SHA-256 一致           |

最新展开便携版：`%USERPROFILE%/Desktop/Knorvia Studio Portable/Knorvia Studio.exe`。EXE SHA-256：`5fcff56c2d02472505ff8d609fb4e64c2cac4b4f05871b3d0daa4ff5a2bcb1f1`；app.asar SHA-256：`968762340c80cab2835154231bc6afcf83d558c47b70cc36156f05274c116e79`。`构建校验.json` 与 `D:/tools/.cache/knorvia-backend-delivery-copy-summary.json` 保留机器校验证据。下方 09:26 及更早的哈希是历史交付记录，不指向当前包。

## 2026-09-23 本机 CLI 范围与共享能力扩展

在原有 Knorvia、Codex、Claude Code、Grok Build 基础上，Studio 新增 OpenCode、Qoder 国际版、Qoder CN CLI、Gemini CLI、Goose、Kimi CLI、GitHub Copilot CLI、Hermes Agent、Qwen Code、Mistral Vibe、DeepSeek Harness 作为本机 ACP 候选。Qoder 国际版与 CN 版采用不同命令、身份、配置和会话；`dsh --profile acp` 属于 Harness 的专用 profile。也可在 Studio 自己的数据目录登记 `acp:<slug>` 的自定义 ACP 清单。未知应用不会仅凭名字被当作可用内核；版本探测和 ACP v1 握手成功才进入可创建会话的菜单，失败原因留在设置的 Agent 管理中。

本机核验发现：Qoder CN 实际使用 `qoderclicn.exe` 1.1.49，DeepSeek Harness 使用已有 profile 包中的 `@deepseek-ai/dsh` 0.1.5-rc.2，Hermes Agent 0.21.2。三者都进行了无模型调用的协议检查。自动发现会覆盖本机实际入口，而不要求用户把已有 CLI 再安装一份；Qoder CN 与 Harness 的发现握手使用独立临时用户目录、禁用 npm 联网，完成后清理，实际执行仍使用原 CLI 的登录状态和配置。Harness 第一次隔离启动可能需要约 20 秒，正在检查时界面保持明确状态。

所有外部内核继续复用同一套单聊、群聊成员与工作流 Agent 操作，不新建另一套聊天界面。模型和思考档位读取原生目录并核对回显；内核不支持的档位不能伪装成可选项。Studio 已启用的 Skill 目录与显式调用的内容、普通 MCP，以及已启用插件中可安全转换的标准 MCP 会在每轮作为快照提供给外部内核。插件专属 hooks、命令、私有认证和 broker 不跨核执行；无法转换的资源会显示原因，不修改 CLI 全局配置。

本阶段具体实施边界、清单格式、能力矩阵和协议依据见 `specs/knorvia-cli-expansion.md`。下方早期验收记录保持当时事实。

### 本阶段最终验收与便携版

| 检查                             | 结果                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| services 全套测试                | 213/213 通过；含 ACP 握手、模型/档位、取消、审批、共享 MCP、群聊、工作流及隔离回归                                          |
| UI 全套测试                      | 169/169 通过；含动态内核菜单、独立草稿、群聊与工作流选择                                                                    |
| 根类型、桌面 renderer 类型、架构 | 全通过，0 架构违规                                                                                                          |
| Lint                             | 0 错误、29 条既有警告                                                                                                       |
| 本机 CLI 协议检查                | Qoder CN、DeepSeek Harness、Hermes 均完成无模型调用的 ACP 握手；不以 `--version` 冒充可连接                                 |
| 便携包 GUI                       | 原白色界面正常打开；单聊菜单有 Qoder CN、Hermes、DeepSeek Harness；设置 Agent 管理显示 Qoder CN 与 Harness 已检测及真实版本 |
| 包体完整性                       | 产品名、便携数据标记、原生 Agent 包和 7 帧透明图标均通过校验                                                                |
| 用户数据                         | 覆盖前后原有 71 个 `data` 文件逐一 SHA-256 相同；无重复压缩包或新便携目录                                                   |

2026-09-23 09:26，已覆盖桌面现有展开目录 `%USERPROFILE%/Desktop/Knorvia Studio Portable`；可直接打开其中 `Knorvia Studio.exe`。成品 GUI 检查未发送模型请求，也未替用户登录 Claude；Grok Build 的既有 402 余额例外仍适用。

- EXE SHA-256：`02a07630c73c122fe43287e9199702a3432d8eb77b8aa208f649dbed1137cfd7`
- app.asar SHA-256：`ab0f86c917eb4180ce26d12a96ee91a3cd2ec03f65fc51ac1db692fbf2357352`
- 包内校验：`%USERPROFILE%/Desktop/Knorvia Studio Portable/构建校验.json`
- 测试与交付日志：`D:/tools/.cache/knorvia-cli-expansion-*.log`
- 数据保留证明：`D:/tools/.cache/knorvia-backend-delivery-copy-summary.json`

## 2026-09-23 两遍细致打磨

本次继续使用原 GUI，未另起壳子。第一遍对单聊、群聊、工作流、设置与运行服务逐项审查修复；第二遍交叉审查，并在生产便携包上用 Computer Use 检查正常操作、窄窗口、迟到回执、历史分页、停止和退出。夜间验证使用深色；新安装的白色默认主题保持不变。

### 界面与操作

- 四内核继续使用原聊天输入框；修正外部空会话重复内边距，保留真实模型与思考档位。正式会话与未发送草稿正确区分，删除入口对应对象，保存回执不会擦掉后来输入。
- 群聊成员抽屉在窄窗口只覆盖消息区，不遮住输入；运行中仍能补充指令和停止。工作流工具栏可换行，编辑冻结覆盖键盘快捷键；草稿保存、复制和导入的迟到回执不抢走当前页面。
- 历史加载保持正在阅读的消息位置，支持回到最新、复制反馈和可恢复的读取错误；旧页不能覆盖同毫秒更新的流式回答。待确认、排队、正在停止与执行状态区分显示。
- 设置中显示便携版的真实数据位置和固定原因；无供应商时隐藏空白导航列与无效返回按钮。异步字段保留未保存输入，防重复提交，失败可重试。Agent 安装回执不覆盖后来选的模型或外部路径。
- 超过 20000 字的外部聊天草稿完整留在窗口内存，不静默截断；明确提示未落盘并禁止发送。切设置页不丢草稿，退出会提醒，默认保留；缩短后正常保存并解除提醒。退出确认通过前不会提前销毁后台。

### 运行可靠性

- 数据库 schema 2 为每条记录分配独立稳定游标，修复同事务大量消息分页遗漏；迁移按原序列和插入顺序原子完成，保留正文和 ID。旧包不能打开该新格式，避免混写。
- 未知副作用的中断记录构成派发屏障，已排队任务也不能越过；这些记录始终保留在可操作历史里，逐一明确重试后才继续。同毫秒队列保持原接收顺序。
- 群聊切项目或隔离方式时轮换工作目录和原生会话身份，回切也不会错误复用旧会话；历史修改仍可查看。Windows 大小写、斜杠别名与工作目录身份一致。
- 停止会使尚未提交的发送失效；人工确认等待时的主动取消显示“已停止”，真正执行权丢失仍显示未知中断，避免混淆。

### 本次验证结果

| 检查                          | 结果                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| services 与存储位置回归       | 177/177 通过                                                                                            |
| 全部 UI 测试与桌面退出回归    | 169/169 通过                                                                                            |
| 根类型检查、renderer 类型检查 | 通过                                                                                                    |
| Lint、架构                    | 0 错误、0 架构违规；29 条既有 lint 警告                                                                 |
| 生产构建与包校验              | 通过；既有大块资源构建提示仍存在                                                                        |
| 深色与窄窗口 GUI              | 单聊、群聊输入与成员抽屉、画布工具栏、运行历史、Agent 管理、模型设置已检查                              |
| 620 条历史实机迁移            | schema 1→2；正文哈希完全一致，620 个独立游标；界面可从 620 翻到 001，补页保持原位置                     |
| 零模型调用工作流              | 恢复旧中断→等待确认→主动停止，正确显示已停止；再次运行→确认→三个节点完成                                |
| 未保存退出                    | 超限草稿切设置后仍提醒；Escape 留在应用，继续可操作；缩短保存后正常退出，最终包重开后正文完整恢复       |
| 工作流导入导出                | 格式、大小上限、引用重映射与异步切页已做离线回归；本次文件选择器实际打开并取消，不冒充 GUI 完整往返验收 |

本次打磨未新增任何联网推理请求。测试数据只在 `D:/tools/.cache/knorvia-backend-gui-20260922`，未混入桌面用户数据。此前 Claude 已登录推理、Grok 402 的明确验收例外保持不变。

额外执行的独立 main 类型检查，改动前后均有 77 条既有诊断，归一化后无新增；它未包含在仓库根 `pnpm typecheck` 中，不将其写作全通过。证据：隔离工作区 `D:/tools/.cache/knorvia-polish-orchestration-20260923/desktop-types-before.log` 与 `desktop-types-after.log`。最终构建与桌面覆盖校验记录见下方交付记录。

### 最终便携版交付

2026-09-23 02:22，已覆盖原展开目录 `%USERPROFILE%/Desktop/Knorvia Studio Portable`，直接运行其中的 `Knorvia Studio.exe`。未增加压缩包或重复目录；覆盖前后 71 个 `data` 文件逐一 SHA-256 完全一致。隔离测试配置和测试对话未复制进去。

最终生产包重开后，已保存草稿正文完整恢复，工作流三个完成节点和主动停止记录均保留；“任务已停止”以中性状态显示。测试应用正常退出。桌面包独立校验通过：产品名、便携标记、原生 Agent 包、7 个透明图标尺寸正确，未包含登录 HTML/preload 页面。

- EXE SHA-256：`1eb1e3dd3d8864fedd62429f4f8e2ba70f968bacd4a86360f1776accfe1dd603`
- app.asar SHA-256：`11c4bb43ec7122e921f49c325bf488d7061b9c9a3da9553b0d8dde415009cc40`
- 桌面包内记录：`%USERPROFILE%/Desktop/Knorvia Studio Portable/构建校验.json`
- 数据保留证明：`D:/tools/.cache/knorvia-backend-delivery-copy-summary.json`
- 自动检查与构建日志：`D:/tools/.cache/knorvia-polish-pass2-*.log`、`knorvia-polish-final-*.log`

## 已实现的范围

- 继续复用原 GUI，保留白色默认主题、统一聊天组件、已确认的小机器人及透明图标。管理入口仍在设置；未新增角色与记忆、成果或插件市场页面。
- Knorvia 原生单聊使用原执行通路；Codex、Claude Code、Grok Build 使用各自的双向原生协议，支持流式文本、工具状态、原生会话恢复、用户问题和可用的权限审批。
- 外部单聊在原输入框选择模型、思考档位。目录来自实际 CLI，选择分别保存在草稿和会话中，提交时冻结；切换内核仍新开独立会话。
- 群聊支持用户 @、全部成员、主持人 fallback，以及明确启动后的规划、派发、复核、返工。持续任务没有固定总轮次/总调用数的“继续”门槛；仍限制同时运行数量和单批派发数量。
- 用户运行中补充说明会持久保存，冻结尚未执行的旧派发，等活跃成员收口后重排。停止撤销后续派发及排队续接；迟到消息不能重新启动任务。
- 工作流连接真实的串并行、条件、all/any 汇合、人工确认、失败重试、历史与恢复。已完成节点不重复执行；未知副作用需要明确检查后重试。拒绝确认会显示原始原因及对应失败节点。
- 隔离项目快照包含当前未提交文件。成员结果携带实际工作目录；原项目只有在明确应用文件且基线没有冲突时才更改。长群任务裁剪活动检查点时，保留完整结果和各成员工作目录的修改入口。
- SQLite 保存队列、会话、交互、运行和恢复状态；多个 Host 通过事务与 owner 租约避免重复执行。长历史可分页补齐，旧的待答问题不因新历史增多而消失。
- 版本及模型探测也参与进程所有权和安装租约。退出先停止接收，取消自有内核进程，等待已接受的文件应用、管理操作和任务收尾，最后关库。

## 内核管理与模型选择

Studio 接入已有 CLI，同时可安装独立的受管副本。只卸载有有效所有权及完整哈希收据的受管版本；外部安装不被静默卸载。升级保留旧副本，避免配置尚未切换时旧路径失效。Windows 临时文件锁会短暂重试，失败仍明确报告。

Codex 使用 `model/list` 和只抽取模型/思考配置的 `config/read`；选择传入原生 thread/turn 参数。CLI 配置中的真实自定义默认模型可能不在公开目录里，恢复默认时交给原生回显和执行验证，不把它伪造成可选菜单项。任意不支持的显式思考档位不会静默忽略。

Claude Code 使用 initialize 的模型能力与原生 effort/模型控制。Grok Build 使用 ACP 的模型状态、模型切换及 reasoning 配置；核对回显，不能把“请求已发送”当成“设置已生效”。这些外部 CLI 的原有认证归 CLI 自己，Studio 没有重新加入应用账号登录模块。

## 前一阶段后端验收记录

| 检查                               | 结果                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| services 新后端测试                | 159 项通过                                                                                      |
| UI 的 Studio/mascot 测试           | 68 项通过，另有运行步骤名称映射 5 项通过                                                        |
| 根类型检查、renderer 类型检查      | 通过                                                                                            |
| 架构检查                           | 0 违规                                                                                          |
| Lint                               | 0 错误；保留原有 29 条警告                                                                      |
| 生产构建                           | 通过；既有大块资源提示仍存在                                                                    |
| 三 CLI 模型目录                    | 实机握手读取成功；目录探测不发送推理请求                                                        |
| GPT-5.6 Luna / low                 | Codex 0.155.1 实机短输入成功，返回 `pong`，无回退                                               |
| Codex 双轮原生恢复、流式和文件工具 | 已实机验证                                                                                      |
| Codex 原生取消                     | 长命令运行时停止，原生确认，结果已知；约 225 ms 收口                                            |
| 主持群任务                         | 已实机完成一次计算、成员检查与主持复核，结果 391                                                |
| 打包后原聊天界面                   | 原模型菜单选 GPT-5.6 Luna、低档位，发送后回复 `pong`；数据库保存同一选择                        |
| 打包后工作流 GUI                   | 开始 → Luna 回复 → 条件判断 → 人工确认 → 结束，五节点全部完成，运行历史显示真实结果             |
| 群聊与 Agent 管理 GUI              | 实际服务保存的群聊可打开，@ 菜单正确；检出 Codex 0.155.1、Claude Code 2.1.220、Grok Build 1.0.3 |
| 窗口与退出                         | 关闭窗口隐藏到托盘后可重新打开；独立测试配置关闭托盘隐藏后，主进程与子进程正常退出              |
| 重启保存                           | 新进程重开后，原单聊 `pong`、Luna/低档位和五个工作流完成状态保留；没有再次调用模型              |
| 桌面便携目录                       | 已更新原展开目录；71 个 data 文件逐一哈希一致，没有测试数据混入                                 |

用户提出低成本测试要求之后，共进行 3 次短输入联网推理（适配器、GUI 单聊、GUI 工作流），均固定使用 `gpt-5.6-luna` / `low`，不自动回退昂贵模型。较早完成的 Codex 双轮/工具/取消/群任务检查使用了当时既有的默认模型，该事实不改写为 Luna 测试。

GUI 测试使用 `D:/tools/.cache/knorvia-backend-gui-20260922` 独立数据目录；没有把测试对话、工作流或模型配置写入用户桌面便携版的数据。运行历史显示冻结定义中的节点名称，内部编号仅用于执行和应用修改。

前一阶段交付也沿用同一个桌面便携目录；现已由上方“两遍细致打磨”的最终包替换，以该节哈希和当前 `构建校验.json` 为准。

已确认的验收例外：Claude Code 保留接入，不替用户登录，也不要求本轮完成已登录实机推理；Grok Build 余额耗尽（402）保留为联网验收例外。协议、目录、状态、错误和取消路径仍已测试。不得将例外推广为其他功能免验收。

## 设计参考与独立实现

- [Ekko Studio](https://github.com/EKKOLearnAI/ekko-studio)：检查版本 `4805c44b163c9312b727a0578cbae42b919b4d2c`。参考 @ 路由、成员队列和共享上下文边界；未复制 BSL-1.1 源代码。
- [Hermes Agent](https://github.com/NousResearch/hermes-agent)：检查版本 `fde4997f580c3480798fdf9c7e92c0079d6e03d6`。参考停止中的取消确认和运行代次隔离。
- [Grok Bot 历史重建仓库](https://github.com/b-nnett/grok-bot-0.18-reconstructed)：检查版本 `a9f633e09d49a85829b8236331b9e21f7e612634`。只研究历史停止、补充指令、队列清理行为；不把该第三方旧版当作当前官方实现，也未执行其二进制。
- [Grok Bot 当前协作说明](https://docs.x.ai/grok-bot/chat-and-collaboration)：对照用户介入、直接停止及异步协作。实现采用本项目自身的契约和持久化逻辑。

本项目不采用参考中的固定少量讨论轮次。每轮原生执行结束仅表示该轮结束；群任务完成还需要主持复核与工作目录证据。

## 后续维护入口

运行与恢复以 `packages/services/src/studio-runtime` 为唯一新增后端模块；浏览器安全契约在 `contract.ts`，Node 组装在 `node.ts`。界面通过 `packages/ui/src/studio/runtime` 获取服务快照和提交命令，不能重新建立另一份已接受的任务队列。

修改协议时先更新实际 CLI 能力夹具，再做最少量的低成本实机验证。新增内核必须明确会话恢复、权限、用户问题、取消确认及模型/思考控制能力。不支持的能力应在界面说明，不能靠提示词冒充强制限制。

更新便携版时沿用桌面 `Knorvia Studio Portable` 展开目录并保留 `data`；不生成重复便携目录或把压缩包当作可直接运行的交付物。原开源许可证与必要声明保留。
