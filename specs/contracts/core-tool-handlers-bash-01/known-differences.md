# core-tool-handlers-bash-01 已知差异（known-differences.md）

只登记在旧实现上实测、且重写时必须保持或明确处理的既存事实。每条写理由与对应测试；不为通过而放宽断言。三条均属只读规则表（选择 9）：公开文档与旧判定不一致处，合同**保留旧判定**，重写不得顺手「修正」——那会改变审批行为。

## K-ro-1 无操作内建 `:` 判非只读

- 事实：`isRuntimeReadOnlyBashCommand(":")` 返回 false。公开文档上 `:` 是无副作用 no-op 内建；旧实现的只读表未收录 `:`，故判非只读（需审批）。
- 影响：`:` 走审批而非静默只读；无功能损害。
- 处理：合同保留旧判定（B-ro-2 样例记录 false）。重写依公开文档重建时**不得**把 `:` 改为只读——那会改变审批行为。
- 对应测试：`tests/bash-readonly.test.ts` B-ro-2。

## K-ro-2 `git clean -n`（干跑）判非只读

- 事实：`isRuntimeReadOnlyBashCommand("git clean -n")` 返回 false。公开文档上 `-n/--dry-run` 只列出将删除项、不实际删除，属只读；旧实现未识别该干跑标志。
- 影响：干跑清理走审批；无功能损害。
- 处理：合同保留旧判定（B-ro-11 样例记录 false）。重写是否按公开文档修正干跑判定，属独立行为决策；本合同不改。
- 对应测试：`tests/bash-readonly.test.ts` B-ro-11。

## K-ro-3 `top` 判非只读而 `ps` 判只读

- 事实：`isRuntimeReadOnlyBashCommand("ps aux")`=true，`isRuntimeReadOnlyBashCommand("top -b -n 1")`=false。两者都是只读进程查看工具，旧只读表收录了 `ps` 未收录 `top`。
- 影响：`top` 走审批；属表覆盖不一致，非缺陷。
- 处理：合同保留旧判定（B-ro-15）。重写重建时保持 `ps` 只读；`top` 是否纳入只读表为独立决策，本合同不改。
- 对应测试：`tests/bash-readonly.test.ts` B-ro-15。

## K-ro-4 `xargs` 只读判定随平台变化

- 事实：`bash-readonly-policy-argv.ts` 在 `process.platform === "win32"` 且 argv[0] 为 `xargs` 时返回 `undefined` → `isRuntimeReadOnlyBashCommand` 判非只读；POSIX 上 `xargs` 走目标分析，`echo/wc/grep/head/tail` 等安全目标判只读、`rm` 等危险目标判非只读。例：`cat list.txt | xargs echo` 在 win32=false、Linux=true。
- 影响：同一命令在两平台审批行为不同；属实现对「win32 无原生 xargs」的保守处理，非缺陷。
- 处理：合同保留旧判定，断言按平台取期望值（`tests/bash-readonly.test.ts` 用 `!IS_WIN32`）。重写重建时保持该平台差异，不得统一成单一平台行为。
- 对应测试：`tests/bash-readonly.test.ts` B-ro-9（安全目标样例 `!IS_WIN32`、`xargs rm` 恒 false）。

## 状态

K-ro-1..4 各有对应样例断言；本簇在旧实现源码与 dist 两入口、Windows 与 Linux 两平台均通过（选择 9：判定样例即基线）。
