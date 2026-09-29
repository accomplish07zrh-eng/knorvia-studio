// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { strict as assert } from "node:assert";
import test from "node:test";
import { deferred, flushMicrotasks } from "./mcp-client-harness/clock.ts";
import { instanceAt, objectArg, stdioConfig, withRig } from "./mcp-client-harness/rig.ts";

test("stderr logs each redacted chunk from the front with a 4000-unit bound", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectServer("stdio", stdioConfig());
    rig.seams.clearCalls();
    rig.stderr.emit(`Bearer secret ${"x".repeat(5000)}`);
    const entry = rig.seams.call("logger.debug");
    assert.equal(entry.args[0], "MCP stdio stderr");
    const stderr = objectArg(entry.args, 1).stderr as string;
    assert.equal(stderr.length, 4000);
    assert.ok(stderr.startsWith("Bearer [Redacted] "));
    assert.equal(stderr.includes("secret"), false);
  });
});

test("connection failure reads the last 4000 raw UTF-16 units before redaction", async () => {
  await withRig(async (rig) => {
    const gate = deferred<void>();
    rig.seams.setHook("sdk.client.connect", () => gate.promise);
    const adapter = rig.adapter();
    const pending = adapter.connectServer("stdio", stdioConfig());
    await flushMicrotasks();
    const raw = `${"😀".repeat(2000)}x`;
    rig.stderr.emit(raw);
    gate.reject(new Error("connect failed"));
    await pending;
    const failed = rig.seams
      .callsFor("logger.warn")
      .find((call) => call.args[0] === "MCP server connection failed");
    assert.ok(failed);
    const tail = objectArg(failed.args, 1).stderr as string;
    assert.equal(tail.length, 4000);
    assert.equal(tail.charCodeAt(0), raw.slice(-4000).charCodeAt(0));
    assert.equal(tail, raw.slice(-4000));
  });
});

test("redaction covers bearer, authorization, query, quoted keys, plain keys, and URI credentials", async () => {
  await withRig(async (rig) => {
    await rig.adapter().connectServer("stdio", stdioConfig());
    rig.seams.clearCalls();
    rig.stderr.emit(
      [
        "Bearer bearer-secret",
        "Authorization: Bearer auth-secret",
        "https://x.test?p=1&access_key=query-secret&ok=1",
        '{"api_key":"quoted-secret", password=plain-secret}',
        "postgres://user:uri-secret@db.test/name",
      ].join("\n"),
    );
    const text = objectArg(rig.seams.call("logger.debug").args, 1).stderr as string;
    for (const secret of [
      "bearer-secret",
      "auth-secret",
      "query-secret",
      "quoted-secret",
      "plain-secret",
      "uri-secret",
    ]) {
      assert.equal(text.includes(secret), false);
    }
    assert.ok(text.includes("Bearer [Redacted]"));
    assert.ok(text.includes("access_key=[Redacted]"));
    assert.ok(text.includes("postgres://[Redacted]@"));
  });
});

test("chunk logging has no cross-chunk credential state while final onclose tail is re-redacted", async () => {
  await withRig(async (rig) => {
    const adapter = rig.adapter();
    await adapter.connectServer("stdio", stdioConfig());
    const client = instanceAt(rig, "sdk.client.construct");
    rig.seams.clearCalls();
    rig.stderr.emit("Authorization: Bear");
    rig.stderr.emit("er split-secret");
    const chunkLogs = rig.seams
      .callsFor("logger.debug")
      .map((call) => objectArg(call.args, 1).stderr as string);
    assert.equal(chunkLogs[1], "er split-secret");
    (client.onclose as (() => void) | undefined)?.call(client);
    const lost = rig.seams
      .callsFor("logger.warn")
      .find((call) => call.args[0] === "MCP server connection lost");
    assert.ok(lost);
    const finalTail = objectArg(lost.args, 1).stderr as string;
    assert.equal(finalTail.includes("split-secret"), false);
    assert.ok(finalTail.includes("Authorization: Bearer [Redacted]"));
  });
});

test("stderr logger exceptions propagate through event dispatch", async () => {
  await withRig(async (rig) => {
    await rig.adapter().connectServer("stdio", stdioConfig());
    const boom = new Error("stderr logger failed");
    rig.seams.setHook("logger.debug", (_receiver, message) => {
      if (message === "MCP stdio stderr") throw boom;
    });
    assert.throws(() => rig.stderr.emit("safe text"), boom);
  });
});
