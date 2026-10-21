// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { randomBytes } from "node:crypto";
import type { ComputerUseRuntime } from "@knorvia/cua";
import type { Logger } from "@knorvia/contracts";
import type { NodeReplCuaBrokerConnection } from "./cua-bridge.js";
import { authenticatedEnvelope, computerFailureLine, computerRequest } from "./cua-request.js";
import { LocalRequestServer } from "./local-request-server.js";

const TOKEN_BYTES = 32;

/** 装配结果：连接信息、就绪信号、关闭入口。 */
export type NodeReplCuaBroker = {
  connection: NodeReplCuaBrokerConnection;
  ready: Promise<void>;
  close: () => Promise<void>;
};

/** 必填项：要执行工具调用的运行时。 */
type CuaBrokerRequired = { runtime: ComputerUseRuntime };

/** 可覆盖项：日志与平台（测试会注入替身）。 */
type CuaBrokerOverrides = { logger?: Logger; platform?: NodeJS.Platform | string };

/** 装配入参：必填 + 可覆盖。 */
type CuaBrokerAsk = CuaBrokerRequired & CuaBrokerOverrides;

export function createNodeReplCuaBroker(input: CuaBrokerAsk): NodeReplCuaBroker {
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
