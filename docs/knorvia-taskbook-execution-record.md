# Knorvia Studio 任务书执行记录（T00 起）

对应《Knorvia Studio 开发任务书与迭代路线》（T00–T13）。本文件记录真实基线、实际执行的命令与结果、未执行项与阻塞项；不使用任务书的待办当作完成声明。

## T00 执行基线与最小变更边界

### 检出与基线

| 项目 | 实际值 |
| --- | --- |
| 仓库 | `https://github.com/accomplish07zrh-eng/knorvia-studio`（私有） |
| 工作目录 | `D:\tools\knorvia-studio` |
| 分支 | `main` |
| 基线提交 | `bcc63b6ff684e8ee9b8070f326d70ac007ece19b` |
| 版本 | `0.8.0-preview.2`（根 `package.json`） |
| 工作区状态 | 检出时干净（`git status --porcelain` 0 行） |
| 新鲜度检查 | `node scripts/check-workspace-freshness.mjs` 退出 0：`[freshness] 基线新鲜：main（与 origin/main 同步），相对 origin/main：ahead 0 / behind 0（阈值 50）` |
| 与规划基线一致性 | `main` 当前 SHA 与任务书规划的 `bcc63b6` 完全一致，无需回退 |

### 本机工具链（与 `mise.toml` 的差异如实记录）

`mise.toml` 固定 `node = 24.14.0`、`pnpm = 10.33.2`；本机未安装 mise。

| 工具 | 本机版本 | 说明 |
| --- | --- | --- |
| Node | `v26.3.0` | 与 `mise.toml` 固定的 24.14.0 不同，属于环境偏差 |
| pnpm | `10.33.2` | 通过 `npx --yes pnpm@10.33.2` 执行，与锁定版本一致（全局 pnpm 为 11.4.0，未使用） |
| Python | `3.13.14` | 与 CI 的 `actions/setup-python@v5` 3.13 一致 |
| git | `2.54.0.windows.1` | |

依赖安装：`npx --yes pnpm@10.33.2 install`，退出 0，用时 1 分 26 秒。

- 安装过程中的真实失败：`node_modules/ssh2` 的可选 crypto 原生绑定编译失败（`v8::Context::GetIsolate` 在 Node 26 头文件中不存在）。ssh2 的安装脚本自身以 “Failed to build optional crypto binding” 继续，`pnpm install` 整体退出 0。该绑定是可选优化；本轮 SSH 相关用例即使运行也不会连接远端。
- `packages/desktop` 的 `postinstall` 使用 `node-pty` 的 `win32-x64` prebuild（`: [node-pty] skip electron-rebuild (windows-prebuild-available)`）。

### 基线检查结果（真实执行）

在基线 `bcc63b6` 上执行的检查（`pnpm typecheck` / `pnpm lint` / `pnpm fmt:check` / `pnpm architecture:check`）：

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 退出 0（含 desktop main 的 project references） |
| `pnpm lint` | 退出 0，`Found 0 warnings and 0 errors.` |
| `pnpm fmt:check` | 首次退出 1，但报告的文件恰好只有本次新增的 7 个文件；对这 7 个文件执行 `pnpm fmt` 后 `pnpm fmt:check` 退出 0，`All matched files use the correct format.`（4458 文件）。据此判定基线自身格式干净 |
| `pnpm architecture:check` | 退出 0 |

尚未在基线执行的检查（在后续批次补齐，不预先声称通过）：`pnpm build:cli-packages`、`pnpm test:studio`、`pnpm perf:baseline`。

### 路径核对（任务书“建议新增/按需新增”的落点）

任务书 R/C/U 简称与实际路径全部存在，逐条核对结果：

```text
R = packages/services/src/studio-runtime/        存在
C = packages/services/src/creation/              存在
U = packages/ui/src/studio/                      存在
packages/cua                                     存在（当前为 .js/.d.ts 形式的 broker 实现，不是空占位目录）
examples/plugins                                 存在（仅 project-brief 一个示例）
scripts/perf-baseline.mjs / scripts/test-studio.mjs / scripts/deliver-portable.ps1  均存在
packages/ui/src/i18n/locales/{zh-CN,en-US}.ts    存在（新增文案必须两种语言同时补）
```

任务书 T02/T05/T06/T07/T09 点名的所有文件均已存在；`建议新增` 的文件（如 `R/app/runOutcomeProjection.ts`）尚未创建，属正常。

### 已有实现复核结论（已存在 / 需增强 / 待核实）

| 结论 | 依据 |
| --- | --- |
| 已存在：内置单聊 V4、Studio Runtime、CreationService、SQLite 持久化、工作区隔离、审批、停止、恢复、历史链路 | 任务书要求的保留边界全部在检出代码中可定位 |
| 已存在：`workspaceReview` 的 `paths[]` 批量参数、项目应用锁、失败后恢复核查 | 已在源码中确认，T05 第一版应复用而不是另建 |
| 已存在：请求编号幂等与“同 ID 不同负载”拒绝 | 服务端已抛错拒绝，T09 只需保留并补测试，不需新造 |
| 已存在：内核程序/版本/ACP 探测 | 存在，但异常出口统一折叠为 `installed:false`，T04 需分层 |
| 需增强：多内核分层状态、输出契约、Host 引用解析、工作流参数 | 见各任务卡 |
| 待核实：历史线索中的失败统计与性能数字 | 属 [H01]，必须以本轮新证据为准 |

### 本轮不新增的边界

- 不新增手机端页面、适配或手机验收工作项；不改动共享身份与远端保护逻辑。
- 不新增 UI 壳、成果中心、素材数据库、角色/记忆页、插件市场或登录体系。
- 不推倒重构、不合并 V4 与 Studio Runtime、不新增第二条业务写入路径。
- 不新增统一 E2E 命令（仓库当前不存在该入口）。

### 回滚

本任务只记录事实，未修改产品行为。回滚方式为删除本文件与新增的说明文档；不涉及恢复废弃实现、不清空工作区。

## 批次进度

| 任务 | 状态 | 提交 | 备注 |
| --- | --- | --- | --- |
| T00 | 进行中 | — | 本文件；基线检查已记录，`build:cli-packages` / `test:studio` 待补 |
| T01 | 已提交待验收 | `797a76e` | 见下 |
| T02–T13 | 进行中 | — | 后续补充 |

> 状态含义：待执行 → 进行中 → 待验收 → 已完成。任何未执行或失败项在下文如实列出。
