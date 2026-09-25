# Knorvia Studio 批次验收与便携交付（T13）

2026-09-25。对应任务书 T13「综合桌面验收与批次发布」。本文件只记录实际执行的命令与结果；未执行项与例外在文末单列，未把 ACK、模型宣称或未运行的测试写成成功。

## 候选提交与版本

| 项目 | 值 |
| --- | --- |
| 批内功能清单 | T00 基线、T01 发布门禁、T02 测试稳定性、T03 升级/便携数据保护、T06 输出契约、T09 创作来源与只读核验 |
| 候选交付 SHA | `d142571b673aad0370df03aac0645542dfffe7da` |
| 版本 | `0.8.0-preview.2` |
| 交付时远端 | `origin/main` 已包含 `797a76e`…`d142571`（T01–T06、T09、T00 记录与回归修复） |

## 批次门禁（从仓库根执行，全部为真实结果）

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 退出 0（含 desktop main 的 project references 与中英文键校验） |
| `pnpm lint` | 退出 0，0 warnings / 0 errors |
| `pnpm fmt:check` | 退出 0，`All matched files use the correct format`（4474 文件） |
| `pnpm architecture:check` | 退出 0，`violations: 0 / baseline: 0 / new: 0` |
| `pnpm build:cli-packages` | 退出 0 |
| `pnpm test:studio` | 退出 0，**tests 608 / pass 608 / fail 0 / skipped 0** |

首轮全量回归曾出现 1 项失败（`file import rejects unknown versions…`）：T06 有意把工作流文件信封版本升到 2 并继续接受版本 1，而旧断言把版本 2 当作未知版本。已按“未知新版本必须拒绝”的原意改为断言“当前版本 + 1”被拒绝，并补充版本 1 与当前版本均可读取的正向断言（提交 `d142571`）；重跑 608/608 通过。

日志：`D:/tools.cache/knorvia-batch1-full-checks.log`、`D:/tools.cache/knorvia-batch1-full-checks2.log`。

## 升级夹具与数据保护

- `pnpm exec tsx --test packages/services/test/studio-upgrade-protection.test.ts` → 11 通过 / 0 失败（迁移幂等、记录/完成节点/审批保留、迁移不触发任务执行、迁移前一致备份、版本过新拒绝且零写入、注入失败可重试、中断后恢复、不可写目标、新库不备份）。
- `packages/desktop/test/portable-upgrade-preserves-data.test.ts` → 3 通过 / 0 失败，其中一个用例真实调用 `scripts/deliver-portable.ps1` 在模拟目录上端到端复核，并含反例对照证明该检查非空转。

## 便携包交付（本次真实执行）

构建命令（`KNORVIA_ENV=production`、`KNORVIA_PORTABLE_BUILD=1`、`KNORVIA_SKIP_REMOTE_ASSETS=1`）：

```text
node packages/desktop/scripts/bundle.mjs --os win --arch x64
```

- 构建退出 0，用时约 13 分 41 秒（electron-builder 821 秒）。
- 产物目录 `packages/desktop/dist/win-unpacked` 含 `resources/knorvia-portable.json`（`product=Knorvia Studio`，`dataDirectory=data`）。
- 安装包：`packages/desktop/dist/Knorvia Studio-0.8.0-preview.2-win-x64.exe`，150 020 779 字节（143.1 MiB，低于 500 MiB 上限）。
- 交付脚本：`pwsh -NoProfile -File scripts/deliver-portable.ps1 -Source <win-unpacked> -Target "C:\Users\17018\Desktop\Knorvia Studio Portable"`，退出 0。

交付脚本输出（原文）：

```text
Portable data before: 429 files, 54742994 bytes
Portable data verified: 429 files, 54742994 bytes, SHA-256 identical; robocopy code 3
Program files verified: 118 SHA-256 identical to the build
Delivered executable SHA-256: 974BC623F0857967749546014027A619B0A65070A7CCFE5F5C0A4730EAA8D44A
```

交付后 `构建校验.json`：

```json
{
  "target": "C:\\Users\\17018\\Desktop\\Knorvia Studio Portable",
  "product": "Knorvia Studio",
  "version": "0.8.0-preview.2",
  "dataFiles": 429,
  "dataDirectories": 214,
  "dataBytes": 54742994,
  "dataUnchanged": true,
  "programFilesVerified": 118,
  "exeSha256": "974BC623F0857967749546014027A619B0A65070A7CCFE5F5C0A4730EAA8D44A",
  "asarSha256": "6F06ECB386F85427AF7F0C0B88F0B46382DAD3E1014584EBCC87BEE9107BF8F7",
  "verifiedAt": "2026-09-25T10:26:04.4822605+00:00"
}
```

交付包内 `resources/app.asar` 的 `package.json` 为 `@knorvia/desktop` / `0.8.0-preview.2` / `main=out/main/index.js`，与源码构建产物一致。

### 便携包打开与数据保留验证

启动交付后的 `Knorvia Studio.exe`：

| 观察项 | 结果 |
| --- | --- |
| 启动后 45 秒进程 | 存活，共 6 个 “Knorvia Studio” 进程（Electron 主进程 + 渲染/辅助进程） |
| 启动前 `data` | 429 文件 / 54 742 994 字节 |
| 启动后 `data` | 430 文件 / 54 775 671 字节 |
| 丢失文件 | **0** |
| 新增文件 | 1（`profile\session\DIPS-wal`，Chromium 会话数据） |

结论：便携包可以打开，覆盖只更新程序文件；`data` 中已有用户文件一个都没有丢失，启动只新增了 Chromium 会话文件。

## 交付物哈希

| 产物 | SHA-256 |
| --- | --- |
| `Knorvia Studio.exe`（便携目录内） | `974BC623F0857967749546014027A619B0A65070A7CCFE5F5C0A4730EAA8D44A` |
| `resources/app.asar`（便携目录内） | `6F06ECB386F85427AF7F0C0B88F0B46382DAD3E1014584EBCC87BEE9107BF8F7` |
| 安装包 `Knorvia Studio-0.8.0-preview.2-win-x64.exe` | `34528F0B596A06A0A26CD72031F7C9757AD0A20BD945EE9175BA8551F5E9E020` |

## 故障矩阵覆盖情况（如实）

| 场景 | 覆盖方式 | 状态 |
| --- | --- | --- |
| 重复请求 / 幂等 | `release-gate.test.ts`（同版本重跑）、T09 同 requestId 幂等与“同 ID 不同负载拒绝”测试 | 已覆盖 |
| 迁移中断 / 备份失败 / 不可写 / 版本过新 | T03 `studio-upgrade-protection.test.ts` | 已覆盖 |
| 文件应用未知结果、恢复锁、应用后断线 | 既有 `studio-workspace-recovery.test.ts`、`studio-runtime-polish.test.ts` 等；T05 的多选与接纳证据本轮未完成 | 部分覆盖 |
| 到期 / 取消 / 重启 / 重复触发（定时工作流） | T02 注入虚拟时钟的两个新用例 | 已覆盖 |
| 引用失效、越权引用 | T06 的非法/未知版本与超限拒绝；T07 的 Host 引用解析本轮未完成 | 部分覆盖 |
| 付费远端未知结果 | T09 `verifyJob` 只读核验、绝不自动重发（断言未发生第二次提交） | 已覆盖（未真机联网） |

## 未执行 / 例外（不得当作通过）

1. **真实完整路径未跑**：没有执行“选择内核 → 参数/权限检查 → 隔离执行 → 查验证据 → 用户接纳 → 重开核对”的端到端桌面交互，也没有调用任何真实模型或付费服务（无授权）。任务书要求该步“需要付费的部分必须先获得明确授权”。
2. **云端 CI 未运行**：`.github/workflows/*` 的改动只做了本地 YAML 解析与逻辑夹具验证，未在 GitHub Actions 上执行；分支保护与必需检查需要仓库管理员配置（见 `docs/knorvia-release-admin-rules.md`）。
3. **交付脚本关闭方式**：本次用 `taskkill` 关闭便携应用，优雅关闭未生效后使用了强制终止；已验证 `data` 无文件丢失，但强制终止不是正常退出路径。
4. **安装包未做安装/卸载向导验证**，也未做代码签名（未申请证书，安装包未签名，可能出现 SmartScreen 提示）。
5. **本轮未纳入的任务**：T04、T05、T07、T08、T10、T11、T12 未在本交付 SHA 中完成（详见 `docs/knorvia-taskbook-execution-record.md`）。这些能力既未宣称可用，也没有以“实验开关”形式对外露出。
6. 环境偏差：本机 Node 为 `v26.3.0`，`mise.toml` 固定 `24.14.0`；`node_modules/ssh2` 的可选 crypto 原生绑定在 Node 26 下编译失败（可选绑定，安装整体退出 0）。以上差异未在 Node 24.14.0 上复验。

## 回滚

1. 程序回退：用上一版已验证的 `win-unpacked` 重新执行 `scripts/deliver-portable.ps1` 覆盖程序文件；`data` 按脚本比对保证不被替换。
2. 数据恢复：应用完全退出后，用 T03 生成的 `<db>.pre-<起点>.<时间戳>.bak` 覆盖回数据库并清除 `-wal`/`-shm`；步骤见 `docs/knorvia-upgrade-protection-report.md`。
3. 代码回退：按任务分别回退对应提交（`797a76e` T01、`657a00b` T02、`d62c610` T03、`e4208d3` T06、`3dc3a62` T09、`d142571` 回归修复），代码回滚不自动撤销用户已应用的文件。
