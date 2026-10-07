import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { redactDiagnosticText } from "@knorvia/shared";
import type { StudioAgentTools } from "../agentToolTypes.js";
import type { StudioKernelSink, StudioKernelTurn, StudioSharedMcpServer } from "../kernelTypes.js";
import {
  studioAgentToolDescriptions,
  studioAgentToolSchemas,
  type StudioAgentToolName,
} from "../domain/agentToolPolicy.js";
import { studioAgentMcpProgram } from "./studioAgentMcpProgram.js";

const MAX_BYTES = 64 * 1024;
const MAX_IN_FLIGHT = 8;
interface Grant {
  tools: StudioAgentTools;
  controller: AbortController;
  signal: AbortSignal;
  inFlight: number;
}
function reply(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed) return;
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}
async function requestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error("Studio Agent 请求过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Grants never expose a caller selection API, account config, or an approval answer tool. */
export function createStudioAgentBridge(
  bind: (turn: StudioKernelTurn, sink: StudioKernelSink, signal: AbortSignal) => StudioAgentTools,
  executablePath: string,
) {
  const grants = new Map<string, Grant>();
  const pending = new Set<Promise<void>>();
  let disposed = false;
  const tools = Object.entries(studioAgentToolSchemas).map(([name, schema]) => ({
    name,
    description: studioAgentToolDescriptions[name as StudioAgentToolName],
    inputSchema: z.toJSONSchema(schema),
    annotations: {
      readOnlyHint: ["list_kernels", "get_task", "get_result"].includes(name),
      idempotentHint: true,
    },
  }));
  const program = studioAgentMcpProgram(tools);
  const envelope = z.object({ name: z.string().max(100), input: z.unknown() }).strict();
  const server = createServer((request, response) => {
    const operation = (async () => {
      if (request.method !== "POST" || request.url !== "/tool")
        return reply(response, 404, { error: "Not found" });
      const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
      const grant = grants.get(token);
      if (!grant || disposed || grant.signal.aborted)
        return reply(response, 401, { error: "Studio 调用方已失效" });
      if (grant.inFlight >= MAX_IN_FLIGHT)
        return reply(response, 429, { error: "Studio Agent 工具请求过多" });
      grant.inFlight += 1;
      try {
        const input = envelope.parse(await requestBody(request));
        const result = await grant.tools.call(input.name, input.input);
        reply(response, 200, { result });
      } finally {
        grant.inFlight -= 1;
      }
    })().catch((error) =>
      reply(response, 400, {
        error: redactDiagnosticText(
          error instanceof Error ? error.message : "Studio Agent 工具失败",
        ),
      }),
    );
    pending.add(operation);
    void operation.finally(() => pending.delete(operation));
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  let address: Promise<string> | undefined;
  let close: Promise<void> | undefined;
  function start(): Promise<string> {
    if (disposed) throw new Error("Studio Agent bridge 已关闭");
    address ??= new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        const bound = server.address();
        if (!bound || typeof bound === "string") reject(new Error("Studio Agent bridge 未启动"));
        else resolve(`http://127.0.0.1:${bound.port}`);
      });
    });
    return address;
  }
  return {
    async issue(
      turn: StudioKernelTurn,
      sink: StudioKernelSink,
      signal: AbortSignal,
    ): Promise<{ server: StudioSharedMcpServer; revoke(): void }> {
      signal.throwIfAborted();
      const url = await start();
      signal.throwIfAborted();
      const controller = new AbortController();
      const combined = AbortSignal.any([signal, controller.signal]);
      const token = randomUUID() + randomUUID();
      grants.set(token, {
        tools: bind(turn, sink, combined),
        controller,
        signal: combined,
        inFlight: 0,
      });
      return {
        server: {
          name: "knorvia_studio_agents",
          type: "stdio",
          command: executablePath,
          args: ["-e", program],
          env: {
            ELECTRON_RUN_AS_NODE: "1",
            KNORVIA_STUDIO_AGENT_URL: url,
            KNORVIA_STUDIO_AGENT_TOKEN: token,
          },
        },
        revoke: () => {
          grants.delete(token);
          controller.abort(new Error("Studio 调用方已结束"));
        },
      };
    },
    disposeAllAndWait(): Promise<void> {
      close ??= (async () => {
        disposed = true;
        for (const grant of grants.values())
          grant.controller.abort(new Error("Studio Agent bridge 退出"));
        grants.clear();
        await address?.catch(() => undefined);
        await Promise.allSettled(pending);
        if (server.listening)
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
      })();
      return close;
    },
  };
}
export type StudioAgentBridge = ReturnType<typeof createStudioAgentBridge>;
