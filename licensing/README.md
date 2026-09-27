# 文件来源与许可范围

当前版本的根许可证仍为 [Apache-2.0](../LICENSE)。本目录记录向独立 Knorvia 实现迁移的证据，不把尚未替换的实现改称 MIT。第三方声明继续见 [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)；已单独声明 MIT 的插件仍以包内正文为准。

`upstream-baseline.json` 固定最初使用的上游提交及逐文件摘要；`current-files.json` 覆盖当前工作区文件；`reviews.json` 保存绑定文件摘要的复核决定。工具说明和完成标准见 [独立实现规格](../specs/knorvia-independent-implementation.md)。没有匹配上游文件只代表需要审查，不代表原创。目录级第三方声明可能仅覆盖文件中的部分内容。

新编写的 `scripts/provenance/` 审计工具、REPL 编译与会话执行器、`core/src/browser-client/` 中的 SDK 与安装入口、bootstrap 浏览器协议与本地 IPC 转发器及对应的新契约测试，采用本目录 [MIT 许可](MIT.txt)。具体文件与摘要见 `reviews.json`。这不改变被审计代码、SDK 使用的协议契约、MCP 宿主和其他未确认文件的许可，也不表示应用已经完成独立替换。新增 Knorvia 代码应注明许可并记录来源；修改现有文件须保留仍适用的版权及许可，贡献者不得提交无权提供的代码、素材或凭据。

旧版发行记录、许可证及附件不追溯改写。

当前已验证范围见[迁移进展](../docs/knorvia-independence-progress-20260927.md)。

## 更新和检查

- 首次提取固定上游提交的摘要：`node scripts/provenance/cli.mjs --baseline-repo <仓库外的上游 Git 对象库>`。工具只读取该对象库，不联网或更新它。
- 审查文件改动及相应 `reviews.json` 决定后，运行 `pnpm provenance:report` 更新逐文件清单。
- Material Icon Theme 的精确来源证据在 `evidence/material-icon-theme.json`。重现命令：`node scripts/provenance/material-icons.mjs --source-repo <仓库外的发布者 Git 对象库> <输出 JSON>`；源提交固定，命令不会下载或替换图标。只有字节一致的项被确认为第三方 MIT，仍保留 Material Extensions 原许可；未知生成变体继续待审。
- `pnpm provenance:check` 检查已提交清单是否与当前文件一致，并拒绝过期或冲突的复核。UTF-8 文本允许 Git 检出的 CRLF/LF 差异，其他内容及二进制变化必须重新核验；报告的原始字节摘要和大小保留为采集时的证据。它通过仅代表清单新鲜，不代表全部文件已完成独立替换。
- `pnpm test:studio` 包含审计工具的离线回归。自动报告自身列为生成文件并明确不作自引用摘要，其余文件记录原字节和换行归一后的摘要。
