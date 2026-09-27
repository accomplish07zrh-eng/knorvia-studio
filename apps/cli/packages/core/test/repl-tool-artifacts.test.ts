// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { resolve, sep } from "node:path";
import test from "node:test";
import type { ToolArtifactStorePort } from "@knorvia/contracts";
import { saveBrowserScreenshots } from "../src/tool/repl/artifacts.js";
import { toolOutput } from "../src/tool/repl/output.js";
import { fixture } from "./repl-tool-fixture.js";

test("artifact adapter preserves absolute path spelling and MIME-to-extension compatibility", async (t) => {
  const seen: Array<[string, string | undefined]> = [];
  const paths = [
    "fixture/relative.png",
    `${resolve("fixture")}${sep}..${sep}image.jpg`,
    "",
    undefined,
  ];
  const store: ToolArtifactStorePort = {
    async writeToolResultBinaryArtifact(request) {
      assert.equal(this, store);
      seen.push([request.contentType, request.extension]);
      return {
        id: "fixture",
        uri: "artifact:fixture",
        path: paths[seen.length - 1],
        bytes: 1,
        contentType: request.contentType,
        createdAt: new Date(0),
      };
    },
    readToolResultArtifact: async () => assert.fail("Unexpected read"),
    writeToolResultArtifact: async () => assert.fail("Unexpected text artifact"),
  };
  const context = fixture(t, { artifactStore: store });
  const mimeTypes = [
    " IMAGE/JPEG ; extra=1",
    "image/jpg",
    "Image/WebP",
    "image/svg+xml",
    "constructor",
  ];
  const result = await saveBrowserScreenshots(
    {
      logs: "",
      images: mimeTypes.map((mimeType) => ({ base64: "AA==", mimeType })),
      browserScreenshotImageIndices: [0, 1, -1, 100, 2, 3, 4],
    },
    context,
  );
  assert.deepEqual(
    seen,
    mimeTypes.map((mime, index) => [mime, [".jpg", ".jpg", ".webp", ".png", ".png"][index]]),
  );
  assert.deepEqual(result, [resolve(paths[0]!), paths[1]]);
});

test("missing binary writer, images and trusted indices produce no artifact writes", async (t) => {
  const context = fixture(t);
  const image = { base64: "AA==", mimeType: "image/png" };
  assert.deepEqual(
    await saveBrowserScreenshots(
      { logs: "", images: [image], browserScreenshotImageIndices: [0] },
      context,
    ),
    [],
  );
  context.artifactStore = {
    writeToolResultBinaryArtifact: async () => assert.fail("No trusted occurrence to persist"),
    writeToolResultArtifact: async () => assert.fail("Unexpected text artifact"),
    readToolResultArtifact: async () => assert.fail("Unexpected read"),
  };
  for (const run of [
    { logs: "" },
    { logs: "", images: [image] },
    { logs: "", browserScreenshotImageIndices: [0] },
  ])
    assert.deepEqual(await saveBrowserScreenshots(run, context), []);
});

test("core output projection preserves optionality without adding structured trust channels", () => {
  const output = toolOutput(
    {
      result: "",
      logs: "",
      error: { name: "Error", message: "fixture" },
      images: [],
      responseMeta: {},
      structuredResults: [{ content: [] }],
      cuaApp: { appKey: "fixture" },
    },
    [],
  );
  assert.deepEqual(output, {
    result: "",
    logs: "",
    error: { name: "Error", message: "fixture" },
    responseMeta: {},
  });
  assert.deepEqual(Object.keys(output), ["result", "logs", "error", "responseMeta"]);
});
