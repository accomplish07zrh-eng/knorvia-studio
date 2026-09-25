# Knorvia Studio Computer Use 本地方案评估（T3.1）

日期：2026-09-25。结论：正式接入优先走“现有内核决定受限动作 + 本地 Cua Driver 执行”的路线；先以独立的、由桌面进程监督的 Driver 连接做原型，再评估嵌入式 SDK。Jev 可以作为以后可选的候选动作选择器，但本轮不依赖外部模型服务，也不把它作为 Computer Use 的必要条件。当前 `@knorvia/cua` 仍是拒绝执行的占位包，产品内没有可用的桌面操作能力；已删除的旧插件不恢复。本报告只评估路线，没有改动运行时代码或便携包。

## 两条路线与状态所有者

| 项目       | Cua 的 jev-use 配方                                                                                                                                                    | 常规 Computer Use                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 决策       | 应用根据最新观察构造带固定参数的不可变候选；TypeSafe Jev 只返回候选 ID，也可返回重新观察或放弃。选错、过期或不在表内的 ID 拒绝执行。                                   | 现有内核依据观察选择下一步；Knorvia 的动作网关仍须约束目标、工具、参数与审批，不能让模型直接获得无限制桌面入口。离线验收使用固定动作替身。 |
| 执行与验收 | Cua Driver 观察和执行；应用重新观察并独立判断后置条件。                                                                                                                | 同一个 Cua Driver 负责本机观察和执行；Studio 运行时独立判断后置条件。                                                                      |
| 额外依赖   | [官方配方](https://github.com/trycua/cua/blob/main/skills/jev-use/SKILL.md)的 live 路径需要 TypeSafe 服务、凭据与 SDK；mock 不需要。候选生成与选择结果校验由应用负责。 | 不需要 Jev 凭据或第二个外部决策服务，但内核自己的可用性及能力仍须真实探测。                                                                |
| 建议       | 待有明确的延迟、成本、隐私收益和用户授权后，才作为可选决策层评估。                                                                                                     | 作为首个产品实现方向；复用 Studio 的会话、审批、停止和审计边界。                                                                           |

产品设计建议是：Studio Runtime Host 持有唯一 run 状态、批准请求和结果记录；桌面 Main 只监督本机 Driver 进程和转发受限动作，不保存会话业务状态；Renderer 只展示观察、审批及停止入口。动作包含 run/turn、目标窗口、观察版本与请求 ID，发出前再验证；执行结果不能当作任务完成。停止先禁止后续动作并取消当前请求，再读取实际终态。已下发但无法确认是否生效的动作记为“结果未知”，不得自动重放。这与[现有运行时规格](../specs/knorvia-backend.md)的 owner、审批和迟到回执规则一致。正式实现前需另写接口与权限规格，并做 Windows 原生应用的端到端测试。

## 官方能力、安装与许可

评估以 Cua 官方仓库提交 [`83a71552d608003ae64c1c3989b6f45ec795c6e0`](https://github.com/trycua/cua/tree/83a71552d608003ae64c1c3989b6f45ec795c6e0/libs/cua-driver/examples/jev-use) 的示例为准。本机 Windows 11 build 26200 上的 Cua Driver 为 **0.28.0**；当日官方稳定发布页列出 [0.28.2](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.28.2)，本轮没有升级用户已安装版本。Driver 的[平台支持表](https://cua.ai/docs/reference/cua-driver/platform-support)列出 Windows Win32、UI Automation、原生输入与定向窗口消息；部分 Chromium 后台手势、提权窗口边界仍有限制，不能据此承诺所有软件可控。Windows [工具目录](https://cua.ai/docs/reference/cua-driver/mcp-tools-windows)可返回 UIA 树与截图；无可靠 UIA 语义时要另做截图定位和歧义处理。本机 0.28.0 的 MCP 未提供示例所需的 capture-bound visual click 组合，因此本次实操走带页面 ref 的语义浏览器路径；视觉区域的过期与不匹配只由固定夹具验证。

Driver 支持持久 `cua-driver mcp` stdio、CLI `cua-driver call`、同进程 SDK、私有 worker 与应用托管服务，详见[接入选择](https://cua.ai/docs/concepts/choose-a-cua-driver-integration)和[进程模型](https://cua.ai/docs/reference/cua-driver/process-model)。本次用持久 MCP 连接；正式产品若打包 SDK/worker，需另验 Electron/Node ABI、Windows 安装与升级、进程退出、便携版大小和离线启动，不沿用本机安装作为交付证明。官方示例的 Python 包要求 Python >=3.10、`mcp>=1.26,<2`、`typesafe-sdk>=0.6,<1`；本次锁定安装 `mcp 1.30.0`、`typesafe-sdk 0.6.0`。TypeScript 示例使用 Node >=22、`@modelcontextprotocol/sdk 1.30.0`、`@typesafe-ai/sdk 0.6.0`；本次用 Node 24。只评估示例，没有把 Python、Node 依赖或 Driver 加入 Knorvia 安装包。

Cua 主仓库及 Driver 标为 [MIT](https://github.com/trycua/cua/blob/main/LICENSE.md)，TypeSafe [JavaScript SDK](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/LICENSE)和 [Python SDK](https://github.com/typesafe-ai/typesafe-sdk-python/blob/main/LICENSE)仓库也标为 MIT；复制其软件时须保留版权与许可文本。**本轮未逐件核验 Windows 发布压缩包和其传递依赖，因此未作便携包再分发结论，也未打包。** Cua 的[可选视觉感知扩展及模型](https://github.com/trycua/cua/blob/main/libs/cua-driver/README.md)有独立的第三方条款，不能因为 Driver 为 MIT 就一并打包。Jev live 服务的使用条款、费用和数据外传另行评估；本轮没有调用服务。

默认后台动作在目标支持时不移动当前鼠标、前台窗口或焦点；这是[尽力保证](https://cua.ai/docs/concepts/capture-and-delivery-modalities)，并非所有应用的绝对承诺。前台模式会短暂激活目标窗口；部分 Win32 快捷键也可能短暂切前台。产品应在动作前显示目标与影响，前台路径由用户针对本次运行显式批准，后台失败不得静默切换到前台。现有浏览器配置或已登录页面比隔离浏览器敏感；[Driver 的既有配置连接](https://cua.ai/docs/concepts/choose-a-cua-driver-integration)需要单独授权，首版应默认只允许隔离会话。Driver 默认的 `standard` 模式可面向桌面多个应用；产品原型应使用[受限模式或能力清单](https://cua.ai/docs/reference/cua-driver/permission-modes)与 Knorvia 自己的逐动作审批，固定模式由可信启动者设置，模型不能提高权限。

另有两个同名但不同的仓库：[shitianfang/jev-use](https://github.com/shitianfang/jev-use)是面向代理步骤分流的插件，[savka777/jev-use](https://github.com/savka777/jev-use)是 macOS 的 Swift 桌面语音/辅助功能项目。它们都不是本次测试的 Cua 官方 Windows 配方，不能把其特性或测试结果移作本方案证据。

## 本机隔离验证

外部测试目录是 `D:\tools.cache\cua-jev-use-eval-20260925`，没有进入 Knorvia 仓库。Cua 官方示例使用本机回环 HTTP 表单、Driver 启动的全新隔离 Chromium 配置和独立 `/state` 端点；未访问账号页、现有浏览器配置、生产主机或真实模型。测试时未设置 TypeSafe 凭据，也没有请求付费推理。结果如下：

| 检查                                                                                                   | 实际结果                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uv run --frozen python verify_choice_cli.py`、`verify_mcp_tools.py`                                   | mock 候选选择通过；六个必要浏览器工具存在，capture-bound visual adapter 不可用。                                                                                                                                            |
| `uv run --frozen python -m unittest discover -s python/tests`、`npm.cmd run typecheck`、`npm.cmd test` | Python **72 项通过、1 项跳过**；TypeScript 类型检查通过、**25/25** 测试通过。首次稀疏检出缺少官方工作流文件，补齐后重跑通过；不是产品代码故障。固定测试覆盖未知/过期候选、歧义视觉区域、capture ID 不匹配和拒绝无绑定重试。 |
| `uv run --frozen python verify_setup.py --typescript --output-dir runs/local-mock-both-20260925`       | Python 与 TypeScript mock 各跑一次完整观察、定位、输入、点击与独立结果回读；`summary.json` 为 `complete: true`、`live_requested: false`、**2/2 verified**，回读值均为 `jev-guide-mock`。                                    |
| 固定动作的直接 Driver 路径 `local_direct_driver.py`                                                    | 不经过 Jev 适配器，重新观察后用新 ref 输入并点击；独立 `/state` 回读 `direct-driver-local`，通过。                                                                                                                          |
| Driver 权限故障注入 `local_policy_refusal.py`                                                          | 在独立 MCP 进程设置拒绝 `click` 的用户策略；Driver 返回 `permission_denied`，未派发点击，通过。                                                                                                                             |
| `local_fault_checks.py`、`local_stop_check.py`                                                         | 前者以固定适配器响应验证权限拒绝、动作失败、取消均只派发一次；后者在观察后、动作下发前停止并关闭 MCP，独立表单仍为空。两项通过。                                                                                            |

四份 `local_*.py` 是评估目录内一次性脚本，并非官方示例或 Knorvia 产品测试；官方 mock 结果不能证明 live Jev 会作相同选择。隔离测试服务器在浏览器连接结束时输出过非致命 `ConnectionResetError`，上述进程退出码为 0 且独立状态检查通过。本机 Driver `doctor --json` 报告交互会话与 UIA 可用；本机已运行的守护进程为 `standard` 且没有用户/管理策略，这只描述评估环境，不是建议的产品权限配置。

未验证：真实 Jev 服务与计费、真实内核决策、Windows 原生应用的 UIA/像素混合操作、前台焦点争用、提权窗口、活动作中途取消的最终确认、Driver 升级到 0.28.2、视觉扩展和分发包许可、便携版集成与真实用户界面。尤其是“停止前未派发”的本地检查不能推出“已派发动作已撤销”；后者必须按结果未知处理。本轮不将占位包或本报告称作已交付的 Computer Use 功能。
