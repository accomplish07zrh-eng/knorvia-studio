// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { NodeReplSession } from "@knorvia/repl-core";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { ExecutionBinding, type ActiveNodeReplCall } from "./execution-binding.js";
import { brokerCall, callContext } from "./ipc.js";
import { computerObservations, publishObservations } from "./bridge-observations.js";

export const NODE_REPL_CUA_BRIDGE_SYMBOL = Symbol.for("knorvia.node-repl.computer-use-bridge");
export { CUA_UNAVAILABLE_IN_SUBAGENT_MESSAGE } from "./execution-binding.js";
export type ActiveCuaNodeReplCall = ActiveNodeReplCall;

/** 连到 broker 的两个要素：本地套接字路径与一次性令牌。 */
export type NodeReplCuaBrokerConnection = { socketPath: string; token: string };

/** 暴露给 REPL 的 Computer Use 桥：三个动作/字段。 */
export type ComputerUseRuntimeBridge = {
  call: (method: string, input: unknown) => Promise<CallToolResult>;
  assertAvailable: () => void;
  documentationRoot: string;
};

/** 桥的必填依赖：代号、取当前调用、会话。 */
type BridgeCoreAsk = {
  generation: number;
  getActiveCall: () => ActiveCuaNodeReplCall | undefined;
  session: () => NodeReplSession;
};

/** 桥的可选项：broker 连接（缺席即视为不可用）与文档根。 */
type BridgeOptionalAsk = { broker?: NodeReplCuaBrokerConnection; documentationRoot: string };

export function createComputerUseBridgeGlobals(
  input: BridgeCoreAsk & BridgeOptionalAsk,
): Record<PropertyKey, unknown> {
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
