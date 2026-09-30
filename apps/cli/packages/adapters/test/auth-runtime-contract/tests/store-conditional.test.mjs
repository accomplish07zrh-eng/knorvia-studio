// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { getPersistenceState, resetPersistenceState } from "../harness/seam-controls.mjs";
import {
  authModule,
  caseTemp,
  ensureCaseTemp,
  identityCipher,
  readJson,
} from "../harness/test-context.mjs";

function commits() {
  return getPersistenceState().events.filter((event) => event.type === "write:committed").length;
}

test(
  "A-STO-06 conditional deletes compare plaintext exactly and batch once",
  { timeout: 7000 },
  async () => {
    await ensureCaseTemp();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const filePath = caseTemp("conditional", "credentials.json");
    const store = createSharedKnorviaCredentialStore({
      filePath,
      cipher: identityCipher(),
      env: {},
    });
    await store.saveMany({ alpha: "A", beta: "B", gamma: "G" });
    let notifications = 0;
    store.onDidChange?.(() => {
      notifications += 1;
    });

    resetPersistenceState();
    assert.equal(await store.deleteIfValue(" alpha ", "wrong"), false);
    assert.deepEqual(await readJson(filePath), {
      alpha: "owned:A",
      beta: "owned:B",
      gamma: "owned:G",
    });
    assert.equal(commits(), 1);
    assert.equal(notifications, 1);

    resetPersistenceState();
    assert.equal(await store.deleteIfValue("alpha", "A"), true);
    assert.deepEqual(await readJson(filePath), { beta: "owned:B", gamma: "owned:G" });
    assert.equal(commits(), 1);
    assert.equal(notifications, 2);

    resetPersistenceState();
    assert.deepEqual(
      await store.deleteIfValues({ " beta ": "B", gamma: "wrong", missing: "none" }),
      { beta: true, gamma: false, missing: false },
    );
    assert.deepEqual(await readJson(filePath), { gamma: "owned:G" });
    assert.equal(commits(), 1);
    assert.equal(notifications, 3);

    resetPersistenceState();
    assert.deepEqual(await store.deleteIfValues({}), {});
    assert.equal(getPersistenceState().events.length, 0);
    assert.equal(notifications, 3);
  },
);

test(
  "A-STO-07 guarded multi-delete is one all-or-none transaction",
  { timeout: 7000 },
  async () => {
    await ensureCaseTemp();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const filePath = caseTemp("guarded", "credentials.json");
    const store = createSharedKnorviaCredentialStore({
      filePath,
      cipher: identityCipher(),
      env: {},
    });
    await store.saveMany({ guard: "generation-2", mirrorA: "a", mirrorB: "b", keep: "k" });
    let notifications = 0;
    store.onDidChange?.(() => {
      notifications += 1;
    });

    resetPersistenceState();
    assert.equal(
      await store.deleteManyIfValue(" guard ", "generation-1", ["mirrorA", "mirrorB"]),
      false,
    );
    assert.deepEqual(await readJson(filePath), {
      guard: "owned:generation-2",
      mirrorA: "owned:a",
      mirrorB: "owned:b",
      keep: "owned:k",
    });
    assert.equal(commits(), 1);
    assert.equal(notifications, 1);

    resetPersistenceState();
    assert.equal(
      await store.deleteManyIfValue("guard", "generation-2", [
        " mirrorA ",
        "mirrorB",
        "guard",
        "mirrorA",
      ]),
      true,
    );
    assert.deepEqual(await readJson(filePath), { keep: "owned:k" });
    assert.equal(commits(), 1);
    assert.equal(notifications, 2);

    await store.save("guard", "generation-3");
    resetPersistenceState();
    assert.equal(await store.deleteManyIfValue("guard", "generation-3", []), true);
    assert.deepEqual(await readJson(filePath), { keep: "owned:k", guard: "owned:generation-3" });
    assert.equal(commits(), 1);
    assert.equal(notifications, 4);
  },
);
