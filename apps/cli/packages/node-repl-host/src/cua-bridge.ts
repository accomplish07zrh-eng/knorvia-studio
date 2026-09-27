// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { NodeReplSession } from "@knorvia/core/repl";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { ExecutionBinding, type ActiveNodeReplCall } from "./execution-binding.js";
import { brokerCall, callContext } from "./ipc.js";
import { computerObservations, publishObservations } from "./bridge-observations.js";

export const NODE_REPL_CUA_BRIDGE_SYMBOL = Symbol.for("knorvia.node-repl.computer-use-bridge");
export { CUA_UNAVAILABLE_IN_SUBAGENT_MESSAGE } from "./execution-binding.js";
export type ActiveCuaNodeReplCall = ActiveNodeReplCall;
export interface NodeReplCuaBrokerConnection {
  socketPath: string;
  token: string;
}
export interface ComputerUseRuntimeBridge {
  call(method: string, input: unknown): Promise<CallToolResult>;
  assertAvailable(): void;
  documentationRoot: string;
}
export function createComputerUseBridgeGlobals(input: {
  broker?: NodeReplCuaBrokerConnection;
  generation: number;
  getActiveCall(): ActiveCuaNodeReplCall | undefined;
  session(): NodeReplSession;
  documentationRoot: string;
}): Record<PropertyKey, unknown> {
  const binding = new ExecutionBinding(input, "Computer Use");
  const connection = () => {
    if (!input.broker) throw new Error("Computer Use is unavailable for this node_repl session");
    return input.broker;
  };
  const bridge: ComputerUseRuntimeBridge = {
    documentationRoot: input.documentationRoot,
    assertAvailable() {
      binding.current();
      connection();
    },
    call: (method, payload) =>
      binding.exchange(
        (execution) =>
          brokerCall(
            connection(),
            { method, input: payload, context: callContext(execution.requestMeta, true) },
            execution.signal,
          ),
        (frame) => {
          const { result, observations } = computerObservations(frame);
          if (observations.length) publishObservations(input.session(), observations);
          return result;
        },
      ),
  };
  return { [NODE_REPL_CUA_BRIDGE_SYMBOL]: bridge };
}
