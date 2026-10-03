// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { world, path } from "./fixture.mjs";
import { searchWorld } from "./search-cases.mjs";
const loaded = await target();
after(() => loaded.dispose());
test("actual Anthropic metadata consumer reads inherited identity without changing stored fields", async () => {
  const w = world();
  const base = path("provider-data");
  const state = JSON.stringify({ deviceMid: "controlled-existing", unknown: { retained: true } });
  const file = w.put("provider-data/.knorvia-studio/v2/telemetry-state.json", state);
  const { provider } = loaded.use(w);
  const env = { KNORVIA_DATA_BASE_DIR: base };
  const metadata = await provider.resolveAnthropicRequestMetadataUserId({
    env,
    providerKind: "anthropic",
    sessionId: "controlled-session",
  });
  assert.deepEqual(JSON.parse(metadata), {
    device_id: "controlled-existing",
    account_uuid: "",
    session_id: "controlled-session",
  });
  assert.equal(w.files.get(file).toString(), state);
  const before = w.events.length;
  assert.equal(
    await provider.resolveAnthropicRequestMetadataUserId({ env, providerKind: "other" }),
    undefined,
  );
  assert.equal(w.events.length, before);
  assert.deepEqual(
    provider.redactAnthropicRequestMetadata({ nested: [{ user_id: metadata }], other: "keep" }),
    { nested: [{ user_id: "[REDACTED]" }], other: "keep" },
  );
});
test("actual Core Grep handler and schema consume filesystem content/trace/cancellation boundary", async () => {
  const w = searchWorld();
  const { fs, grep } = loaded.use(w);
  const ctx = {
    fileSystemPort: new fs.NodeFileSystemAdapter({ textSearchEngine: "javascript" }),
    workingDirectory: path("tree"),
    workspaceRoot: path("tree"),
    traceId: "controlled-trace",
    toolCallId: "controlled-tool",
  };
  const output = await grep.grepToolEntry.handler(
    { pattern: "target", output_mode: "content", type: "ts", "-n": true },
    ctx,
  );
  const checked = grep.grepToolEntry.runtimeOutputSchema.parse(output);
  assert.equal(checked.numMatches, 2);
  assert.match(checked.content, /z\.ts:2:target/);
  assert.match(checked.content, /z\.ts:4:target/);
  assert.equal(checked.numFiles, 1);
  assert.equal(checked.numLines, 2);
  assert.equal(checked.truncated, false);
});
test("actual Core Glob handler and schema preserve mtime order and workspace-relative paths", async () => {
  const w = searchWorld();
  const { fs, glob } = loaded.use(w);
  const ctx = {
    fileSystemPort: new fs.NodeFileSystemAdapter(),
    workingDirectory: path("tree"),
    workspaceRoot: path("tree"),
    traceId: "controlled-trace",
    toolCallId: "controlled-tool",
  };
  const output = glob.globToolEntry.runtimeOutputSchema.parse(
    await glob.globToolEntry.handler({ pattern: "*.txt" }, ctx),
  );
  assert.deepEqual(output.filenames, ["binary.txt", "a.txt", "deep/q.txt"]);
  assert.equal(output.numFiles, 3);
  assert.equal(output.truncated, false);
});
