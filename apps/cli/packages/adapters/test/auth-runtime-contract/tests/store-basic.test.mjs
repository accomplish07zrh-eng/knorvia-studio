// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import test from "node:test";
import { getPersistenceState, resetPersistenceState } from "../harness/seam-controls.mjs";
import {
  authModule,
  caseTemp,
  ensureCaseTemp,
  identityCipher,
  markedCipher,
  readJson,
  writeJson,
} from "../harness/test-context.mjs";

function countEvent(type) {
  return getPersistenceState().events.filter((event) => event.type === type).length;
}

test(
  "A-STO-03 save/load/delete use locked atomic exact JSON persistence",
  { timeout: 7000 },
  async () => {
    await ensureCaseTemp();
    resetPersistenceState();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const filePath = caseTemp("basic", "credentials.json");
    const cipherEvents = [];
    const store = createSharedKnorviaCredentialStore({
      filePath,
      cipher: markedCipher(cipherEvents),
      env: {},
    });
    assert.equal(await store.load("missing"), null);
    await store.save(" beta ", "B");
    await store.save("alpha", "A");
    assert.equal(await store.load("beta"), "B");
    assert.equal(await store.load(" absent "), null);
    assert.equal(
      await readFile(filePath, "utf8"),
      '{\n  "beta": "sealed:B",\n  "alpha": "sealed:A"\n}\n',
    );
    assert.equal(countEvent("lock:acquired"), 2);
    assert.equal(countEvent("lock:released"), 2);
    assert.equal(countEvent("write:committed"), 2);
    assert.equal(countEvent("write:cleanup"), 2);
    await store.delete(" beta ");
    assert.equal(await store.load("beta"), null);
    assert.deepEqual(await readJson(filePath), { alpha: "sealed:A" });
    assert.ok(cipherEvents.includes("encrypt:B"));
    assert.ok(cipherEvents.includes("decrypt:sealed:B"));
  },
);

test(
  "A-STO-04 saveMany publishes once and loadMany consumes one normalized snapshot",
  { timeout: 7000 },
  async () => {
    await ensureCaseTemp();
    resetPersistenceState();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const filePath = caseTemp("many", "credentials.json");
    const store = createSharedKnorviaCredentialStore({
      filePath,
      cipher: identityCipher(),
      env: {},
    });
    await store.saveMany({ " first ": "v1", second: "v2", first: "v3" });
    assert.deepEqual(await readJson(filePath), { first: "owned:v3", second: "owned:v2" });
    assert.equal(countEvent("lock:acquired"), 1);
    assert.equal(countEvent("write:committed"), 1);

    await writeJson(filePath, { first: "snapshot:one", second: "snapshot:two" });
    let decryptions = 0;
    const decryptedInputs = new Set();
    const snapshotCipher = {
      encrypt(value) {
        return `snapshot:${value}`;
      },
      decrypt(value) {
        decryptions += 1;
        decryptedInputs.add(value);
        if (decryptions === 1) {
          writeFileSync(
            filePath,
            '{"first":"snapshot:new-one","second":"snapshot:new-two"}\n',
            "utf8",
          );
        }
        return value.slice("snapshot:".length);
      },
    };
    const reader = createSharedKnorviaCredentialStore({
      filePath,
      cipher: snapshotCipher,
      env: {},
    });
    assert.deepEqual(await reader.loadMany([" first ", "second", "first", " absent "]), {
      first: "one",
      second: "two",
      absent: null,
    });
    // 契约要求同一快照，不要求对重复归一化 key 去重解密调用。
    assert.deepEqual(decryptedInputs, new Set(["snapshot:one", "snapshot:two"]));
  },
);

test(
  "A-STO-05 saveReplacing writes destination and removes distinct normalized replacements",
  { timeout: 7000 },
  async () => {
    await ensureCaseTemp();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const filePath = caseTemp("replacing", "credentials.json");
    resetPersistenceState();
    const cipher = {
      decrypt(value) {
        return value.slice("owned:".length);
      },
      encrypt(value) {
        getPersistenceState().events.push({ type: "cipher:encrypt", value });
        return `owned:${value}`;
      },
    };
    const store = createSharedKnorviaCredentialStore({ filePath, cipher, env: {} });
    await store.saveMany({ old1: "one", old2: "two", keep: "kept" });
    resetPersistenceState();
    const currentState = getPersistenceState();
    await store.saveReplacing(" destination ", "new", [" old1 ", "destination", "old1", " old2 "]);
    assert.deepEqual(await readJson(filePath), { keep: "owned:kept", destination: "owned:new" });
    assert.equal(countEvent("lock:acquired"), 1);
    assert.equal(countEvent("write:committed"), 1);
    assert.equal(currentState.events[0].type, "cipher:encrypt");
    assert.equal(currentState.events[1].type, "lock:waiting");
  },
);
