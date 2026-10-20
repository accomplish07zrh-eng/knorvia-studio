// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-02 契约测试的公开入口解析与共享驱动。
//
// 只经公开入口做事：`app-server --stdio` 的 NDJSON（与 kernel-bridge-01 同一口径），
// 不 import 任何 bootstrap/core 内部实现模块。
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { resolveBridgeEntry, assertBridgeEntry, repoRoot } from "./entry.mjs";

/** 单条消息的等待上限；任何时序断言都必须靠事件驱动，不能靠这个值凑结果。 */
const DEFAULT_TIMEOUT_MS = 20_000;

/** 反向请求（CLI → Host）的最小应答；契约测试只关心形状，不关心偏好内容。 */
const RUNTIME_PREFERENCES = {
  nativeSearchEnhancementsEnabled: false,
  memoryEnabled: false,
  askUserQuestionAutoResolutionEnabled: true,
};

export { repoRoot };

/**
 * 造一个临时目录；调用方负责用 {@link removeTempDir} 收尾。
 *
 * @param prefix - 目录名前缀，便于定位残留。
 * @returns 临时目录的绝对路径。
 */
export async function makeTempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * 删一个临时目录。多动作清理各自 try/catch 由调用方保证。
 *
 * @param directory - 要删的目录。
 */
export async function removeTempDir(directory) {
  await rm(directory, { recursive: true, force: true, maxRetries: 3 });
}

/**
 * 子进程环境：清除宿主继承的 DSH_* 与凭据形变量，隔离 HOME 与数据目录。
 * 只有选择 dsh 引擎时才写产品开关。
 *
 * @param options.home - 隔离后的主目录。
 * @param options.dataBase - 数据根。
 * @param options.extra - 额外注入的变量。
 * @returns 可直接传给 spawn 的环境对象。
 */
export function protocolEnv({ home, dataBase, extra = {} }) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.toUpperCase().startsWith("DSH_")) continue;
    if (key === "KNORVIA_KERNEL_ENGINE") continue;
    if (/(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET|PASSWORD|_KEY)$/iu.test(key)) {
      continue;
    }
    env[key] = value;
  }
  Object.assign(env, {
    KNORVIA_ENV: "test",
    KNORVIA_DATA_BASE_DIR: dataBase,
    HOME: home,
    USERPROFILE: home,
  });
  const engine = process.env.KNORVIA_BRIDGE_ENGINE?.trim();
  if (engine) env.KNORVIA_KERNEL_ENGINE = engine;
  Object.assign(env, extra);
  return env;
}

/**
 * 造一条 v4 命令信封。字段与 `@knorvia/shared` 的 envelope schema 对齐。
 *
 * @param input.commandId - 幂等键。
 * @param input.sessionId - 目标会话；`null` 表示全局（如 createSession）。
 * @param input.type - 命令字面量（权威源：`commandPayloadSchemas`）。
 * @param input.payload - 该命令的 payload。
 * @returns 可写进 `v4/command` params 的信封。
 */
export function commandEnvelope({ commandId, sessionId = null, type, payload }) {
  return {
    commandId,
    clientId: "bridge-02-contract",
    sessionId,
    type,
    payload,
    issuedAt: Date.now(),
  };
}

/**
 * 造一个唯一的 commandId。
 *
 * @param prefix - 便于在日志里定位前缀。
 * @returns 该进程内唯一的字符串。
 */
export function newCommandId(prefix) {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 起一个真实的 `app-server --stdio`，只通过 NDJSON 驱动。
 *
 * @param options.cwd - 子进程工作目录。
 * @param options.home - 隔离后的主目录。
 * @returns 驱动器：`request`、`waitForMessage`、`close`、`messages` 等。
 */
export async function spawnBridgeApp({ cwd, home }) {
  const entry = resolveBridgeEntry();
  assertBridgeEntry(entry);
  const dataBase = join(home, "data");
  const child = spawn(process.execPath, [entry, "app-server", "--stdio"], {
    cwd,
    env: protocolEnv({ home, dataBase }),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const state = { stdoutText: "", stderrText: "", lines: [], exit: undefined };
  const messages = [];
  const waiters = new Set();
  let nextId = 0;
  let closed = false;

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    state.stderrText += chunk;
  });
  const reader = createInterface({ input: child.stdout });
  reader.on("line", (line) => {
    state.stdoutText += `${line}\n`;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    state.lines.push(message);
    const index = messages.length;
    messages.push(message);
    // 反向请求必须应答，否则 CLI 侧会一直挂着等。
    if (message.method !== undefined && message.id !== undefined) {
      child.stdin.write(`${JSON.stringify({ id: message.id, result: RUNTIME_PREFERENCES })}\n`);
    }
    for (const waiter of waiters) {
      if (waiter.predicate(message, index)) {
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve({ message, index });
      }
    }
  });

  const exitPromise = new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => {
      state.exit = { code, signal };
      for (const waiter of waiters) {
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.reject(
          new Error(`app-server exited before match; stderr=${tail(state.stderrText)}`),
        );
      }
      resolveExit(state.exit);
    });
  });
  exitPromise.catch(() => {});

  /**
   * 等到第一条满足条件的消息。只由消息事件驱动，不 sleep。
   *
   * @param predicate - 判定函数。
   * @param options.after - 从该下标之后开始找。
   * @param options.timeoutMs - 仅作挂起兜底。
   * @param options.label - 报错时的描述。
   * @returns `{ message, index }`。
   */
  function waitForMessage(predicate, options = {}) {
    const { after = 0, timeoutMs = DEFAULT_TIMEOUT_MS, label = "message" } = options;
    for (let index = after; index < messages.length; index += 1) {
      const message = messages[index];
      if (predicate(message, index)) return Promise.resolve({ message, index });
    }
    return new Promise((resolveWait, rejectWait) => {
      const waiter = {
        predicate,
        resolve: resolveWait,
        reject: rejectWait,
        timer: setTimeout(() => {
          waiters.delete(waiter);
          rejectWait(new Error(`timed out waiting for ${label}; stderr=${tail(state.stderrText)}`));
        }, timeoutMs),
      };
      waiters.add(waiter);
    });
  }

  /**
   * 发一条请求并等它的应答。
   *
   * @param method - 协议方法名。
   * @param params - 参数。
   * @param options.timeoutMs - 挂起兜底。
   * @returns 应答消息。
   */
  async function request(method, params, options = {}) {
    if (closed) throw new Error("app-server is closed");
    const id = `client-${(nextId += 1)}`;
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    const { message } = await waitForMessage(
      (candidate) => candidate.id === id && candidate.method === undefined,
      { label: `${method} response`, timeoutMs: options.timeoutMs },
    );
    return message;
  }

  /** 收尾：先关 stdin，再等进程退出；只在超时兜底时才用句柄强杀自己起的子进程。 */
  async function close() {
    if (closed) return state.exit;
    closed = true;
    reader.close();
    child.stdin.end();
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    const exit = await exitPromise;
    clearTimeout(timer);
    return exit;
  }

  return {
    child,
    state,
    request,
    waitForMessage,
    close,
    messages: () => messages,
    messageCount: () => messages.length,
  };
}

/** 截一段 stderr 尾巴进错误信息，避免整段日志刷屏。 */
function tail(text, limit = 1200) {
  return JSON.stringify(text.slice(-limit));
}

/**
 * 抽 v4 帧里的关键字段，供事件序列断言使用。
 * 帧是嵌套在 `v4/conversation/frame` 通知里的；这里只取契约关心的那几项。
 *
 * @param message - 一条协议消息。
 * @returns 帧摘要，或 undefined（不是帧消息时）。
 */
export function summarizeFrame(message) {
  if (message.method !== "v4/conversation/frame") return undefined;
  const wire = message.params;
  const frame = wire?.frame;
  if (frame === undefined) return undefined;
  return {
    topic: wire.topic,
    subscriptionId: wire.subscriptionId,
    deliveryKind: wire.deliveryKind,
    kind: frame.kind,
    fromSeq: frame.fromSeq,
    payloadKind: frame.payload?.kind,
    payload: frame.payload,
  };
}

/**
 * 断言一条应答是 accepted ACK，返回 ACK 本体。
 *
 * @param response - `request()` 的返回值。
 * @param label - 报错描述。
 * @returns ACK 的 result。
 */
export function expectedAccepted(response, label = "command") {
  if (response.error !== undefined) {
    throw new Error(`${label} 意外协议错误: ${JSON.stringify(response.error)}`);
  }
  const result = response.result;
  if (result?.status !== "accepted") {
    throw new Error(`${label} ACK 不是 accepted: ${JSON.stringify(response)}`);
  }
  return result;
}
