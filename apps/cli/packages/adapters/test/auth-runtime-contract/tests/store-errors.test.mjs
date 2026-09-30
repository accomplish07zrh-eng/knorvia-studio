// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  failNextBackup,
  getPersistenceState,
  resetPersistenceState,
} from "../harness/seam-controls.mjs";
import {
  authModule,
  caseTemp,
  ensureCaseTemp,
  identityCipher,
  publicFacts,
} from "../harness/test-context.mjs";

async function captureRejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("promise did not reject");
}

test(
  "A-STO-08 every key/value boundary validates exactly before durable change",
  { timeout: 7000 },
  async () => {
    await ensureCaseTemp();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const facts = await publicFacts();
    const filePath = caseTemp("validation", "credentials.json");
    const store = createSharedKnorviaCredentialStore({
      filePath,
      cipher: identityCipher(),
      env: {},
    });
    await store.save("stable", "original");
    const original = await readFile(filePath, "utf8");
    const invalidKeys = [
      () => store.load(" \t "),
      () => store.loadMany(["ok", " "]),
      () => store.save(" ", "value"),
      () => store.saveMany({ " ": "value" }),
      () => store.saveReplacing(" ", "value", []),
      () => store.saveReplacing("key", "value", [" "]),
      () => store.delete(" "),
      () => store.deleteIfValue(" ", "value"),
      () => store.deleteIfValues({ " ": "value" }),
      () => store.deleteManyIfValue(" ", "value", []),
      () => store.deleteManyIfValue("key", "value", [" "]),
    ];
    for (const operation of invalidKeys) {
      resetPersistenceState();
      await assert.rejects(operation(), { message: facts.store.emptyKey });
      assert.equal(await readFile(filePath, "utf8"), original);
      assert.equal(getPersistenceState().events.length, 0);
    }
    const invalidValues = [
      () => store.save("key", ""),
      () => store.saveMany({ key: "" }),
      () => store.saveReplacing("key", "", []),
      () => store.deleteIfValue("key", ""),
      () => store.deleteIfValues({ key: "" }),
      () => store.deleteManyIfValue("key", "", []),
    ];
    for (const operation of invalidValues) {
      resetPersistenceState();
      await assert.rejects(operation(), { message: facts.store.emptyValue });
      assert.equal(await readFile(filePath, "utf8"), original);
      assert.equal(getPersistenceState().events.length, 0);
    }

    await store.save("space-save", " \t ");
    assert.equal(await store.load("space-save"), " \t ");
    assert.equal(await store.deleteIfValue("space-save", " \t "), true);
    await store.saveMany({ "space-many": "   " });
    assert.equal((await store.loadMany(["space-many"]))["space-many"], "   ");
    await store.saveReplacing("space-replace", "  ", []);
    assert.equal((await store.deleteIfValues({ "space-replace": "  " }))["space-replace"], true);
    await store.save("space-guard", " \t");
    assert.equal(await store.deleteManyIfValue("space-guard", " \t", []), true);
  },
);

test(
  "A-STO-09 read failures and corruption preserve evidence and exact causes",
  { timeout: 7000 },
  async () => {
    await ensureCaseTemp();
    const { createSharedKnorviaCredentialStore } = await authModule();
    const missingPath = caseTemp("errors", "missing.json");
    const missingStore = createSharedKnorviaCredentialStore({
      filePath: missingPath,
      cipher: identityCipher(),
      env: {},
    });
    assert.equal(await missingStore.load("key"), null);

    const directoryPath = caseTemp("errors", "is-a-directory");
    await mkdir(directoryPath, { recursive: true });
    const directoryStore = createSharedKnorviaCredentialStore({
      filePath: directoryPath,
      cipher: identityCipher(),
      env: {},
    });
    const readError = await captureRejection(directoryStore.load("key"));
    assert.equal(
      readError.message,
      `Unable to read shared Knorvia Studio credentials: ${directoryPath}`,
    );
    assert.ok(readError.cause instanceof Error);
    assert.notEqual(readError.cause.code, "ENOENT");

    const corruptCases = [
      ["invalid-json", "{not json", (cause) => assert.ok(cause instanceof SyntaxError)],
      [
        "array-root",
        "[]",
        (cause) => assert.equal(cause.message, "Credential record must be an object"),
      ],
      [
        "non-string",
        '{"valid":"owned:x","bad":42}',
        (cause) => assert.equal(cause.message, "Credential record value must be a string: bad"),
      ],
    ];
    for (const [name, content, checkCause] of corruptCases) {
      const filePath = caseTemp("errors", `${name}.json`);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf8");
      resetPersistenceState();
      const store = createSharedKnorviaCredentialStore({
        filePath,
        cipher: identityCipher(),
        env: {},
      });
      const error = await captureRejection(store.load("valid"));
      const backupEvent = getPersistenceState().events.find(
        (event) => event.type === "backup:created",
      );
      assert.ok(backupEvent);
      assert.equal(
        error.message,
        `Shared Knorvia Studio credentials are corrupt: ${filePath}. Backup: ${backupEvent.backup}`,
      );
      checkCause(error.cause);
      assert.equal(await readFile(filePath, "utf8"), content);
      assert.equal(await readFile(backupEvent.backup, "utf8"), content);
      await assert.rejects(store.save("later", "value"), /credentials are corrupt/);
      assert.equal(await readFile(filePath, "utf8"), content);
    }

    const noBackupPath = caseTemp("errors", "backup-fails.json");
    await writeFile(noBackupPath, "null", "utf8");
    resetPersistenceState();
    failNextBackup();
    const noBackupStore = createSharedKnorviaCredentialStore({
      filePath: noBackupPath,
      cipher: identityCipher(),
      env: {},
    });
    const noBackupError = await captureRejection(noBackupStore.load("key"));
    assert.equal(
      noBackupError.message,
      `Shared Knorvia Studio credentials are corrupt: ${noBackupPath}.`,
    );
    assert.equal(noBackupError.cause.message, "Credential record must be an object");
    assert.equal(await readFile(noBackupPath, "utf8"), "null");
  },
);
