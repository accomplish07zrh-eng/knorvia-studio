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

## K4 v2 删桩：B88 的 oracle 从 `stubs/<路径>` 改指 `interface.md` 的 ```ts 导出声明块（Lead 裁决 C）

- 原因：替换验收的强制终态要求「旧文件与桩全部删除、`not implemented: core-tool-01` 全仓为零」（计划书「每包流程」五.1 与验收清单「替换验收」，`lead/verify-replace.mjs` 第 3 项同样要求 `stubs/` 目录不存在；4 个已合并替换 PR 先例一致）。而 v1 的 B88 把 `stubs/<32 路径>` 当 oracle 读取，「留桩」与「删桩」互锁。Lead 2026-10-14 裁决选 C（issue #148 评论）：删桩，B88 oracle 改指合同自身的 `interface.md` 导出声明块。
- 变更内容：`tests/executor.test.ts` 的 B88 只换 oracle 的读取对象（`stubs/<文件>` → `interface.md` 对应 `###` 节内全部 ```ts 块的导出声明），**断言方向与强度逐字不变**——源码导出名 ⊆ 合同声明，`assert.deepEqual(missing, [])`、`files.length === 32`、`missing`的`file:name`格式与两侧同一条解析正则全部原样；其余 80 例断言不动、不删、不跳过。配套把`interface.md` 6 行常量简写（`NAME = 值;`）改回逐字源码形式 `export const NAME = 值;`（对照旧实现 `6ea4cbe7` 逐行核对，6/6 一致），使 ts 块内 134 行导出声明全部可被同一正则解析（与「导出 134 个声明」的文件口径精确相等）。
- 强度对照：v1 oracle（桩）与 v2 oracle（interface.md 块）覆盖同一批导出名；被删掉的只是「桩=接口派生快照」这半边脚手架检查，其证据留存 `gate-old.json` 的 `stubReplacement`（桩替换后 0/9 通过、失败原因全是 `not implemented: core-tool-01`）。v2 旧门已对旧实现复跑：两入口各 81/81、预登记差异 0（`gate-old.json`、`acceptance.md` 的 v2 复跑记录）。
- 结论：**断言强度不变，没有任何放宽**。依据：计划书「合同写错就改测试」通道 + 默认裁决表「前后不一致选更保守：不放宽测试」。
- 对应测试：`tests/executor.test.ts`「B88 interface.md export declarations cover the source exports」。

## 已在别处登记、本包不补偿的既有缺陷

- **`executor/timeout.ts` 的 handler 同步 throw 会绕过 timer 清理**：已由 `specs/knorvia-tool-deadline.md` 登记为「本次明确修复」，属**已独立替换**的文件（不在本包 32 文件内），本包不重复处理。
- **`executor/batch-runner.ts` 的 `executeSchedule` 转发漏掉 `offPeakTurn`**：已由 `specs/knorvia-tool-batch-execution.md` 登记为唯一预期修复，同样属已独立替换文件。
- 本包的 `executor/impl.ts` 只做装配与委托，不重复这两处修复。

## 状态

K1–K3 每条都有对应测试；K4 是 v2 的合同修订记录（裁决 C，断言强度不变）。v2 旧门复跑已完成：两入口各 81/81、预登记差异 0 条，dist 入口用 `dist-entry-loader.mjs`；B1–B88 全部有用例（对照表见 `README.md` 文末）。见 `gate-old.json` 与 `acceptance.md`。
