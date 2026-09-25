import type { NodeReplSession } from "@knorvia/core/repl";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { CUA_APP_ASSOCIATIONS_META_KEY } from "@knorvia/cua/host-display-contract";
import { activeCall, type ActiveNodeReplCall } from "./browser-bridge.js";
import { brokerCall, callContext, textField } from "./ipc.js";

export const NODE_REPL_CUA_BRIDGE_SYMBOL = Symbol.for("knorvia.node-repl.computer-use-bridge");
export const CUA_UNAVAILABLE_IN_SUBAGENT_MESSAGE = "Computer Use is not available in subagent";
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
  const available = () => {
    const call = activeCall(input, "Computer Use");
    if (!input.broker) throw new Error("Computer Use is unavailable for this node_repl session");
    return { call, broker: input.broker };
  };
  const bridge: ComputerUseRuntimeBridge = {
    documentationRoot: input.documentationRoot,
    assertAvailable: () => {
      available();
    },
    call: async (method, payload) => {
      const { call, broker } = available();
      const frame = await brokerCall(
        broker,
        { method, input: payload, context: callContext(call.requestMeta, true) },
        call.signal,
      );
      activeCall(input, "Computer Use");
      const result = frame.result as CallToolResult | undefined;
      if (!result || !Array.isArray(result.content))
        throw new Error("Computer Use broker returned no result");
      if (frame.responseMeta && typeof frame.responseMeta === "object")
        input.session().mergeResponseMeta(frame.responseMeta as Record<string, unknown>);
      const associations = result._meta?.[CUA_APP_ASSOCIATIONS_META_KEY] as
        | { primary?: Record<string, unknown> }
        | undefined;
      const primary = associations?.primary;
      if (primary && typeof primary === "object") {
        const appKey = textField(primary, "appKey");
        const displayName = textField(primary, "displayName");
        if (appKey)
          input.session().recordCuaAppIdentity({ appKey, ...(displayName ? { displayName } : {}) });
      }
      return result;
    },
  };
  return { [NODE_REPL_CUA_BRIDGE_SYMBOL]: bridge };
}
