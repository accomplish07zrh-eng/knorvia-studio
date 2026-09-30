<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 日志稀疏数组性能修复

独立 QA 发现 `db04fb9` 的数组遍历为每个槽预建闭包与工作项。250000 槽仅两个有效元素仍产生约 192 MiB 额外 heap。先加入隔离进程 GC 后、首个 getter 处的 32 MiB 内存门，未修改源码时实际失败：200215600 bytes。修复后同一探针为 2011272 bytes，结果长度、空槽和共享身份投影一致。

数组改为逐索引继续帧，保留初始长度和深度优先读取、继承数字属性、getter 对后续槽的增删。第二项回归核验这些顺序；既有 51 项未删改。构建后 source/dist 各 53/53，CLI 构建 17/17，根/CLI typecheck 与 lint 通过。机器时间仅为测量信息，不用时间断言代替语义或空间门。

新增子进程案例同时暴露合同启动字符串 `--test-timeout=60_000` 实际解析为 60ms，按原声明的 60 秒改为 `60000`。没有修改 ComfyUI 的 1000ms/10ms 终态预算。该无关超时在诊断提交 `a26cde5` 的 CI #186 两平台通过，Windows 3841/3841、ComfyUI 38.7463ms；原 CI #185 首因仍未证明，阶段诊断继续保留。

生产序列化文件继续 Apache-2.0 和开放来源复核，不授予 MIT。没有数据库、JSONL、用户目录、UI、依赖或外部命令改动；回滚切回前一提交并保留数据即可。原生 Electron UI 仍未完成，不能以离线回归代替。

本批摘要和构建绑定另存 `licensing/evidence/logging-sparse-array-20260930.json`，历史冻结与原验收输入原样保留。整仓回归及新提交远端 CI 结果在提交后的交接中报告，本文不预先宣称成功。
