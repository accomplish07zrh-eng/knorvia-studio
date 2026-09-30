# 并行切片整合检查

设备身份与完整 FileSystemPort 已提交 `fd2fed2`。审查并无冲突接入：services `8c412427…`/`5a0def9b…` → `f7076fb`/`98b886b`，protocol `0639cf67…`/`5277f807…` → `0cd04ef`/`1162786`，进程 QA `ffe064c2…` → `fe908b9`。各原提交保持独立，可按序 revert；没有数据清理/转换、UI 修改、合并、部署或发布。

审查核对实际 diff、接口/Schema 不变、完整帧/分片错误优先、计量 callback 顺序、数组空槽/原对象引用、session title/变更端点聚合/MCP 实际条件，以及每调用绝对 deadline/root 去重/parser 边界。复用父任务独立 QA 的 services 8434 边界、protocol 6627 四方结果，不重复同宽度差分。它们的 Windows/macOS/浏览器 VM 是模拟，未称原生 UI 验证。

实际来源门先拒绝 `wire-codec.ts` 的旧 input binding。已核对 `8e8f631` 内容摘要与原输入 `a8a419e2…` 一致、当前实际修改 `ac1e36d4…` 与协议冻结实现证据一致，只更新这一 input；历史 copied-file digest、publisher/LICENSE/Microsoft 部分范围和全部 notices 不变。清单刷新不改生产 MIT review，严格门实际仍拒绝 27 材料。

重建 CLI 17/17（11 缓存），修改的两份 probe dist 与三份实际 wire source 在 CLI sourcemap 全部逐字节匹配；root shared emitted JS 和声明摘要一并记录。最新整合 root/CLI 类型、lint、格式/架构、离线 aggregate 与最终 SHA Linux/Windows CI 分别确认，见[整合证据](../licensing/evidence/parallel-integration-20260930.json)及同草稿 PR #7。旧提交通过结果不替代最新 SHA。

来源暴露/Apache/第三方范围继续保留。全库仍有大量来源未闭合文件，已登记覆盖约 11% 仅是文件账本指标，没有可靠工作量比例；见[余量](knorvia-migration-remaining-scope-20260930.md)。下一 Fast 实例接续当前工作区/同分支，不重做已完成切片，不变更全局或安全配置。
