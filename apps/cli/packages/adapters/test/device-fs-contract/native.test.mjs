// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { nativeWorld } from "./native-world.mjs";
const loaded = await target();
after(() => loaded.dispose());
async function temporary(run) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-fs-native-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
for (const [encoding, hex] of [
  ["utf8", "e4bda0e5a5bd0d0a7365636f6e640d0a"],
  ["gb2312", "c4e3bac30d0acec4b1be"],
  ["utf16le", "fffe61000d000a0062000d000a00"],
])
  test(`owned native atomic bytes roundtrip: ${encoding}`, () =>
    temporary(async (directory) => {
      const { fs } = loaded.use(nativeWorld(directory)),
        port = new fs.NodeFileSystemAdapter();
      const path = join(directory, "owned.txt"),
        bytes = Buffer.from(hex, "hex");
      await writeFile(path, bytes);
      const before = await port.readTextFile({ path, encoding });
      await port.writeTextFile({
        path,
        content: before.content,
        encoding,
        lineEndings: before.lineEndings,
        expectedRevision: before.revision,
      });
      assert.deepEqual(await readFile(path), bytes);
      assert.equal(
        (await port.readTextFileRange({ path, encoding, offsetLine: 0, limitLines: 1 })).content,
        before.content.split("\n")[0],
      );
      assert.equal(
        (await port.readBinaryFile({ path, maxBytes: bytes.length })).content.length,
        bytes.length,
      );
    }));
test("owned native identity accepts unknown state fields and caches one Promise", () =>
  temporary(async (directory) => {
    const { identity } = loaded.use(nativeWorld(directory)),
      state = join(directory, ".knorvia-studio/v2/telemetry-state.json");
    await mkdir(join(directory, ".knorvia-studio/v2"), { recursive: true });
    await writeFile(state, '{"unknown":{"values":[1,"keep"]}}');
    let generated = 0;
    const options = {
      baseDir: directory,
      createId: () => {
        generated++;
        return "synthetic-owned-device";
      },
    };
    const first = identity.ensureCliDeviceMid(options);
    assert.equal(identity.ensureCliDeviceMid(options), first);
    assert.equal(await first, "synthetic-owned-device");
    assert.equal(generated, 1);
    assert.deepEqual(JSON.parse(await readFile(state, "utf8")), {
      unknown: { values: [1, "keep"] },
      deviceMid: "synthetic-owned-device",
    });
  }));
test(
  "actual default Worker executes bundled ripgrep on an owned directory",
  { timeout: 15000 },
  () =>
    temporary(async (directory) => {
      const messages = [],
        { fs } = loaded.use(nativeWorld(directory, messages)),
        path = join(directory, "owned.txt");
      await writeFile(path, "before\nhit\nafter\n");
      const value = await new fs.NodeFileSystemAdapter().searchText({
        path: directory,
        pattern: "hit",
        outputMode: "content",
      });
      assert.equal(value.numMatches, 1);
      assert.equal(value.entries[0].path, path);
      assert.equal(value.entries[0].lineNumber, 2);
      assert.equal(value.entries[0].text, "hit");
      assert.equal(messages.length, 1, JSON.stringify(messages));
      assert.equal(messages[0].type, "result", JSON.stringify(messages));
      assert.equal(messages[0].result.code, 0);
    }),
);
