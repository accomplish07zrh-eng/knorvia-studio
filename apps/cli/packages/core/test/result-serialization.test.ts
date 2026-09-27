// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type {
  ToolArtifactStorePort,
  ToolArtifactWriteRequest,
  ModelMessageContent,
} from "@knorvia/contracts";
import {
  serializeOutput,
  appendHookAdditionalContexts,
} from "../src/tool/executor/result-serialization.js";
import {
  artifact,
  budget,
  dependencies,
  entry,
  result,
  signal,
  trace,
} from "./result-budget-fixture.js";

const run = (output: unknown, options = entry(), deps = dependencies()) =>
  serializeOutput(deps, output, options, trace, "call-fixture", signal);

test("an output without persistence finishes projection before the next microtask", async () => {
  const blocks: ModelMessageContent = [{ type: "text", text: "before" }];
  const tool = entry({ resultBudget: budget(100), formatModelContent: () => blocks });
  const pending = run(null, tool);
  blocks[0] = { type: "text", text: "after" };
  tool.resultBudget.strategy = "inline";
  const actual = await pending;
  assert.equal(actual.content, "before");
  assert.equal(actual.modelContent, blocks);
  assert.equal(actual.budgetStrategy, "truncate");
});

test("failed persistence retains the initial text snapshot when the model blocks change during the write", async () => {
  const blocks: ModelMessageContent = [{ type: "text", text: "before" }];
  const store = {
    async writeToolResultArtifact() {
      blocks[0] = { type: "text", text: "after" };
      throw new Error("save failed");
    },
  } as unknown as ToolArtifactStorePort;
  const actual = await run(
    null,
    entry({
      maxModelChars: 1,
      resultBudget: { ...budget(100, "artifact"), artifact: { enabled: true } },
      formatModelContent: () => blocks,
    }),
    dependencies(store),
  );
  assert.equal(actual.content, "before");
  assert.equal(actual.returnedBytes, 6);
  assert.equal(actual.modelContent, blocks);
});

test("sparse model block lists retain array-method empty semantics", async () => {
  const blocks: ModelMessageContent = [];
  blocks.length = 2;
  assert.equal(
    (await run(null, entry({ formatModelContent: () => blocks }))).content,
    "(Fixture completed with no output)",
  );
});

test("empty output keeps original byte accounting and uses a successful placeholder without saving", async () => {
  for (const model of ["", " \n", [], [{ type: "text", text: " " }]] as ModelMessageContent[]) {
    const actual = await run(
      "ignored",
      entry({
        formatModelContent: () => model,
        resultBudget: { ...budget(0, "artifact"), artifact: { enabled: true } },
      }),
      dependencies({
        writeToolResultArtifact: async () => assert.fail("empty must not save"),
      } as unknown as ToolArtifactStorePort),
    );
    assert.equal(actual.content, "(Fixture completed with no output)");
    assert.equal(actual.modelContent, actual.content);
    assert.equal(actual.returnedBytes, 34);
    assert.equal(actual.truncated, false);
    assert.equal(actual.budgetStrategy, "artifact");
    assert.equal(Object.hasOwn(actual, "artifactPath"), false);
  }
  assert.equal((await run(undefined)).originalBytes, 0);
  assert.equal((await run(" \n")).originalBytes, 2);
  const reasoning: ModelMessageContent = [{ type: "reasoning", text: "reason" }];
  const actual = await run(null, entry({ formatModelContent: () => reasoning }));
  assert.equal(actual.content, "");
  assert.equal(actual.modelContent, reasoning);
});

test("default formatting preserves strings, JSON and string fallback; formatter receiver and errors propagate", async () => {
  assert.equal((await run({ a: 1 })).content, '{"a":1}');
  assert.equal((await run(1n)).content, "1");
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.equal((await run(circular)).content, "[object Object]");
  assert.equal((await run("text")).budgetStrategy, "truncate");
  const blocks: ModelMessageContent = [
    { type: "image", mediaType: "image/png", dataUrl: "fixture" },
  ];
  const tool = entry({
    formatModelContent(output) {
      assert.equal(this, tool);
      assert.equal(output, 7);
      return blocks;
    },
  });
  const actual = await run(7, tool);
  assert.equal(actual.modelContent, blocks);
  assert.equal(actual.content, "[Attached image/png]");
  await assert.rejects(
    run(
      7,
      entry({
        formatModelContent() {
          throw new Error("format failed");
        },
      }),
    ),
    /format failed/,
  );
});

test("byte threshold is inclusive and limits both inline and model budgets without changing strategy", async () => {
  assert.equal((await run("中😀", entry({ resultBudget: budget(7) }))).truncated, false);
  for (const strategy of ["inline", "truncate", "artifact"] as const) {
    const actual = await run(
      "中😀",
      entry({ resultBudget: { ...budget(8, strategy), maxInlineBytes: 6 } }),
    );
    assert.equal(actual.content, "\n\n[Too");
    assert.equal(actual.returnedBytes, 6);
    assert.equal(actual.originalBytes, 7);
    assert.equal(actual.budgetStrategy, strategy);
    assert.equal(actual.truncated, true);
  }
  const long = await run("x".repeat(500), entry({ resultBudget: budget(200) }));
  assert.ok(
    long.content.endsWith(
      "[Tool output truncated by resultBudget: originalBytes=500, maxModelBytes=200, strategy=truncate]",
    ),
  );
  assert.equal(long.returnedBytes, 200);
});

test("artifact requests preserve full content, identity, trace, signal, receiver and configured policy", async () => {
  const requests: ToolArtifactWriteRequest[] = [];
  const store: ToolArtifactStorePort = {
    async writeToolResultArtifact(request, options) {
      assert.equal(this, store);
      assert.equal(options?.signal, signal);
      requests.push(request);
      return artifact("saved.txt");
    },
    readToolResultArtifact: async () => assert.fail("no read"),
  };
  const tool = entry({
    resultBudget: { ...budget(1, "artifact"), artifact: { enabled: true, retention: "project" } },
    resultArtifactContentType: "custom/type",
  });
  const actual = await run("raw output", tool, dependencies(store));
  assert.deepEqual(requests, [
    {
      sessionId: "session-fixture",
      turnId: "trace-turn",
      toolCallId: "call-fixture",
      toolName: "Fixture",
      content: "raw output",
      contentType: "custom/type",
      retention: "project",
      trace,
    },
  ]);
  assert.equal(requests[0].trace, trace);
  assert.equal(actual.artifactPath, "saved.txt");
  assert.equal(actual.truncated, true);
  assert.ok(actual.returnedBytes > 1);
  assert.ok(actual.content.includes("raw output"));
  assert.equal(actual.originalBytes, 10);
});

test("character threshold saves only when strictly exceeded and persistence failure preserves the whole provider result", async () => {
  let writes = 0;
  const store = {
    async writeToolResultArtifact() {
      writes++;
      throw new Error("storage unavailable");
    },
  } as unknown as ToolArtifactStorePort;
  const tool = entry({
    maxModelChars: 2,
    resultBudget: { ...budget(50, "artifact"), artifact: { enabled: true } },
  });
  assert.equal((await run("😀", tool, dependencies(store))).truncated, false);
  assert.equal(writes, 0);
  assert.equal((await run("😀a", tool, dependencies(store))).content, "😀a");
  assert.equal(writes, 1);
  tool.resultBudget = { ...budget(1, "artifact"), artifact: { enabled: true } };
  for (const deps of [dependencies(store), dependencies()]) {
    const actual = await run("😀a", tool, deps);
    assert.equal(actual.content, "😀a");
    assert.equal(actual.truncated, false);
  }
  tool.maxModelChars = undefined;
  assert.equal((await run("😀a", tool, dependencies(store))).truncated, true);
});

test("persistence formatter receives raw output, preserves receiver and treats only undefined as fallback", async () => {
  const output = { a: "long" };
  const store = {
    async writeToolResultArtifact() {
      return artifact();
    },
  } as unknown as ToolArtifactStorePort;
  for (const projected of ["", [], "custom", undefined] as Array<ModelMessageContent | undefined>) {
    const tool = entry({
      resultBudget: { ...budget(1, "artifact"), artifact: { enabled: true } },
      formatPersistedModelContent(input) {
        assert.equal(this, tool);
        assert.equal(input.output, output);
        assert.equal(input.content, JSON.stringify(output));
        assert.equal(input.persistedPath, "artifact:fixture");
        return projected;
      },
    });
    const actual = await run(output, tool, dependencies(store));
    if (projected === undefined) assert.ok(actual.content.startsWith("<persisted-output>"));
    else assert.equal(actual.modelContent, projected);
    assert.equal(actual.truncated, true);
  }
});

test("artifact path priorities preserve whitespace and empty stored path blocks URI fallback", async () => {
  const output = { persistedOutputPath: "", rawOutputPath: " ", artifactPath: "later" };
  assert.equal((await run(output)).artifactPath, " ");
  const store = {
    async writeToolResultArtifact() {
      return artifact("");
    },
  } as unknown as ToolArtifactStorePort;
  const actual = await run(
    output,
    entry({ resultBudget: { ...budget(5, "artifact"), artifact: { enabled: true } } }),
    dependencies(store),
  );
  assert.equal(actual.artifactPath, "");
  assert.equal(actual.content, "\n\n[To");
});

test("hook no-op identity, numbering, stable original accounting and artifact preview exemption", () => {
  const input = result("body");
  assert.equal(appendHookAdditionalContexts(input, [], entry()), input);
  const actual = appendHookAdditionalContexts(input, ["A", "B"], entry());
  assert.equal(actual.content, "body\n\n[Hook additional context]\n#1\nA\n#2\nB");
  assert.equal(actual.modelContent, actual.content);
  assert.equal(actual.originalBytes, 4);
  assert.equal(input.content, "body");
  const saved = result("<persisted-output>FULL</persisted-output>", {
    truncated: true,
    budgetStrategy: "artifact",
    artifactPath: "p",
  });
  const augmented = appendHookAdditionalContexts(saved, ["A"], entry({ resultBudget: budget(4) }));
  assert.equal(augmented.content, saved.content + "\n\n[H");
  assert.equal(augmented.truncated, true);
  assert.equal(augmented.originalBytes, saved.originalBytes);
});

test("structured hook append keeps references under budget and retains previously truncated status", () => {
  const image = { type: "image", mediaType: "image/png", dataUrl: "fixture" } as const;
  const actual = appendHookAdditionalContexts(
    result("[Attached image/png]", { modelContent: [image], truncated: true }),
    ["A"],
    entry(),
  );
  assert.deepEqual(actual.modelContent, [
    image,
    { type: "text", text: "[Hook additional context]\n#1\nA" },
  ]);
  assert.equal((actual.modelContent as unknown[])[0], image);
  assert.equal(actual.truncated, true);
});

test("hook result copies the original envelope before projecting model blocks", () => {
  const blocks: ModelMessageContent = [
    { type: "image", mediaType: "image/png", dataUrl: "fixture" },
  ];
  const input = result("display", { modelContent: blocks });
  Object.defineProperty(input, "returnedBytes", {
    enumerable: true,
    get() {
      blocks.push({ type: "text", text: "during-copy" });
      return 7;
    },
  });
  const actual = appendHookAdditionalContexts(input, ["H"], entry());
  assert.deepEqual(actual.modelContent, [
    blocks[0],
    { type: "text", text: "during-copy" },
    { type: "text", text: "[Hook additional context]\n#1\nH" },
  ]);
});
