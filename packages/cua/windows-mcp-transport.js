import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { WindowsComputerUseError } from "./windows-contract.js";

const LIMIT = 32 * 1024 * 1024;
const error = (code, dispatched = false) =>
  new WindowsComputerUseError(code, `Computer driver reported ${code}.`, {
    dispatched,
    outcome: dispatched ? "unknown" : "not-dispatched",
  });

// 每个可信 scope 独占 stdio transport；进程的 implicit session 不会串到另一个会话。
export async function createCuaMcpTransport(options) {
  if ((options.platform ?? process.platform) !== "win32") throw error("unsupported_platform");
  if (typeof options.driverPath !== "string" || !isAbsolute(options.driverPath))
    throw error("driver_unavailable");
  const home = await mkdtemp(join(tmpdir(), "knorvia-cua-"));
  const env = {};
  for (const key of [
    "SystemRoot",
    "WINDIR",
    "PATH",
    "PATHEXT",
    "TEMP",
    "TMP",
    "LOCALAPPDATA",
    "APPDATA",
    "USERPROFILE",
    "COMSPEC",
  ])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    CUA_DRIVER_RS_HOME: home,
    CUA_DRIVER_RS_TELEMETRY_ENABLED: "false",
    CUA_DRIVER_RS_UPDATE_CHECK: "false",
    CUA_DRIVER_PERMISSION_MODE: "standard",
  });
  let child;
  try {
    child = (options.spawn ?? spawn)(options.driverPath, ["mcp", "--direct", "--embedded"], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env,
      cwd: home,
    });
  } catch {
    await rm(home, { recursive: true, force: true });
    throw error("driver_unavailable");
  }
  const decoder = new StringDecoder("utf8");
  const pending = new Map();
  let buffer = "";
  let stderrBytes = 0;
  let nextId = 0;
  let closingCode;
  let exited = false;
  let settleClose;
  const closed = new Promise((resolve) => {
    settleClose = resolve;
  });
  const maxBytes = Math.min(LIMIT, Math.max(1024, options.maxOutputBytes ?? LIMIT));
  const terminate = (code) => {
    closingCode ??= code;
    if (!exited) {
      try {
        child.kill();
      } catch {
        /* close 事件才确认进程退出，不能提前放行。 */
      }
    }
  };
  const write = (message) => {
    const line = JSON.stringify(message) + "\n";
    if (Buffer.byteLength(line) > 64 * 1024) throw error("invalid_request");
    child.stdin.write(line);
  };
  child.once("error", () => terminate("driver_unavailable"));
  child.stdin.on("error", () => terminate("driver_transport"));
  child.stdout.on("data", (chunk) => {
    if (closingCode) return;
    buffer += decoder.write(chunk);
    // 逐行有界并保留跨块 UTF-8；不能把一次 data 事件当作一条 JSON 消息。
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) {
        if (Buffer.byteLength(buffer) > maxBytes) terminate("driver_output_limit");
        break;
      }
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > maxBytes) {
        terminate("driver_output_limit");
        break;
      }
      try {
        const message = JSON.parse(line);
        if (!message || message.jsonrpc !== "2.0" || Array.isArray(message)) throw new Error();
        if (typeof message.method === "string") {
          // 拒绝 server 发起的 sampling/elicitation/roots 等请求，无模型或文件系统代理。
          if (Object.hasOwn(message, "id"))
            write({
              jsonrpc: "2.0",
              id: message.id,
              error: { code: -32601, message: "Client method unavailable" },
            });
          else if (!message.method.startsWith("notifications/")) throw new Error();
          continue;
        }
        const entry = pending.get(message.id);
        if (!entry || Object.hasOwn(message, "result") === Object.hasOwn(message, "error"))
          throw new Error();
        pending.delete(message.id);
        entry.cleanup();
        if (Object.hasOwn(message, "error"))
          entry.reject(error("driver_rpc_error", entry.dispatched));
        else entry.resolve(message.result);
      } catch {
        terminate("invalid_driver_result");
        break;
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    // 诊断只计数，绝不输出截图、标题、输入文本或原生异常正文。
    stderrBytes += chunk.length;
    if (stderrBytes > 64 * 1024) terminate("driver_output_limit");
  });
  child.once("close", async () => {
    exited = true;
    closingCode ??= "driver_exit";
    for (const entry of pending.values()) {
      entry.cleanup();
      entry.reject(error(closingCode, entry.dispatched));
    }
    pending.clear();
    buffer = "";
    // 仅清理由此调用 mkdtemp 返回的自有目录，且必须在子进程 close 之后。
    try {
      await rm(home, { recursive: true, force: true });
    } catch {
      /* 清理失败不掩盖操作首因。 */
    }
    settleClose();
  });
  const request = (method, params, call = {}, sideEffect = false) => {
    if (closingCode || exited) return Promise.reject(error(closingCode ?? "driver_exit"));
    if (call.signal?.aborted) return Promise.reject(error("cancelled"));
    const id = ++nextId;
    const message = { jsonrpc: "2.0", id, method, params };
    if (Buffer.byteLength(JSON.stringify(message)) > 64 * 1024)
      return Promise.reject(error("invalid_request"));
    return new Promise((resolve, reject) => {
      const abort = () => terminate("cancelled");
      const timer = setTimeout(
        () => terminate("driver_timeout"),
        Math.min(60000, Math.max(1, call.timeoutMs ?? 15000)),
      );
      const cleanup = () => {
        clearTimeout(timer);
        call.signal?.removeEventListener("abort", abort);
      };
      const entry = { resolve, reject, cleanup, dispatched: false };
      pending.set(id, entry);
      call.signal?.addEventListener("abort", abort, { once: true });
      if (call.signal?.aborted) {
        abort();
        return;
      }
      try {
        // 写入之后即可能执行，任何回执丢失都不能自动重放。
        entry.dispatched = sideEffect;
        write(message);
      } catch {
        terminate("driver_transport");
      }
    });
  };
  const transport = {
    request,
    get alive() {
      return !closingCode && !exited;
    },
    async close() {
      terminate("cancelled");
      await closed;
    },
  };
  try {
    const hello = await request(
      "initialize",
      {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "knorvia-computer-use", version: "1.0.0" },
      },
      options.initialCall,
    );
    if (
      hello?.protocolVersion !== "2025-06-18" ||
      hello.serverInfo?.name !== "cua-driver" ||
      hello.serverInfo?.version !== "0.30.1"
    )
      throw error("driver_version_mismatch");
    write({ jsonrpc: "2.0", method: "notifications/initialized" });
    return transport;
  } catch (failure) {
    await transport.close();
    throw failure;
  }
}
