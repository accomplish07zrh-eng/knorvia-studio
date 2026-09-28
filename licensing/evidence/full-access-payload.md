<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 完全访问载荷投影的保留来源

`apps/cli/packages/adapters/src/storage/session-store/repositories/permission-full-access-payload.ts` 从原仓储保留了 JSON 解析、intent/conversationInputIntent 两字段判断和 mode 覆写，只有帮助函数提取与常量命名调整。它继续采用 Apache-2.0，不计作 Knorvia 原创或独立替换；本证据文档本身是新编写的说明。

固定来源为根来源清单记录的 ZCode 提交 `872ad960de7ec172591f7e1952f7849229f94521`，原路径 `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/permission-full-access.ts`，Git blob `7e607a2a63d6e9e0ae8e61adffb1e102d0521f31`，归一化 SHA-256 `17214c7e0a67ba7cc219e7d4f5c3faa7f2d08921e1de21a623bd26dd18dbf7f3`。本轮前本地 `fd4bc58` 文件只有 contracts 包导入改名，不据此判为独立实现。

新动作程序、事务 owner 与本投影的关系见 [先行规格](../../specs/knorvia-full-access-storage.md)。投影文件在摘要复核中作为继承的第三方代码记录 Apache-2.0；其新路径不代表无上游来源。根 LICENSE、NOTICE 和历史发行继续保留。这部分仍是后续整体迁移需要处理的实现，不能以新协调层的 MIT 声明覆盖它。
