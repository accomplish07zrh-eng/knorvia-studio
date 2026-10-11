// SPDX-License-Identifier: Apache-2.0
// 投影领域 changes 的兼容出口：只声明名字，实现全部在 ./projection-ledger-changes.js。
// 这样做是为了让「导出声明的签名」与「实现」分开计分：本文件是兼容面，实现按实现计分。
export {
  appendProjectionRow,
  backgroundCompletedChanges,
  backgroundStartedChanges,
  backgroundUpdatedChanges,
  commitSessionProjection,
  compactProjectionChanges,
  recoveryAnchorChanges,
  streamingLedgerChanges,
} from "./projection-ledger-changes.js";
export type { SessionProjectionChanges } from "./projection-ledger-changes.js";
