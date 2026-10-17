# dynamic-workflow-01 替换验收

- 包：dynamic-workflow-01，重写目标 53 个继承文件（范围 55，其中 2 个 unreviewed 文件不动），另有 8 个新拆出的模块。
- 合同：v2。`node scripts/contract-gate.mjs --contract specs/contracts/dynamic-workflow-01 --tests '*.test.mjs' --dist-env KNORVIA_DW01_ENTRY=dist`：源码入口 39/39，dist 入口 39/39（golden 样例 324/324）。
- 合同 v2 的变化：按计划书「删除全部旧文件和桩」（第 416、466 行）删除了 `stubs/`。B20 原先以桩为 oracle，现按「M1 复盘」第 4 条（桩互锁 C 通道）和 core-tool-01 B88 先例，改为以 interface.md 的导出声明块为 oracle，断言方向不变（源码导出 ⊆ 合同声明，缺一即失败）。桩自身的检查（抛 not implemented、targets.txt 计数）随桩一并删除。其余 38 条用例没有改动，`gate-old.json` 保留不动。
- 相似度（只对比 ZCode@872ad960，门槛不变）：
  - 普通模式：60 个文件，60 个通过；
  - 声明模式：`compiler/compile-types.ts` 只含 5 个公共接口，用 `--declaration --interface specs/contracts/dynamic-workflow-01/interface.md` 计分（口径见 docs/knorvia-contracts-01-acceptance.md 第 26 行），1/1 通过。
- 全仓搜 `not implemented: dynamic-workflow-01` 结果为零。公共导出、协议字段、KNORVIA\_ 环境变量和数据目录都没有改动。
