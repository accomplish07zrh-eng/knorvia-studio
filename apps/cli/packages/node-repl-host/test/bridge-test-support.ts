// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import type { Socket } from "node:net";
import type { TestContext } from "node:test";
import type { NodeReplSession } from "@knorvia/core/repl";
import { createBrowserBridgeGlobals, type ActiveNodeReplCall } from "../src/browser-bridge.js";
import {
  createComputerUseBridgeGlobals,
  NODE_REPL_CUA_BRIDGE_SYMBOL,
  type ComputerUseRuntimeBridge,
} from "../src/cua-bridge.js";
import { readNodeReplBrowserRuntimeBridge } from "../src/runtime-bridge.js";
import { brokerFixture } from "./ipc-test-support.js";

export const browserEnvironment = [
  "KNORVIA_NODE_REPL_BROWSER_BROKER_SOCKET",
  "KNORVIA_NODE_REPL_BROWSER_BROKER_TOKEN",
] as const;
export async function bridgeFixture(
  t: TestContext,
  kind: "browser" | "computer",
  respond?: (request: Record<string, unknown>, socket: Socket) => void,
) {
  const reply = { value: {} as Record<string, unknown> };
  const fixture = await brokerFixture(t, (request, socket) => {
    if (respond) respond(request, socket);
    else socket.end(JSON.stringify({ id: request.id, ok: true, ...reply.value }) + "\n");
  });
  fixture.connection.token = "local-fixture-token-with-at-least-32-characters";
  const before = browserEnvironment.map((key) => process.env[key]);
  if (kind === "browser") {
    process.env[browserEnvironment[0]] = fixture.connection.socketPath;
    process.env[browserEnvironment[1]] = fixture.connection.token;
    t.after(() =>
      browserEnvironment.forEach((key, index) => {
        if (before[index] === undefined) delete process.env[key];
        else process.env[key] = before[index];
      }),
    );
  }
  const controller = new AbortController();
  t.after(() => controller.abort());
  const state: { active: ActiveNodeReplCall | undefined } = {
    active: {
      generation: 7,
      signal: controller.signal,
      requestMeta: {
        session_id: " session ",
        turn_id: " turn ",
        trace_id: " trace ",
        workspace_identity: " remote:workspace ",
        workspace_path: " /project ",
        remote_session_id: " remote-session ",
      },
    },
  };
  const observations: { name: string; value: unknown }[] = [];
  const record = (name: string) => (value: unknown) =>
    observations.push({ name, value: structuredClone(value) });
  const session = {
    recordBrowserScreenshot: record("screenshot"),
    mergeResponseMeta: record("metadata"),
    recordCuaAppIdentity: record("application"),
  } as unknown as NodeReplSession;
  const input = {
    generation: 7,
    getActiveCall: () => state.active,
    session: () => session,
    documentationRoot: "fixture-docs",
  };
  const browser =
    kind === "browser"
      ? readNodeReplBrowserRuntimeBridge(createBrowserBridgeGlobals(input))
      : undefined;
  const computer =
    kind === "computer"
      ? (createComputerUseBridgeGlobals({ ...input, broker: fixture.connection })[
          NODE_REPL_CUA_BRIDGE_SYMBOL
        ] as ComputerUseRuntimeBridge)
      : undefined;
  return { ...fixture, reply, state, controller, observations, browser, computer, input };
}
