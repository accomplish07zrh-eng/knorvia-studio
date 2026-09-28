// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  assistant,
  messageFixture,
  messageID,
  owner,
  part,
  user,
} from "./message-storage-fixture.js";

const DEPTH = 1100;
function nestedMetadata() {
  let value: Record<string, unknown> = { fixture: true };
  for (let index = 0; index < DEPTH; index++) value = { child: value };
  return value;
}
function inspectDepth(value: unknown) {
  let depth = 0;
  while (typeof value === "object" && value !== null && "child" in value) {
    depth++;
    value = value.child;
  }
  assert.equal(depth, DEPTH);
  assert.deepEqual(value, { fixture: true });
}

for (const kind of ["message", "part"] as const) {
  test(`${kind} without legacy members accepts deep metadata without a new JSON1 parse`, async (t) => {
    const f = await messageFixture(t);
    if (kind === "message") await f.store.saveMessage(assistant());
    else {
      await f.store.saveMessage(user());
      await f.store.savePart(part());
    }
    const metadata = nestedMetadata();
    if (kind === "message") await f.store.saveMessage({ ...assistant(), metadata });
    else await f.store.savePart({ ...part(), metadata });
    const saved = await f.store.messageWithParts({
      sessionID: owner,
      messageID: kind === "message" ? assistant().id : messageID,
    });
    assert.ok(saved);
    inspectDepth(
      kind === "message" ? saved.info.metadata : Reflect.get(saved.parts[0], "metadata"),
    );
    assert.equal(f.db.isTransaction, false);
  });
}
