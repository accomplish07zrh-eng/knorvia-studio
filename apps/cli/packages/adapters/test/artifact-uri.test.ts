import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { NodeToolArtifactStore } from "../src/storage/index.js";

test("artifact storage writes Knorvia URIs and reads old session URIs", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "knorvia-artifact-protocol-"));
  if (!resolve(root).startsWith(resolve(tmpdir()))) throw new Error("Unexpected test directory");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new NodeToolArtifactStore({
    rootDir: join(root, "artifacts"),
    imageCacheRootDir: join(root, "images"),
    videoCacheRootDir: join(root, "videos"),
  });
  const written = await store.writeToolResultArtifact({
    sessionId: "session-1",
    toolCallId: "call-1",
    content: "hello",
    contentType: "text/plain",
  });
  assert.match(written.uri, /^knorvia-artifact:\/\//u);
  const legacyUri = written.uri.replace(/^knorvia-artifact:/u, "knorvia-artifact:");
  const oldRead = await store.readToolResultArtifact({ uri: legacyUri });
  assert.equal(oldRead.content, "hello");
});
