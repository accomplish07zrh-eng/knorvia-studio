import { createServer, type Server, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, rm } from "node:fs/promises";
import {
  controlRequestSchema,
  controlResponseSchema,
  type ControlRequest,
  type ControlResponse,
} from "../contracts.js";
import { encodeJsonLine, JsonLineDecoder } from "./framing.js";
import { ControlRequestError } from "./controlError.js";

const CONTROL_CLOSE_TIMEOUT_MS = 2_000;

export interface ControlHandler {
  (request: ControlRequest): Promise<unknown>;
}

function describeFailure(
  code: string,
  error: unknown,
): { code: string; message: string; retryable?: boolean } {
  if (error instanceof ControlRequestError) {
    return { code: error.code, message: error.message.slice(0, 500), retryable: error.retryable };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code, message: message.slice(0, 500) };
}

class ControlSession {
  private readonly decoder = new JsonLineDecoder();

  public constructor(
    private readonly socket: Socket,
    private readonly handler: ControlHandler,
  ) {
    socket.on("error", () => { socket.destroy(); });
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.receive(chunk));
    socket.on("end", () => {
      try {
        this.decoder.finish();
      } catch {
        socket.destroy();
      }
    });
  }

  private receive(chunk: string): void {
    let requests: unknown[];
    try {
      requests = this.decoder.push(chunk);
    } catch (error) {
      this.respond({ id: randomUUID(), ok: false, error: describeFailure("invalid-frame", error) });
      this.socket.destroy();
      return;
    }
    // Supervisor 仍是命令 admission 的所有者；传输层不另建串行队列。
    for (const request of requests) void this.dispatch(request);
  }

  private async dispatch(raw: unknown): Promise<void> {
    const request = controlRequestSchema.safeParse(raw);
    if (!request.success) {
      this.respond({
        id: randomUUID(),
        ok: false,
        error: { code: "invalid-request", message: "Invalid control request" },
      });
      return;
    }
    const handler = this.handler;
    try {
      const result = await handler(request.data);
      this.respond({ id: request.data.id, ok: true, result });
    } catch (error) {
      this.respond({
        id: request.data.id,
        ok: false,
        error: describeFailure("request-failed", error),
      });
    }
  }

  private respond(response: ControlResponse): void {
    const admitted = controlResponseSchema.parse(response);
    if (this.socket.destroyed || this.socket.writableEnded) return;
    try {
      this.socket.write(encodeJsonLine(admitted), (error) => {
        if (error) this.socket.destroy();
      });
    } catch {
      this.socket.destroy();
    }
  }
}

class ControlListener {
  public readonly server: Server;
  private readonly connections = new Set<Socket>();
  private shutdown: Promise<void> | undefined;

  public constructor(private readonly endpoint: string, handler: ControlHandler) {
    this.server = createServer((socket) => {
      this.connections.add(socket);
      socket.once("close", () => this.connections.delete(socket));
      new ControlSession(socket, handler);
    });
  }

  public listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.endpoint, () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });
  }

  public close(): Promise<void> {
    if (!this.shutdown) this.shutdown = this.stopAccepting();
    return this.shutdown;
  }

  private async stopAccepting(): Promise<void> {
    const closed = new Promise<void>((resolve) => this.server.close(() => resolve()));
    // 收口连接才能释放上层 endpoint/lock；只停新连接会被半帧客户端永久阻塞。
    for (const socket of this.connections) socket.destroy();
    const deadline = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, CONTROL_CLOSE_TIMEOUT_MS);
      timer.unref();
    });
    await Promise.race([closed, deadline]);
    await rm(this.endpoint, { force: true }).catch(() => undefined);
  }
}

export async function createControlServer(
  endpoint: string,
  handler: ControlHandler,
): Promise<{ server: Server; close: () => Promise<void> }> {
  await rm(endpoint, { force: true }).catch(() => undefined);
  const separator = endpoint.lastIndexOf("/");
  await mkdir(separator === -1 ? "." : endpoint.slice(0, separator), { recursive: true }).catch(
    () => undefined,
  );
  const listener = new ControlListener(endpoint, handler);
  await listener.listen();
  await chmod(endpoint, 0o600).catch(() => undefined);
  return { server: listener.server, close: async () => await listener.close() };
}
