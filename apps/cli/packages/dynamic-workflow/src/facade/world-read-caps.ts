// SPDX-License-Identifier: Apache-2.0

// Knorvia 动态工作流：世界读取（worldRead）环境探查安全配额

export const WORLD_READ_CAPS = {
  globMaxFiles: 2000,
  grepMaxMatches: 2000,
  grepMaxSerializedBytes: 262144,
  gitDiffMaxBytes: 524288,
  gitLogMaxCount: 100,
  gitLogDefaultCount: 20,
  runStdoutMaxBytes: 262144,
  runStderrMaxBytes: 262144,
  runDefaultTimeoutMs: 300000,
} as const;
