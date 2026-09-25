## Knorvia Studio 当前范围

- 本仓库于 2026-09-22 从上游重新克隆。此前旧仓库中的多内核与协作实现已被用户明确废弃，不得复制或恢复；当前的多内核、群聊、工作流等能力是按 `specs/` 重新实现的，不属于废弃范围。
- 保持上游原版 GUI、Knorvia Studio 品牌、透明图标、白色初始主题，以及已经完成的登录清理和身份隔离。
- 视觉取值与形状已换成 Knorvia 自己的黑白视觉语言（2026-09-24 用户确认，见 `specs/knorvia-visual-language.md` 与 DESIGN.md「Knorvia visual language」）：纯净黑白、同色系以深浅区分、胶囊/圆形操作、纸片式选中、三道笔画母题、细线图标。「保持原版 GUI」指布局、组件与交互不变，**不得**把颜色、圆角、形状恢复为 ZCode/Zai 原值，也不得引入紫色、粉色或左黑右白的配色。
- 夜间使用 Computer Use 实机调试时，测试配置默认使用深色，避免强光；这不改变新安装首次启动的白色主题。
- 当前用户已授权在原 GUI 内全面补齐 Agent 管理、单聊／群聊与工作流后端，以 `specs/knorvia-backend.md` 为当前实施规格，沿用 `specs/knorvia-frontend-shell.md` 的界面规则；基础隔离继续遵守 `specs/knorvia-clean-base.md`。群任务持续运行至完成、真实阻塞或用户停止，不按固定轮次要求继续。不恢复废弃实现、不另起 UI 壳子。
- 暂不新增角色与记忆、成果页面。主侧栏保留新建任务、自动化、工作流及其后的创作入口（`specs/knorvia-creation.md`）；搜索为顶部图标，其余管理入口收进设置左侧。
- 内置与本机发现的 CLI 内核共用原 Knorvia 聊天呈现组件；新增 ACP 内核按 `specs/knorvia-cli-expansion.md` 登记和核验。外部内核草稿、项目与运行时边界独立，未接入时禁止发送，不做另一套聊天外观。
- 不提供独立插件市场，设置只留一个插件管理入口。管理页标题使用紧凑的 text-ui-lg，避免巨大标题和大块标题留白；模型供应商并列展示，不为智谱或 Z.ai 设置单独专区。
- 产品自己的环境变量与数据目录使用 `KNORVIA_`、`.knorvia-studio`，不读取现有 ZCode 配置或凭据。内部包名可保留兼容标识。
- 保留 LICENSE、NOTICE.md 与第三方许可和署名，不将合法归属声明当作产品品牌删除。

## 核心原则

- 新增或修改行为前，先更新对应 spec；目录不存在时按需创建。先明确产品规则、状态所有者、接口和验收场景，再实现代码。
- 以当前检出的源码、`package.json` 和架构策略为准。说明中只保留当前仓库提供的功能、命令和文件；删除功能时同步清理指令和技能中的引用。
- 定位问题时，未明确要求修改代码就先调查原因。结合源码、日志和运行时证据，区分已确认原因与待验证假设。
- 保留与任务无关的本地改动，不自行恢复已移除的模块或内部依赖。

## 命令与仓库结构

开工前运行 `node scripts/check-workspace-freshness.mjs` 检查基线。Node 版本以 `mise.toml` 为准。

以下命令从仓库根目录执行：

| 用途             | 命令                                      |
| ---------------- | ----------------------------------------- |
| 类型检查         | `pnpm typecheck`（含中英文键校验）        |
| Lint             | `pnpm lint` / `pnpm lint:fix`             |
| 格式检查         | `pnpm fmt:check`                          |
| 构建 CLI 包      | `pnpm build:cli-packages`                 |
| 离线回归测试     | `pnpm test:studio`                        |
| 中英文键校验     | `pnpm i18n:check`                         |
| 性能基线         | `pnpm perf:baseline`                      |
| 桌面开发         | `pnpm dev:desktop`                        |
| Web 开发         | `pnpm dev:web`                            |
| 提交前检查       | `pnpm verify:pre-push`（Lint 与架构检查） |
| 架构检查         | `pnpm architecture:check --changed`       |
| 模块阅读包       | `pnpm architecture:context <module-id>`   |
| 未使用依赖与导出 | `pnpm knip`                               |
| 导出引用查询     | `pnpm dep:refs --list-exports <file>`     |

`pnpm test:studio` 汇总 services、ui、desktop、shared、rpc 及 CLI 相关包的离线测试文件（见 `scripts/test-studio.mjs`），运行前需 `pnpm build:cli-packages` 生成 `apps/cli` 各包的 `dist`；其他测试入口以目标包的 `package.json` 和实际测试文件为准，不假定存在统一的 E2E 命令。`.github/workflows/studio-offline.yml` 在每个 PR 上于 Linux 运行 typecheck、lint、`fmt:check`、全量架构检查与 `test:studio`，推送 `main` 或手动触发时另在 Windows 上运行。测试涉及路径、大小写或主目录时须同时兼容 Windows 与 POSIX。

- `packages/desktop`：Electron main、host、renderer。
- `packages/web`、`packages/server`：Web 客户端与服务端。
- `packages/ui`：共享 React 组件、hooks 与 Zustand store。
- `packages/services`：业务服务；`packages/rpc`：RPC 框架。
- `packages/shared`：共享协议与类型；`packages/client`：Agent 客户端 SDK。
- `apps/cli`：Agent CLI 与运行时。
- `CONTEXT.md`：插件商店领域词汇；修改相关 UI 前阅读。
- `DESIGN.md`：UI 设计规范；修改 UI 前阅读。

## 实现与验证

- 代码改动使用 `.agents/skills/architecture-governance/SKILL.md`，先运行架构检查，再读取目标模块的受控上下文。
- 避免重复状态和多条写入路径。明确唯一所有者、接口、依赖方向、事件顺序与幂等边界，不能用超时掩盖同步问题。
- 有行为改动时先补充对应测试；交互改动需要 E2E 场景。检查测试与实现是否一致，并实际执行可用的验证。未执行或环境受限时如实说明。
- 修复 bug 时用中文注释说明原因和修复依据。发现设计缺陷时先与用户对齐，不不断增加兜底分支。
- 涉及状态、时序、远端或异步同步的方案，用图展示所有者及事件顺序。
- 必须执行 `pnpm typecheck` 和 `pnpm lint`，报告真实结果，不将已有失败写成通过。
- 使用异步文件和网络 IO；跨包导入使用公开入口，遵守现有路径别名。
- 禁止 UI 直接调用 Repo、Service 引用 Runtime 具体实现、跨域导入实现细节及循环依赖。

## UI 与平台边界

- 遵守 `DESIGN.md`，复用已有组件，兼顾桌面与手机 Web 的布局、交互、主题和国际化。
- 组件通过 `packages/ui/src/hooks/` 访问服务；平台操作通过 `IPlatformService`（`packages/shared/src/platform.ts`），不直接调用 `window.knorvia`。
- 通过依赖注入处理 Desktop、Web、本地和远程环境的差异，并兼顾 Windows、macOS 和 Linux。
- Zustand 状态位于 `packages/ui/src/store/`。广播同步的主题、语言等字段需要防止回环；UI 局部状态不应被误当作服务端事实。
- hooks 中含 JSX 的文件使用 `.tsx`。

## 进程、协议与远程控制

- Desktop app 通过 stdio 与 Agent 通信。协议改动同步更新 `packages/shared/src/protocol/index.ts`，提供严格类型与运行时校验。
- Main 负责窗口、原生操作、进程调度和消息转发，不承载 task/session 业务状态。
- 每个窗口使用一个 window-scoped Local Host；本地 workspace 共享该 Host。远程 workspace 由窗口内的连接注册表管理，不另建 Desktop Remote Host。
- 手机远控连接桌面已有 Host attachment，复用会话运行时；不为手机另起 Agent、Local Host 或远程会话。
- Desktop 的 `desktop-continuous` 实时链路与手机的 `web-remote-replayable` 恢复链路必须明确区分。修改 stream、snapshot、queue 或重连时，同时验证两种语义。
- 外部 relay 与 Main 只做鉴权、配对、心跳、转发及 attachment 调度，不保存任务队列、快照等业务状态。
- 已接受的 busy/running 输入由 CLI/runtime `CommandInbox` 串行 admission；Renderer 只保留未提交草稿与 pending optimistic overlay，Host owner/lease 负责路由。
- 保留 owner/lease、跨 Host 路由和 stale run 防护，不能仅根据单一路径删除边界判断。

## Workspace Identity

- `workspaceIdentity` 用于身份隔离，`workspacePath` 用于文件操作、命令 cwd、Git 和路径展示。
- 身份 key 统一为 `workspaceIdentity?.trim() || workspacePath`，适用于去重、绑定、缓存、队列、持久化和请求关联。
- 远程链路贯穿传递 `workspaceIdentity` 与 `remoteSessionId`，不得仅按路径匹配。
- 新接口保留本地路径 fallback；远程 identity 复用现有构造和解析工具，不在业务代码中手写格式。

## 日志

- UI 使用 `packages/ui/src/logger.ts`，不直接使用 `console.log` 或 `window.knorvia?.log`。
- Agent/session/runtime 相关服务日志使用 `createServiceLogger(scope)`（`packages/services/src/logger/serviceLogger.ts`）。
- `debug` 用于协议原始数据、流式 chunk 和逐条工具更新等高频诊断，生产环境不落盘。
- `info` 用于进程和会话生命周期、权限结果、一次性初始化等生产可用事件。
- `warn` 用于可恢复异常；`error` 用于崩溃、握手失败、鉴权丢失等不可恢复错误。
- 不在日志、示例或提交中写入凭据、真实用户数据和内部服务地址。
