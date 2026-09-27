// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import type { ToolArtifactStorePort } from "@knorvia/contracts";
import { formatJsModelContent } from "../src/tool/handlers/node-repl-model-content.js";
import {
  createJsToolEntry,
  fixture,
  gate,
  invoke,
  jsToolEntry,
  successful,
  turn,
} from "./repl-tool-fixture.js";

test("model rendering keeps error, log, result and artifact ordering with images first", () => {
  assert.equal(formatJsModelContent({ logs: "" }), "(no output)");
  assert.equal(formatJsModelContent({ logs: " ", result: "" }), " \n=> ");
  assert.deepEqual(
    formatJsModelContent({
      error: {
        name: "Error",
        message: "line one\nline two",
        stack: "Error: line one\nline two\n    at fixture\n\n",
      },
      logs: "logged",
      result: "42",
      images: [
        { mimeType: "image/webp", base64: "AQID" },
        { mimeType: "image/png", base64: "BAUG" },
      ],
      browserScreenshotPaths: ["first", "second"],
    }),
    [
      { type: "image", mediaType: "image/webp", dataUrl: "data:image/webp;base64,AQID" },
      { type: "image", mediaType: "image/png", dataUrl: "data:image/png;base64,BAUG" },
      {
        type: "text",
        text: "Error: line one\nline two\n    at fixture\nlogged\n=> 42\nBrowser screenshot saved to: first\nBrowser screenshot saved to: second",
      },
    ],
  );
  assert.equal(
    formatJsModelContent({
      logs: "",
      error: { name: "X", message: "message", stack: "alternate head\n  frame\n" },
    }),
    "X: message\n  frame",
  );
  assert.equal(
    formatJsModelContent({ logs: "", error: { name: "X", message: "message", stack: "one line" } }),
    "X: message",
  );
  assert.deepEqual(
    formatJsModelContent({ logs: "", images: [{ mimeType: "image/png", base64: "AA==" }] }),
    [
      { type: "image", mediaType: "image/png", dataUrl: "data:image/png;base64,AA==" },
      { type: "text", text: "(no output)" },
    ],
  );
});

test("JS declaration retains permissions, budgets and opt-in browser instructions", () => {
  const enabled = createJsToolEntry({ browserUseEnabled: true });
  assert.equal(enabled.handler, jsToolEntry.handler);
  assert.equal(enabled.formatModelContent, formatJsModelContent);
  const { description: _description, ...metadata } = enabled.metadata;
  assert.deepEqual(metadata, {
    name: "js",
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    timeoutMs: 30000,
    sideEffectScope: "system",
    riskLevel: "high",
    needsApproval: true,
  });
  const { reason: _reason, ...permission } = enabled.permission!;
  assert.deepEqual(permission, {
    permission: "node_repl",
    riskLevel: "high",
    sideEffectScope: "system",
    needsApproval: true,
    denyPriority: "beforeAsk",
    patternSources: ["input"],
    alwaysAllowPatternSources: [],
  });
  assert.deepEqual(enabled.resultBudget, {
    maxInlineBytes: 1000000,
    maxModelBytes: 65536,
    strategy: "artifact",
    preview: { maxBytes: 65536, direction: "tail" },
    artifact: { enabled: true, retention: "session" },
  });
  assert.deepEqual(enabled.timeout, {
    defaultMs: 30000,
    maxMs: 120000,
    allowCallOverride: true,
    cleanupGraceMs: 2000,
  });
  assert.deepEqual(enabled.cancellation, {
    supported: true,
    cleanup: "bestEffort",
    userVisibleMessage: "JavaScript execution was cancelled",
  });
  assert.deepEqual(enabled.trace, {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  });
  assert.doesNotMatch(jsToolEntry.metadata.description!, /agent\.browsers/);
  for (const token of [
    "code",
    "title",
    "importModule",
    "globalThis",
    "await",
    "const",
    "let",
    "var",
    "function",
    "class",
  ])
    assert.ok(jsToolEntry.metadata.description!.includes(token), token);
  for (const token of [
    "agent.browsers",
    "getForUrl",
    "getDefault",
    "browser.documentation()",
    "domSnapshot",
    "controlledTabs",
    "userTabs",
    "Promise.all",
    "emitImage",
    "BrowserCommandError",
    "untrusted",
  ])
    assert.ok(enabled.metadata.description!.includes(token), token);
});

const image = { base64: "AQID", mimeType: "image/png" as const };
const screenshotCode =
  "const shot = await fixtureBrowser.execute('fixture', 3, {method:'screenshot'}); nodeRepl.emitImage(shot.image); nodeRepl.emitImage(shot.image); undefined";
function store(
  write: NonNullable<ToolArtifactStorePort["writeToolResultBinaryArtifact"]>,
): ToolArtifactStorePort {
  return {
    writeToolResultBinaryArtifact: write,
    readToolResultArtifact: async () => assert.fail("Must not read artifacts"),
    writeToolResultArtifact: async () => assert.fail("Must not use text writer"),
  };
}
const artifact = (path?: string) => ({
  id: "fixture",
  uri: "artifact:fixture",
  path,
  bytes: 3,
  contentType: "image/png",
  createdAt: new Date(0),
});

test("screenshot provenance writes only the observed image occurrence with original context", async (t) => {
  const requests: unknown[] = [];
  const artifactStore = store(async function (this: ToolArtifactStorePort, request, options) {
    assert.equal(this, artifactStore);
    requests.push([request, options]);
    return artifact("fixture/capture.png");
  });
  const context = fixture(t, {
    artifactStore,
    browserControlPort: {
      list: async () => [],
      execute: async () => ({ ok: true, elapsedMs: 0, image }),
    },
  });
  context.traceContext = { traceId: context.traceId };
  const output = successful(await invoke(screenshotCode, context));
  assert.deepEqual(requests, [
    [
      {
        sessionId: context.sessionId,
        turnId: context.turnId,
        toolCallId: context.toolCallId,
        toolName: "js",
        content: Buffer.from([1, 2, 3]),
        contentType: "image/png",
        extension: ".png",
        retention: "session",
        trace: context.traceContext,
      },
      { signal: context.abortSignal },
    ],
  ]);
  assert.deepEqual(output.images, [image, image]);
  assert.deepEqual(output.browserScreenshotPaths, [resolve("fixture/capture.png")]);
  assert.deepEqual(Object.keys(output), ["logs", "images", "browserScreenshotPaths"]);
});

test("failed commands, non-screenshot images and non-browser emissions cannot create paths", async (t) => {
  let writes = 0;
  const context = fixture(t, {
    artifactStore: store(async () => {
      writes++;
      return artifact("capture.png");
    }),
    browserControlPort: {
      list: async () => [],
      execute: async ({ command }) => ({
        ok: command.method !== "screenshot",
        elapsedMs: 0,
        image,
      }),
    },
  });
  for (const method of ["screenshot", "getState"]) {
    const output = successful(
      await invoke(
        `nodeRepl.emitImage((await fixtureBrowser.execute('fixture', 3, {method:${JSON.stringify(method)}})).image)`,
        context,
      ),
    );
    assert.equal(output.images?.length, 1);
    assert.equal(output.browserScreenshotPaths, undefined);
  }
  successful(await invoke("nodeRepl.emitImage({base64:'AQID'})", context));
  assert.equal(writes, 0);
});

test("artifact failures preserve successful output except when the request has been cancelled", async (t) => {
  const failure = new Error("artifact unavailable");
  const controller = new AbortController();
  let cancel = false;
  const context = fixture(t, {
    abortSignal: controller.signal,
    artifactStore: store(async () => {
      if (cancel) controller.abort();
      throw failure;
    }),
    browserControlPort: {
      list: async () => [],
      execute: async () => ({ ok: true, elapsedMs: 0, image }),
    },
  });
  assert.equal(successful(await invoke(screenshotCode, context)).browserScreenshotPaths, undefined);
  cancel = true;
  await assert.rejects(invoke(screenshotCode, context), (error) => error === failure);
});

test("artifact awaits remain attributed to their originating call while the next cell runs", async (t) => {
  const entered = gate();
  const resume = gate();
  t.after(() => resume.resolve());
  const context = fixture(t, {
    artifactStore: store(async (request) => {
      assert.equal(request.turnId, "old");
      entered.resolve();
      await resume.promise;
      return artifact(resolve("capture.png"));
    }),
    browserControlPort: {
      list: async () => [],
      execute: async () => ({ ok: true, elapsedMs: 0, image }),
    },
  });
  const old = invoke(screenshotCode, turn(context, "old"));
  await entered.promise;
  const next = successful(await invoke("42", turn(context, "new")));
  assert.deepEqual(next, { result: "42", logs: "" });
  resume.resolve();
  assert.deepEqual(successful(await old).browserScreenshotPaths, [resolve("capture.png")]);
});
