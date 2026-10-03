# 新来源证据登记补正

main `0d77ee312520a7806085d448acee63f08728c214` 的自动 [CI 37118755535](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/37118755535) 已失败。Linux / Windows 的来源索引与类型检查步骤成功；lint 步骤在 `run-quality.mjs` 的证据完整性前置检查报告 `Frozen evidence inconsistent (42)`，语言 lint 工具尚未运行。随后格式、架构、CLI 构建及离线产品回归跳过，均不记为通过。

遗漏是本整合任务接收新 CLI / native / services 资料和原始响应后没有补登记新增文件。本次仅向 `licensing/frozen-evidence.json` 追加这 42 份确切文件的 SHA-256、字节数及它们实际进入 Git 的 sourceCommit；每份完整字节与该提交 blob 对照后登记。原有 5674 条记录、旧 SHA/字节数、baselineCommit、原始证据及检查器保持原状；不修改独占生产文件。

登记只是固定实际保留字节，不构成原创、权利、许可验收或独立性决定。已有 Apache / MIT / 第三方声明、26 项历史材料记录及未解决事实保持；不把私有工具链的失败响应、未合入提案或来源相同当作新的权利确认。

本次只对新增记录、旧登记保留关系及受影响身份描述做有界对账。本地未执行全套证据检查、测试、lint、类型检查、构建或完整审计；没有重跑失败 CI。后续自动 CI 对各自确切 SHA 的实际结果另行报告。
