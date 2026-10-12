// SPDX-License-Identifier: Apache-2.0
// 会话投影的初值：模块求值时建立一份，reduce 的种子会在它上面换掉 id。
// 组织方式：字段类型由两块显式标注的表持有（空集合 / 未设置字段），初值对象只做一次拼接。

import type {
  CollaborationMode,
  SessionProjection,
  SessionStatus,
} from "../interfaces/session.port.js";

/** 初值里必须为空数组的字段；类型写在标注上，值一律写成裸 `[]`。 */
type EmptySessionCollectionKey =
  | "pendingPermissions"
  | "pendingSteerInputs"
  | "activeToolCalls"
  | "streamingToolLedger"
  | "backgroundTasks"
  | "targetCompletionVerifications"
  | "targetCompletionVerificationTimeline";

/** 初值里「还没有发生」的字段；值一律写成裸 `undefined`。 */
type UnsetSessionFieldKey =
  | "currentTurnId"
  | "lastError"
  | "lastCompact"
  | "lastCheckpoint"
  | "lastStreamRecoveryAnchor"
  | "lastRewind"
  | "target";

/** 调用方拿到初值后不得原地 push 这些数组。 */
const EMPTY_SESSION_COLLECTIONS: {
  [Key in EmptySessionCollectionKey]: SessionProjection[Key];
} = {
  pendingPermissions: [],
  pendingSteerInputs: [],
  activeToolCalls: [],
  streamingToolLedger: [],
  backgroundTasks: [],
  targetCompletionVerifications: [],
  targetCompletionVerificationTimeline: [],
};

/** 选项字段显式写成 undefined，便于区分「还没发生」与「值为空」。 */
const UNSET_SESSION_FIELDS: { [Key in UnsetSessionFieldKey]: SessionProjection[Key] } = {
  currentTurnId: undefined,
  lastError: undefined,
  lastCompact: undefined,
  lastCheckpoint: undefined,
  lastStreamRecoveryAnchor: undefined,
  lastRewind: undefined,
  target: undefined,
};

const DEFAULT_CONTEXT_WINDOW = 200_000;

/** 取一次当前时间；初值里调用两次，因此 createdAt 与 updatedAt 不是同一个 Date 实例。 */
function moduleStartTime(): Date {
  return new Date();
}

/** 标量默认值：协作模式、会话状态与各种计数。 */
const SESSION_SCALAR_DEFAULTS = {
  mode: "build" as CollaborationMode,
  status: "idle" as SessionStatus,
  turnCount: 0,
  totalTokenCount: 0,
  contextUsed: 0,
  contextWindow: DEFAULT_CONTEXT_WINDOW,
};

/** 投影初值。`createdAt` 与 `updatedAt` 各取一次当前时间，因此是两个不同的 Date 实例；时间只在这里读取，之后投影上的时间戳一律来自事件自身。 */
export const initialSessionProjection = {
  createdAt: moduleStartTime(),
  updatedAt: moduleStartTime(),
  ...SESSION_SCALAR_DEFAULTS,
  ...EMPTY_SESSION_COLLECTIONS,
  ...UNSET_SESSION_FIELDS,
};
