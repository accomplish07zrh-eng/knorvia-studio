// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { randomBytes } from "node:crypto";
import type { ComputerUseRuntime } from "@knorvia/cua";
import type { Logger } from "@knorvia/contracts";
import type { NodeReplCuaBrokerConnection } from "./cua-bridge.js";
import { authenticatedEnvelope, computerFailureLine, computerRequest } from "./cua-request.js";
import { LocalRequestServer } from "./local-request-server.js";

const TOKEN_BYTES = 32;
export interface NodeReplCuaBroker {
  connection: NodeReplCuaBrokerConnection;
  ready: Promise<void>;
  close(): Promise<void>;
}
export function createNodeReplCuaBroker(input: {
  runtime: ComputerUseRuntime;
  logger?: Logger;
  platform?: NodeJS.Platform | string;
}): NodeReplCuaBroker {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const credential = Buffer.from(token);
  const listener = new LocalRequestServer({
    platform: input.platform,
    onError: (error) => input.logger?.error("Execution broker failed", error),
    failure: (error) => computerFailureLine(null, error),
    async exchange(raw, signal) {
      let id: unknown = null;
      try {
        const envelope = authenticatedEnvelope(raw, credential);
        id = envelope.id;
        const request = computerRequest(envelope);
        const result = await input.runtime.execute({ ...request, signal });
        return JSON.stringify({ id, ok: true, result }) + "\n";
      } catch (error) {
        return computerFailureLine(id, error);
      }
    },
  });
  return {
    connection: { socketPath: listener.socketPath, token },
    ready: listener.ready,
    close: () => listener.close(),
  };
}
