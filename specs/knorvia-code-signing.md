# Knorvia Windows 代码签名准备

2026-10-05。当前只准备文档和来源证据；SignPath Foundation 申请待处理，尚未获准或启用签名。本次不发布版本、不部署官网，不修改产品代码、发布工作流、签名配置或账户安全设置。

## 产品规则与范围

- 计划申请 SignPath.io 免费开源签名服务及 SignPath Foundation 证书，为 Windows 安装程序、便携程序和通过应用更新入口下载的安装程序提供可验证的发布者身份。有效且受信任的 Authenticode 签名旨在替代 Windows 的 Unknown Publisher；不保证消除全部 SmartScreen 信誉、组织策略或其他系统警告。
- 只接受 `accomplish07zrh-eng/knorvia-studio` 公共仓库中可追溯源码，由该仓库 GitHub Actions 构建的稳定发行产物。不得提交本地构建、仓库外产物或第三方现成二进制的签名请求。
- 计划范围为项目构建的 Windows setup EXE、portable EXE，以及便携 ZIP 内由项目源码构建的 Knorvia 应用程序。ZIP 是分发容器，不宣称 ZIP 文件自身获得 Authenticode 签名；Electron、原生工具、DLL 等上游可执行文件保留各自签名及归属，不使用本项目证书重新签名。更新入口使用同一 setup EXE，不另设更新发布者。
- 保留 Apache-2.0、NOTICE 和真实逐文件来源记录。当前仍有 ZCode 继承实现，不能把自维护身份写成已经全部独立；SignPath 对修改上游软件的条件必须在申请和实际签名前核验。

## 所有者、接口与批准

作者、复核者、批准者均为 [accomplish07zrh-eng](https://github.com/accomplish07zrh-eng)。该维护者负责本仓库源代码及构建脚本、复核外部贡献、核对发行内容，并在 SignPath 网站手动批准每个稳定发行的签名请求；不得使用自动批准替代此步骤。

公开政策由根 `CODE_SIGNING.md` 维护，使用英文。README 下载说明和官网源码中的下载链接区各添加一个简短的 `Code signing policy` 链接，指向该政策。保留官网现有黑白样式，不修改既有发行说明或部署线上页面。

政策必须明确显示申请待处理、尚未启用签名；以下是获准后的计划署名，不能单独呈现为现状：

> Free code signing provided by SignPath.io, certificate by SignPath Foundation.

正式请求的源码提交、构建来源、产品名、统一版本、精确产物及批准记录属于未来发布集成的输入。申请状态和是否启用由维护者核实后更新文档，不从期望配置推断成功。

## 当前隐私行为与证据

| 边界           | 当前源码事实及政策表达                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 更新检查       | `packages/shared/src/releaseUpdate.ts` 指定项目 GitHub Releases API；`packages/desktop/src/main/releaseUpdateCheck.ts` 默认检查，使用不带凭据的 GET，无聊天、工作区或用户文件请求体。GitHub 仍可处理 IP、请求时间和普通连接元数据，不得写成完全离线或零数据传输。         |
| 更新设置       | `packages/ui/src/settings/ReleaseUpdateSettings.tsx` 提供关闭及自定义来源；位于 Settings > General > Updates。空来源继续使用官方 GitHub 源。自定义服务适用其自身隐私政策。                                                                                                |
| 一键更新       | `releaseUpdate.ts` 只允许 HTTPS 的 github.com、objects.githubusercontent.com、release-assets.githubusercontent.com；`releaseUpdateInstall.ts` 对重定向再次核验并在启动前比较 SHA-256。此限制针对应用内一键安装下载，不代表所有模型、插件或浏览器网络请求都只访问 GitHub。 |
| 模型和其他服务 | `apps/cli/packages/adapters/src/model/model-execution.ts` 使用用户选择和配置的模型供应商、地址及认证，供应商 SDK 可使用默认地址或环境认证。模型、创作、远端工作区、外部 CLI、MCP、插件和浏览器可能按用户操作发送相关内容，适用相应服务的隐私政策。                        |
| 遥测           | `apps/cli/packages/telemetry/src/bootstrap.ts` 同时要求 KNORVIA_MODEL_TELEMETRY_ENABLED=1 和有效 trace OTLP endpoint。可配置独立 trace/metrics endpoint，通用 endpoint 派生 /v1/traces、/v1/metrics。`otlp-exporter.ts` 使用这些配置，不能概括成只发送到一个地址。        |
| 项目收集端     | Desktop main 的 appTelemetryCore 是空实现，`config/default.json` 为空；本地数据与诊断不等于自动上传。政策说明没有默认项目遥测收集端，同时保留更新连接元数据及用户配置网络服务的上述例外。                                                                                 |

必要第三方链接为 [GitHub 隐私声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)。动态配置的模型、MCP、插件、外部 CLI 和 OTLP 服务没有一个通用隐私承诺，应查阅用户实际选择服务的政策，不罗列无条件使用的供应商。

## 资格核验与未确认项

以 [SignPath Foundation 条件](https://signpath.org/terms) 为准。GitHub MFA 已由用户确认启用；不宣称已独立检查账户状态。SignPath MFA、项目信誉接受、服务批准与签名配置尚未确认。

`FORK-NOTES.md` 公开记录 ZCode 来源和固定提交，来源清单保留上游匹配；GitHub fork 标记为 false 不能单独证明满足或违反上游规则。还需确认适用的上游签名发行、来源分支及贡献复核证据。不能将基础来源检查通过当作完全独立或全部许可材料已收口。

源码保留 Windows Chrome App-Bound 导入 helper。默认准备脚本仅在 KNORVIA_ENABLE_WINDOWS_BROWSER_IMPORT=1 时构建，现有打包资源清单没有该 helper；不能据其保留源码断言当前 Windows 产物含此功能。此实现的签名资格与未来启用必须另行审查，本次不签名或启用它。

默认更新请求仅获取发行元数据；当前安装器未发现针对该检查的隐私展示或安装阶段关闭选项。SignPath 的安装披露条件涉及向非用户指定系统传送用户数据，普通连接元数据是否触发该条件仍需明确，不能把设置中的关闭开关说成安装阶段选项。任何明确不满足的条件在实际申请或签名前必须解决。

## 未来实施边界

本次不实现以下工作：

1. 将 SignPath 请求、来源核验、产品/版本限制、人工批准、签名产物下载与发行校验集成到稳定发布流程。批准前禁止把未签名产物标成已签名，签名后重新生成真实校验值和发行元数据。
2. 在更新安装程序启动前验证 Authenticode 链、签名状态及预期签名者身份。现有 SHA-256 比较不构成签名者认证；未来必须在 Main 的启动边界拒绝无效、不受信任或非预期签名者，并明确失败状态。不能提前把该保护写成现有能力。

```text
公共源码提交 → GitHub Actions 构建 → SignPath 来源核验
    → 维护者在 SignPath 网站批准 → 签名产物 → 发行校验与发布
更新（未来）：用户确认 → Main 下载 → SHA-256 → Authenticode/签名者核验 → 启动
```

## 本次验收

- 先写本规格，再写英文政策和两处短链接；署名原句、角色、范围、待处理状态与隐私表述一致。
- 最终 diff 只包含规格、政策、README、官网链接及工具派生的 tracked 来源指纹；无代码、工作流、签名配置、账户资料或凭据。
- 执行 pnpm fmt:check、node scripts/provenance/cli.mjs、node scripts/provenance/cli.mjs --check、pnpm lint、pnpm typecheck，报告各自真实退出码。刷新来源清单不改写既有复核决定或上游基线。
- 中文提交、GitHub noreply 提交身份，隔离分支推送并合并 main；核验 main 上政策公开可读。本次不创建发行、不改历史发行、不部署官网、不提交申请。
