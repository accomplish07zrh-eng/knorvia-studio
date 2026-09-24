import type { NodeReplRequestMeta, NodeReplSession } from "@knorvia/core/repl";
import type { BrowserCommand, BrowserCommandResult } from "@knorvia/shared";
import { NODE_REPL_BROWSER_BROKER_SOCKET_ENV, NODE_REPL_BROWSER_BROKER_TOKEN_ENV, nodeReplBrowserBrokerResponseSchema } from "@knorvia/shared/node-repl-browser-broker";
import { brokerCall, callContext } from "./ipc.js";
import { BROWSER_UNAVAILABLE_IN_SUBAGENT_MESSAGE, NODE_REPL_BROWSER_BRIDGE_SYMBOL, type NodeReplBrowserRuntimeBridge } from "./runtime-bridge.js";

export interface ActiveNodeReplCall { generation: number; requestMeta: NodeReplRequestMeta; signal: AbortSignal }
export function activeCall(input: { generation: number; getActiveCall(): ActiveNodeReplCall | undefined }, domain: string): ActiveNodeReplCall {
  const call = input.getActiveCall();
  if (!call || call.generation !== input.generation) throw new Error(`${domain} runtime binding is stale after kernel reset`);
  call.signal.throwIfAborted();
  if (call.requestMeta.runtime_scope === "subagent") throw new Error(domain === "Browser" ? BROWSER_UNAVAILABLE_IN_SUBAGENT_MESSAGE : "Computer Use is not available in subagent");
  return call;
}

export function createBrowserBridgeGlobals(input: {
  documentationRoot: string; generation: number; getActiveCall(): ActiveNodeReplCall | undefined; session(): NodeReplSession;
}): Record<PropertyKey, unknown> {
  const request = async (payload: Record<string, unknown>) => {
    const current = activeCall(input, "Browser");
    const socketPath = process.env[NODE_REPL_BROWSER_BROKER_SOCKET_ENV]?.trim();
    const token = process.env[NODE_REPL_BROWSER_BROKER_TOKEN_ENV]?.trim();
    if (!socketPath || !token) throw new Error("Browser control is unavailable for this node_repl session");
    const response = await brokerCall({ socketPath, token }, { ...payload, ...callContext(current.requestMeta) }, current.signal);
    activeCall(input, "Browser");
    const parsed = nodeReplBrowserBrokerResponseSchema.parse(response);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed;
  };
  const bridge: NodeReplBrowserRuntimeBridge = {
    documentationRoot: input.documentationRoot,
    assertAvailable: () => { activeCall(input, "Browser"); },
    list: async () => (await request({ op: "list" })).browsers ?? [],
    execute: async (browserId, browserGeneration, command) => {
      const response = await request({ op: "execute", browserId, browserGeneration, command });
      if (!response.result) throw new Error("Browser broker returned no command result");
      recordBrowserResult(input.session(), command, response.result);
      return response.result;
    },
  };
  return { [NODE_REPL_BROWSER_BRIDGE_SYMBOL]: bridge };
}

function recordBrowserResult(session: NodeReplSession, command: BrowserCommand, result: BrowserCommandResult): void {
  if (result.ok && command.method === "screenshot" && result.image) session.recordBrowserScreenshot(result.image);
  if (!result.meta) return;
  const meta = result.meta;
  const final = result.ok && command.method === "finalizeTabs";
  const mutation = command.method === "playwright" && command.action.name === "locator"
    ? ["click", "dblclick", "downloadMedia", "fill", "press", "selectOption", "setChecked"].includes(command.action.operation)
    : ["navigate", "back", "forward", "reload", "click", "fill", "type", "press", "scroll", "hover", "select", "check", "drag", "handleDialog", "close"].includes(command.method);
  const screenshot = result.ok && meta.tabId && !["capabilities", "list", "listUserTabs", "browserVisibilityGet", "cancelRequest", "closeSession", "finalizeTabs", "nameSession", "turnEnded"].includes(command.method);
  session.mergeResponseMeta({
    "knorvia/browserUse": true,
    "knorvia/toolSurface": { kind: "browserUse", backend: meta.backendType, browserId: meta.browserId,
      ...(final || (result.ok && mutation) ? { openTabIds: meta.openTabIds } : {}), ...(final ? { sessionEnded: true } : {}) },
    browser_use: meta.currentUrl ? { url: meta.currentUrl } : {},
    ...(screenshot ? { "knorvia/browserTurnScreenshot": { browserGeneration: meta.browserGeneration, browserId: meta.browserId, tabId: meta.tabId } } : {}),
  });
}
