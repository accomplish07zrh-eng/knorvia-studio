// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { target } from "./subject.mjs";
import { world, info } from "./fixture.mjs";

const loaded = await target();
try {
  const w = world();
  const p = w.put("long-line.txt", "");
  const chunk = Buffer.alloc(64 * 1024, 0x61);
  const chunks = 1024;
  let peak = 0;
  let base;
  w.chunks = (async function* () {
    for (let index = 0; index < chunks; index++) {
      if (index % 128 === 0) {
        globalThis.gc();
        peak = Math.max(peak, process.memoryUsage().heapUsed - base);
      }
      yield chunk;
    }
    globalThis.gc();
    peak = Math.max(peak, process.memoryUsage().heapUsed - base);
  })();
  loaded.use(w);
  globalThis.gc();
  base = process.memoryUsage().heapUsed;
  const result = await loaded.subject.range.readTextFileRangeFromNode(
    { path: p, encoding: "utf8", limitLines: 0 },
    info("file", chunk.length * chunks),
  );
  process.stdout.write(
    JSON.stringify({
      extraHeap: peak,
      content: result.content,
      lineCount: result.lineCount,
      totalLines: result.totalLines,
      bytesRead: result.bytesRead,
      sizeBytes: result.sizeBytes,
      lineEndings: result.lineEndings,
    }),
  );
} finally {
  await loaded.dispose();
}
