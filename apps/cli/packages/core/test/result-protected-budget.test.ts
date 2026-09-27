// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { ModelMessageContentBlock, ToolArtifactStorePort } from "@knorvia/contracts";
import {
  artifact,
  budget,
  dependencies,
  entry,
  result,
  signal,
  trace,
} from "./result-budget-fixture.js";

// 模拟已认可合同，核验 consumer 分支；当前真实合同不签发此类帧，不能据此宣称实机能力。
const original = await import("@knorvia/cua/frame-contract");
const AUTHORITY = "fixture-frame-authority";
mock.module("@knorvia/cua/frame-contract", {
  namedExports: {
    ...original,
    containsOfficialCuaImageRefCredentialText: (text: string) => text.includes(AUTHORITY),
    findOfficialCuaFrameContentPair: (content: ModelMessageContentBlock[]) => {
      const imageRefIndex = content.findIndex(
        (block) => block.type === "text" && block.text === AUTHORITY,
      );
      const imageIndex = imageRefIndex - 1;
      if (imageIndex < 0 || content[imageIndex]?.type !== "image") return undefined;
      return {
        imageIndex,
        imageRefIndex,
        image: content[imageIndex],
        imageRef: content[imageRefIndex],
      };
    },
  },
});
const { projectOfficialCuaStructuredContent, OfficialCuaFrameContractError } =
  await import("../src/tool/executor/result-content-projection.js");
const { serializeOutput, appendHookAdditionalContexts } =
  await import("../src/tool/executor/result-serialization.js");
const image = {
  type: "image",
  mediaType: "image/png",
  dataUrl: "data:image/png;base64,AAAA",
} as const;
const authority = { type: "text", text: AUTHORITY } as const;
const protection = original.OFFICIAL_CUA_FRAME_MODEL_CONTENT_PROTECTION;

test("recognized frames must lead and retain pair identity; absent authority grants nothing", () => {
  assert.equal(
    projectOfficialCuaStructuredContent([image, { type: "text", text: "ordinary" }], 1, "head"),
    undefined,
  );
  const value = projectOfficialCuaStructuredContent(
    [image, authority, { type: "text", text: "" }],
    100,
    "head",
  );
  assert.deepEqual(value, { content: [image, authority], truncated: false });
  assert.equal(value?.content[0], image);
  assert.equal(value?.content[1], authority);
  assert.throws(
    () =>
      projectOfficialCuaStructuredContent(
        [{ type: "text", text: "prefix" }, image, authority],
        1000,
        "head",
      ),
    (error: unknown) =>
      error instanceof OfficialCuaFrameContractError &&
      error.code === "official_cua_frame_pair_not_leading",
  );
});

test("pair exceeds a tiny generic budget intact, while unsupported blocks and ordinary text are bounded", () => {
  assert.deepEqual(
    projectOfficialCuaStructuredContent(
      [image, authority, { type: "text", text: "long text" }],
      0,
      "tail",
    ),
    { content: [image, authority], truncated: true },
  );
  const stripped = projectOfficialCuaStructuredContent(
    [image, authority, { type: "reasoning", text: "hidden" }, { type: "text", text: "tail" }],
    300,
    "head",
  );
  assert.equal(stripped?.truncated, true);
  assert.deepEqual(stripped?.content.slice(0, 3), [
    image,
    authority,
    { type: "text", text: "tail" },
  ]);
  assert.ok(
    stripped?.content.some(
      (block) => block.type === "text" && block.text.startsWith("[Official CUA text truncated"),
    ),
  );
});

test("protected serialization records real media bytes and keeps persistence before pair validation", async () => {
  const events: string[] = [];
  const deps = dependencies({
    async writeToolResultArtifact() {
      events.push("persist");
      return artifact("saved");
    },
  } as unknown as ToolArtifactStorePort);
  const tool = entry({
    modelContentProtection: protection,
    resultBudget: { ...budget(0, "artifact"), artifact: { enabled: true } },
    formatModelContent: () => [image, authority],
  });
  const actual = await serializeOutput(deps, "output", tool, trace, "call", signal);
  assert.deepEqual(events, ["persist"]);
  assert.equal(
    actual.modelContent && (actual.modelContent as ModelMessageContentBlock[])[0],
    image,
  );
  assert.equal(
    actual.returnedBytes,
    Buffer.byteLength(actual.content) + Buffer.byteLength(image.dataUrl),
  );
  assert.equal(actual.artifactPath, "saved");
  assert.equal(actual.truncated, true);
  const warnings: unknown[] = [];
  deps.logger = {
    warn: (...args: unknown[]) => {
      events.push("warn");
      warnings.push(args);
    },
  } as unknown as typeof deps.logger;
  tool.formatModelContent = () => [{ type: "text", text: "prefix" }, image, authority];
  await assert.rejects(
    serializeOutput(deps, "output", tool, trace, "call", signal),
    (error: unknown) => {
      const e = error as Error & { context: Record<string, unknown>; recoverable: boolean };
      assert.equal(e.recoverable, true);
      assert.equal(e.context.code, "official_cua_frame_pair_not_leading");
      assert.match(e.message, /capture a new raster first/);
      assert.equal(e.message.includes(AUTHORITY), false);
      return true;
    },
  );
  assert.deepEqual(events, ["persist", "persist", "warn"]);
  assert.equal(JSON.stringify(warnings).includes(AUTHORITY), false);
  assert.equal(JSON.stringify(warnings).includes(image.dataUrl), false);
});

test("protection flag without recognized pair still uses normal result budget", async () => {
  const tool = entry({
    modelContentProtection: protection,
    resultBudget: budget(5),
    formatModelContent: () => [image, { type: "text", text: "ordinary" }],
  });
  const actual = await serializeOutput(dependencies(), null, tool, trace, "call", signal);
  assert.equal(actual.modelContent, "\n\n[To");
  assert.equal(actual.returnedBytes, 5);
  assert.equal(actual.truncated, true);
});

test("protected content text is captured before reading media payload for accounting", async () => {
  const dynamicImage = {
    type: "image" as const,
    mediaType: "image/png",
    get dataUrl() {
      this.mediaType = "image/jpeg";
      return "payload";
    },
  };
  const tool = entry({
    modelContentProtection: protection,
    resultBudget: budget(100),
    formatModelContent: () => [dynamicImage, authority],
  });
  const actual = await serializeOutput(dependencies(), null, tool, trace, "call", signal);
  const expected = `[Attached image/png]\n\n${AUTHORITY}`;
  assert.equal(actual.content, expected);
  assert.equal(actual.returnedBytes, Buffer.byteLength(expected) + 7);
});

test("protected hooks filter authority, append after image and retain media byte accounting", () => {
  const input = result("display", { modelContent: [image, authority], returnedBytes: 1000 });
  const tool = entry({ modelContentProtection: protection, resultBudget: budget(80) });
  const removed = appendHookAdditionalContexts(input, [AUTHORITY], tool);
  assert.notEqual(removed, input);
  assert.equal(removed.modelContent, input.modelContent);
  assert.equal(removed.content, "display");
  assert.equal(removed.returnedBytes, 1000);
  assert.equal(removed.truncated, true);
  const actual = appendHookAdditionalContexts(input, [AUTHORITY, "safe"], tool);
  const appended = "\n\n[Hook additional context]\n#1\nsafe";
  assert.equal(actual.content, "display" + appended);
  assert.equal(actual.returnedBytes, 1000 + Buffer.byteLength(appended));
  assert.deepEqual(actual.modelContent, [
    image,
    authority,
    { type: "text", text: appended.slice(2) },
  ]);
  assert.equal(actual.truncated, true);
  const tight = appendHookAdditionalContexts(
    input,
    ["safe"],
    entry({ modelContentProtection: protection, resultBudget: budget(9) }),
  );
  assert.equal(tight.modelContent, input.modelContent);
  assert.equal(tight.returnedBytes, 1000);
  assert.equal(tight.truncated, true);
  assert.equal(input.truncated, false);
});
