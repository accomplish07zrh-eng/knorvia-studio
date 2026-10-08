import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { seedLegacyStudioDatabase } from "./fixtures/studio-legacy-v010.integration.js";

test("opening a genuine v0.10.0 schema preserves old entity bytes, scopes, cursors and unknown fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-image-old-schema-"));
  const path = join(root, "studio.sqlite");
  try {
    const old = await seedLegacyStudioDatabase(path, join(root, "project"));
    const owner = new StudioDatabase(path);
    try {
      assert.deepEqual(owner.read("command", "legacy-command"), JSON.parse(old.rows[3]!.value));
      assert.deepEqual(owner.read("conversation", "legacy-chat"), JSON.parse(old.rows[0]!.value));
      assert.equal(owner.revision(), 23);
      const messages = owner.list<{ sequence: number; text: string }>("message", {
        scope: "legacy-chat",
      });
      assert.equal(messages[0]!.sequence, 3);
      assert.equal(messages[0]!.text, "旧正文保留");
    } finally {
      owner.close();
    }
    const raw = new DatabaseSync(path, { readOnly: true });
    try {
      const actual = raw
        .prepare("SELECT kind,id,scope,value,sequence FROM studio_entities ORDER BY sequence")
        .all();
      assert.deepEqual(
        actual.map((row) => ({ ...row })),
        old.rows,
      );
      for (const previous of old.schema) {
        const current = raw
          .prepare("SELECT name,sql FROM sqlite_master WHERE name=?")
          .get(previous.name as string);
        assert.deepEqual(current, previous);
      }
    } finally {
      raw.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
