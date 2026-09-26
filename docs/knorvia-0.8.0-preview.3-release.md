# Knorvia Studio 0.8.0-preview.3 交付记录

版本：`0.8.0-preview.3` ｜ 构建提交：`f8d1b22` ｜ 整理日期：2026-09-26

## 为什么升版本

远端 `v0.8.0-preview.2` 已指向旧基线 `bcc63b6`。按 `specs/knorvia-release-gates.md` 规则 7
（同版本不可变），当前这批代码**不能**再发布到那个标签上；因此把根 `package.json` 升到
`0.8.0-preview.3`。**原标签与附件保留不动**，不删除、不覆盖、不使用 `--clobber`。

历史文档里出现的 `0.8.0-preview.2` 是对当时构建的记录，不随版本升级改写。

## 交付物

交付位置：`C:\Users\17018\Desktop\Knorvia Studio Portable`（程序文件覆盖，`data` 原样保留）。

| 交付物                                              | 大小             | SHA-256                                                            |
| --------------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| `Knorvia Studio.exe`                                | 222 899 200 字节 | `C5C18176BD4D5C48AB8D7ECC37440996588C1355BF200AE859C70D65C52D0D94` |
| `resources/app.asar`                                | 291 635 187 字节 | `2A898E9F6728FF00ADDBF010D2F57869C7464F4D2CECCED497B0ABDFA8F3D1F9` |
| 安装包 `Knorvia Studio-0.8.0-preview.3-win-x64.exe` | 150 126 938 字节 | `2F3F019A7BFA079A9260804A4F9034FDEBBCC7F8BFC782329302C1A441954B3A` |

> 本记录先后覆盖三次构建：`94805dd`（首次交付，exe `F0F24D87…8356ED`）、`f357ed4`
> （补上创作媒体交接等服务层改动）、`f8d1b22`（补上输出契约派发、创作参考图受控读取与
> 界面重开核验后的重新交付）。**上表为当前交付物**；三次都保留了 `data` 不动。

## 交付校验（`scripts/deliver-portable.ps1` 的真实输出）

```text
Portable data before: 431 files, 54930656 bytes
Portable data verified: 431 files, 54930656 bytes, SHA-256 identical; robocopy code 3
Program files verified: 118 SHA-256 identical to the build
Delivered executable SHA-256: C5C18176BD4D5C48AB8D7ECC37440996588C1355BF200AE859C70D65C52D0D94
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

用本版 `win-unpacked`（去掉便携标记的副本）重跑**三个**脚本，全部通过：

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

`node scripts/t13-workflow-acceptance.mjs` → **6/6 PASS**（工作流界面，本版构建）

```text
PASS 工作流界面可达：侧栏进入工作流页、选中种子工作流、找到「运行工作流」入口
PASS 从界面发起运行：运行对话框提交，请求只到达回环夹具
PASS 参数/权限检查：人工批准节点与写文件的工具调用都触发审批，显式批准后才继续
PASS 真实执行：工作流在打包应用里跑完，运行历史显示「已产出」，工具结果回到模型
PASS 用户接纳：界面里应用修改后，真实项目按隔离快照内容被写入
PASS 重开核验：关闭应用后用同一数据根重开，运行历史与已产出仍在，且未重新执行
```

这条脚本补的是「盘点 → 人工批准 → 整理 → 查看修改 → 接受文件」的**界面级**验收：
种子工作流从侧栏进入、在运行对话框里发起、显式批准人工批准节点与工具副作用、
整理节点经**真实工具调用**在隔离工作区写出 `docs/cleanup.md`、运行历史显示「已产出」，
最后在修改审阅里应用该文件并核对真实项目被写入，**然后真的关掉应用、用同一数据根重开**，核对运行历史与「已产出」仍在且没有重新执行。

两次运行全程只连 `127.0.0.1`，数据根都在临时目录并在结束后删除；真实便携目录未被触碰。

## 未验证（如实）

- ~~云端 CI 是否转绿未验证~~ **已通过（据用户核对）**：最新提交 `65191fe` 对应
  **`Studio offline checks #83`，运行编号 `36230025967`，结果 `success`**；Linux 与 Windows 的
  质量检查、构建与离线回归均已通过。（`e82e9f3` 的 #76 `36224595039` 是更早一次，不作为本次依据。）
  **注意区分**：这是离线检查，**不是**一次 Windows 发布工作流的完整 dry run；发布侧仍需一份固定 SHA 的
  「检查 → 打包 → `validate-release`」成功记录，正式发布再由明确的发布操作放行。
- 本执行环境**读不到 GitHub Actions**（未安装 `gh`）；仓库当前为**公开**（`private: false`），
  先前「仓库私有」的说法已更正。
- 未做真实模型、真实 CLI/ACP 内核、真实 SSH、真实付费调用（未获授权）。
- **未做代码签名**（无证书）。未签名版本**可能**受到 SmartScreen 或系统策略提示、限制；
  是否出现提示与二进制信誉和系统策略有关，签名也不保证新二进制立即没有提示。
  安装向导、安装后启动与卸载验证属于**独立记录项**，不受签名阻塞，应在隔离环境单独验收。
- `main` 分支保护未配置（需仓库管理员，见 `docs/knorvia-release-admin-rules.md`）。
- 创作成果的跨隔离交接已在服务层跑通，并有**真实 CreationService + 回环供应商 + 真 PNG 字节**的用例
  （`studio-workflow-media-loopback.test.ts`：创作 → Agent、创作 → 创作参考图两类消费者），
  但**创作媒体路径未在界面上**跑（工作流界面验收目前只覆盖文档路径）。
- 文档路径既在服务层（`studio-workflow-delivery-path.test.ts`）也在打包应用的工作流界面上跑通了。
- **交付包与源码的一致性**：当前交付包构建自 `f8d1b22`，与 `main` 在**程序行为上一致**
  （`f8d1b22` 之后仅有文档提交）。若之后再改服务层/界面代码，必须重新构建并重新交付。

## 回滚

程序文件回退：重新解压 `0.8.0-preview.2` 的构建产物覆盖程序文件即可；`data` 不受影响。
数据回退：交付过程对 `data` 只有“不触碰”的义务，没有任何写入，因此无需回退。
