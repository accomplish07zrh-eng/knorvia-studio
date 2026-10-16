# shared-03 替换验收

- 包：shared-03（继承文件 34 个，见 specs/contracts/shared-03）。
- 契约：`node scripts/contract-gate.mjs --contract specs/contracts/shared-03 --tests '*.test.mjs' --dist-env KNORVIA_SHARED_03_ENTRY=dist`：源码入口 47/47、dist 入口 47/47。
- 相似度（只对比 ZCode@872ad960，门槛不变）：48 个候选，48 个通过，0 个失败。
- 桩目录与 `not implemented: shared-03` 已删除，对应的 reviews 条目也已移除。
- 公共导出、协议字段、KNORVIA\_ 环境变量和数据目录都没有改动。
