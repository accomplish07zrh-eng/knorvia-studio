// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { executeCell } from "./execution-cell.js";
import type { NodeReplExecutor } from "./execution-contract.js";
export {
  WORKER_KIND,
  type NodeReplExecuteInput,
  type NodeReplExecutor,
} from "./execution-contract.js";
export { executeInWorker } from "./worker-call.js";

export function createInProcessNodeReplExecutor(): NodeReplExecutor {
  return (input) => executeCell(input);
}
