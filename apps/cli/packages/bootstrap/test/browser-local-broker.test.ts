// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createConnection, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { BrowserControlPort, Logger, McpServerConfig } from "@knorvia/contracts";
import { nodeReplBrowserBrokerRequestSchema } from "@knorvia/shared/node-repl-browser-broker";
import { callContext } from "../../node-repl-host/src/ipc.js";
import { createBrowserBridgeGlobals } from "../../node-repl-host/src/browser-bridge.js";
import { readNodeReplBrowserRuntimeBridge } from "../../node-repl-host/src/runtime-bridge.js";
import {
  createNodeReplBrowserBroker,
  injectNodeReplBrowserBroker,
  type NodeReplBrowserBroker,
} from "../src/app/node-repl-browser-broker.js";

const logger = { debug() {}, info() {}, warn() {}, error() {} } as unknown as Logger;
const ok = { ok: true, elapsedMs: 2 };
function setup(overrides: Partial<BrowserControlPort> = {}) {
  const calls: Array<{ op: string; input: unknown }> = [];
  const port: BrowserControlPort = {
    list: async (input) => {
      calls.push({ op: "list", input });
      return [];
    },
    execute: async (input) => {
      calls.push({ op: "execute", input });
      return ok;
    },
    ...overrides,
  };
  const broker = createNodeReplBrowserBroker({ browserControlPort: port, logger });
  return { broker, calls };
}
function listFrame(broker: NodeReplBrowserBroker) {
  return {
    op: "list",
    id: randomUUID(),
    token: broker.token,
    runtimeScope: "main",
    sessionId: "s",
  };
}
async function connect(broker: NodeReplBrowserBroker) {
  await broker.ready;
  const socket = createConnection(broker.socketPath);
  socket.on("error", () => {});
  await once(socket, "connect");
  return socket;
}
function readResponse(socket: Socket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    socket.once("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}
async function exchange(broker: NodeReplBrowserBroker, value: unknown) {
  const socket = await connect(broker);
  try {
    const response = readResponse(socket);
    socket.write(typeof value === "string" ? value : JSON.stringify(value) + "\n");
    return await response;
  } finally {
    socket.destroy();
  }
}

test("local list and execute preserve request identity, trace and results", async () => {
  const f = setup();
  try {
    assert.match(f.broker.token, /^[0-9a-f]{64}$/u);
    const list = {
      ...listFrame(f.broker),
      turnId: "turn",
      trace: { traceId: "trace", spanId: "span" },
    };
    assert.deepEqual(await exchange(f.broker, list), { id: list.id, ok: true, browsers: [] });
    const input = f.calls[0].input as Parameters<BrowserControlPort["list"]>[0];
    assert.equal(input.sessionId, "s");
    assert.equal(input.turnId, "turn");
    assert.deepEqual(input.traceContext, list.trace);
    assert.ok(input.signal instanceof AbortSignal);
    const exec = {
      ...listFrame(f.broker),
      op: "execute",
      browserId: "b",
      browserGeneration: 9,
      command: { method: "list" },
    };
    assert.deepEqual(await exchange(f.broker, exec), { id: exec.id, ok: true, result: ok });
    const executed = f.calls[1].input as Parameters<BrowserControlPort["execute"]>[0];
    assert.equal(executed.browserId, "b");
    assert.equal(executed.browserGeneration, 9);
    assert.deepEqual(executed.command, { method: "list" });
  } finally {
    await f.broker.close();
  }
});

test("authentication, subagent and schema failures never reach the port", async () => {
  const f = setup();
  try {
    for (const changes of [
      { token: "x".repeat(64) },
      { token: "x".repeat(32) },
      { runtimeScope: "subagent" },
      { workspacePath: "/forged" },
      { timeout: 10 },
    ]) {
      const frame = { ...listFrame(f.broker), ...changes };
      const result = await exchange(f.broker, frame);
      assert.equal(result.id, frame.id);
      assert.equal(result.ok, false);
      assert.equal(JSON.stringify(result).includes(f.broker.token), false);
    }
    assert.equal(f.calls.length, 0);
  } finally {
    await f.broker.close();
  }
});

test("invalid JSON gets a response id; port errors preserve the valid caller id", async () => {
  const f = setup({
    list: async () => {
      throw new Error("fixture failure");
    },
  });
  try {
    const malformed = await exchange(f.broker, "{invalid\n");
    assert.match(String(malformed.id), /^[0-9a-f-]{36}$/u);
    assert.equal(malformed.ok, false);
    const frame = listFrame(f.broker);
    assert.deepEqual(await exchange(f.broker, frame), {
      id: frame.id,
      ok: false,
      error: "fixture failure",
    });
  } finally {
    await f.broker.close();
  }
});

test("one connection admits only its first complete frame", async () => {
  const f = setup();
  try {
    const first = listFrame(f.broker),
      second = listFrame(f.broker);
    assert.equal(
      (await exchange(f.broker, JSON.stringify(first) + "\n" + JSON.stringify(second) + "\n")).id,
      first.id,
    );
    assert.equal(f.calls.length, 1);
  } finally {
    await f.broker.close();
  }
});

test("oversized inbound frames fail before port admission", async () => {
  const f = setup();
  try {
    const result = await exchange(f.broker, "x".repeat(1024 * 1024 + 1) + "\n");
    assert.equal(result.ok, false);
    assert.match(String(result.error), /exceeded 1 MiB/);
    assert.equal(f.calls.length, 0);
  } finally {
    await f.broker.close();
  }
});

test("disconnecting during a request aborts its port signal", async () => {
  let received!: () => void, signal: AbortSignal | undefined;
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  const f = setup({
    list: async (input) => {
      signal = input.signal;
      received();
      await new Promise<void>((resolve) =>
        signal?.addEventListener("abort", () => resolve(), { once: true }),
      );
      return [];
    },
  });
  const socket = await connect(f.broker);
  try {
    socket.write(JSON.stringify(listFrame(f.broker)) + "\n");
    await started;
    socket.destroy();
    await Promise.race([
      once(signal!, "abort"),
      delay(1000).then(() => {
        throw new Error("No disconnect cancellation");
      }),
    ]);
    assert.ok(signal?.aborted);
  } finally {
    socket.destroy();
    await f.broker.close();
  }
});

test("MCP injection only clones the matching stdio configuration", () => {
  const broker = {
    socketPath: "fixture",
    token: "test",
    ready: Promise.resolve(),
    close: async () => {},
  };
  const base: Record<string, McpServerConfig> = {
    node_repl: { type: "stdio", command: "fixture", env: { KEPT: "yes" } },
    other: { type: "stdio", command: "other" },
  };
  assert.equal(injectNodeReplBrowserBroker(base, undefined), base);
  const empty = {};
  assert.equal(injectNodeReplBrowserBroker(empty, broker), empty);
  const http: Record<string, McpServerConfig> = {
    node_repl: { type: "http", url: "https://example.test/mcp" },
  };
  assert.equal(injectNodeReplBrowserBroker(http, broker), http);
  const result = injectNodeReplBrowserBroker(base, broker);
  assert.notEqual(result, base);
  assert.equal(result.other, base.other);
  const beforeEntry = base.node_repl,
    afterEntry = result.node_repl;
  assert.ok(beforeEntry.type === "stdio" && afterEntry.type === "stdio");
  assert.deepEqual(beforeEntry.env, { KEPT: "yes" });
  assert.deepEqual(afterEntry.env, {
    KEPT: "yes",
    KNORVIA_NODE_REPL_BROWSER_BROKER_SOCKET: "fixture",
    KNORVIA_NODE_REPL_BROWSER_BROKER_TOKEN: "test",
  });
});

test("close before listening is safe and repeated close is safe", async () => {
  const { broker } = setup();
  await broker.close();
  await broker.close();
});

test("UTF-8 command values survive a split inside a multibyte character", async () => {
  const f = setup();
  const socket = await connect(f.broker);
  try {
    const response = readResponse(socket);
    const value = "中文🙂";
    const frame = Buffer.from(
      JSON.stringify({
        ...listFrame(f.broker),
        op: "execute",
        browserId: "b",
        browserGeneration: 1,
        command: { method: "fill", ref: "n", value },
      }) + "\n",
    );
    const split = frame.indexOf(Buffer.from(value)) + 1;
    socket.write(frame.subarray(0, split));
    await delay(40);
    socket.write(frame.subarray(split));
    assert.equal((await response).ok, true);
    assert.equal((f.calls[0].input as { command: { value: string } }).command.value, value);
  } finally {
    socket.destroy();
    await f.broker.close();
  }
});

test("broker close terminates idle peers without waiting for them to disconnect", async () => {
  const f = setup();
  const socket = await connect(f.broker);
  await delay(20);
  const closing = f.broker.close();
  let finished: boolean;
  try {
    finished = await Promise.race([closing.then(() => true), delay(250).then(() => false)]);
  } finally {
    socket.destroy();
    await closing;
  }
  assert.equal(finished, true);
});

test("browser metadata matches strict wire schema; Computer Use retains workspace fields", () => {
  const meta = {
    session_id: " s ",
    turn_id: " turn ",
    workspace_path: "/fixture",
    workspace_identity: " remote:fixture ",
    remote_session_id: "remote-session",
    trace_id: "trace",
    span_id: "span",
  };
  const browser = callContext(meta);
  const parsed = nodeReplBrowserBrokerRequestSchema.safeParse({
    id: randomUUID(),
    token: "x".repeat(64),
    op: "list",
    ...browser,
  });
  assert.equal(parsed.success, true);
  assert.equal("workspacePath" in browser, false);
  assert.equal("workspaceIdentity" in browser, false);
  assert.equal(browser.sessionId, "s");
  assert.equal(browser.turnId, "turn");
  const computer = callContext(meta, true);
  assert.equal(computer.workspacePath, "/fixture");
  assert.equal(computer.workspaceIdentity, "remote:fixture");
  assert.equal(computer.remoteSessionId, "remote-session");
  assert.equal(computer.workspaceKey, "remote:fixture");
});

test("real host bridge can discover over the authenticated broker with workspace metadata", async () => {
  const f = setup();
  const socketKey = "KNORVIA_NODE_REPL_BROWSER_BROKER_SOCKET";
  const tokenKey = "KNORVIA_NODE_REPL_BROWSER_BROKER_TOKEN";
  const before = { [socketKey]: process.env[socketKey], [tokenKey]: process.env[tokenKey] };
  try {
    await f.broker.ready;
    process.env[socketKey] = f.broker.socketPath;
    process.env[tokenKey] = f.broker.token;
    const active = {
      generation: 1,
      signal: new AbortController().signal,
      requestMeta: {
        session_id: "s",
        workspace_path: "/fixture",
        workspace_identity: "remote:fixture",
        remote_session_id: "remote-session",
      },
    };
    const globals = createBrowserBridgeGlobals({
      generation: 1,
      documentationRoot: "",
      getActiveCall: () => active,
      session: () => {
        throw new Error("Discovery should not record a command result");
      },
    });
    assert.deepEqual(await readNodeReplBrowserRuntimeBridge(globals).list(), []);
    assert.equal(f.calls.length, 1);
    assert.equal((f.calls[0].input as { sessionId: string }).sessionId, "s");
  } finally {
    for (const key of [socketKey, tokenKey] as const) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
    await f.broker.close();
  }
});

test("closing with an active request aborts the port and disposes its peer", async () => {
  let received!: () => void;
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  let aborted = false;
  const f = setup({
    list: async ({ signal }) => {
      received();
      await new Promise<void>((resolve) =>
        signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        ),
      );
      return [];
    },
  });
  const socket = await connect(f.broker);
  socket.write(JSON.stringify(listFrame(f.broker)) + "\n");
  await started;
  const closing = f.broker.close();
  try {
    assert.equal(closing, f.broker.close());
    assert.equal(aborted, true);
    await Promise.race([
      closing,
      delay(1000).then(() => {
        throw new Error("Broker close stalled");
      }),
    ]);
    await delay(0);
    assert.equal(aborted, true);
  } finally {
    socket.destroy();
    await closing;
  }
});

test("error diagnostics do not return the broker credential", async () => {
  const f = setup({
    list: async () => {
      throw new Error(`Fixture ${f.broker.token} failure`);
    },
  });
  try {
    const malformed = await exchange(f.broker, `not-json-${f.broker.token}\n`);
    assert.equal(malformed.error, "Node REPL browser broker request is not valid JSON");
    const result = await exchange(f.broker, listFrame(f.broker));
    assert.equal(result.error, "Fixture [redacted] failure");
  } finally {
    await f.broker.close();
  }
});

test("a complete frame at the byte limit is accepted without truncation", async () => {
  const f = setup();
  try {
    const frame = {
      ...listFrame(f.broker),
      op: "execute",
      browserId: "b",
      browserGeneration: 1,
      command: { method: "fill", ref: "n", value: "" },
    };
    const size = 1024 * 1024 - Buffer.byteLength(JSON.stringify(frame) + "\n");
    frame.command.value = "a".repeat(size);
    assert.equal((await exchange(f.broker, frame)).ok, true);
    assert.equal((f.calls[0].input as { command: { value: string } }).command.value.length, size);
  } finally {
    await f.broker.close();
  }
});
