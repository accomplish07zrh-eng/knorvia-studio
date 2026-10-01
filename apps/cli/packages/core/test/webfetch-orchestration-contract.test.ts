import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  WebFetchInputSchema,
  WebFetchInputJsonSchema,
  WebFetchOutputSchema,
  WebFetchOutputJsonSchema,
} from "@knorvia/contracts";
import {
  URL_FIXTURE,
  cachedContent,
  directCases,
  getterCases,
} from "./webfetch-orchestration-cases.js";
import {
  advance,
  cache,
  clock,
  clockEvents,
  declaration,
  entry,
  fixture,
  flushUntil,
  handlerModule,
  lower,
  microtaskObservation,
  observe,
  publicDeclaration,
} from "./webfetch-orchestration-fixture.js";
import { cacheMatrix } from "./webfetch-orchestration-consumer-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./webfetch-orchestration-contract.json", import.meta.url), "utf8"),
);
test("WebFetch exports, strict declaration bytes, prose and metadata are frozen", () => {
  assert.deepEqual(Object.keys(handlerModule), frozen.exports);
  assert.equal(publicDeclaration, frozen.publicDeclaration);
  assert.deepEqual(declaration(), frozen.declaration);
  assert.equal(entry.runtimeInputSchema, WebFetchInputSchema);
  assert.equal(entry.inputSchema, WebFetchInputJsonSchema);
  assert.equal(entry.runtimeOutputSchema, WebFetchOutputSchema);
  assert.equal(entry.outputSchema, WebFetchOutputJsonSchema);
  assert.equal(entry.metadata.needsApproval, true);
  assert.equal(entry.permission.needsApproval, true);
  assert.equal(entry.metadata.readOnly, true);
  assert.equal(entry.timeout.defaultMs, 60000);
  assert.equal(entry.timeout.maxMs, 60000);
  assert.equal(entry.timeout.allowCallOverride, false);
});
test("unchanged direct cache/fresh/terminal/URL/error/model contracts remain frozen", async () => {
  for (const [i, c] of directCases.entries())
    assert.deepEqual(await observe(c), frozen.direct[i].observed, c.label);
});
test("context, response, HTTP/model getter reads and failures remain frozen", async () => {
  for (const [i, p] of getterCases.entries())
    assert.deepEqual(
      await observe({ label: "getter" }, p),
      frozen.getters[i].observed,
      JSON.stringify(p),
    );
});
test("cache URL/TTL/status matrix retains its single cache owner", async () =>
  assert.deepEqual(await cacheMatrix(), frozen.cacheMatrix));
test("fresh continuation and synchronous cached model admission remain frozen", async () => {
  for (const [i, hit] of [false, true].entries())
    assert.deepEqual(await microtaskObservation(hit), frozen.microtasks[i]);
});
test("runtime schema failure precedes clocks and every context read", async () =>
  clock(async () => {
    const f = fixture();
    const context = new Proxy(
      {},
      {
        get() {
          assert.fail("schema must precede context");
        },
      },
    );
    await assert.rejects(entry.handler({ url: "bad" }, context));
    assert.equal(clockEvents.length, 0);
    assert.equal(f.calls.length, 0);
  }));
test("normalization restrictions still precede cached access or HTTP port reads", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    for (const url of [
      "ftp://owned-webfetch.example/fixture",
      "https://synthetic:placeholder@owned-webfetch.example/fixture",
    ]) {
      const f = fixture({ label: "restricted", url, seed: cachedContent });
      await assert.rejects(entry.handler(f.input, f.context));
      assert.equal(f.reads.includes("context.httpClientPort"), false);
      assert.equal(f.calls.length, 0);
    }
  }));
test("original cache key preserves URL spelling while outbound normalization upgrades HTTP", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = fixture({ label: "key", url: "http://OWNED-WEBFETCH.example/fixture#owned" });
    const output = await entry.handler(f.input, f.context);
    assert.equal(output.url, f.input.url);
    assert.equal(
      f.rawCalls.find((c) => c.target === "request").args[0].url,
      "https://owned-webfetch.example/fixture#owned",
    );
    assert.ok(cache.getWebFetchCache(f.input.url));
    assert.equal(cache.getWebFetchCache(output.finalUrl), undefined);
  }));
test("cache expires at its existing exact TTL and clear export shares lower ownership", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    cache.putWebFetchCache(URL_FIXTURE, cachedContent);
    advance(899900);
    assert.ok(cache.getWebFetchCache(URL_FIXTURE));
    advance(100);
    assert.equal(cache.getWebFetchCache(URL_FIXTURE), undefined);
    cache.putWebFetchCache(URL_FIXTURE, cachedContent);
    handlerModule.clearWebFetchCacheForTests();
    assert.equal(cache.getWebFetchCache(URL_FIXTURE), undefined);
  }));
test("fresh content remains cached before a missing or rejected model", async () =>
  clock(async () => {
    for (const c of [
      { label: "missing", noModel: true },
      { label: "rejected", fault: { target: "generateText", kind: "reject" } },
    ]) {
      handlerModule.clearWebFetchCacheForTests();
      const f = fixture(c);
      await assert.rejects(entry.handler(f.input, f.context));
      assert.ok(cache.getWebFetchCache(f.input.url));
      await assert.rejects(entry.handler(f.input, f.context));
      assert.equal(f.calls.filter((c) => c.target === "request").length, 1);
    }
  }));
test("redirect/HTTP errors skip cache and all model reads without changing prose", async () =>
  clock(async () => {
    for (const status of [302, 401, 403, 429]) {
      handlerModule.clearWebFetchCacheForTests();
      const f = fixture({
        label: "terminal",
        status,
        headers: { location: "https://other-owned.example/target", "retry-after": "5" },
      });
      const output = await entry.handler(f.input, f.context);
      assert.equal(output.cacheHit, false);
      assert.equal(output.truncated, false);
      assert.equal(f.reads.includes("context.model"), false);
      assert.equal(cache.getWebFetchCache(f.input.url), undefined);
    }
  }));
test("bound HTTP/model receivers, exact signal/trace/request order and limits remain", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = fixture();
    await entry.handler(f.input, f.context);
    const request = f.rawCalls.find((c) => c.target === "request"),
      model = f.rawCalls.find((c) => c.target === "generateText");
    assert.equal(f.calls.find((c) => c.target === "request").receiver, true);
    assert.equal(f.calls.find((c) => c.target === "generateText").receiver, true);
    assert.equal(request.args[1].signal, f.controller.signal);
    assert.equal(model.args[0].abortSignal, f.controller.signal);
    assert.deepEqual(Object.keys(request.args[0]), [
      "url",
      "method",
      "headers",
      "timeoutMs",
      "maxResponseBytes",
      "redirect",
      "trace",
    ]);
    assert.equal(request.args[0].timeoutMs, 60000);
    assert.equal(request.args[0].maxResponseBytes, 10 * 1024 * 1024);
    assert.equal(request.args[0].redirect, "manual");
    assert.deepEqual(request.args[0].trace, lower[6].traceFromContext(f.context));
    assert.deepEqual(model.args[0].tools, []);
    assert.deepEqual(model.args[0].options, {
      reasoningLevel: "synthetic-low",
      maxOutputTokens: 4096,
    });
  }));
test("preapproved short markdown bypass is lower-owned and avoids even model getter", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = fixture({
      label: "approved",
      url: "https://docs.python.org/owned-fixture",
      headers: { "content-type": "text/markdown" },
      noModel: true,
    });
    const output = await entry.handler(f.input, f.context);
    assert.equal(output.result, "synthetic fetched content");
    assert.equal(f.reads.includes("context.model"), false);
  }));
test("normal output retains own undefined artifacts, redirects identity and formatter fallback", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = fixture();
    const output = await entry.handler(f.input, f.context),
      stored = cache.getWebFetchCache(f.input.url);
    assert.equal(output.redirects, stored.redirects);
    assert.equal(Object.hasOwn(output, "artifactUri"), true);
    assert.equal(Object.hasOwn(output, "artifactPath"), true);
    assert.equal(output.artifactUri, undefined);
    assert.equal(output.artifactPath, undefined);
    assert.deepEqual(Object.keys(output), [
      "url",
      "finalUrl",
      "status",
      "statusText",
      "contentType",
      "bytes",
      "durationMs",
      "result",
      "cacheHit",
      "redirects",
      "artifactUri",
      "artifactPath",
      "truncated",
    ]);
    assert.equal(
      entry.formatModelContent({ result: "synthetic", finalUrl: URL_FIXTURE }),
      "synthetic",
    );
    assert.equal(entry.formatModelContent(undefined), "");
    assert.equal(entry.formatModelContent("synthetic"), "synthetic");
  }));
test("delayed fresh ports defer cache and processing until the existing completion boundary", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = fixture({ label: "delay", fault: { target: "request", kind: "delay" } });
    const pending = entry.handler(f.input, f.context);
    await flushUntil(() => f.calls.some((c) => c.target === "request"));
    assert.equal(cache.getWebFetchCache(f.input.url), undefined);
    assert.equal(
      f.calls.some((c) => c.target === "generateText"),
      false,
    );
    f.waits.request.resolve(f.response());
    assert.equal((await pending).cacheHit, false);
    assert.ok(cache.getWebFetchCache(f.input.url));
  }));
test("direct cancellation adds no rollback or gate when synthetic HTTP ignores abort", async () =>
  clock(async () => {
    handlerModule.clearWebFetchCacheForTests();
    const f = fixture({ label: "late", fault: { target: "request", kind: "delay" } });
    const pending = entry.handler(f.input, f.context);
    await flushUntil(() => f.calls.some((c) => c.target === "request"));
    f.controller.abort();
    f.waits.request.resolve(f.response());
    assert.equal((await pending).result, "synthetic processed result");
    assert.ok(cache.getWebFetchCache(f.input.url));
  }));
