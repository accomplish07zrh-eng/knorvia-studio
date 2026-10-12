// SPDX-License-Identifier: Apache-2.0
// core-hooks 合同 v1 的最小桩（对应 session-mailbox.ts）。仅签名，无实现。
import type {
  HookEventName,
  SessionId,
  SessionMailboxPort,
  TraceContext,
} from "@knorvia/contracts";
export type HookRegistration = { callback: unknown; event: HookEventName; [key: string]: unknown };
export function createSessionMailboxHookRegistrations(options: {
  enqueuePendingInput?: (input: string, traceContext: TraceContext) => Promise<void>;
  mailbox: SessionMailboxPort;
  sessionId: SessionId;
}): HookRegistration[] {
  void options;
  throw new Error("not implemented: core-hooks");
}
