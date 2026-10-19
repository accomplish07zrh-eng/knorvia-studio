// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// v4 公开协议入口的黑盒驱动：spawn 真实 app-server --stdio，只读写 NDJSON。
// 不 import 任何 bootstrap/core 内部模块；新运行时实现后同一套用例原样复跑。
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createInterface } from "node:readline";
import { assertBridgeEntry, resolveBridgeEntry } from "./entry.mjs";

const DEFAULT_TIMEOUT_MS = 20_000;
const RUNTIME_PREFERENCES = {
  nativeSearchEnhancementsEnabled: false,
  memoryEnabled: false,
  askUserQuestionAutoResolutionEnabled: true,
};

export async function makeTempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

export function removeTempDir(directory) {
  return rm(directory, { recursive: true, force: true });
}

/**
 * 子进程环境：清除外部 DSH_* 与供应商凭据，隔离 HOME/数据目录。
 * 引擎由测试专用的 KNORVIA_BRIDGE_ENGINE 选择（legacy | dsh），
 * 只有选择 dsh 时才写入产品开关 KNORVIA_KERNEL_ENGINE=dsh。
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
    KNORVIA_STORAGE_DIR: join(home, "cli"),
    HOME: home,
    USERPROFILE: home,
  });
  const engine = process.env.KNORVIA_BRIDGE_ENGINE?.trim();
  if (engine) env.KNORVIA_KERNEL_ENGINE = engine;
  Object.assign(env, extra);
  return env;
}

export function commandEnvelope({
  commandId,
  sessionId = null,
  type,
  payload,
  baseRevision,
  baseLogEpoch,
}) {
  return {
    commandId,
    clientId: "bridge-contract",
    sessionId,
    ...(baseRevision !== undefined ? { baseRevision } : {}),
    ...(baseLogEpoch !== undefined ? { baseLogEpoch } : {}),
    type,
    payload,
    issuedAt: Date.now(),
  };
}

export function newCommandId(prefix) {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

  const state = {
    stdoutText: "",
    stderrText: "",
    lines: [],
    invalidLines: [],
    exit: undefined,
  };
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
      state.invalidLines.push(line);
      return;
    }
    state.lines.push(message);
    const index = messages.length;
    messages.push(message);
    // 反向请求（server → client）必须应答；默认返回最小运行时偏好。
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
          new Error(`app-server exited before match; stderr tail=${tail(state.stderrText)}`),
        );
      }
      resolveExit(state.exit);
    });
  });
  exitPromise.catch(() => {});

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
          rejectWait(
            new Error(
              `timed out waiting for ${label} after ${timeoutMs}ms; stderr tail=${tail(
                state.stderrText,
              )}`,
            ),
          );
        }, timeoutMs),
      };
      waiters.add(waiter);
    });
  }

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
    messageCount: () => messages.length,
    messages: () => messages,
    sleep,
  };
}

export function frameMatches(
  message,
  { topic, subscriptionId, deliveryKind, payloadKind, fromSeq },
) {
  if (message.method !== "v4/conversation/frame") return false;
  const wire = message.params;
  if (!wire || wire.wireVersion !== 3 || typeof wire.frame !== "object") return false;
  if (topic !== undefined && wire.topic !== topic) return false;
  if (subscriptionId !== undefined && wire.subscriptionId !== subscriptionId) return false;
  if (deliveryKind !== undefined && wire.deliveryKind !== deliveryKind) return false;
  if (payloadKind !== undefined && wire.frame.payload?.kind !== payloadKind) return false;
  if (fromSeq !== undefined && wire.frame.fromSeq !== fromSeq) return false;
  return true;
}

export async function waitForFrame(app, criteria, options = {}) {
  return app.waitForMessage((message) => frameMatches(message, criteria), {
    label: `frame ${JSON.stringify(criteria)}`,
    ...options,
  });
}

export function expectedAccepted(response) {
  assert.equal(response.error, undefined, `unexpected protocol error: ${JSON.stringify(response)}`);
  assert.equal(
    response.result?.status,
    "accepted",
    `ACK not accepted: ${JSON.stringify(response)}`,
  );
  return response.result;
}

export function expectedAckStatus(response, status) {
  assert.equal(response.error, undefined, `unexpected protocol error: ${JSON.stringify(response)}`);
  assert.equal(response.result?.status, status, `ACK not ${status}: ${JSON.stringify(response)}`);
  return response.result;
}

export async function createDraftSession(app, workspacePath, options = {}) {
  const commandId = options.commandId ?? newCommandId("create");
  const response = await app.request(
    "v4/command",
    commandEnvelope({
      commandId,
      type: "createSession",
      payload: { workspaceId: workspacePath },
    }),
  );
  const ack = expectedAccepted(response);
  const sessionId = ack.result?.sessionId;
  assert.equal(
    typeof sessionId,
    "string",
    `createSession ACK missing sessionId: ${JSON.stringify(ack)}`,
  );
  return { sessionId, ack, commandId };
}

export async function subscribeConversation(app, params, options = {}) {
  const response = await app.request("v4/conversation/subscribe", params, options);
  assert.equal(response.error, undefined, `subscribe failed: ${JSON.stringify(response)}`);
  return response.result.ack;
}

export function workspaceRef(workspacePath) {
  return { workspacePath, workspaceKey: workspacePath };
}

function tail(text, limit = 1200) {
  return JSON.stringify(text.slice(-limit));
}
