// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { FileSystemPortError } from "@knorvia/contracts";
import { target } from "./subject.mjs";
import { world, info } from "./fixture.mjs";

const loaded = await target();
after(() => loaded.dispose());
const LARGE = 10 * 1024 * 1024 + 1;
test("real Read handler consumes range, byte counts, line numbers and callback metadata", async () => {
  const w = world();
  const bytes = Buffer.from("e4bda0e5a5bd0d0a7365636f6e640d0a74686972640d0a", "hex");
  const path = w.put("consumer.txt", bytes);
  w.metadata.set(path, info("file", LARGE));
  w.chunks = [...bytes].map((byte) => Buffer.from([byte]));
  const { fs, reader } = loaded.use(w);
  const port = new fs.NodeFileSystemAdapter();
  let observed;
  const output = await reader.readTextFileForModel({
    filePath: path,
    fileSystemPort: port,
    offset: 2,
    limit: 1,
    trace: { traceId: "controlled-trace" },
    onRead: (read) => {
      observed = read;
    },
  });
  assert.deepEqual(output, {
    type: "text",
    filePath: path,
    content: "second",
    numLines: 1,
    startLine: 2,
    totalLines: 4,
    sizeBytes: LARGE,
    bytesRead: bytes.length,
    truncated: false,
  });
  assert.equal(reader.formatReadTextOutput(output), "2\tsecond");
  assert.equal(observed.lineEndings, "CRLF");
  assert.equal(observed.revision.id, `mtime:1000:size:${LARGE}`);
});
test("real filesystem facade preserves legacy bytes through read, write and reread", async () => {
  const w = world();
  const bytes = Buffer.from("c4e3bac30d0acec4b1be", "hex");
  const path = w.put("legacy.txt", bytes);
  const { fs } = loaded.use(w);
  const port = new fs.NodeFileSystemAdapter();
  const read = await port.readTextFile({ path });
  assert.equal(read.content, "你好\n文本");
  assert.equal(read.encoding, "gb2312");
  assert.equal(read.lineEndings, "CRLF");
  await port.writeTextFile({
    path,
    content: read.content,
    encoding: read.encoding,
    lineEndings: read.lineEndings,
    atomic: false,
    expectedRevision: read.revision,
  });
  assert.deepEqual(w.files.get(path), bytes);
  assert.deepEqual(await port.readTextFile({ path }), read);
});
test("stream cancellation removes listener and the real facade retains cancelled cause", async () => {
  const w = world();
  const path = w.put("cancel.txt", "a\nb");
  w.metadata.set(path, info("file", LARGE));
  const controller = new AbortController();
  let balance = 0;
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => {
    balance++;
    return add(...args);
  };
  controller.signal.removeEventListener = (...args) => {
    balance--;
    return remove(...args);
  };
  const stream = w.createReadStream;
  w.createReadStream = (...args) => {
    const value = stream(...args);
    queueMicrotask(() => controller.abort());
    return value;
  };
  const { fs } = loaded.use(w);
  await assert.rejects(
    new fs.NodeFileSystemAdapter().readTextFileRange(
      { path, encoding: "utf8" },
      { signal: controller.signal },
    ),
    (error) =>
      error instanceof FileSystemPortError &&
      error.code === "cancelled" &&
      error.path === path &&
      error.cause?.name === "AbortError",
  );
  assert.equal(balance, 0);
});
test("real facade retains unsupported encoding error instead of replacing its cause", async () => {
  const w = world();
  const path = w.put("binary.txt", Buffer.from([0]));
  const { fs } = loaded.use(w);
  await assert.rejects(
    new fs.NodeFileSystemAdapter().readTextFileRange({ path }),
    (error) =>
      error instanceof FileSystemPortError &&
      error.code === "unsupported" &&
      error.path === path &&
      error.cause === undefined,
  );
});
