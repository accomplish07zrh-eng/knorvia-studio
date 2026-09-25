# Knorvia Studio 批次验收与便携交付（T13）

2026-09-25。对应任务书 T13「综合桌面验收与批次发布」。本文件只记录实际执行的命令与结果；未执行项与例外在文末单列，未把 ACK、模型宣称或未运行的测试写成成功。

## 候选提交与版本

| 项目           | 值                                                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本批次功能清单 | T01 发布门禁、T02 测试稳定性、T03 升级/便携数据保护、T04 内核分层状态（后端+界面）、T05 交付摘要与接纳、T06 输出契约、T07 Host 引用与参数、T08 工作流场景、T09 创作来源（服务层+界面）、T10 性能基线/运行历史收敛/两库并行准备、T11 技能包与兼容面板、T12 受限 CUA 契约与失败关闭门禁 |
| 构建时提交     | `6e1b4f27181d843b72f7e6c5a32a2f1b96562980`（构建期间工作区干净）                                                                                                                                                                                                                      |
| 记录提交       | 本次文档提交（仅更新执行记录与验收文档，不含代码改动）                                                                                                                                                                                                                                |
| 版本           | `0.8.0-preview.2`                                                                                                                                                                                                                                                                     |
| 远端           | `origin/main` 已包含全部批次提交（T01–T12、T10 的两项优化与各次修复）                                                                                                                                                                                                                 |

## 批次门禁（从仓库根执行，全部为真实结果）

| 检查                      | 结果                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| `pnpm typecheck`          | 退出 0（含 desktop main 的 project references 与中英文键校验）               |
| `pnpm lint`               | 退出 0，0 warnings / 0 errors                                                |
| `pnpm fmt:check`          | 退出 0，`All matched files use the correct format`                           |
| `pnpm architecture:check` | 退出 0，`violations: 0 / baseline: 0 / new: 0`（未修改基线、未抬高任何上限） |
| `pnpm build:cli-packages` | 退出 0                                                                       |
| `pnpm test:studio`        | 退出 0，**tests 751 / pass 751 / fail 0 / skipped 0**                        |

回归规模：基线 571 → 751。日志：`D:/tools.cache/knorvia-batch1-full-checks2.log`、`knorvia-batch2-full-checks.log`、`knorvia-batch3-full-checks.log`、`knorvia-batch4-full-checks.log`、`knorvia-batch5-full-checks.log`、`knorvia-batch6-full-checks.log`。

批次过程中发现并修复的真实回归（均单独提交）：工作流文件信封版本断言失效（`d142571`）、交付投影在缺少可选 checkpoint 的旧运行上抛错（含于 `b6fb13c`）、UI 参数未透传到 send 命令（含于 `7011f67`）、重新探测无法绕过探测缓存（含于 `a882ae9`）、插件文档与测试仍声称兼容面板已推迟（含于 `11a5660`）。

## 升级夹具与数据保护

- `studio-upgrade-protection.test.ts` → 11 通过 / 0 失败（迁移幂等、记录/完成节点/审批保留、迁移不触发任务执行、迁移前一致备份、版本过新拒绝且零写入、注入失败可重试、中断后恢复、不可写目标、新库不备份）。
- `portable-upgrade-preserves-data.test.ts` → 3 通过 / 0 失败，其中一个用例真实调用 `scripts/deliver-portable.ps1` 端到端复核，并含反例对照证明检查非空转。

## 便携包交付（最终，本次真实执行）

构建命令（`KNORVIA_ENV=production`、`KNORVIA_PORTABLE_BUILD=1`、`KNORVIA_SKIP_REMOTE_ASSETS=1`）：

```text
node packages/desktop/scripts/bundle.mjs --os win --arch x64
```

构建退出 0，用时约 14 分钟；产物 `packages/desktop/dist/win-unpacked` 含 `resources/knorvia-portable.json`（`product=Knorvia Studio`，`dataDirectory=data`）。

交付命令：

```text
pwsh -NoProfile -File scripts/deliver-portable.ps1 -Source <win-unpacked> -Target "C:\Users\17018\Desktop\Knorvia Studio Portable"
```

交付脚本输出（原文）：

```text
Portable data before: 430 files, 54865365 bytes
Portable data verified: 430 files, 54865365 bytes, SHA-256 identical; robocopy code 3
Program files verified: 118 SHA-256 identical to the build
Delivered executable SHA-256: 87FAAB6C0FEA14C660CEA93013219BDAC0C8E9034C63EF8E3D8F1925AE5B1106
```

交付后 `构建校验.json`：

```json
{
  "target": "C:\\Users\\17018\\Desktop\\Knorvia Studio Portable",
  "product": "Knorvia Studio",
  "version": "0.8.0-preview.2",
  "dataFiles": 430,
  "dataDirectories": 214,
  "dataBytes": 54865365,
  "dataUnchanged": true,
  "programFilesVerified": 118,
  "exeSha256": "87FAAB6C0FEA14C660CEA93013219BDAC0C8E9034C63EF8E3D8F1925AE5B1106",
  "asarSha256": "159D03B6653695E9CFAF80616E9C47684C6B2582D66C15E6483A7A45EE7B98F0",
  "verifiedAt": "2026-09-25T15:30:42.1697230+00:00"
}
```

交付包内 `resources/app.asar` 的 `package.json` 为 `@knorvia/desktop` / `0.8.0-preview.2` / `main=out/main/index.js`，与源码构建产物一致。

### 便携包打开与数据保留验证

启动交付后的 `Knorvia Studio.exe`：

| 观察项        | 结果                                      |
| ------------- | ----------------------------------------- |
| 启动后 45 秒  | 主进程存活，共 6 个 “Knorvia Studio” 进程 |
| 启动前 `data` | 430 文件 / 54 865 365 字节                |
| 启动后 `data` | 430 文件 / 54 865 365 字节                |
| 丢失文件      | **0**                                     |
| 新增文件      | **0**                                     |

结论：便携包可以打开；覆盖只更新程序文件；`data` 中已有用户文件一个都没有丢失，本次启动也没有改动 `data` 内容。

> 说明：本轮共交付 6 次便携构建（`48894e8`、`7011f67`、`6ee777d`、`81b2073`、`dc51d26`、`6e1b4f2`），每次都用同一交付脚本覆盖程序文件，`data` 逐文件 SHA-256 前后一致。首次交付时的启动验证曾新增 1 个 Chromium 会话文件（`profile\session\DIPS-wal`），此后各次启动前后完全一致。

## 交付物哈希

| 产物                                                | SHA-256                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Knorvia Studio.exe`（便携目录内）                  | `87FAAB6C0FEA14C660CEA93013219BDAC0C8E9034C63EF8E3D8F1925AE5B1106`                     |
| `resources/app.asar`（便携目录内）                  | `159D03B6653695E9CFAF80616E9C47684C6B2582D66C15E6483A7A45EE7B98F0`                     |
| 安装包 `Knorvia Studio-0.8.0-preview.2-win-x64.exe` | `BFEC71F06FB99335DC845556760FB94CCD592CE91760F1042C7ABE907C0673B9`（150 073 498 字节） |

## 故障矩阵覆盖情况（如实）

| 场景                                        | 覆盖方式                                                                                                                    | 状态                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 重复请求 / 幂等                             | `release-gate.test.ts`（同版本重跑 6 种判定）、T09 同 requestId 幂等与「同 ID 不同负载拒绝」                                | 已覆盖                                           |
| 迁移中断 / 备份失败 / 不可写 / 版本过新     | T03 `studio-upgrade-protection.test.ts`                                                                                     | 已覆盖                                           |
| 文件应用未知结果、恢复锁、应用后断线        | 既有 `studio-workspace-recovery.test.ts`、`studio-runtime-polish.test.ts`；T05 新增接纳记录、失败后不写「已接纳」、重启三态 | 已覆盖（UI 渲染未运行时验证）                    |
| 到期 / 取消 / 重启 / 重复触发（定时工作流） | T02 注入虚拟时钟的两个新用例                                                                                                | 已覆盖                                           |
| 引用失效、越权引用                          | T06 非法/未知版本与超限拒绝；T07 引用拒绝矩阵（穿越、符号链接/联接点/ADS、身份不符、缺文件、哈希变化、越权任务）            | 已覆盖                                           |
| 内核能力不足时运行前拒绝                    | T04 能力矩阵与发送前校验；T07 受理前「节点要求 ∩ 用户授权」；T08 代码审查模板在不支持强制只读的内核上被拒绝                 | 已覆盖                                           |
| 付费远端未知结果                            | T09 `verifyJob` 只读核验、绝不自动重发（断言未发生第二次提交）                                                              | 已覆盖（未真机联网）                             |
| 性能与长会话                                | T10 滚动/启动基线、运行历史有界化前后对比、两库并行准备前后对比（同机同命令，median 5799 → 5554ms）                         | 已覆盖（启动仍约 5.5 秒，未达 3 秒目标）         |
| 插件 / CUA 边界                             | T11 技能包、兼容矩阵与只读面板；T12 失败关闭门禁与默认关闭开关                                                              | 已覆盖（逐内核运行时支持未验证，CUA 无观察路径） |

## 未执行 / 例外（不得当作通过）

1. **真实完整路径未跑**：没有执行「选择内核 → 参数/权限检查 → 隔离执行 → 查验证据 → 用户接纳 → 重开核对」的端到端桌面交互，也没有调用任何真实模型或付费服务（未获授权）。任务书要求该步「需要付费的部分必须先获得明确授权」。
2. **云端 CI 未运行**：工作流改动只做了本地 YAML 解析与逻辑夹具验证；分支保护与必需检查需仓库管理员配置（见 `docs/knorvia-release-admin-rules.md`）。
3. **关闭方式**：每次都用 `taskkill` 关闭便携应用，优雅关闭未生效后使用了强制终止；已确认 `data` 无文件丢失、无内容改动，但强制终止不是正常退出路径。
4. **安装包未做安装/卸载向导验证**，也未做代码签名（未申请证书，可能出现 SmartScreen 提示）。
5. **界面渲染未运行时验证**：`packages/ui/test` 没有 DOM 测试环境（未引入 jsdom/@testing-library），T04/T05/T08/T09/T11/T12 的界面行为由纯逻辑模块与类型检查覆盖，组件本身未在浏览器中渲染验证。
6. **T12 没有可用的观察能力**：`packages/cua` 仍是 fail-closed 占位，Windows 上没有可启动的 Helper/Driver，交付的是受限契约、失败关闭门禁与默认关闭开关，不是桌面控制能力。
7. **T10 的 `<3 秒` 目标仍未达标**：实测冷启动约 5.5 秒（并行准备两库已取得约 250–300ms 收益）。剩余固定成本是 15.9MB CLI 包启动、SQLite 建库/WAL/fsync，以及约 0.8s Host 启动、0.24s 服务构造、0.18s 端口/IPC/渲染，全部在同一条串行链上；要达标必须把「首次可交互」与数据库就绪解耦，属产品/架构决策，本轮未擅自改动。
8. 环境偏差：本机 Node `v26.3.0`，`mise.toml` 固定 `24.14.0`；`node_modules/ssh2` 的可选 crypto 原生绑定在 Node 26 下编译失败（可选绑定，安装整体退出 0）。以上差异未在 Node 24.14.0 上复验。

## 回滚

1. 程序回退：用上一版已验证的 `win-unpacked` 重新执行 `scripts/deliver-portable.ps1` 覆盖程序文件；脚本保证 `data` 不被替换。
2. 数据恢复：应用完全退出后，用 T03 生成的 `<db>.pre-<起点>.<时间戳>.bak` 覆盖回数据库并清除 `-wal`/`-shm`；步骤见 `docs/knorvia-upgrade-protection-report.md`。
3. 代码回退：按任务回退对应提交（T01 `797a76e`、T02 `657a00b`、T03 `d62c610`、T06 `e4208d3`、T09 `3dc3a62`/`6ee777d`、T04 `18acac7`/`a882ae9`、T05 `b6fb13c`、T07 `7011f67`、T08 `0797b30`、T10 `81b2073`/`6e1b4f2`、T11 `48894e8`/`11a5660`、T12 `dc51d26`），代码回滚不自动撤销用户已应用的文件。T10 的两项优化是独立提交，可按项单独撤销。
