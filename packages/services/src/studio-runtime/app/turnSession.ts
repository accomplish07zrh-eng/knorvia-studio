// SPDX-License-Identifier: Apache-2.0
import type { StudioConversation, StudioTurnSnapshot } from "../types.js";
import type { StoredSession, StudioClock, StudioRepository } from "./storePort.js";

/** Called inside the turn owner's fenced transaction, for session events and final receipts. */
export function saveStudioTurnSession(
  db: StudioRepository,
  clock: StudioClock,
  sessionKey: string,
  nativeSessionId: string,
  workspacePath: string,
  turnId: string,
  conversation?: StudioConversation,
): void {
  db.write<StoredSession>("session", sessionKey, {
    id: sessionKey,
    nativeSessionId,
    workspacePath,
  });
  const turn = db.read<StudioTurnSnapshot>("turn", turnId);
  if (turn) db.write("turn", turnId, { ...turn, nativeSessionId }, turn.runId);
  if (conversation)
    db.write("conversation", conversation.id, {
      // 原生回执只合并自身字段，不能覆盖后来排队消息选择的模型配置。
      ...db.read<StudioConversation>("conversation", conversation.id),
      nativeSessionId,
      updatedAt: clock.now(),
    });
}
