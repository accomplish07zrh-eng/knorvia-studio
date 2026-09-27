// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { NodeReplSession } from "@knorvia/core/repl";
import {
  NODE_REPL_BROWSER_BROKER_SOCKET_ENV,
  NODE_REPL_BROWSER_BROKER_TOKEN_ENV,
  nodeReplBrowserBrokerResponseSchema,
  type NodeReplBrowserBrokerResponse,
} from "@knorvia/shared/node-repl-browser-broker";
import { brokerCall, callContext } from "./ipc.js";
import { ExecutionBinding, type ActiveNodeReplCall } from "./execution-binding.js";
import { browserObservations, publishObservations } from "./bridge-observations.js";
import {
  NODE_REPL_BROWSER_BRIDGE_SYMBOL,
  type NodeReplBrowserRuntimeBridge,
} from "./runtime-bridge.js";

export { activeCall, type ActiveNodeReplCall } from "./execution-binding.js";

function connection() {
  const socketPath = process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV]?.trim();
  const token = process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV]?.trim();
  if (!socketPath || !token)
    throw new Error("Browser control is unavailable for this node_repl session");
  return { socketPath, token };
}

type SuccessfulReply = Extract<NodeReplBrowserBrokerResponse, { ok: true }>;
export function createBrowserBridgeGlobals(input: {
  documentationRoot: string;
  generation: number;
  getActiveCall(): ActiveNodeReplCall | undefined;
  session(): NodeReplSession;
}): Record<PropertyKey, unknown> {
  const binding = new ExecutionBinding(input, "Browser");
  const exchange = <Value>(
    payload: Record<string, unknown>,
    consume: (reply: SuccessfulReply) => Value,
  ) =>
    binding.exchange(
      (execution) =>
        brokerCall(
          connection(),
          { ...payload, ...callContext(execution.requestMeta) },
          execution.signal,
        ),
      (frame) => {
        const reply = nodeReplBrowserBrokerResponseSchema.parse(frame);
        if (!reply.ok) throw new Error(reply.error);
        return consume(reply);
      },
    );
  const bridge: NodeReplBrowserRuntimeBridge = {
    documentationRoot: input.documentationRoot,
    assertAvailable() {
      binding.current();
    },
    list: () => exchange({ op: "list" }, (reply) => reply.browsers ?? []),
    execute: (browserId, browserGeneration, command) =>
      exchange({ op: "execute", browserId, browserGeneration, command }, (reply) => {
        if (!reply.result) throw new Error("Browser broker returned no command result");
        publishObservations(input.session(), browserObservations(command, reply.result));
        return reply.result;
      }),
  };
  return { [NODE_REPL_BROWSER_BRIDGE_SYMBOL]: bridge };
}
