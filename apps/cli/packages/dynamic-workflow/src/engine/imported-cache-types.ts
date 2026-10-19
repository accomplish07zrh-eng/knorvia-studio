// SPDX-License-Identifier: Apache-2.0
// Knorvia 工作流引擎：断点续跑（amend-resume）导入缓存的数据模型定义。
// 由上层服务在启动时解析前驱 run 生成，引擎仅用于加速匹配，不直接执行持久化 I/O。

import type { AskStats, NodeKind, PersonaSpec } from "./types.js";

// 前驱运行中已完成的某轮 ask 结果缓存项
export interface ImportedAskEntry {
  inputHash: string;
  result: unknown;
  stats?: AskStats;
  messageBoundary: number;
}

// 前驱运行中同一具名 actor 对应的历史记录前缀候选
export interface ImportedActorCandidate {
  persona: PersonaSpec;
  entries: ImportedAskEntry[];
  transcriptSourceSessionId: string;
  resolvedModel?: string;
}

// 前驱运行中已完成的世界感知/操作节点结果缓存项
export interface ImportedWorldEntry {
  inputHash: string;
  kind: NodeKind;
  result: unknown;
}

// 注入执行引擎的运行期导入缓存结构映射
export interface ImportedRunCache {
  actors: ReadonlyMap<string, ImportedActorCandidate>;
  world: ReadonlyMap<string, ImportedWorldEntry[]>;
}
