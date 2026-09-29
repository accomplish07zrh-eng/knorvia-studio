// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import test from "node:test";
import { deferred, flushMicrotasks } from "./mcp-client-harness/clock.ts";
import { httpConfig, objectArg, stdioConfig, withRig } from "./mcp-client-harness/rig.ts";
import type { UnknownRecord } from "./mcp-client-harness/types.ts";

function oauthFailure(reason = "no_credentials"): Error {
  return Object.assign(new Error("authorization required"), { fixtureOAuthTrigger: { reason } });
}

test("stdio and qualified official HTTP do not create ordinary OAuth providers", async () => {
  await withRig(async (rig) => {
    const trustedOrigins = {
      async isTrusted() {
        return { trusted: true };
      },
    };
    const adapter = rig.adapter({ officialMcpAuth: { trustedOrigins } });
    await adapter.connectServer("stdio", stdioConfig());
    await adapter.connectServer(
      "official",
      httpConfig({
        auth: { provider: "jwt_token", type: "knorvia_official" },
        official: { mcpKey: "search", pluginId: "plugin-a", source: "plugin" },
      }),
    );
    assert.equal(rig.seams.callsFor("oauth.createProvider").length, 0);
    assert.equal(rig.seams.callsFor("sdk.clientCredentials.construct").length, 0);
  });
});

test("default auth-code provider is excluded only by an own Authorization header", async () => {
  await withRig(async (rig) => {
    const inherited = Object.create({ Authorization: "Bearer inherited" }) as UnknownRecord;
    inherited["X-Fixture"] = "yes";
    const adapter = rig.adapter();
    await adapter.connectServer("default", httpConfig({ headers: inherited }));
    await adapter.connectServer("excluded", httpConfig({ headers: { authorization: "anything" } }));
    assert.equal(rig.seams.callsFor("oauth.createProvider").length, 1);
  });
});

test("explicit authorization_code wins even when headers carry Authorization", async () => {
  await withRig(async (rig) => {
    const config = { clientId: "client-a", scope: "read", type: "authorization_code" };
    const adapter = rig.adapter();
    await adapter.connectServer(
      "alpha",
      httpConfig({ headers: { Authorization: "Bearer fixed" }, oauth: config }),
    );
    const input = objectArg(rig.seams.call("oauth.createProvider").args, 0);
    assert.equal(input.config, config);
    assert.equal(input.serverName, "alpha");
    assert.equal(input.serverUrl, "https://mcp.example.test/rpc");
  });
});

test("client credentials use SDK provider with nullish client-name default", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter({ clientName: "desktop" });
    await adapter.connectServer(
      "alpha",
      httpConfig({
        oauth: {
          clientId: "id",
          clientSecret: "secret",
          scope: "read",
          type: "client_credentials",
        },
      }),
    );
    const options = objectArg(rig.seams.call("sdk.clientCredentials.construct").args, 0);
    assert.deepEqual(options, {
      clientId: "id",
      clientName: "desktop-alpha",
      clientSecret: "secret",
      scope: "read",
    });
    assert.equal(Object.hasOwn(options, "expectedIssuer"), false);
  });
});

test("runtime token providers cache one credential store per adapter", async () => {
  await withRig(async (rig) => {
    const store = { marker: "store" };
    rig.seams.setValue("credentials.store", store);
    const adapter = rig.adapter();
    await adapter.connectServer("one", httpConfig({ oauth: { type: "authorization_code" } }));
    await adapter.connectServer(
      "two",
      httpConfig({ oauth: { type: "authorization_code" }, url: "https://two.test/rpc" }),
    );
    assert.equal(rig.seams.callsFor("credentials.createStore").length, 1);
    const providers = rig.seams.callsFor("oauth.createProvider");
    assert.equal(objectArg(providers[0]!.args, 0).credentialStore, store);
    assert.equal(objectArg(providers[1]!.args, 0).credentialStore, store);
  });
});

test("connect-time interactive authorization closes, authorizes, then retries once", async () => {
  await withRig(async (rig) => {
    let connects = 0;
    rig.seams.setHook("sdk.client.connect", async () => {
      connects += 1;
      if (connects === 1) throw oauthFailure();
    });
    rig.seams.setHook("oauth.runInteractive", async () => ({ status: "authorized" }));
    const adapter = rig.adapter({ mcpOAuth: { authorizationTimeoutMs: 77 } });
    const status = await adapter.connectServer(
      "alpha",
      httpConfig({ oauth: { clientId: "client", type: "authorization_code" } }),
      { oauthAuthorizationTimeoutMs: 5 },
    );
    assert.equal(status.status, "connected");
    assert.equal(connects, 2);
    assert.equal(rig.seams.callsFor("sdk.client.close").length, 1);
    const input = objectArg(rig.seams.call("oauth.runInteractive").args, 0);
    assert.equal(input.transactionTtlMs, 300_000);
    assert.equal(Object.hasOwn(input, "authorizationTimeoutMs"), false);
    assert.ok(input.signal instanceof AbortSignal);
  });
});

test("runtime OAuth recovery preserves tools, owns its signal, and bypasses reconnect logging", async () => {
  await withRig(async (rig) => {
    const interactive = deferred<{ status: "authorized" }>();
    const runtime: UnknownRecord = {
      onAuthorizationRequired(this: unknown, context: UnknownRecord) {
        rig.seams.invoke("oauth.externalCallback", this, [context]);
      },
    };
    let transactionSignal: AbortSignal | undefined;
    rig.seams.setHook("oauth.runInteractive", async (_receiver, inputValue) => {
      const input = inputValue as UnknownRecord;
      transactionSignal = input.signal as AbortSignal;
      const callback = input.onAuthorizationRequired as (context: UnknownRecord) => Promise<void>;
      await callback({
        authorizationUrl: "https://authorize.test",
        redirectUrl: "http://callback",
        serverName: "alpha",
      });
      return interactive.promise;
    });
    rig.seams.setHook("sdk.client.listTools", async () => ({
      tools: [{ inputSchema: {}, name: "echo" }],
    }));
    const adapter = rig.adapter({ mcpOAuth: runtime });
    await adapter.connectServer("alpha", httpConfig({ oauth: { type: "authorization_code" } }));
    let attempts = 0;
    rig.seams.setHook("sdk.client.callTool", async () => {
      attempts += 1;
      if (attempts === 1) throw oauthFailure();
      return { content: [{ text: "authorized", type: "text" }] };
    });
    const caller = new AbortController();
    const pending = adapter.callTool(
      { serverName: "alpha", toolName: "echo" },
      { signal: caller.signal, timeoutMs: 1000 },
    );
    await flushMicrotasks(10);
    const callback = rig.seams.call("oauth.externalCallback");
    assert.equal(callback.receiver, runtime);
    assert.notEqual(transactionSignal, caller.signal);
    assert.equal(transactionSignal?.aborted, false);
    assert.equal((await adapter.status()).alpha?.status, "connecting");
    assert.equal((await adapter.listTools()).length, 1);
    assert.equal(
      rig.seams
        .callsFor("logger.warn")
        .some((call) => call.args[0] === "MCP server reconnecting after lost connection"),
      false,
    );
    interactive.resolve({ status: "authorized" });
    const result = await pending;
    assert.equal(((result.content as unknown[])[0] as UnknownRecord).text, "authorized");
    assert.equal(attempts, 2);
  });
});

test("a shared OAuth waiter timeout does not cancel the transaction owner", async () => {
  await withRig(async (rig) => {
    const interactive = deferred<{ status: "authorized" }>();
    let connectCount = 0;
    let transactionSignal: AbortSignal | undefined;
    rig.seams.setHook("sdk.client.connect", async () => {
      connectCount += 1;
      if (connectCount === 1) throw oauthFailure();
    });
    rig.seams.setHook("oauth.runInteractive", async (_receiver, inputValue) => {
      const input = inputValue as UnknownRecord;
      transactionSignal = input.signal as AbortSignal;
      const notify = input.onAuthorizationRequired as (context: UnknownRecord) => Promise<void>;
      await notify({
        authorizationUrl: "https://authorize.test",
        redirectUrl: "http://callback",
        serverName: "alpha",
      });
      return interactive.promise;
    });
    const config = httpConfig({ oauth: { type: "authorization_code" } });
    const adapter = rig.adapter();
    const owner = adapter.connectServer("alpha", config);
    await flushMicrotasks(10);
    const waiter = adapter.connectConfiguredServers(
      { alpha: { ...config } },
      { oauthAuthorizationTimeoutMs: 10 },
    );
    await flushMicrotasks();
    rig.clock.advance(10);
    await flushMicrotasks();
    const waiterSnapshot = await waiter;
    assert.equal(waiterSnapshot.statuses.alpha?.status, "connecting");
    assert.equal(transactionSignal?.aborted, false);
    interactive.resolve({ status: "authorized" });
    assert.equal((await owner).status, "connected");
  });
});

test("insufficient-scope recovery unions scopes and forces reauthorization", async () => {
  await withRig(async (rig) => {
    rig.seams.setHook("oauth.loadCredentialPair", async () => ({
      source: "canonical",
      tokens: { scope: "stored" },
    }));
    rig.seams.setHook("sdk.computeScopeUnion", () => "base stored elevated");
    let connects = 0;
    rig.seams.setHook("sdk.client.connect", async () => {
      connects += 1;
      if (connects === 1) {
        throw Object.assign(oauthFailure("insufficient_scope"), {
          fixtureOAuthTrigger: {
            reason: "insufficient_scope",
            requiredScope: "elevated",
            resourceMetadataUrl: "https://mcp.example.test/.well-known/oauth",
          },
        });
      }
    });
    const adapter = rig.adapter();
    await adapter.connectServer(
      "alpha",
      httpConfig({ oauth: { scope: "base", type: "authorization_code" } }),
    );
    const input = objectArg(rig.seams.call("oauth.runInteractive").args, 0);
    assert.equal(input.forceReauthorization, true);
    assert.equal(input.requestedScope, "base stored elevated");
    assert.equal(
      (input.resourceMetadataUrl as URL).href,
      "https://mcp.example.test/.well-known/oauth",
    );
  });
});
