// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { NodeReplRequestMeta, NodeReplRunResult } from "@knorvia/core/repl";
import type { NodeReplCuaBrokerConnection } from "./cua-bridge.js";

export interface NodeReplExecuteInput {
  code: string;
  requestMeta: NodeReplRequestMeta;
  signal: AbortSignal;
  syncTimeoutMs: number;
  cuaBroker?: NodeReplCuaBrokerConnection;
}
export type NodeReplExecutor = (input: NodeReplExecuteInput) => Promise<NodeReplRunResult>;
export const WORKER_KIND = "knorvia-execution-cell-v1";
