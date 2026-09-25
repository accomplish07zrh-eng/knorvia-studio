import assert from "node:assert/strict";
import test from "node:test";
import { v4AttachmentBeginParamsSchema } from "../src/protocol-v4/transport.js";

test("attachment filenames reject NUL and line separators while preserving Unicode", () => {
  const params = {
    connectionId: "c",
    uploadId: "u",
    sessionId: "s",
    mime: "text/plain",
    totalBytes: 0,
    totalChunks: 0,
    checksum: `sha256:${"0".repeat(64)}`,
  };
  for (const fileName of ["报告.txt", "space name.txt"]) {
    assert.equal(
      v4AttachmentBeginParamsSchema.safeParse({ ...params, fileName }).success,
      true,
      fileName,
    );
  }
  for (const fileName of ["", "a\0b.txt", "a\rb.txt", "a\nb.txt"]) {
    assert.equal(v4AttachmentBeginParamsSchema.safeParse({ ...params, fileName }).success, false);
  }
});
