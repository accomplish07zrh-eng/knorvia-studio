// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { after, test } from "node:test";
import {
  binaryRequest,
  derivedPath,
  exactBytes,
  fixture,
  ready,
  textRequest,
  uri,
} from "./artifact-store.fixture.js";

const keys = ["KNORVIA_ENV", "KNORVIA_E2E_FS_FAULTS", "KNORVIA_E2E_FS_FAULTS_ALLOW"] as const;
const saved = keys.map((key) => [key, process.env[key]] as const);
after(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
process.env.KNORVIA_ENV = "test";
delete process.env.KNORVIA_E2E_FS_FAULTS_ALLOW;
process.env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([
  { id: "text-mkdir", code: "EACCES", operations: ["mkdir"], pathIncludes: "/fault-text-mkdir/" },
  {
    id: "text-write",
    code: "ENOSPC",
    operations: ["writeFile"],
    pathIncludes: "/fault-text-write/",
  },
  {
    id: "binary-write",
    code: "ENOSPC",
    operations: ["writeFile"],
    pathIncludes: "/fault-binary-write/",
  },
  { id: "media-mkdir", code: "EACCES", operations: ["mkdir"], pathIncludes: "/fault-media-mkdir/" },
  {
    id: "media-write",
    code: "ENOSPC",
    operations: ["writeFile"],
    pathIncludes: "/fault-media-write/",
  },
  {
    id: "media-rename",
    code: "EACCES",
    operations: ["rename"],
    pathIncludes: "/fault-media-rename/",
  },
]);

for (const [label, operation, code] of [
  ["text-mkdir", "mkdir", "EACCES"],
  ["text-write", "writeFile", "ENOSPC"],
  ["binary-write", "writeFile", "ENOSPC"],
] as const) {
  test(`durable ${label} fault surfaces before publication and a subsequent write can succeed`, async (t) => {
    const { store, options, root } = await fixture(t, `fault-${label}`);
    const call = () =>
      label === "binary-write"
        ? store.writeToolResultBinaryArtifact(binaryRequest())
        : store.writeToolResultArtifact(textRequest());
    await assert.rejects(call(), (error: unknown) => {
      assert.ok(
        error instanceof Error &&
          "knorviaFsFaultId" in error &&
          "code" in error &&
          "syscall" in error &&
          "path" in error,
      );
      assert.equal(error.knorviaFsFaultId, label);
      assert.equal(error.code, code);
      assert.equal(error.syscall, operation);
      assert.ok(String(error.path).startsWith(root));
      return true;
    });
    if (operation === "mkdir") await assert.rejects(access(options.rootDir), { code: "ENOENT" });
    else assert.deepEqual(await readdir(options.rootDir + "/owned-session"), []);
    const recovered = await call();
    assert.ok(recovered.path);
    await access(recovered.path);
  });
}

for (const [label, operation] of [
  ["media-mkdir", "mkdir"],
  ["media-write", "writeFile"],
  ["media-rename", "rename"],
] as const) {
  test(`derived ${label} fault preserves the primary error, removes temporary file and clears flight`, async (t) => {
    const { store, options } = await fixture(t, `fault-${label}`);
    const path = derivedPath(options, uri(), "image", ".png");
    const request = { uri: uri(), mediaType: "image/png", bytes: new Uint8Array([1, 2]) };
    const pending = store.primeMediaAttachmentPath(request);
    assert.equal(store.ensureMediaAttachmentPath(request), pending);
    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof Error && "path" in error && "knorviaFsFaultId" in error);
      assert.equal(error.knorviaFsFaultId, label);
      if (operation === "mkdir") assert.equal(error.path, dirname(path));
      if (operation === "writeFile") assert.ok(String(error.path).startsWith(path + ".tmp-"));
      if (operation === "rename") assert.equal(error.path, path);
      return true;
    });
    await assert.rejects(access(path), { code: "ENOENT" });
    if (operation !== "mkdir") assert.deepEqual(await readdir(dirname(path)), []);
    const retried = store.primeMediaAttachmentPath(request);
    assert.notEqual(retried, pending);
    await exactBytes(ready(await retried), request.bytes);
  });
}
