import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ComputerUseRuntime, ComputerUseRuntimeContext } from "@knorvia/cua";
import type { Logger } from "@knorvia/contracts";
import type { NodeReplCuaBrokerConnection } from "./cua-bridge.js";
import { readFrame, textField } from "./ipc.js";

export interface NodeReplCuaBroker { connection: NodeReplCuaBrokerConnection; ready: Promise<void>; close(): Promise<void> }
export function createNodeReplCuaBroker(input: { runtime: ComputerUseRuntime; logger?: Logger; platform?: NodeJS.Platform | string }): NodeReplCuaBroker {
  const windows = (input.platform ?? process.platform) === "win32";
  const socketPath = windows ? `\\\\.\\pipe\\knorvia-repl-${randomUUID()}` : join(tmpdir(), `knorvia-${randomUUID()}.sock`);
  const token = randomBytes(32).toString("hex");
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const abort = new AbortController();
    socket.once("close", () => { sockets.delete(socket); abort.abort(); });
    socket.on("error", () => abort.abort());
    void (async () => {
      let id: unknown = null;
      try {
        const raw = await readFrame(socket, 1024 * 1024, AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]));
        if (!raw || typeof raw !== "object") throw new Error("Invalid broker request");
        const frame = raw as Record<string, unknown>;
        const received = Buffer.from(typeof frame.token === "string" ? frame.token : "");
        const expected = Buffer.from(token);
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Computer Use broker request is not authorized");
        id = frame.id;
        if (typeof id !== "string" || typeof frame.method !== "string") throw new Error("Invalid broker request");
        const context = frame.context as Record<string, unknown> | undefined;
        if (!context || !textField(context, "sessionId")) throw new Error("Computer Use request context is missing sessionId");
        if (context.runtimeScope === "subagent") throw new Error("Computer Use is not available in subagent");
        const workspaceKey = textField(context, "workspaceKey") ?? textField(context, "workspaceIdentity") ?? textField(context, "workspacePath");
        if (!workspaceKey) throw new Error("Computer Use request context is missing workspaceKey");
        const result = await input.runtime.execute({ toolName: frame.method as never, arguments: frame.input,
          context: { ...context, workspaceKey } as unknown as ComputerUseRuntimeContext, signal: abort.signal });
        if (socket.writable) socket.end(JSON.stringify({ id, ok: true, result }) + "\n");
      } catch (error) {
        if (socket.writable) socket.end(JSON.stringify({ id, ok: false, error: error instanceof Error ? error.message : String(error) }) + "\n");
      }
    })();
  });
  server.on("error", (error) => input.logger?.error("Execution broker failed", error));
  const ready = new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  server.listen(socketPath).unref();
  let closing: Promise<void> | undefined;
  return { connection: { socketPath, token }, ready, close: () => closing ??= (async () => {
    await ready.catch(() => undefined);
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (!windows) await rm(socketPath, { force: true });
  })() };
}
