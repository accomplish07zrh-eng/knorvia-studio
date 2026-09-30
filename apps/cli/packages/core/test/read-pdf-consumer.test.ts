// Real Read PDF routing against synthetic ports; transition licence retained.
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readToolEntry } from "../src/tool/handlers/read.js";
import type { ToolExecutionContext } from "../src/tool/types.js";

for (const pages of [undefined, "1"] as const) {
  test(`Read PDF ${pages === undefined ? "native" : "pages"} route bypasses text snapshots`, async () => {
    const path = join(tmpdir(), "knorvia-synthetic.PDF");
    const calls: string[] = [];
    const states = new Map();
    const context = {
      workingDirectory: tmpdir(),
      workspaceRoot: tmpdir(),
      readFileState: states,
      abortSignal: new AbortController().signal,
      model: { properties: { inputFormat: { supportsPdf: true, supportsImage: true } } },
      fileSystemPort: {
        stat: async () => {
          calls.push("stat");
          return { kind: "file", sizeBytes: 8 };
        },
        readBinaryFile: async () => {
          calls.push("read");
          return { path, content: Buffer.from("%PDF-fixture"), bytesRead: 12, sizeBytes: 12 };
        },
      },
      pdfDocumentPort: {
        getPageCount: async () => {
          calls.push("count");
          return 1;
        },
        renderPages: async () => {
          calls.push("render");
          return [{ pageNumber: 1, data: new Uint8Array([1]), mediaType: "image/jpeg" }];
        },
      },
      imageProcessorPort: {
        prepareForModel: async () => {
          calls.push("prepare");
          return {
            data: new Uint8Array([2]),
            mediaType: "image/jpeg",
            originalSizeBytes: 1,
            transformedSizeBytes: 1,
            resized: false,
            compressed: false,
            strategy: "original",
          };
        },
      },
      recordReadFileStateMetadata: () => assert.fail("PDF cannot write text freshness snapshots"),
    } as unknown as ToolExecutionContext;
    const output = await readToolEntry.handler({ file_path: path, pages }, context);
    const content = readToolEntry.formatModelContent!(output) as any[];
    assert.equal(content[0].type, "text");
    assert.equal(content[1].type, pages === undefined ? "file" : "image");
    assert.equal(content[1].source.id, pages === undefined ? "read-pdf" : "read-pdf-page-1");
    assert.deepEqual(
      calls,
      pages === undefined ? ["stat", "count", "read"] : ["stat", "render", "prepare"],
    );
    assert.equal(states.size, 0);
  });
}
