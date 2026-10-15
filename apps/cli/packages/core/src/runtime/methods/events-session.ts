// SPDX-License-Identifier: Apache-2.0
// 会话持久化入口：五 phase 落库在 support/session-persist.ts，这里接线标题事件（走 B23 管线）
// 并保持兼容导出面。
import type { TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  persistSessionFirstTime,
  SESSION_TITLE_EVENT_TYPE,
  type SessionPersistPorts,
} from "./support/session-persist.js";

export async function ensureSessionPersisted(
  this: AgentRuntimeInternal,
  input: string,
  traceContext: TraceContext,
): Promise<void> {
  const ports = {
    sessionId: this.sessionId,
    workingDirectory: this.workingDirectory,
    appVersion: this.appVersion,
    isSessionPersisted: () => this.sessionPersisted,
    markSessionPersisted: () => {
      this.sessionPersisted = true;
    },
    config: this.config,
    sessionStore: this.sessionStore,
    getSessionModelSelection: () => this.getSessionModelSelection?.(),
    deliverTitleEvent: async (payload: unknown, trace: TraceContext) => {
      await this.appendEvent(this.createEvent(SESSION_TITLE_EVENT_TYPE, payload, trace), trace);
    },
    logger: this.logger,
  } as unknown as SessionPersistPorts;
  await persistSessionFirstTime(this, ports, input, traceContext);
}
