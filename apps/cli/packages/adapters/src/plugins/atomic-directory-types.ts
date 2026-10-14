// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 目录事务形状：由 atomic-directory.ts 引入（activation 由其实现文件原样再导出，公开面不变）。
// 字段说明（字段名是契约）：transactionId 本次目录事务的唯一标识；finalize 提交事务；
// rollback 回滚事务；authorityPath 上级协调目录（缺席表示独立事务）；prepare 落地前的内容准备回调；
// signal 中止信号；sourcePath 待拷贝的插件源目录；targetPath 最终落地路径。

export interface AtomicDirectoryActivation {
  transactionId: string;
  finalize: () => Promise<void>;
  rollback: () => Promise<void>;
}

export interface AtomicDirectoryActivationInput {
  authorityPath?: string;
  prepare?: (stagedPath: string) => Promise<void>;
  signal?: AbortSignal;
  sourcePath?: string;
  targetPath: string;
}
