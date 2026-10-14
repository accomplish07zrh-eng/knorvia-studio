// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 原子事务协议形状：由 atomic-protocol.ts 引入（四名形状由其实现文件原样再导出，公开面不变）。
// 字段说明（字段名是契约）：target 规范化目标路径；parent 父目录；marker 事务标记文件路径；
// backup 旧代备份路径；stagePrefix 暂存目录前缀；version 标记格式版本（1 旧 / 2 现行）；
// stageName 暂存目录名；transactionId 事务标识；ownerId 所有者标识；ownerPid 所有者进程号；
// hadTarget 事务启动时目标是否已存在；mode 协调模式（coordinated 从属于上级 / standalone 独立）；
// authorityPath 上级协调目录（standalone 时缺席）。

export interface AtomicPaths {
  target: string;
  parent: string;
  marker: string;
  backup: string;
  stagePrefix: string;
}

export interface LegacyAtomicMarker {
  version: 1;
  stageName: string;
}

export interface AtomicMarker {
  version: 2;
  stageName: string;
  transactionId: string;
  ownerId: string;
  ownerPid: number;
  hadTarget: boolean;
  mode: "coordinated" | "standalone";
  authorityPath?: string;
}

export type ReadableAtomicMarker = LegacyAtomicMarker | AtomicMarker;
