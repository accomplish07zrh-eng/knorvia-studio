# core-tool-handlers-workflow-runs-01 验收（acceptance.md）

版本 v1。合同阶段验收 = 旧门三通道输出（`gate-old.json`）+ 覆盖率自查。

## 旧门三通道（contract-gate，2026-10-15）

| 通道                                              | 结果                                                       |
| ------------------------------------------------- | ---------------------------------------------------------- |
| 源码入口（7 个测试文件）                          | **60/60 通过**（fail=0、skipped=0）                        |
| dist 入口（同一套用例，dist-entry-loader 重定向） | **60/60 通过**                                             |
| 桩替换（11 目标文件换 `stubs/` 后重跑源码入口）   | **0/60，7 个测试文件全部失败**（allFail=true，桩互锁成立） |

## 条目覆盖

- `behavior.md` 51 条（B-gw-8 + B-gs-5 + B-gr-4 + B-gf-7 + B-gt-5 + B-ga-3 + B-lr-3 + B-ls-3 + B-lm-2 + B-rw-7 + B-qs-5 + B-tp-6）逐条挂测试用例名（测试文件内 `test("B-xx-n …")` 命名对照）。
- 金样往返：`fixtures/workflow-runs-goldens.json`（旧实现录制真值，含 4 个输入快照 + summary/模型面/情势块/活动行/引导文案）由 `fixtures.test.ts` 5 例逐字节比对。
- 语义常量（超时 10s/15s、预算 400k/100k/24k、失败码 11–17/21–24、终态集、列宽 24、摘要预算与省略号）显式入 `behavior.md` 总表并在 `tool-entries.test.ts`/`get-workflow-run.test.ts` 逐项断言。

## 断言强度自查

- 事件序列断言：端口替身记录调用序列（`assertCallSequence`）+ gate 握手（deferred，无 sleep、无固定超时）覆盖 B-gw-1/2、B-rw-1/2/3/4、B-qs-1/2/3/4 与两个 gate handshake 用例。
- 失败通道：结构化失败（errorCode + message 判别键前缀）逐分支断言；`not_found` 复用内省表同键同码同 message 断言。
- 断言强度只增不减：金样逐字节 + 结构断言（块序/缺席语义/单复数/列宽上界）双层。

## 运行方法

见 `README.md`「运行契约测试（两个入口）」。前置：Node 24.14.0、`pnpm --filter @knorvia/core... build`（dist 通道）、`$env:TSX_TSCONFIG_PATH=<repo>/packages/ui/tsconfig.json`、`$env:KNORVIA_ENV=test`。

## 未验证范围

- `list-workflow-runs-operation.ts`/`list-models-projection.ts`/`list-saved-workflows-model-renderer.ts` 等 original 邻居的内部行为不在本合同（经公开入口消费，转口恒等用例 B-lr-1/B-lm-1 钉住接缝）。
- `saved-workflows/**` 存储层与 `workflow-run-introspection` 格式基件分别归 -02 与 workflow-01 合同。
