import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { IFileService } from "../src/file/file.js";

test("synthetic preview authorization gates URLs and reads, preserving errors and inline data", async () => {
  const trace: unknown[][] = [];
  const denied = Object.assign(new Error("synthetic denied"), { code: "EACCES" });
  mock.module("@knorvia/shared", {
    namedExports: {
      ServiceChannels: { MediaPreview: "synthetic-preview" },
      getMediaPreviewFormat: (path: string) =>
        path.endsWith(".mp4") ? { kind: "video", mediaType: "video/mp4" } : null,
    },
  });
  const { createMediaPreviewService } = await import("../src/media-preview/mediaPreview.js");
  const fileService = {
    stat: async (params: unknown) => {
      trace.push(["stat", params]);
      return { type: "file", size: 5 };
    },
    readMediaPreview: async (params: unknown) => {
      trace.push(["read", params]);
      return { dataBase64: "c3ludGhldGlj", mediaType: "synthetic/type", totalBytes: 3 };
    },
  } as unknown as IFileService;
  const options = {
    fileService,
    inlineMaxBytes: 0,
    authorizeLocalMediaPreviewPath: async (path: string) => {
      trace.push(["authorize", path]);
      throw denied;
    },
    createLocalMediaPreviewUrl: (path: string) => {
      trace.push(["url", path]);
      return "synthetic:preview";
    },
  };
  const local = createMediaPreviewService(options);
  await assert.rejects(
    local.prepare({ path: "/synthetic/input.mp4", expectedKind: "video" }),
    (e) => e === denied,
  );
  assert.deepEqual(trace, [
    ["stat", { path: "/synthetic/input.mp4" }],
    ["authorize", "/synthetic/input.mp4"],
  ]);
  trace.length = 0;
  await assert.rejects(
    local.prepare({ path: "/synthetic/input.mp4", expectedKind: "audio" }),
    /Unsupported media preview format/,
  );
  assert.deepEqual(trace, []);
  const inlineOptions = { fileService, inlineMaxBytes: 4 };
  const bounded = createMediaPreviewService(inlineOptions);
  inlineOptions.inlineMaxBytes = 999;
  await assert.rejects(
    bounded.prepare({ path: "/synthetic/input.mp4", expectedKind: "video" }),
    /too large/,
  );
  assert.deepEqual(trace, [["stat", { path: "/synthetic/input.mp4" }]]);
  trace.length = 0;
  const result = await createMediaPreviewService({ fileService, inlineMaxBytes: 5 }).prepare({
    path: "/synthetic/input.mp4",
    expectedKind: "video",
  });
  assert.deepEqual(result, {
    kind: "inline",
    path: "/synthetic/input.mp4",
    mediaType: "synthetic/type",
    dataBase64: "c3ludGhldGlj",
    size: 3,
  });
  assert.deepEqual(trace, [
    ["stat", { path: "/synthetic/input.mp4" }],
    ["read", { path: "/synthetic/input.mp4", maxBytes: 5 }],
  ]);
});
