// Real Read routing with synthetic media ports; transition licence retained.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readToolEntry } from "../src/tool/handlers/read.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

for (const kind of ["image", "video"]) {
  test(`Read dispatch keeps ${kind} media blocks separate from text watermarks`, async () => {
    const inputMime = kind === "image" ? "image/png" : "video/mp4";
    const path = join(tmpdir(), `knorvia-synthetic-media.${kind === "image" ? "PNG" : "mp4"}`);
    let reads = 0;
    let prepares = 0;
    const states = new Map();
    const context = {
      workingDirectory: tmpdir(),
      workspaceRoot: tmpdir(),
      readFileState: states,
      fileSystemPort: {
        stat: async () => assert.fail("media must not use the text stat/cache path"),
        readBinaryFile: async () => {
          reads++;
          return { path, content: new Uint8Array([1, 2, 3]), bytesRead: 3, sizeBytes: 123 };
        },
      },
      imageProcessorPort: {
        prepareForModel: async () => {
          prepares++;
          return {
            data: new Uint8Array([1, 2, 3]),
            mediaType: inputMime,
            originalSizeBytes: 3,
            transformedSizeBytes: 3,
            resized: false,
            compressed: false,
            strategy: "original",
          };
        },
      },
      recordReadFileStateMetadata: () =>
        assert.fail("media does not create a text freshness snapshot"),
    } as unknown as ToolExecutionContext;
    const output = await readToolEntry.handler({ file_path: path }, context);
    assert.deepEqual(readToolEntry.formatModelContent!(output), [
      {
        type: kind,
        mediaType: inputMime,
        dataUrl: `data:${inputMime};base64,AQID`,
        source: {
          id: `read-${kind}`,
          kind: "inline",
          mimeType: inputMime,
          placeholder: `Read ${kind}`,
          sizeBytes: 123,
        },
      },
    ]);
    assert.equal(reads, 1);
    assert.equal(prepares, kind === "image" ? 1 : 0);
    assert.equal(states.size, 0);
  });
}
