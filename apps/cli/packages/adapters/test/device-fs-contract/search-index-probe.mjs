// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { target } from "./subject.mjs";
import { world } from "./fixture.mjs";
const loaded = await target();
try {
  const w = world();
  const text = "hit\n".repeat(10000);
  const p = w.put("indexed.txt", text);
  let probes = 0;
  const counted = new Proxy(new String(text), {
    get(_, key) {
      if (key === "charCodeAt" || key === "indexOf")
        return (...args) => {
          probes++;
          return text[key](...args);
        };
      if (key === Symbol.toPrimitive) return () => text;
      const value = text[key];
      return typeof value === "function" ? value.bind(text) : value;
    },
  });
  const read = w.readFile;
  w.readFile = async (...a) => {
    await read(...a);
    return counted;
  };
  const { fs } = loaded.use(w);
  const value = await new fs.NodeFileSystemAdapter({ textSearchEngine: "javascript" }).searchText({
    path: p,
    pattern: "hit",
    multiline: true,
    outputMode: "content",
    headLimit: 0,
  });
  process.stdout.write(
    JSON.stringify({
      probes,
      length: text.length,
      numMatches: value.numMatches,
      entries: value.entries.length,
      first: value.entries[0],
      last: value.entries.at(-1),
    }),
  );
} finally {
  await loaded.dispose();
}
