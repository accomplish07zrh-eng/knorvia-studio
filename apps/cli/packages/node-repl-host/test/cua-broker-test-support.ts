// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { once } from "node:events";
import { createConnection } from "node:net";
import type { TestContext } from "node:test";
import type { ComputerUseRuntimeExecuteInput } from "@knorvia/cua";
import { createNodeReplCuaBroker, type NodeReplCuaBroker } from "../src/cua-broker.js";

export const context = {
  sessionId: "session-test",
  runtimeScope: "main",
  workspaceIdentity: "workspace-test",
};
export async function service(
  t: TestContext,
  execute: (input: ComputerUseRuntimeExecuteInput) => Promise<unknown> = async () => ({
    content: [],
  }),
) {
  const requests: ComputerUseRuntimeExecuteInput[] = [];
  const broker = createNodeReplCuaBroker({
    runtime: {
      async execute(input) {
        requests.push(input);
        return execute(input);
      },
      closeSession: async () => {
        throw new Error("The caller owns runtime sessions");
      },
      dispose: async () => {
        throw new Error("The caller owns runtime disposal");
      },
    },
  });
  t.after(() => broker.close());
  await broker.ready;
  return { broker, requests };
}

export async function client(t: TestContext, broker: NodeReplCuaBroker) {
  const socket = createConnection(broker.connection.socketPath);
  t.after(() => {
    socket.destroy();
  });
  const response = new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.on("error", reject);
    socket.once("close", () => reject(new Error("Client closed without a response")));
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const end = bytes.indexOf(10);
      if (end < 0) return;
      try {
        resolve(JSON.parse(bytes.subarray(0, end).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
  });
  // Some lifecycle probes deliberately close without a reply; keep those observable.
  void response.catch(() => {});
  await once(socket, "connect", { signal: t.signal });
  return {
    socket,
    response,
    send(overrides: Record<string, unknown> = {}) {
      socket.write(
        JSON.stringify({
          id: "request-test",
          method: "observe",
          token: broker.connection.token,
          context,
          ...overrides,
        }) + "\n",
      );
      return response;
    },
  };
}

export async function request(
  t: TestContext,
  broker: NodeReplCuaBroker,
  overrides: Record<string, unknown> = {},
) {
  return (await client(t, broker)).send(overrides);
}
