// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import test from "node:test";
import { httpConfig, objectArg, stdioConfig, withRig } from "./mcp-client-harness/rig.ts";
import type { UnknownRecord } from "./mcp-client-harness/types.ts";

const official = { mcpKey: "search", pluginId: "plugin-a", source: "plugin" };
const auth = { provider: "jwt_token", type: "knorvia_official" };

test("qualified official HTTP delegates to the retained fetch factory", async () => {
  await withRig(async (rig) => {
    const sentinelFetch = (() => {
      throw new Error("sentinel fetch must not be called");
    }) as typeof fetch;
    rig.seams.setValue("network.fetch", sentinelFetch);
    const trustedOrigins = {
      async isTrusted() {
        return { trusted: true };
      },
    };
    const authHeadersPort = {
      async resolveHeaders() {
        return { headers: { Authorization: "Bearer fixture" }, ok: true };
      },
    };
    const adapter = rig.adapter({
      officialMcpAuth: { authHeadersPort, trustedOrigins, workspaceIdentity: "workspace" },
      workingDirectory: "D:/workspace",
    });
    await adapter.connectServer("official", httpConfig({ auth, official }));
    const input = objectArg(rig.seams.call("official.createFetch").args, 0);
    assert.equal(input.authHeadersPort, authHeadersPort);
    assert.equal(input.trustedOrigins, trustedOrigins);
    assert.equal(input.official, official);
    assert.equal(input.serverName, "official");
    assert.equal(input.url, "https://mcp.example.test/rpc");
    assert.equal(input.workspaceIdentity, "workspace");
    assert.equal(input.workspacePath, "D:/workspace");
    assert.equal(input.baseFetch, sentinelFetch);
    const transportOptions = objectArg(rig.seams.call("sdk.http.construct").args, 1);
    assert.equal(transportOptions.fetch, sentinelFetch);
  });
});

test("missing official registry installs a fetch that throws only when called", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectServer("official", httpConfig({ auth, official }));
    assert.equal(rig.seams.callsFor("official.createFetch").length, 0);
    const transportOptions = objectArg(rig.seams.call("sdk.http.construct").args, 1);
    const fetchFn = transportOptions.fetch as (...args: unknown[]) => unknown;
    assert.throws(
      () => fetchFn("https://mcp.example.test/rpc"),
      (error: unknown) => {
        const value = error as UnknownRecord;
        return (
          value.kind === "official_auth_unavailable" &&
          String(value.message).includes(
            "official MCP trusted origin registry is not available in this runtime: official",
          )
        );
      },
    );
  });
});

test("stdio metadata reports unavailable ports without setting connection failure", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter({ officialMcpAuth: {} });
    await adapter.connectServer("official", stdioConfig({ auth, official }));
    const parameters = objectArg(rig.seams.call("stdio.processTree.construct").args, 0);
    const provider = parameters.requestMetaProvider as () => Promise<UnknownRecord>;
    const result = await provider();
    assert.deepEqual(result, {
      "com.knorvia-studio/official-mcp-auth": {
        ok: false,
        reason: "official_auth_unavailable",
      },
    });
    assert.equal((await adapter.status()).official?.status, "connected");
    const warning = rig.seams
      .callsFor("logger.warn")
      .find((call) => call.args[0] === "Official MCP stdio auth headers unavailable");
    assert.ok(warning);
  });
});

test("stdio untrusted origin preserves registry receiver and returns the precise reason", async () => {
  await withRig(async (rig) => {
    const trustedOrigins = {
      async isTrusted(this: unknown, input: UnknownRecord) {
        rig.seams.invoke("registry.isTrusted", this, [input]);
        return { detail: "fixture denied", trusted: false };
      },
    };
    const officialMcpAuth = {
      authHeadersPort: {
        async resolveHeaders() {
          throw new Error("must not reach headers");
        },
      },
      resolveKnorviaApiOrigin: () => "https://api.example.test",
      trustedOrigins,
    };
    const adapter = rig.adapter({ officialMcpAuth });
    await adapter.connectServer("official", stdioConfig({ auth, official }));
    const parameters = objectArg(rig.seams.call("stdio.processTree.construct").args, 0);
    const result = await (parameters.requestMetaProvider as () => Promise<UnknownRecord>)();
    assert.deepEqual(result, {
      "com.knorvia-studio/official-mcp-auth": {
        ok: false,
        reason: "official_mcp_origin_untrusted",
      },
    });
    assert.equal(rig.seams.call("registry.isTrusted").receiver, trustedOrigins);
    assert.deepEqual(rig.seams.call("registry.isTrusted").args[0], {
      mcpKey: "search",
      origin: "https://api.example.test",
      pluginId: "plugin-a",
    });
  });
});

test("trusted stdio metadata keeps header identity and logs only sorted header names", async () => {
  await withRig(async (rig) => {
    const headers = {
      Authorization: "Bearer fixture",
      "Bigmodel-Target-Type": "workspace",
      "X-Zeta": "z",
    };
    const trustedOrigins = {
      async isTrusted() {
        return { trusted: true };
      },
    };
    const authHeadersPort = {
      async resolveHeaders(this: unknown, input: UnknownRecord) {
        rig.seams.invoke("authHeaders.resolve", this, [input]);
        return { headers, ok: true };
      },
    };
    const adapter = rig.adapter({
      officialMcpAuth: {
        authHeadersPort,
        resolveKnorviaApiOrigin: () => "https://api.example.test",
        trustedOrigins,
        workspaceIdentity: "identity-a",
      },
      workingDirectory: "D:/workspace",
    });
    await adapter.connectServer("official", stdioConfig({ auth, official }));
    const parameters = objectArg(rig.seams.call("stdio.processTree.construct").args, 0);
    const payload = await (parameters.requestMetaProvider as () => Promise<UnknownRecord>)();
    assert.equal(
      (payload["com.knorvia-studio/official-mcp-auth"] as UnknownRecord).headers,
      headers,
    );
    assert.equal(rig.seams.call("authHeaders.resolve").receiver, authHeadersPort);
    assert.deepEqual(rig.seams.call("authHeaders.resolve").args[0], {
      mcpKey: "search",
      pluginId: "plugin-a",
      signal: rig.seams.callsFor("timeout.withTimeout")[0]!.args[3],
      targetOrigin: "https://api.example.test",
      workspaceIdentity: "identity-a",
      workspacePath: "D:/workspace",
    });
    const attached = rig.seams
      .callsFor("logger.debug")
      .find((call) => call.args[0] === "Official MCP stdio auth headers attached");
    assert.ok(attached);
    const context = objectArg(attached.args, 1);
    assert.deepEqual(context.identityHeaderNames, [
      "authorization",
      "bigmodel-target-type",
      "x-zeta",
    ]);
    assert.equal(context.identityTargetType, "workspace");
  });
});

test("stdio auth-header rejection propagates from the per-message provider", async () => {
  await withRig(async (rig) => {
    const rejection = new Error("headers offline");
    const adapter = rig.adapter({
      officialMcpAuth: {
        authHeadersPort: {
          async resolveHeaders() {
            throw rejection;
          },
        },
        resolveKnorviaApiOrigin: () => "https://api.example.test",
        trustedOrigins: {
          async isTrusted() {
            return { trusted: true };
          },
        },
      },
    });
    await adapter.connectServer("official", stdioConfig({ auth, official }));
    const parameters = objectArg(rig.seams.call("stdio.processTree.construct").args, 0);
    await assert.rejects(
      () => (parameters.requestMetaProvider as () => Promise<UnknownRecord>)(),
      rejection,
    );
  });
});

test("official response IDs correlate by span, overwrite result metadata, and stay bounded", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter({
      officialMcpAuth: {
        trustedOrigins: {
          async isTrusted() {
            return { trusted: true };
          },
        },
      },
    });
    await adapter.connectServer("official", httpConfig({ auth, official }));
    const officialInput = objectArg(rig.seams.call("official.createFetch").args, 0);
    const onResponse = officialInput.onServerResponse as (info: UnknownRecord) => void;
    for (let index = 0; index < 65; index += 1) {
      onResponse({
        httpStatus: 200,
        rpcMethod: "tools/call",
        serverRequestId: `request-${index}`,
        spanId: `span-${index}`,
      });
    }
    const originalMeta = { "knorvia/officialMcpServerRequestId": "server-value", retained: true };
    rig.seams.setHook("sdk.client.callTool", async () => ({
      content: [],
      isError: true,
      _meta: originalMeta,
    }));
    const evicted = await adapter.callTool({
      serverName: "official",
      toolName: "echo",
      trace: { spanId: "span-0", traceId: "trace" },
    });
    assert.equal(evicted._meta, originalMeta);
    const correlated = await adapter.callTool({
      serverName: "official",
      toolName: "echo",
      trace: { spanId: "span-64", traceId: "trace" },
    });
    assert.notEqual(correlated._meta, originalMeta);
    assert.equal(
      (correlated._meta as UnknownRecord)["knorvia/officialMcpServerRequestId"],
      "request-64",
    );
    assert.equal(originalMeta["knorvia/officialMcpServerRequestId"], "server-value");
  });
});
