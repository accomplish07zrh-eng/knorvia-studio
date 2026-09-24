import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");
type Message = { id: string; text: string; sequence: number };
const location = () => join(mkdtempSync(join(tmpdir(), "studio-cursors-")), "db.sqlite");
function allMessages(db: StudioDatabase): Message[] {
  const messages: Message[] = [];
  let before: number | undefined;
  while (true) {
    const page = db.list<Message>("message", { scope: "chat", limit: 500, before });
    messages.push(...page);
    if (page.length < 500) return messages;
    before = page.at(-1)!.sequence;
  }
}

test("numeric cursors cover a transaction larger than a page and a batch crossing the page boundary", () => {
  const db = new StudioDatabase(location());
  try {
    db.transaction(() => {
      for (let i = 0; i < 620; i++)
        db.write("message", `message-${i}`, { id: `message-${i}`, text: `${i}` }, "chat");
    });
    db.transaction(() => {
      for (let i = 620; i < 720; i++)
        db.write("message", `message-${i}`, { id: `message-${i}`, text: `${i}` }, "chat");
    });
    const before = allMessages(db);
    assert.equal(before.length, 720);
    assert.equal(new Set(before.map((message) => message.sequence)).size, 720);
    assert.deepEqual(
      before.map((message) => message.text),
      Array.from({ length: 720 }, (_, i) => String(719 - i)),
    );
    const original = before.find((message) => message.id === "message-20")!;
    db.transaction(() =>
      db.write("message", original.id, { id: original.id, text: "updated" }, "chat"),
    );
    const after = allMessages(db);
    assert.deepEqual(
      after.map((message) => [message.id, message.sequence]),
      before.map((message) => [message.id, message.sequence]),
    );
    assert.equal(after.find((message) => message.id === original.id)?.text, "updated");
  } finally {
    db.close();
  }
});

test("schema 1 migration atomically restores insertion order within old ties and retains every payload", () => {
  const path = location();
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE studio_entities(kind TEXT NOT NULL,id TEXT NOT NULL,scope TEXT NOT NULL DEFAULT '',value TEXT NOT NULL,sequence INTEGER NOT NULL,PRIMARY KEY(kind,id));
    CREATE TABLE studio_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO studio_meta VALUES('revision','7');
    PRAGMA user_version=1;
    BEGIN;
  `);
  const insert = legacy.prepare("INSERT INTO studio_entities VALUES('message',?,'chat',?,?)");
  for (let i = 0; i < 620; i++)
    insert.run(
      `message-${i}`,
      JSON.stringify({ id: `message-${i}`, text: `${i}`, extra: ["preserved", i] }),
      i < 300 ? 6 : 7,
    );
  legacy
    .prepare("UPDATE studio_entities SET value=? WHERE id='message-20'")
    .run(JSON.stringify({ id: "message-20", text: "edited", extra: ["preserved", 20] }));
  const payloads = legacy.prepare("SELECT id,value FROM studio_entities ORDER BY rowid").all();
  legacy.exec("COMMIT");
  legacy.close();
  const db = new StudioDatabase(path);
  try {
    assert.equal(db.revision(), 7);
    const migrated = allMessages(db);
    assert.equal(migrated.length, 620);
    assert.deepEqual(
      migrated.map((message) => message.id),
      Array.from({ length: 620 }, (_, i) => `message-${619 - i}`),
    );
    for (const row of payloads)
      assert.deepEqual(db.read("message", String(row.id)), JSON.parse(String(row.value)));
    db.transaction(() => db.write("message", "new", { id: "new", text: "new" }, "chat"));
    assert.ok(allMessages(db)[0]!.sequence > migrated[0]!.sequence);
  } finally {
    db.close();
  }
  const verify = new DatabaseSync(path);
  assert.equal(verify.prepare("PRAGMA user_version").get()?.user_version, 2);
  verify.close();
  const reopened = new StudioDatabase(path);
  try {
    assert.equal(allMessages(reopened).length, 621);
  } finally {
    reopened.close();
  }
});

test("unsupported newer stores fail before mutation", () => {
  const path = location();
  const raw = new DatabaseSync(path);
  raw.exec("PRAGMA user_version=3");
  raw.close();
  assert.throws(() => new StudioDatabase(path), /版本较新/);
  const verify = new DatabaseSync(path);
  try {
    assert.equal(verify.prepare("PRAGMA user_version").get()?.user_version, 3);
    assert.equal(
      verify.prepare("SELECT name FROM sqlite_master WHERE name='studio_entities'").get(),
      undefined,
    );
  } finally {
    verify.close();
  }
});
