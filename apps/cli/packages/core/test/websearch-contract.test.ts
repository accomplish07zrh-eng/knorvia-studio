import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CoreErrorType,
  WEBSEARCH_TOOL_CONTRACT,
  WebSearchInputSchema,
  WebSearchOutputSchema,
  WebSearchInputJsonSchema,
  WebSearchOutputJsonSchema,
} from "@knorvia/contracts";
import { streamCases } from "./websearch-cases.js";
import { gate } from "./tool-invocation-fixture.js";
import {
  clock,
  date,
  entry,
  errorShape,
  handlers,
  json,
  observeReads,
  observeStream,
  projection,
  streamFixture,
  support,
  valid,
} from "./websearch-fixture.js";
const frozen = JSON.parse(
  await readFile(new URL("./websearch-contract.json", import.meta.url), "utf8"),
);

test("WebSearch source/dist declaration, schemas and handler registry preserve identities", async () => {
  await clock(() => {
    assert.deepEqual(Object.keys(entry), frozen.entryKeys);
    assert.deepEqual(
      json({
        ...entry,
        handler: undefined,
        formatModelContent: undefined,
        runtimeInputSchema: undefined,
        runtimeOutputSchema: undefined,
      }),
      frozen.declaration,
    );
    assert.deepEqual(Object.keys(projection), frozen.moduleExports.projection);
    assert.deepEqual(Object.keys(support), frozen.moduleExports.support);
  });
  assert.equal(
    handlers.builtInTools.find((tool: any) => tool.metadata.name === "WebSearch"),
    entry,
  );
  assert.equal(entry.runtimeInputSchema, WebSearchInputSchema);
  assert.equal(entry.runtimeOutputSchema, WebSearchOutputSchema);
  assert.equal(entry.inputSchema, WebSearchInputJsonSchema);
  assert.equal(entry.outputSchema, WebSearchOutputJsonSchema);
  for (const key of ["permission", "timeout", "resultBudget", "cancellation", "trace"])
    assert.equal(entry[key], (WEBSEARCH_TOOL_CONTRACT as any)[key]);
});
test("frozen source/dist requests and malformed/reordered/partial/error stream observations", async () => {
  await clock(async () => {
    for (const [index, scenario] of streamCases.entries())
      assert.deepEqual(
        await observeStream(scenario),
        frozen.streams[index].observed,
        scenario.label,
      );
  });
});
test("dynamic description reflects every local month and year on each access", async () => {
  for (let month = 0; month < 12; month++)
    await clock(
      () => {
        assert.equal(entry.metadata.description, frozen.descriptions[month]);
        assert.equal(
          Object.getOwnPropertyDescriptor(entry.metadata, "description")?.get instanceof Function,
          true,
        );
      },
      Date.UTC(2026, month, 15, 12),
    );
  await clock(
    () => assert.ok(entry.metadata.description.includes("January 2027")),
    Date.UTC(2027, 0, 15, 12),
  );
});
test("request, stream and projection getter reads retain exact frozen ordering", async () => {
  for (const kind of ["request", "projection", "events"] as const)
    assert.deepEqual(await clock(() => observeReads(kind)), frozen.reads[kind]);
});
test("admission clocks before model access and does not inspect input or start rejected effects", async (t) => {
  for (const missing of [true, false]) {
    const fixture = streamFixture({
      label: "admission",
      missingModel: missing,
      supported: false,
      events: [],
    });
    const reads: string[] = [];
    t.mock.method(Date, "now", () => {
      reads.push("clock");
      return date;
    });
    const model = fixture.context.model;
    Object.defineProperty(fixture.context, "model", {
      get() {
        reads.push("model");
        return model;
      },
    });
    const input = {
      get query() {
        throw new Error("Input must remain unread before admission");
      },
    };
    await assert.rejects(entry.handler(input, fixture.context), (error: any) => {
      assert.equal(error.type, CoreErrorType.ConfigurationError);
      assert.equal(error.recoverable, !missing);
      return true;
    });
    assert.deepEqual(reads, ["clock", "model"]);
    assert.deepEqual(fixture.calls, []);
    t.mock.restoreAll();
  }
});
test("native contract retains domains, quota, auto choice, model receiver and exact signal", async () => {
  const fixture = streamFixture({ label: "request", events: [] });
  fixture.controller.abort();
  await clock(() =>
    entry.handler({ ...valid, allowed_domains: ["example.invalid"], maxUses: 2 }, fixture.context),
  );
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].receiver, true);
  const request = fixture.requests[0];
  assert.equal(request.abortSignal, fixture.controller.signal);
  assert.equal(Object.hasOwn(request, "toolChoice"), false);
  assert.deepEqual(Object.keys(request.tools![0].providerNative!.args!), [
    "allowedDomains",
    "blockedDomains",
    "maxUses",
  ]);
  assert.deepEqual(request.tools![0].providerNative!.args!.allowedDomains, ["example.invalid"]);
  assert.equal(request.tools![0].providerNative!.fallback, "disabled");
  assert.equal(request.options!.reasoningLevel, "low");
  assert.equal(request.options!.maxOutputTokens, 4096);
});
test("error event preserves Error identity and closes iterator; iterator/start thrown values propagate", async () => {
  const error = new Error("synthetic stream error");
  for (const c of [
    {
      label: "event",
      events: [
        { type: "error", error },
        { type: "text_delta", text: "unread" },
      ],
    },
    { label: "start", events: [], startFailure: error },
    { label: "iterator", events: [], iteratorFailure: error },
  ]) {
    const fixture = streamFixture(c);
    await assert.rejects(entry.handler(valid, fixture.context), (received) => received === error);
    assert.equal(fixture.calls.length, 1);
    assert.equal(
      fixture.iterations.some((r) => r.phase === "return"),
      c.label === "event",
    );
  }
  const fixture = streamFixture({ label: "value", events: [{ type: "error", error: undefined }] });
  await assert.rejects(entry.handler(valid, fixture.context), (error: any) => {
    assert.equal(error.type, CoreErrorType.ModelError);
    assert.equal(error.recoverable, true);
    assert.deepEqual(Object.keys(error.context), ["error"]);
    return true;
  });
});
test("projection preserves own undefined output fields, usage identity and synthetic elapsed clock", async (t) => {
  const usage = { inputTokens: 0, serverToolUse: { webSearchRequests: 0 } };
  t.mock.method(Date, "now", () => 173);
  const output = projection.buildWebSearchOutput(
    valid,
    { text: " ", usage, finishReason: "stop" },
    100,
  );
  assert.equal(output.modelUsage, usage);
  assert.equal(output.durationMs, 73);
  assert.deepEqual(Object.keys(output), [
    "query",
    "results",
    "sources",
    "summary",
    "durationMs",
    "webSearchRequests",
    "modelUsage",
  ]);
  assert.equal(Object.hasOwn(output, "summary"), true);
  assert.equal(output.summary, undefined);
  assert.equal(errorShape(new Error("synthetic")).message, "synthetic");
});
test("overlapping searches on one model keep stream state and invocation trace per call", async () => {
  await clock(async () => {
    const fixture = streamFixture({ label: "interleaving", events: [] });
    const first = gate(),
      second = gate(),
      release = gate();
    fixture.model.streamText = function (request) {
      assert.equal(this, fixture.model);
      const a = request.messages[1].content === "Perform a web search for the query: first";
      return (async function* () {
        yield { type: "text_delta" as const, text: a ? "first " : "second " };
        (a ? first : second).resolve();
        if (a) await release.promise;
        yield { type: "text_delta" as const, text: "done" };
        yield { type: "finish" as const, finishReason: "stop", usage: { totalTokens: a ? 1 : 2 } };
      })();
    };
    const pending = entry.handler(
      { query: "first" },
      { ...fixture.context, toolCallId: "first-call" },
    );
    await first.promise;
    const completed = await entry.handler(
      { query: "second" },
      { ...fixture.context, toolCallId: "second-call" },
    );
    await second.promise;
    assert.equal(completed.summary, "second done");
    assert.equal(completed.modelUsage.totalTokens, 2);
    release.resolve();
    const original = await pending;
    assert.equal(original.summary, "first done");
    assert.equal(original.modelUsage.totalTokens, 1);
  });
});
