// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import test from "node:test";
import { deferred, flushMicrotasks } from "./mcp-client-harness/clock.ts";
import { httpConfig, objectArg, stdioConfig, withRig } from "./mcp-client-harness/rig.ts";
import type { UnknownRecord } from "./mcp-client-harness/types.ts";

type SdkErrorConstructor = new (code: string, message: string, data?: unknown) => Error;
type SimpleErrorConstructor = new (message: string) => Error;

test("transport/connect failures use HTTP and stdio phase fallbacks", async () => {
  await withRig(async (rig) => {
    rig.seams.setHook("sdk.client.connect", async () => {
      throw new Error("connect failed");
    });
    const adapter = rig.adapter();
    const http = await adapter.connectServer("http", httpConfig());
    const stdio = await adapter.connectServer("stdio", stdioConfig());
    assert.equal(http.failureKind, "network_unreachable");
    assert.equal(stdio.failureKind, "process_start_failed");
    const failed = rig.seams
      .callsFor("logger.warn")
      .filter((call) => call.args[0] === "MCP server connection failed");
    assert.equal(objectArg(failed[0]!.args, 1).connectDurationMs, undefined);
    assert.equal(objectArg(failed[0]!.args, 1).listToolsDurationMs, undefined);
  });
});

test("tool-list phase keeps tool_list_failed even for McpTimeoutError", async () => {
  await withRig(async (rig) => {
    const McpTimeoutError = rig.retained.McpTimeoutError as SimpleErrorConstructor;
    rig.seams.setHook("sdk.client.listTools", async () => {
      throw new McpTimeoutError("list timed out");
    });
    const status = await rig.adapter().connectServer("alpha", httpConfig());
    assert.equal(status.status, "failed");
    assert.equal(status.failureKind, "tool_list_failed");
    const failed = rig.seams
      .callsFor("logger.warn")
      .find((call) => call.args[0] === "MCP server connection failed");
    assert.ok(failed);
    assert.equal(objectArg(failed.args, 1).connectDurationMs, 0);
    assert.equal(objectArg(failed.args, 1).listToolsDurationMs, undefined);
  });
});

test("connect timeout outranks protocol-negotiation fallback", async () => {
  await withRig(async (rig) => {
    const McpTimeoutError = rig.retained.McpTimeoutError as SimpleErrorConstructor;
    const SdkError = rig.retained.SdkError as SdkErrorConstructor;
    const protocol = new SdkError("ERA_NEGOTIATION_FAILED", "era failed");
    const timeout = new McpTimeoutError("connect timed out");
    Object.assign(timeout, { cause: protocol });
    rig.seams.setHook("sdk.client.connect", async () => {
      throw timeout;
    });
    const status = await rig.adapter().connectServer("alpha", httpConfig());
    assert.equal(status.failureKind, "connection_timeout");
  });
});

test("typed negotiation errors classify through a cause chain without text matching", async () => {
  await withRig(async (rig) => {
    const SdkError = rig.retained.SdkError as SdkErrorConstructor;
    const leaf = new SdkError("ERA_NEGOTIATION_FAILED", "unrelated words");
    const outer = Object.assign(new Error("ordinary failure"), { cause: leaf });
    rig.seams.setHook("sdk.client.connect", async () => {
      throw outer;
    });
    const status = await rig.adapter().connectServer("alpha", httpConfig());
    assert.equal(status.failureKind, "protocol_negotiation_failed");
  });
});

test("official origin classification outranks response diagnostics while request ID is retained", async () => {
  await withRig(async (rig) => {
    rig.seams.setHook("sdk.client.connect", async () => {
      const input = objectArg(rig.seams.call("official.createFetch").args, 0);
      (input.onAuthFailure as (kind: string) => void)("official_mcp_origin_untrusted");
      (input.onServerResponse as (info: UnknownRecord) => void)({
        failureKind: "rate_limited",
        httpStatus: 429,
        serverRequestId: "request-429",
      });
      throw new Error("connect rejected");
    });
    const adapter = rig.adapter({
      officialMcpAuth: {
        trustedOrigins: {
          async isTrusted() {
            return { trusted: true };
          },
        },
      },
    });
    const status = await adapter.connectServer(
      "official",
      httpConfig({
        auth: { provider: "jwt_token", type: "knorvia_official" },
        official: { mcpKey: "search", pluginId: "plugin-a", source: "plugin" },
      }),
    );
    assert.equal(status.failureKind, "official_origin_untrusted");
    assert.equal(status.serverRequestId, "request-429");
    assert.equal(status.error, "connect rejected - request-429");
  });
});

test("a stale failure closes its resources without replacing newer success", async () => {
  await withRig(async (rig) => {
    const firstGate = deferred<void>();
    let clientIndex = 0;
    const ids = new WeakMap<object, number>();
    rig.seams.setHook("sdk.client.construct", (receiver) =>
      ids.set(receiver as object, ++clientIndex),
    );
    rig.seams.setHook("sdk.client.connect", async (receiver) => {
      if (ids.get(receiver as object) === 1) {
        await firstGate.promise;
        throw new Error("old failed");
      }
    });
    const adapter = rig.adapter();
    const old = adapter.connectServer("alpha", httpConfig({ url: "https://old.test" }));
    await flushMicrotasks();
    const current = await adapter.connectServer("alpha", httpConfig({ url: "https://new.test" }));
    assert.equal(current.status, "connected");
    firstGate.resolve();
    assert.equal((await old).status, "connected");
    assert.equal((await adapter.status()).alpha?.status, "connected");
    const failedLogs = rig.seams
      .callsFor("logger.warn")
      .filter((call) => call.args[0] === "MCP server connection failed");
    assert.equal(failedLogs.length, 0);
  });
});

test("connected-log failure re-enters failure convergence and clears tools", async () => {
  await withRig(async (rig) => {
    rig.seams.setHook("sdk.client.listTools", async () => ({
      tools: [{ inputSchema: {}, name: "echo" }],
    }));
    rig.seams.setHook("logger.info", (_receiver, message) => {
      if (message === "MCP server connected") throw new Error("success log failed");
    });
    const adapter = rig.adapter();
    const status = await adapter.connectServer("alpha", httpConfig());
    assert.equal(status.status, "failed");
    assert.equal(status.failureKind, "tool_list_failed");
    assert.deepEqual(await adapter.listTools(), []);
  });
});
