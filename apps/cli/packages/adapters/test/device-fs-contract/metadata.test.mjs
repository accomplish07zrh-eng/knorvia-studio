// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { FileSystemPortError } from "@knorvia/contracts";
import { target } from "./subject.mjs";
import { world } from "./fixture.mjs";
import { metadataInputs, observeMetadata } from "./metadata-cases.mjs";

const loaded = await target();
const subject = loaded.use(world());
const frozen = JSON.parse(
  await readFile(new URL("./metadata-observations.json", import.meta.url), "utf8"),
);
after(() => loaded.dispose());
assert.equal(metadataInputs.length, 112);
assert.equal(frozen.records.length, 112);
for (const [index, input] of metadataInputs.entries())
  test(`metadata frozen ${index}: ${input.op}`, () =>
    assert.deepEqual(observeMetadata(subject, input), frozen.records[index]));
test("metadata unsupported cases retain actual public error class and path", () => {
  assert.throws(
    () => subject.metadata.detectTextEncoding(Buffer.from([0]), "controlled.txt"),
    (error) =>
      error instanceof FileSystemPortError &&
      error.code === "unsupported" &&
      error.path === "controlled.txt",
  );
  assert.throws(
    () =>
      subject.metadata.encodeTextContent({
        content: "😀",
        encoding: "gbk",
        path: "controlled.txt",
      }),
    (error) =>
      error instanceof FileSystemPortError &&
      error.code === "unsupported" &&
      error.path === "controlled.txt",
  );
});
