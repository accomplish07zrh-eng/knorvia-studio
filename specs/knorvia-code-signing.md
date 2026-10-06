# Knorvia Windows 代码签名与下载校验

2026-10-06 更新：SignPath Foundation 免费开源签名申请因项目体量未获批准。用户决定暂不申请其他签名证书。本规格替代 2026-10-05 版本中"申请待处理"的表述。

## 产品规则

- 当前所有 Windows 安装版、便携版以及一键更新下载的安装程序均**未经 Authenticode 签名**。公开文档必须如实说明，不得暗示已签名或签名即将启用，也不得保留 SignPath 署名句。
- 用户通过每个发布附带的 `.sha256` 文件或 `SHA256SUMS` 校验下载文件；`CODE_SIGNING.md` 提供 Windows PowerShell 与 Linux 的校验命令，并说明首次运行可能出现"未知发布者"或 SmartScreen 提示。
- 一键更新继续在启动安装程序前比较 SHA-256；该校验与安装包来自同一发布，不构成发布者认证，文档不得将其写成签名校验。
- 隐私说明保留在 `CODE_SIGNING.md`，事实依据见下表。
- 以后若重新申请签名（例如项目规模增长后再次申请 SignPath，或购买个人证书），须先更新本规格再改公开文档与发布流程。

## 所有者

维护者 [accomplish07zrh-eng](https://github.com/accomplish07zrh-eng) 负责公开政策、发布内容与校验文件。`CODE_SIGNING.md` 为唯一公开政策；README 与官网下载区各保留一个指向它的短链接。

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

## 验收

- `CODE_SIGNING.md` 首段明确"未签名，请用 SHA-256 校验"，给出可直接复制的校验命令；不再出现申请待处理或 SignPath 署名句；隐私章节内容不变。
- README 与官网链接文字与现状一致，不宣称已签名。
- 执行 pnpm fmt:check、来源清单生成与 --check、pnpm lint、pnpm typecheck，并如实报告结果。
