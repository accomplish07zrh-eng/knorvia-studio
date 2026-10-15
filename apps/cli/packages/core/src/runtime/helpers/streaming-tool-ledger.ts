// SPDX-License-Identifier: Apache-2.0
// 流式工具账本与恢复锚点的兼容面（B33）：实现见 ./turn/streaming-ledger-events.js。
import * as ledger from "./turn/streaming-ledger-events.js";

export const createStreamingToolAttemptId = ledger.createStreamingToolAttemptId;
export const createStreamRecoveryAnchorId = ledger.createStreamRecoveryAnchorId;
export const emitStreamingToolLedgerUpdate = ledger.emitStreamingToolLedgerUpdate;
export const emitStreamRecoveryAnchor = ledger.emitStreamRecoveryAnchor;
