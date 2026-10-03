import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { stampMemoryOriginSessionId as sourceStamp } from "../src/memory/origin-session.js";
import { stampMemoryOriginSessionId as emittedStamp } from "../dist/memory/origin-session.js";
const rows = JSON.parse(
  readFileSync(new URL("./fixtures/memory-origin-contract.json", import.meta.url), "utf8"),
);
assert.notEqual(sourceStamp, emittedStamp);
for (const [mode, stampMemoryOriginSessionId] of [
  ["source", sourceStamp],
  ["emitted", emittedStamp],
] as const)
  for (const row of rows)
    test(`${mode} memory origin frozen ${row.label}`, () => {
      const root = join(tmpdir(), "knorvia-origin-synthetic");
      const input = {
        content: row.content,
        filePath:
          row.scope === "outside"
            ? join(tmpdir(), "outside.md")
            : row.scope === "root"
              ? root
              : join(root, row.scope === "uppercase" ? "entry.MD" : "entry.md"),
        memoryRoot: row.scope === "disabled" ? undefined : root,
        sessionId: row.sessionId,
      };
      assert.equal(stampMemoryOriginSessionId(input), row.after ?? row.before);
    });
