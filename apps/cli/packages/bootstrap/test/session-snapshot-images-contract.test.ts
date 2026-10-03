import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaApp } from "../src/app/types.js";
import { snapshotMessages } from "../src/protocol/session-snapshot-images.js";
import { appFixture, filePart, message } from "./session-projection-fixture.js";

type Artifact = Awaited<ReturnType<KnorviaApp["readToolResultArtifact"]>>;
const artifact = (uri: string, content: string, contentType = "image/png"): Artifact => ({
  uri,
  content,
  contentType,
  bytes: content.length,
});

test("new and legacy image artifact URIs hydrate through the same app port", async () => {
  const f = appFixture();
  const uris: string[] = [];
  f.app.readToolResultArtifact = async (uri) => {
    uris.push(uri);
    return artifact(uri, "AA==", "IMAGE/JPEG; charset=utf-8");
  };
  const result = await snapshotMessages(f.app, [
    message("user", 100, [filePart("knorvia-artifact://fixture-session/first", "image/*")]),
    message("user", 200, [filePart("zcode-artifact://fixture-session/second", "image/png")]),
  ]);
  assert.deepEqual(uris, [
    "knorvia-artifact://fixture-session/first",
    "zcode-artifact://fixture-session/second",
  ]);
  for (const output of result) {
    const part = output.parts[0];
    assert.ok(part?.type === "file");
    assert.equal(part.url, "data:image/jpeg;base64,AA==");
  }
});

test("inline images, non-images and empty metadata overrides bypass reads; failed reads retain URLs", async () => {
  const f = appFixture();
  const calls: string[] = [];
  f.app.readToolResultArtifact = async (uri) => {
    calls.push(uri);
    throw new Error("fixture unavailable");
  };
  const source = [
    filePart("data:image/png;base64,AA=="),
    filePart("knorvia-artifact://fixture-session/text", "text/plain"),
    filePart("knorvia-artifact://fixture-session/empty", "image/png", { artifactUri: "" }),
    filePart("knorvia-artifact://fixture-session/failure"),
  ];
  const result = await snapshotMessages(f.app, [message("user", 100, source)]);
  assert.deepEqual(calls, ["knorvia-artifact://fixture-session/failure"]);
  assert.deepEqual(
    result[0]?.parts.map((part) => (part.type === "file" ? part.url : undefined)),
    source.map((part) => (part.type === "file" ? part.url : undefined)),
  );
});

test("image size admission counts complete UTF8 data URL bytes and keeps the exact limit", async () => {
  const f = appFixture();
  const prefix = "data:image/png;base64,";
  const limit = 20 * 1024 * 1024;
  const allowed = prefix + "a".repeat(limit - prefix.length);
  f.app.readToolResultArtifact = async (uri) =>
    artifact(uri, uri.endsWith("/over") ? allowed + "a" : allowed);
  const result = await snapshotMessages(f.app, [
    message("user", 100, [
      filePart("knorvia-artifact://fixture-session/exact"),
      filePart("knorvia-artifact://fixture-session/over"),
    ]),
  ]);
  const first = result[0]?.parts[0];
  const second = result[0]?.parts[1];
  assert.ok(first?.type === "file" && second?.type === "file");
  assert.equal(first.url, allowed);
  assert.equal(second.url, "knorvia-artifact://fixture-session/over");
});

test("all image reads begin before hydration completes and output retains message order", async () => {
  const f = appFixture();
  const calls: string[] = [];
  const ready = new Map<string, (value: Artifact) => void>();
  f.app.readToolResultArtifact = (uri) => {
    calls.push(uri);
    return new Promise<Artifact>((resolve) => {
      ready.set(uri, resolve);
    });
  };
  const first = "knorvia-artifact://fixture-session/first";
  const second = "knorvia-artifact://fixture-session/second";
  const pending = snapshotMessages(f.app, [
    message("user", 100, [filePart(first)]),
    message("user", 200, [filePart(second)]),
  ]);
  assert.deepEqual(calls, [first, second]);
  ready.get(second)!(artifact(second, "BB=="));
  ready.get(first)!(artifact(first, "AA=="));
  const output = await pending;
  assert.deepEqual(
    output.map((item) => item.info.messageId),
    ["fixture-message-100", "fixture-message-200"],
  );
});
