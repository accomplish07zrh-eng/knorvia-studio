# core-tool-01 已知差异与既有缺陷（known-differences.md）

只登记**在旧实现上实测**、且重写时必须保持或明确处理的既存事实。每条写理由与对应测试；不为了通过而放宽断言。

## K1 `normalizeToolPathForComparison` 的非 win32 分支用的是宿主 `normalize`，不是 `path.posix.normalize`

- 事实：`path-normalization.ts` 的分支写成 `platform === "win32" ? normalizeWindowsToolPath(filePath) : normalize(filePath)`，其中 `normalize` 来自 `node:path`（即**宿主平台**的实现），而不是 `path.posix.normalize`。因此在 Windows 上调用 `normalizeToolPathForComparison("/c/Users/a", "linux")` 得到 `\c\Users\a`；在 Linux 上同一调用得到 `/c/Users/a`。
- 影响：同一份逻辑在不同宿主上对「显式传入非 win32 平台」的输入给出不同结果。生产调用方传的是默认值（当前平台），所以实际行为一致；只有显式把平台参数写成非宿主时才会暴露。
- 处理：**合同保留该现状**（B43 与 `pure.test.ts` 的 B43 用例按宿主 `normalize` 断言），重写时不得顺手改成 `path.posix.normalize`——那会改变 Windows 上的实际输出。是否修正留给单独的行为修复规格。
- 对应测试：`tests/pure.test.ts`「B43 normalizeToolPathForComparison normalizes per platform」。

## K2 `provider-visible-order` 的排序依赖 `localeCompare` 的 locale

- 事实：`orderProviderVisibleToolContracts` 用 `left.name.localeCompare(right.name)` 排序白名单内的工具名，不传 locale。工具名都是 ASCII，当前所有支持平台上结果一致；但 `localeCompare` 的默认 locale 由运行时决定，若将来出现非 ASCII 工具名，顺序会随 locale 变化。
- 影响：现在无可观察差异。
- 处理：合同只断言 ASCII 名字的顺序（B46 与对应测试），不宣称任意名字集合的排序稳定。
- 对应测试：`tests/pure.test.ts`「B46 orderProviderVisibleToolContracts sorts the reference set first」。

## K3 `edit-match-text.ts` 的 `visibleCharacters` / `unicodeCharacters` 不是幂等的

- 事实：展开后的文本可能再次包含可展开的转义序列（例如 `\\n` 展开成反斜杠 + `n`，再跑一次会变成换行）。
- 影响：调用方只能对原始输入调用一次；旧实现就是这样用的。
- 处理：合同记录该语义（B33、B34、B38），重写不得自行改成幂等。
- 对应测试：`tests/pure.test.ts` 的 B33、B34、B38 用例。

## 已在别处登记、本包不补偿的既有缺陷

- **`executor/timeout.ts` 的 handler 同步 throw 会绕过 timer 清理**：已由 `specs/knorvia-tool-deadline.md` 登记为「本次明确修复」，属**已独立替换**的文件（不在本包 32 文件内），本包不重复处理。
- **`executor/batch-runner.ts` 的 `executeSchedule` 转发漏掉 `offPeakTurn`**：已由 `specs/knorvia-tool-batch-execution.md` 登记为唯一预期修复，同样属已独立替换文件。
- 本包的 `executor/impl.ts` 只做装配与委托，不重复这两处修复。

## 待补

`acceptance.md` 与 `gate-old.json` 未完成；dist 入口的旧门未跑；B1–B15、B19–B20、B59–B67、B79–B84、B87、B88 的测试未写。这些都在 PR 描述里列明，不当作通过。
