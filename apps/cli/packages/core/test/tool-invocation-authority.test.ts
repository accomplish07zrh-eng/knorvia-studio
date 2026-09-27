// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { CoreErrorType, SessionEventType } from "@knorvia/contracts";
import type { ToolEntry, ToolResultSerialization } from "../src/tool/types.js";

// 当前真实合同不签发该 authority；本文件只隔离验证调用主流程的 consumer 分支。
const frame = await import("@knorvia/cua/frame-contract");
const images = await import("../src/mcp/image-normalization.js");
const display = await import("../src/tool/executor/result-display.js");
const actualSerialization = await import("../src/tool/executor/result-serialization.js");
const authorized = new WeakSet<object>();
let accepted = true;
const entries: ToolEntry[] = [];
const displayAuthority: boolean[] = [];
const signals: AbortSignal[] = [];
const protectedContent = [
  { type: "image", mediaType: "image/png", dataUrl: "data:image/png;base64,AAAA" },
] as const;
mock.module("@knorvia/cua/frame-contract", {
  namedExports: {
    ...frame,
    attestOfficialCuaFrameContent: () =>
      accepted ? { kind: frame.OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION } : undefined,
  },
});
mock.module(new URL("../src/mcp/image-normalization.ts", import.meta.url).href, {
  namedExports: {
    ...images,
    hasOfficialCuaFrameAuthority: (value: object) => authorized.has(value),
  },
});
mock.module(new URL("../src/tool/executor/result-display.ts", import.meta.url).href, {
  namedExports: {
    ...display,
    createToolResultDisplay: (...args: Parameters<typeof display.createToolResultDisplay>) => {
      displayAuthority.push(args[2]?.officialCua === true);
      return display.createToolResultDisplay(...args);
    },
  },
});
mock.module(new URL("../src/tool/executor/result-serialization.ts", import.meta.url).href, {
  namedExports: {
    ...actualSerialization,
    serializeOutput: async (
      ...args: Parameters<typeof actualSerialization.serializeOutput>
    ): Promise<ToolResultSerialization> => {
      entries.push(args[2]);
      signals.push(args[5]);
      return {
        content: "display text",
        modelContent: [...protectedContent],
        originalBytes: 10,
        returnedBytes: 10,
        truncated: false,
        budgetStrategy: "inline",
      };
    },
  },
});
const { invocation, eventPayload } = await import("./tool-invocation-fixture.js");

test("temporary REPL protection is per-output and never becomes display authority", async () => {
  for (const variant of ["exact", "server", "unrelated", "untrusted"]) {
    const f = invocation();
    if (variant === "exact" || variant === "untrusted")
      f.entry.metadata.name = "mcp__node_repl__js";
    if (variant === "server")
      f.entry.metadata.mcpPresentation = { serverName: "node_repl", toolName: "js" };
    f.call.name = f.entry.metadata.name;
    const output = { data: "fixture" };
    if (variant !== "untrusted") authorized.add(output);
    f.behavior.handler = async () => output;
    const result = await f.run();
    const protectedEntry = entries.at(-1)!;
    assert.equal(result.success, true);
    assert.equal(f.entry.modelContentProtection, undefined);
    assert.equal(displayAuthority.at(-1), false);
    if (variant === "exact" || variant === "server") {
      assert.notEqual(protectedEntry, f.entry);
      assert.equal(
        protectedEntry.modelContentProtection,
        frame.OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION,
      );
      assert.deepEqual(protectedEntry.resultBudget, {
        maxInlineBytes: 262144,
        maxModelBytes: 262144,
        strategy: "truncate",
        preview: { direction: "head" },
      });
    } else assert.equal(protectedEntry, f.entry);
    assert.equal(
      eventPayload(f.events.at(-1)!).result &&
        (eventPayload(f.events.at(-1)!).result as { content: string }).content,
      "display text",
    );
  }
});

test("failed final attestation emits an error after Post Hook without Result or tracking", async () => {
  const f = invocation();
  f.entry.modelContentProtection = frame.OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION;
  accepted = false;
  try {
    const result = await f.run();
    assert.equal(result.error?.type, CoreErrorType.ToolExecutionFailed);
    assert.equal(
      result.error?.message,
      "Official CUA frame failed final model-content attestation",
    );
    assert.deepEqual(
      f.events.map((e) => e.type),
      [SessionEventType.ToolCallStarted, SessionEventType.ToolCallError],
    );
    assert.equal(f.timeline.includes("background"), false);
    assert.equal(f.terminal()[0]?.args[0], "post_hook");
    assert.equal(displayAuthority.at(-1), true);
  } finally {
    accepted = true;
  }
});

test("serializer shares the child signal and original protected entries remain unchanged", async () => {
  const f = invocation();
  const parent = new AbortController();
  f.entry.modelContentProtection = frame.OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION;
  const budget = f.entry.resultBudget;
  const result = await f.run({ signal: parent.signal });
  assert.equal(result.success, true);
  assert.equal(entries.at(-1), f.entry);
  assert.equal(entries.at(-1)!.resultBudget, budget);
  assert.equal(signals.at(-1), f.observed.contexts[0]!.abortSignal);
  assert.notEqual(signals.at(-1), parent.signal);
  parent.abort();
  assert.equal(signals.at(-1)!.aborted, false);
});
