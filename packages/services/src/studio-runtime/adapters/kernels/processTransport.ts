import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { errorText, record, safeDetail } from "../../domain/kernelPolicy.js";
import type { KernelExecutable } from "./executable.js";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export class ProtocolResponseError extends Error {
  constructor(
    readonly method: string,
    readonly response: unknown,
  ) {
    super(`${method}：${safeDetail(response)}`);
    this.name = "ProtocolResponseError";
  }
}

export class ProtocolProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly failure = deferred<Error>();
  readonly closed = deferred<void>();
  private ended = false;
  private faulted = false;
  private buffer = "";
  private decoder = new StringDecoder("utf8");
  private stderr = "";
  private serial = 0;
  private pending = new Map<
    string,
    { method: string; deferred: ReturnType<typeof deferred<unknown>> }
  >();

  constructor(
    executable: KernelExecutable,
    args: string[],
    cwd: string,
    private mode: "codex" | "claude" | "acp" | "antigravity",
    onMessage: (message: Record<string, unknown>) => void | Promise<void>,
    environment: NodeJS.ProcessEnv = {},
  ) {
    const env = { ...process.env, ...environment };
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    delete env.ELECTRON_RUN_AS_NODE;
    this.child = spawn(executable.command, [...executable.args, ...args], {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", (error) => this.fail(error));
    this.child.stderr.on("data", (chunk) => {
      this.stderr = safeDetail(this.stderr + String(chunk)).slice(-6000);
    });
    this.child.stdout.on("data", (chunk) => {
      this.buffer += this.decoder.write(chunk);
      if (Buffer.byteLength(this.buffer) > 16 * 1024 * 1024)
        return this.fail(new Error("CLI 协议帧超过 16 MB 限制"));
      let index: number;
      while ((index = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!line) continue;
        try {
          const message = record(JSON.parse(line));
          if (!Object.keys(message).length) throw new Error("CLI 返回了无效协议帧");
          if (!this.acceptResponse(message))
            Promise.resolve(onMessage(message)).catch((error) => this.fail(error));
        } catch (error) {
          this.fail(new Error(`CLI 协议解析失败：${errorText(error)}`));
        }
      }
    });
    this.child.on("close", (code, signal) => {
      this.ended = true;
      this.closed.resolve();
      this.fail(
        new Error(
          `CLI 进程退出 (${code ?? signal ?? "unknown"})${this.stderr ? `：${this.stderr}` : ""}`,
        ),
      );
    });
  }

  fail(error: unknown): void {
    if (this.faulted) return;
    this.faulted = true;
    this.failure.resolve(error instanceof Error ? error : new Error(errorText(error)));
  }
  wait<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      this.failure.promise.then((error) => {
        throw error;
      }),
    ]);
  }
  send(message: Record<string, unknown>): void {
    if (this.ended || this.child.stdin.destroyed) throw new Error("CLI 输入通道已关闭");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  notify(method: string, params: Record<string, unknown>): void {
    this.send({ ...(this.mode === "acp" ? { jsonrpc: "2.0" } : {}), method, params });
  }
  respond(id: unknown, result: Record<string, unknown>): void {
    if (this.mode === "claude")
      this.send({
        type: "control_response",
        response: { subtype: "success", request_id: id, response: result },
      });
    else this.send({ ...(this.mode === "acp" ? { jsonrpc: "2.0" } : {}), id, result });
  }
  reject(id: unknown, message: string): void {
    if (this.mode === "claude")
      this.send({
        type: "control_response",
        response: { subtype: "error", request_id: id, error: message },
      });
    else
      this.send({
        ...(this.mode === "acp" ? { jsonrpc: "2.0" } : {}),
        id,
        error: { code: -32601, message },
      });
  }
  async request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 25_000,
  ): Promise<Record<string, unknown>> {
    const id = `knorvia-${++this.serial}`;
    const request = deferred<unknown>();
    this.pending.set(id, { method, deferred: request });
    // prompt 生命周期由原生终态或用户取消结束；0 表示无固定运行预算。
    const timer =
      timeoutMs > 0
        ? setTimeout(() => request.reject(new Error(`${method} 等待响应超时`)), timeoutMs)
        : undefined;
    try {
      if (this.mode === "claude")
        this.send({
          type: "control_request",
          request_id: id,
          request: { subtype: method, ...params },
        });
      else this.send({ ...(this.mode === "acp" ? { jsonrpc: "2.0" } : {}), id, method, params });
      return record(await this.wait(request.promise));
    } finally {
      clearTimeout(timer);
      this.pending.delete(id);
    }
  }
  private acceptResponse(message: Record<string, unknown>): boolean {
    const response = this.mode === "claude" ? record(message.response) : message;
    const id = this.mode === "claude" ? response.request_id : message.id;
    if ((this.mode === "claude" && message.type !== "control_response") || message.method)
      return false;
    const pending = this.pending.get(String(id));
    if (!pending) return false;
    if (response.error || response.subtype === "error")
      pending.deferred.reject(new ProtocolResponseError(pending.method, response.error));
    else pending.deferred.resolve(this.mode === "claude" ? response.response : response.result);
    return true;
  }
  async close(): Promise<void> {
    if (this.ended) return;
    this.child.stdin.end();
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.closed.promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 350);
      }),
    ]);
    clearTimeout(timer);
    if (this.ended || !this.child.pid) return;
    await stopOwnedTree(this.child);
    await Promise.race([
      this.closed.promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 3000);
      }),
    ]);
    clearTimeout(timer);
  }
}

function joinSystemExecutable(name: string): string {
  return `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\${name}`;
}

export async function stopOwnedTree(child: ReturnType<typeof spawn>): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  // 只终止本对象 spawn 的 PID 树，绝不按进程名终止用户桌面 CLI。
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        joinSystemExecutable("taskkill.exe"),
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, shell: false, stdio: "ignore" },
      );
      const timer = setTimeout(() => {
        killer.kill();
        child.kill();
        resolve();
      }, 3000);
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      killer.once("error", () => {
        child.kill();
        finish();
      });
      killer.once("exit", finish);
    });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

export async function captureVersion(
  executable: KernelExecutable,
  signal?: AbortSignal,
  inspection?: { environment?: NodeJS.ProcessEnv; cwd?: string },
): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let output = "";
    let stderr = "";
    let settled = false;
    const env = { ...process.env, ...inspection?.environment };
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable.command, [...executable.args, "--version"], {
      env,
      ...(inspection?.cwd ? { cwd: inspection.cwd } : {}),
      detached: process.platform !== "win32",
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) void stopOwnedTree(child).finally(() => reject(error));
      else resolve(output.trim());
    };
    const abort = () => finish(new Error("版本探测已取消"));
    const timer = setTimeout(() => finish(new Error("CLI 版本探测超时")), 8000);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      if (output.length > 64_000) finish(new Error("无效的版本输出"));
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-2000);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) =>
      finish(code === 0 ? undefined : new Error(safeDetail(stderr) || `版本探测失败 (${code})`)),
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
