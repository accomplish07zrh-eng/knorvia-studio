# M0 桌面打包实测：Windows 安装版与便携版（2026-10-12）

**执行：** exec-5 · **工作树：** `D:\knorvia studio开发\wt\exec-5-pkg` · **分支：** `m0/desktop-packaging-check`
**主仓提交：** `6ea4cbe751a3d4b35d08460151eed758f5a76ac8`（执行基线 `beff12b5` 之后的 main 顶端）
**节点版本：** Node 24.14.0（`mise.toml` 固定版本，经 `toolchain/pnpm24.ps1` 运行；本机 PATH 上是 Node 26）

## 一、结论

| 项目                                                       | 结果                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Windows NSIS 安装版产物                                    | ✅ 产出 `Knorvia-Studio-0.11.4-win-x64-setup.exe`（152.7 MB）                                                                           |
| Windows 便携版产物                                         | ✅ 产出 `Knorvia-Studio-0.11.4-win-x64-portable.zip`（227.6 MB）与自解压启动器 `Knorvia Studio-0.11.4-win-x64-portable.exe`（128.7 MB） |
| 便携版官方验收 `desktop-release-acceptance.mjs … portable` | ✅ **passed**（12 项检查，含「实际便携产物启动打包后的 Electron 窗口两次」）                                                            |
| 安装版官方验收 `… installed`                               | ⚠️ **failed**：12 项检查通过，最后一步**静默卸载**失败 `Uninstaller exit 1223`（`ERROR_CANCELLED`）                                     |
| 安装版实机启动                                             | ✅ 手动静默安装（ASCII 路径）exit 0，启动后 1.97s 出窗口、6.77s 渲染出首次引导界面（截图见证据），无白屏、无崩溃                        |
| 便携版实机启动                                             | ✅ 由官方验收脚本完成两次真实启动（含 portable marker 与 profile 位置断言）                                                             |

安装版验收唯一失败项是**非交互会话下的静默卸载**：NSIS 卸载器在本机需要交互/提权，`/S` 静默模式下返回 `1223`（用户取消）。官方验收脚本与手动复现各 2 次，共 4/4 一致。这不是打包产物缺陷，但**卸载路径本次未验证通过**，如实列出。

## 二、为让打包可跑通做的一处最小修法

`packages/desktop/electron-builder.config.js` 的 `afterPack:copy-runtime-modules` 钩子里用的是
`fs.cpSync(source, target, { recursive: true })`。本机 Node 24.14.0 + Windows 上这个 API **必崩**：

```text
⨯ Exit code -1073740791（0xC0000409 STATUS_STACK_BUFFER_OVERRUN），无任何 JS 异常与栈
   [ci][timer] afterPack:copy-runtime-modules start   ← 崩溃点，4/4 复现
```

**最小化诊断**（只读脚本，见证据目录）：

| 试验                                                         | 结果                                     |
| ------------------------------------------------------------ | ---------------------------------------- |
| `copyFileSync`（单文件）                                     | ✅ 正常                                  |
| `cpSync`（非递归）                                           | ✅ 正常                                  |
| 手工迭代拷贝（`readdirSync` + `mkdirSync` + `copyFileSync`） | ✅ 正常                                  |
| `fs.promises.cp(dir, dest, { recursive: true })`             | ✅ 正常                                  |
| `cpSync(dir, dest, { recursive: true })`                     | ❌ 崩溃（连只有 4 个文件的普通目录也崩） |

**修法：** 只把这一处递归拷贝换成等价的异步实现 —— `runTimedSync` → `await runTimedAsync`、
`cpSync(...)` → `await cp(...)`，并加中文注释写明崩溃原因。没有删步骤、没有改判据、没有放宽任何检查。
注释里写明：**`desktop-scripts-01`（M4）会按合同重写该脚本**，本修法只为让 M0 打包实测可跑通。

## 三、命令与结果（原样）

```powershell
# 1) 干净 main 工作树
git worktree add -b m0/desktop-packaging-check "D:\knorvia studio开发\wt\exec-5-pkg" origin/main
cd "D:\knorvia studio开发\wt\exec-5-pkg"
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" install --frozen-lockfile      # ✅ 57.8s

# 2) CLI 包（本机需绕过 Node fetch 对 GitHub 的超时，见第五节阻塞 1）
$env:KNORVIA_CUA_DRIVER_ARCHIVE="D:\knorvia studio开发\.fixtures\cua\cua-driver-rs-0.30.1-windows-x86_64-binary.zip"
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" build:cli-packages              # ✅ 17/17

# 3) 安装版：electron-builder（本机需绕开 Electron 压缩包下载，见阻塞 2；正式身份需 KNORVIA_ENV=production）
cd packages\desktop
$env:KNORVIA_ENV="production"; $env:HTTP_PROXY="http://127.0.0.1:7897"; $env:HTTPS_PROXY="http://127.0.0.1:7897"
& "D:\knorvia studio开发\toolchain\pnpm24.ps1" exec electron-builder --config electron-builder.config.js --win --x64 `
  "-c.electronDist=D:\knorvia studio开发\.fixtures\electron-dist-41.0.3"     # ✅ 产出 dist\Knorvia Studio-0.11.4-win-x64.exe

# 4) 组装发行产物（安装版 + 便携版 zip + 校验和）
pwsh -NoProfile -File scripts\package-windows-release.ps1 `
  -DistPath "packages\desktop\dist" `
  -OutputDirectory "D:\knorvia studio开发\.fixtures\win-release" `
  -DeliveredSha 6ea4cbe7…                                                     # ✅ release-artifacts.json

# 5) 便携版自解压启动器（CI 用 KNORVIA_PORTABLE_BUILD=1）
$env:KNORVIA_PORTABLE_BUILD="1"
& "…pnpm24.ps1" exec electron-builder --config electron-builder.config.js --win --x64 `
  "-c.electronDist=D:\knorvia studio开发\.fixtures\electron-dist-41.0.3"     # ✅ Knorvia Studio-0.11.4-win-x64-portable.exe

# 6) 官方验收（隔离 profile，避免碰真实用户数据）
node scripts/desktop-release-acceptance.mjs <portable-out> <sha> portable     # ✅ passed
node scripts/desktop-release-acceptance.mjs <installed-out> <sha> installed   # ⚠️ 12 项过，静默卸载 1223
```

## 四、产物与校验（`release-artifacts.json`）

| 文件                                                   | 大小     | sha256                                                             |
| ------------------------------------------------------ | -------- | ------------------------------------------------------------------ |
| `Knorvia-Studio-0.11.4-win-x64-setup.exe`              | 152.7 MB | `f3fab3e20a4dbbccda7ef8ddb7676713a305a1af32059e236c2e6fff1730ed5c` |
| `Knorvia-Studio-0.11.4-win-x64-portable.zip`           | 227.6 MB | `0d506d2ed8378f48a433374365b2a5937f410110409795a6457ab69cbeabb4d2` |
| `Knorvia Studio-0.11.4-win-x64-portable.exe`（自解压） | 128.7 MB | 由 CI 的 portable 变体产出                                         |

签名状态：未创建签名凭据，`signtool.exe` 步骤按无证书路径执行（与 `docs/desktop-release-installation.md` 一致）。

## 五、本机环境阻塞与绕过（都不是仓库问题）

1. **CUA 驱动下载**：`apps/cli/packages/cua-plugin` 的 build 用 Node `fetch` 拉 GitHub release，本机必超时（120s）；
   PowerShell 直接下载同一 URL 正常（HTTP 200，30.7 MB）。绕过：脚本自带的 `KNORVIA_CUA_DRIVER_ARCHIVE=<本地 zip>`
   （脚本会校验整包 SHA-256 `96ebb5…80be`，实测一致）。
2. **Electron 压缩包**：electron-builder 要下 `electron-v41.0.3-win32-x64.zip`，仓库默认镜像 npmmirror 返回 `EOF`、
   官方 GitHub 镜像停滞。绕过：`-c.electronDist=<由本机 `%LOCALAPPDATA%\electron\Cache` 里官方 zip 解出的 41.0.3 目录>`
   （该 zip 带 `LICENSE` 与 `LICENSES.chromium.html`；直接用 `node_modules/electron/dist` 会因缺这两个文件在 `afterExtract` 失败）。
3. **本地代理**：WinINET 配了 `127.0.0.1:7897`（PowerShell 默认走它），Node 的 fetch 与 app-builder（Go）默认不走，
   所以上面 1、2 在它们那里挂住。显式 `HTTP(S)_PROXY=http://127.0.0.1:7897` 后下载类失败消失。
4. **产品身份**：不带 `KNORVIA_ENV=production` 时（本机无 mise 注入），身份默认是 **Preview**，产物名是
   `Knorvia Studio Preview-*`，而 `scripts/package-windows-release.ps1` 只认 `Knorvia Studio-*`，会报「Missing build artifact」。
   必须 `KNORVIA_ENV=production` 重建才能与发行脚本对齐。
5. **非 ASCII 安装路径**：NSIS `/D=` 指向含中文的路径时静默安装返回 `1223` 且不落地；换成纯 ASCII 路径后 exit 0。
6. **Node 版本**：本机 PATH 是 Node 26.3.0，`mise.toml` 固定 24.14.0；本次全部用 `toolchain/pnpm24.ps1`（Node 24.14.0）运行。

## 六、实机启动证据

- **安装版**：静默安装到 ASCII 路径 exit 0 → 用 Playwright `_electron` 启动 `Knorvia Studio.exe`（隔离 `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`）：
  窗口标题 `Knorvia Studio`、1.97s 出首窗、6.77s 命中就绪标记 `[data-testid="onboarding-page"]`，
  截图 1800×1200（首次引导界面，无白屏/无崩溃）。未登录、未连接任何模型。
  证据：`.issues/pkg-evidence/installed-launch.png` 与 `installed-launch.json`。
- **便携版**：官方验收脚本完成两次真实启动（`Actual portable artifact starts a packaged Electron window twice
without explicit Knorvia profile overrides`），并断言 portable marker 与 `data/` 位置。

## 七、未验证项（如实列出，不假装通过）

- **静默卸载**：4/4 次返回 `1223`（非交互会话下 NSIS 卸载器需要交互/提权），卸载路径**未验证通过**；
  安装目录为本次临时目录，已手动清理，注册表未留下 `Knorvia` 卸载项。
- **交互式安装器界面**：未人工点选（只跑了静默安装）。
- **macOS 打包**：未执行（本机 Windows）。
- **Linux 打包**：未执行（本机 Windows；CI 有 linux-x64 变体）。
- **真实模型任务**：未执行（按要求不登录、不连模型）。
- **旧用户数据迁移**：未执行。

## 八、证据文件

- 报告：本文件（`docs/knorvia-desktop-packaging-m0-20261012.md`）
- 验收报告：`<win-release>/win-x64-installed-acceptance.json`、`<win-release>/win-x64-portable-acceptance.json`
- 实机启动：`.issues/pkg-evidence/installed-launch.png`、`.issues/pkg-evidence/installed-launch.json`
- 构建日志：`.issues/pkg-bundle*.log`、`pkg-eb*.log`、`pkg-portable-build.log`、`pkg-accept-*.log`
- 崩溃最小化诊断：`.issues/diag-copy-runtime.mjs`、`.issues/diag-cp-minimal.mjs`、`.issues/diag-cp-api.mjs` 及其日志
- 产物目录：`D:\knorvia studio开发\.fixtures\win-release`（含 `release-artifacts.json` 与校验和）
