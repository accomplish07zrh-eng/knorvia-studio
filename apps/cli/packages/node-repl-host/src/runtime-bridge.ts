import type { BrowserClientTransport } from "@knorvia/core/browser-client";

export const NODE_REPL_BROWSER_BRIDGE_SYMBOL = Symbol.for(
  "knorvia.node-repl.browser-control-bridge",
);
export const BROWSER_UNAVAILABLE_IN_SUBAGENT_MESSAGE = "Browser is not available in subagent";
export interface NodeReplBrowserRuntimeBridge extends BrowserClientTransport {
  documentationRoot: string;
  assertAvailable(): void;
}

export function readNodeReplBrowserRuntimeBridge(
  globals: Record<PropertyKey, unknown>,
): NodeReplBrowserRuntimeBridge {
  const bridge = globals[NODE_REPL_BROWSER_BRIDGE_SYMBOL] as
    | Partial<NodeReplBrowserRuntimeBridge>
    | undefined;
  if (
    !bridge ||
    typeof bridge.list !== "function" ||
    typeof bridge.execute !== "function" ||
    typeof bridge.assertAvailable !== "function" ||
    typeof bridge.documentationRoot !== "string"
  ) {
    throw new Error("Browser runtime bridge is unavailable; use the Knorvia execution host");
  }
  return bridge as NodeReplBrowserRuntimeBridge;
}
