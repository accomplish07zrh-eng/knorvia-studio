# Knorvia Studio 0.8.0-preview.3 交付记录

版本：`0.8.0-preview.3` ｜ 构建提交：`f357ed4`（其后仅文档提交 `c110512`，不影响程序行为） ｜ 整理日期：2026-09-26

## 为什么升版本

远端 `v0.8.0-preview.2` 已指向旧基线 `bcc63b6`。按 `specs/knorvia-release-gates.md` 规则 7
（同版本不可变），当前这批代码**不能**再发布到那个标签上；因此把根 `package.json` 升到
`0.8.0-preview.3`。**原标签与附件保留不动**，不删除、不覆盖、不使用 `--clobber`。

历史文档里出现的 `0.8.0-preview.2` 是对当时构建的记录，不随版本升级改写。

## 交付物

交付位置：`C:\Users\17018\Desktop\Knorvia Studio Portable`（程序文件覆盖，`data` 原样保留）。

| 交付物                                              | 大小             | SHA-256                                                            |
| --------------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| `Knorvia Studio.exe`                                | 222 899 200 字节 | `C62B73B89FD07F69C3D60A4E7620CFEA246E278664FFFEEE0948F647776C7487` |
| `resources/app.asar`                                | 291 632 187 字节 | `00E2CD2382DBEFAC4009E2D183C6CFBBB0E917DB375AFD590537FFD6B80F3494` |
| 安装包 `Knorvia Studio-0.8.0-preview.3-win-x64.exe` | 150 072 776 字节 | `30482750B90E806F8E9F32CCB0268453351DCBEFB527119EFA28780C6974DB54` |

> 本记录先后覆盖两次构建：`94805dd`（首次交付，exe `F0F24D87…8356ED`）与 `f357ed4`
> （补上创作媒体交接等服务层改动后的重新交付，上表为**当前**交付物）。两次都保留了 `data` 不动。

## 交付校验（`scripts/deliver-portable.ps1` 的真实输出）

```text
Portable data before: 431 files, 54930656 bytes
Portable data verified: 431 files, 54930656 bytes, SHA-256 identical; robocopy code 3
Program files verified: 118 SHA-256 identical to the build
Delivered executable SHA-256: C62B73B89FD07F69C3D60A4E7620CFEA246E278664FFFEEE0948F647776C7487
```

`构建校验.json`：`version=0.8.0-preview.3`、`dataFiles=431`、`dataUnchanged=true`、
`programFilesVerified=118`。交付后 `data` 仍为 431 文件——**用户数据逐字节未变**。

这次交付同时是 `deliver-portable.ps1` 路径处理修复（见 `94805dd` 之前的 `a3c9c7f`）在真实交付上的验证：
脚本不再用 `FullName.Substring($root.Length + 1)` 算相对路径，118 个程序文件全部核对通过。

## 构建环境

- Node `v24.14.0`（`mise.toml` 固定；使用本机下载的官方 Node 而非系统 Node 26）
- `KNORVIA_ENV=production`、`KNORVIA_PORTABLE_BUILD=1`、`KNORVIA_SKIP_REMOTE_ASSETS=1`
- 构建命令：`node packages/desktop/scripts/bundle.mjs --os win --arch x64`
- electron-builder 耗时 988 328 ms；产物 143.1 MiB（上限 500 MiB）

## 本机质量门禁（构建前，提交 `94805dd`）

`pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`、`pnpm architecture:check`（0 violations）、
`pnpm build:cli-packages` 全部退出 0；`pnpm test:studio` **784/784 通过 0 失败**。

## 交付后在**本版构建**上重跑的桌面端到端验收

用本版 `win-unpacked`（去掉便携标记的副本）重跑两个脚本，全部通过：

`node scripts/t13-desktop-acceptance.mjs` → **8/8 PASS**

```text
PASS 选择内核/供应商与模型：打包界面保存成功，且未产生任何请求
PASS 真实发送：消息经真实运行时发出，只到达回环夹具
PASS 参数/权限检查：写文件的工具调用触发权限门禁，脚本显式批准后才继续
PASS 真实工具执行：夹具的 Write 调用经真实运行时执行并落盘（t13-probe.txt，hello from t13）
PASS 会话继续：第二轮消息同样只到达回环夹具并收到回复
PASS 停止：停止按钮中止了在途请求，停止控件随之收回
PASS 会话与配置写入本地数据根
PASS 重开核对：引导不再出现，上一轮消息与回复仍在本地存储，供应商配置仍在
```

`node scripts/t13-isolated-workspace-acceptance.mjs` → **6/6 PASS**

```text
PASS 选择内核与项目：在群聊页选中种子群聊（workspaceMode=isolated，指向真实项目）
PASS 参数/权限检查：写文件的工具调用触发群聊审批，显式批准后才继续
PASS 隔离执行：写入落在隔离快照 .knorvia-studio\studio\workspaces\<hash>\working\notes.txt
PASS 项目保护：真实项目文件未被直接改写，README 内容不变
PASS 差异审阅：复核面板已出现（群运行进入复核阶段）
PASS 用户接纳：应用后真实项目文件按隔离快照内容被写入
```

两次运行全程只连 `127.0.0.1`，数据根都在临时目录并在结束后删除；真实便携目录未被触碰。

## 未验证（如实）

- **云端 CI 是否转绿未验证**：本机无法访问 GitHub Actions（未安装 `gh`，仓库私有）。
  Windows 交付用例的失败条件已在本机复现并修复（`a3c9c7f`），但云端结果需下一次运行确认。
- 未做真实模型、真实 CLI/ACP 内核、真实 SSH、真实付费调用（未获授权）。
- 未做代码签名：安装包与 exe 未签名，首次运行会触发 SmartScreen。
- `main` 分支保护未配置（需仓库管理员，见 `docs/knorvia-release-admin-rules.md`）。
- 创作成果的跨隔离交接已在**服务层**跑通（`studio-workflow-file-handoff.test.ts` 的媒体副本用例），
  但工作流界面**未在打包应用上**验收。
- 文档路径的服务层端到端用例已通过（`studio-workflow-delivery-path.test.ts`），但同样**未在打包应用上**跑工作流界面。
- **交付包与源码的一致性**：当前交付包构建自 `f357ed4`（含创作成果跨隔离交接等服务层改动）；
  其后仅有文档提交 `c110512`，不影响程序行为。因此交付包与 `main` 在**程序行为上一致**。
  若之后再改服务层/界面代码，必须重新构建并重新交付，否则交付包会落后于源码。

## 回滚

程序文件回退：重新解压 `0.8.0-preview.2` 的构建产物覆盖程序文件即可；`data` 不受影响。
数据回退：交付过程对 `data` 只有“不触碰”的义务，没有任何写入，因此无需回退。
