<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 日志永久合同

`logging-runtime-contract.test.mjs` 由整仓离线收集器自动运行。它分别加载当前 source 和真实 dist，执行严格公开 API 类型探针及 51 个行为案例；dist 缺失时直接失败，不回退到源码。子进程仅继承明确的系统/临时目录变量，数据根由夹具提供，不继承模型凭据。父测试取消会向子进程传递取消信号。

47 个原始案例在生产改动前冻结，旧 source/dist 均通过。静态复核补充了四个公开导出、callback receiver、数组 getter 修改和 reserved-context getter 场景，保存的旧 source/dist 分别通过 4/4。旧输入只保留在本次执行工作区之外的隔离夹具，不提交旧实现或添加生产 fallback。

`upgrade-fixture.mjs` 的调用者显式提供保存的旧运行时和当前模块，执行旧→新→旧的真实追加及原字节/哨兵保护检查。它是可复用验收工具，不把永久 CI 的“当前格式夹具”冒称为每次重新执行历史版本。

代码与测试作者已接触旧源码，本批不宣称角色隔离或 clean-room。新测试表达采用 MIT，生产模块继续保留 Apache-2.0，具体证据见 `licensing/evidence/logging-runtime*.json` 和本批验收文档。
