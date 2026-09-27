// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { BrowserControlPort } from "@knorvia/contracts";
import type { KnorviaProtocolAgentServerContext } from "./server-types.js";
import { BrowserRequestChannel } from "./browser-request-channel.js";
import { BrowserSessionConnections } from "./browser-session-connections.js";

export function createProtocolBrowserControlBroker(
  context: KnorviaProtocolAgentServerContext,
): BrowserControlPort {
  const channel = new BrowserRequestChannel(context);
  const connections = new BrowserSessionConnections();
  return {
    list: (input) => channel.list(input),
    execute: (input) => channel.execute(input, () => connections.remember(input)),
    async turnEnded(input) {
      await Promise.allSettled(
        connections
          .snapshot(input.sessionId)
          .map((connection) =>
            channel.notify(input, connection, { method: "turnEnded", turnId: input.turnId }),
          ),
      );
    },
    async closeSession(input) {
      // 先取出旧连接集再等待回执，防止旧 close 删除等待期间新建立的连接。
      const closing = connections.take(input.sessionId);
      await Promise.allSettled(
        closing.map((connection) => channel.notify(input, connection, { method: "closeSession" })),
      );
    },
  };
}
