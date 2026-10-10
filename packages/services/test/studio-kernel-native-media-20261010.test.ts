import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  acpContentMedia,
  acpToolMedia,
  claudeContentMedia,
  codexItemMedia,
  locationValueMedia,
  mediaKindOf,
} from "../src/studio-runtime/domain/kernelMedia.js";
import { acpPermissionOptionId } from "../src/studio-runtime/domain/acpPermission.js";
import {
  materializeKernelMedia,
  withMaterializedMedia,
} from "../src/studio-runtime/adapters/kernels/mediaSink.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { saveTurnEvent } from "../src/studio-runtime/app/turnEvents.js";
import type { StoredRun, StudioClock } from "../src/studio-runtime/app/storePort.js";
import type { StudioKernelEvent } from "../src/studio-runtime/kernelTypes.js";
import type { StudioMessage } from "../src/studio-runtime/types.js";

// specs/knorvia-kernel-native-media-20261010.md
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").toString("base64");

test("ACP content blocks yield media instead of being dropped; text blocks do not", () => {
  assert.deepEqual(acpContentMedia({ type: "text", text: "hi" }), []);
  assert.deepEqual(acpContentMedia({ type: "image", data: PNG, mimeType: "image/png" }), [
    { kind: "image", dataBase64: PNG, mimeType: "image/png" },
  ]);
  assert.equal(
    acpContentMedia({ type: "resource_link", uri: "file:///w/out/clip.mp4", name: "clip.mp4" })[0]
      ?.kind,
    "video",
  );
  assert.equal(
    acpContentMedia({
      type: "resource",
      resource: { uri: "file:///w/a.wav", mimeType: "audio/wav", blob: PNG },
    })[0]?.kind,
    "audio",
  );
  // 文本资源是正文，不当作媒体。
  assert.deepEqual(
    acpContentMedia({ type: "resource", resource: { uri: "file:///w/a.ts", text: "x" } }),
    [],
  );
});

test("tool media comes from content blocks and whole-value locations of completed output only", () => {
  const update = {
    status: "completed",
    content: [
      { type: "content", content: { type: "image", data: PNG, mimeType: "image/png" } },
      { type: "diff", path: "/w/a.ts", newText: "" },
    ],
    rawOutput: {
      saved: "/w/generated/cat.png",
      video: "C:\\work\\out\\clip.webm",
      note: "wrote /w/generated/cat.png successfully",
      url: "https://cdn.example.test/v.mp4",
      source: "/w/src/index.ts",
    },
  };
  const media = acpToolMedia(update);
  assert.deepEqual(
    media.map((item) => [item.kind, item.uri ?? "inline"]),
    [
      ["image", "inline"],
      ["image", "/w/generated/cat.png"],
      ["video", "C:\\work\\out\\clip.webm"],
      ["video", "https://cdn.example.test/v.mp4"],
    ],
  );
  // 运行中的原始输出不扫描，避免把输入路径当成产出。
  assert.equal(acpToolMedia({ ...update, status: "in_progress" }).length, 1);
  assert.deepEqual(locationValueMedia("see /w/a.png"), []);
});

test("Codex image generation and Claude image blocks are extracted", () => {
  assert.deepEqual(codexItemMedia({ type: "imageGeneration", result: PNG }), [
    { kind: "image", dataBase64: PNG, mimeType: "image/png" },
  ]);
  assert.equal(
    codexItemMedia({ type: "imageGeneration", savedPath: "/w/i.png" })[0]?.uri,
    "/w/i.png",
  );
  assert.equal(codexItemMedia({ type: "imageView", path: "/w/v.jpg" })[0]?.kind, "image");
  assert.deepEqual(codexItemMedia({ type: "agentMessage", text: "/w/a.png" }), []);
  assert.deepEqual(
    claudeContentMedia({
      type: "tool_result",
      content: [
        { type: "text", text: "ok" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: PNG } },
      ],
    }),
    [{ kind: "image", dataBase64: PNG, mimeType: "image/jpeg" }],
  );
  assert.equal(mediaKindOf(undefined, "https://x.test/a.MP3?sig=1"), "audio");
});

test("ACP permission falls back to the same-direction always option, never the opposite", () => {
  const always = [
    { kind: "allow_always", optionId: "aa" },
    { kind: "reject_always", optionId: "ra" },
  ];
  assert.equal(acpPermissionOptionId(always, "allow-once"), "aa");
  assert.equal(acpPermissionOptionId(always, "deny"), "ra");
  assert.equal(
    acpPermissionOptionId([{ kind: "allow_once", optionId: "ao" }, ...always], "allow-once"),
    "ao",
  );
  assert.equal(
    acpPermissionOptionId([{ kind: "reject_once", optionId: "ro" }], "allow-once"),
    undefined,
  );
});

test("inline media is written once by content hash and the sink forwards only locations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-media-"));
  try {
    const first = await materializeKernelMedia(directory, {
      kind: "image",
      dataBase64: PNG,
      mimeType: "image/png",
    });
    const second = await materializeKernelMedia(directory, {
      kind: "image",
      dataBase64: PNG,
      mimeType: "image/png",
    });
    assert.equal(first.uri, second.uri);
    assert.ok(first.uri?.endsWith(".png"));
    assert.equal(first.dataBase64, undefined);
    assert.equal((await readFile(first.uri!)).toString("base64"), PNG);
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
      [],
    );
    const located = { kind: "video" as const, uri: "/w/clip.mp4", name: "clip.mp4" };
    assert.equal(await materializeKernelMedia(directory, located), located);

    const forwarded: StudioKernelEvent[] = [];
    const sink = withMaterializedMedia(
      { emit: async (event) => void forwarded.push(event), ask: async () => ({}) },
      directory,
    );
    await sink.emit({ type: "media", items: [{ kind: "image", dataBase64: PNG }] });
    await sink.emit({ type: "text", text: "hello" });
    const media = forwarded[0] as Extract<StudioKernelEvent, { type: "media" }>;
    assert.equal(media.items[0]?.dataBase64, undefined);
    assert.ok(media.items[0]?.uri);
    assert.deepEqual(forwarded[1], { type: "text", text: "hello" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("media messages are idempotent per location and never store bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-media-db-"));
  const db = new StudioDatabase(join(directory, "test.sqlite"));
  const clock = { now: Date.now, id: randomUUID } as StudioClock;
  const run = { id: "run", targetId: "chat" } as StoredRun;
  try {
    const event: StudioKernelEvent = {
      type: "media",
      items: [
        { kind: "image", uri: "/w/cat.png", name: "cat.png" },
        { kind: "image", dataBase64: PNG },
      ],
    };
    db.transaction(() => saveTurnEvent(db, clock, run, "turn", "grok-build", event, "step"));
    db.transaction(() => saveTurnEvent(db, clock, run, "turn", "grok-build", event, "step"));
    const messages = db
      .list<StudioMessage>("message")
      .filter((message) => message.kind === "media");
    assert.equal(messages.length, 2);
    const located = messages.find((message) => message.media?.[0]?.uri === "/w/cat.png")!;
    assert.equal(located.sender, "grok-build");
    assert.equal(located.text, "cat.png");
    assert.ok(messages.every((message) => !JSON.stringify(message).includes(PNG)));
    assert.ok(messages.some((message) => message.media?.[0]?.omitted === "too-large"));
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
