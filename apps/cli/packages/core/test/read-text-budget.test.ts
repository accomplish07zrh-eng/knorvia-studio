// Synthetic compatibility fixtures; the repository's transition licence applies.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  READ_DEFAULT_MAX_LINES,
  READ_MAX_FILE_SIZE_BYTES,
  READ_MAX_OUTPUT_TOKENS,
  type CoreError,
  type FileSystemPort,
  type FileSystemReadTextRangeResult,
  type ReadTextOutput,
  type TraceContext,
} from "@knorvia/contracts";
import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@knorvia/shared";
import { estimateTokens } from "../src/context/utils.js";
import {
  addReadLineNumbers,
  formatReadTextOutput,
  readTextFileForModel,
} from "../src/tool/handlers/read-text.js";

const path = "/synthetic/document.txt";
const maximumUnits = READ_MAX_OUTPUT_TOKENS * ESTIMATED_TOKEN_CHAR_DIVISOR;
const partialUnits = Math.floor(READ_MAX_OUTPUT_TOKENS * 0.85) * ESTIMATED_TOKEN_CHAR_DIVISOR;
type Options = Parameters<typeof readTextFileForModel>[0];
function fixture(content = "one\ntwo", changes: Partial<FileSystemReadTextRangeResult> = {}) {
  const read: FileSystemReadTextRangeResult = {
    path,
    content,
    encoding: "utf8",
    bytesRead: Buffer.byteLength(content),
    sizeBytes: Buffer.byteLength(content),
    truncated: false,
    startLine: 1,
    lineCount: content.split("\n").length,
    totalLines: content.split("\n").length,
    ...changes,
  };
  const calls: unknown[][] = [];
  const fileSystemPort = {
    readTextFileRange: async (...args: unknown[]) => {
      calls.push(args);
      return read;
    },
  } as unknown as FileSystemPort;
  const run = (options: Partial<Options> = {}) =>
    readTextFileForModel({ filePath: path, fileSystemPort, ...options });
  return { read, calls, run, fileSystemPort };
}
function normal(read: FileSystemReadTextRangeResult, startLine = read.startLine): ReadTextOutput {
  return {
    type: "text",
    filePath: path,
    content: read.content,
    numLines: read.lineCount,
    startLine,
    totalLines: read.totalLines,
    sizeBytes: read.sizeBytes,
    bytesRead: read.bytesRead,
    truncated: read.truncated,
  };
}
const warning = (body: string) => `<system-reminder>${body}</system-reminder>`;

for (const offset of [undefined, -1, 0, 1, 2, 20]) {
  for (const limit of [undefined, 0, 3]) {
    test(`range request preserves offset ${offset} and limit ${limit}`, async () => {
      const f = fixture();
      const controller = new AbortController();
      const trace = { traceId: "fixture" } as unknown as TraceContext;
      let observed: unknown;
      const output = await f.run({
        offset,
        limit,
        trace,
        abortSignal: controller.signal,
        onRead: (value) => {
          observed = value;
        },
      });
      assert.equal(observed, f.read);
      assert.deepEqual(f.calls, [
        [
          {
            path,
            offsetLine: offset === undefined || offset <= 1 ? 0 : offset - 1,
            limitLines: limit,
            maxBytes: limit === undefined ? READ_MAX_FILE_SIZE_BYTES : undefined,
            trace,
          },
          { signal: controller.signal },
        ],
      ]);
      assert.deepEqual(output, normal(f.read, offset === 0 ? 0 : f.read.startLine));
    });
  }
}

test("empty normalization is limited to the original one-based empty-file shape", async () => {
  const f = fixture("", { lineCount: 0, totalLines: 0 });
  assert.deepEqual(await f.run(), { ...normal(f.read), numLines: 1, totalLines: 1 });
  assert.deepEqual(await f.run({ offset: 0 }), normal(f.read, 0));
  const beyond = fixture("", { lineCount: 0, totalLines: 3, startLine: 8 });
  assert.deepEqual(await beyond.run({ offset: 8 }), normal(beyond.read));
});

test("IO failures and observer failures retain identity and callback order", async () => {
  const failure = new Error("fixture IO failure");
  let observed = false;
  await assert.rejects(
    fixture().run({
      fileSystemPort: {
        readTextFileRange: async () => {
          throw failure;
        },
      } as unknown as FileSystemPort,
      onRead: () => {
        observed = true;
      },
    }),
    (error) => error === failure,
  );
  assert.equal(observed, false);
  const f = fixture("x".repeat(maximumUnits + 1));
  await assert.rejects(
    f.run({
      allowPartialFallback: false,
      onRead: () => {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  assert.equal(f.calls.length, 1);
});

test("already aborted signals are forwarded without inventing a second cancellation policy", async () => {
  const controller = new AbortController();
  controller.abort("fixture cancellation");
  const f = fixture();
  await f.run({ abortSignal: controller.signal });
  assert.equal((f.calls[0]![1] as { signal: AbortSignal }).signal, controller.signal);
});

test("the exact token ceiling is accepted without partial flags", async () => {
  for (const content of ["x".repeat(maximumUnits), "中".repeat(maximumUnits / 2)]) {
    const f = fixture(content);
    assert.deepEqual(await f.run({ allowPartialFallback: false }), normal(f.read));
  }
});

for (const options of [{ allowPartialFallback: false }, { offset: 2 }, { limit: 1 }]) {
  test(`over-budget range rejects with the complete recoverable error ${JSON.stringify(options)}`, async () => {
    const tokenCount = READ_MAX_OUTPUT_TOKENS + 1;
    const f = fixture("x".repeat(maximumUnits + 1));
    let callback = false;
    await assert.rejects(
      f.run({
        ...options,
        onRead: () => {
          callback = true;
        },
      }),
      (error) => {
        const e = error as CoreError;
        assert.equal(e.type, CoreErrorType.ToolExecutionFailed);
        assert.equal(e.recoverable, true);
        assert.deepEqual(e.context, {
          code: "read_output_too_many_tokens",
          filePath: path,
          maxTokens: READ_MAX_OUTPUT_TOKENS,
          tokenCount,
        });
        assert.equal(
          e.message,
          `File content (${tokenCount} tokens) exceeds maximum allowed tokens (${READ_MAX_OUTPUT_TOKENS}). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.`,
        );
        return true;
      },
    );
    assert.equal(callback, true);
  });
}

test("long first line uses the largest original UTF-16 prefix and preserves byte facts", async () => {
  const content = "x".repeat(maximumUnits + 1);
  const f = fixture(content, { bytesRead: 123, sizeBytes: 456, startLine: 9, totalLines: 11 });
  const output = await f.run({ offset: 9, limit: 1, allowPartialFallback: true });
  assert.deepEqual(output, {
    type: "text",
    filePath: path,
    content: content.slice(0, partialUnits),
    numLines: 1,
    startLine: 9,
    totalLines: 11,
    sizeBytes: 456,
    bytesRead: 123,
    truncated: true,
    truncatedByTokenCap: true,
    partialViewNotice: `The file is too large to display in full (${READ_MAX_OUTPUT_TOKENS + 1} estimated tokens, limit ${READ_MAX_OUTPUT_TOKENS}). Showing a partial view of the first line because the first line alone exceeds the token budget. Use Read with a smaller range or use a search tool to find a specific section.`,
  });
});

test("complete-line fallback normalizes CRLF and computes the next offset", async () => {
  const content = ["a".repeat(30000), "中".repeat(10000), "b".repeat(30000)].join("\r\n");
  const f = fixture(content, { startLine: 7, totalLines: 99 });
  const output = await f.run({ allowPartialFallback: true });
  assert.equal(output.content, "a".repeat(30000) + "\n" + "中".repeat(10000));
  assert.equal(output.numLines, 2);
  assert.equal(output.startLine, 7);
  assert.equal(
    output.partialViewNotice,
    `The file is too large to display in full (${Math.ceil(80004 / ESTIMATED_TOKEN_CHAR_DIVISOR)} estimated tokens, limit ${READ_MAX_OUTPUT_TOKENS}). Showing a partial view of lines 7-8 of 99. Use Read with offset 9 and limit ${READ_DEFAULT_MAX_LINES} to continue, or use a search tool to find a specific section.`,
  );
});

test("blank complete lines outrank first-line truncation", async () => {
  const f = fixture("\n" + "x".repeat(maximumUnits + 1));
  const output = await f.run();
  assert.equal(output.content, "");
  assert.equal(output.numLines, 1);
  assert.match(output.partialViewNotice!, /Showing a partial view of lines 1-1/);
});

test("line-number and warning formatting preserve exact model text", () => {
  assert.equal(addReadLineNumbers({ content: "a\r\nb\n", startLine: 0 }), "0\ta\n1\tb\n2\t");
  const empty = {
    type: "text",
    filePath: path,
    content: "",
    numLines: 0,
    startLine: 1,
    totalLines: 0,
  } as const;
  assert.equal(
    formatReadTextOutput(empty),
    warning("Warning: the file exists but the contents are empty."),
  );
  assert.equal(
    formatReadTextOutput({ ...empty, totalLines: 3, startLine: 8, partialViewNotice: "partial" }),
    warning("partial") +
      "\n\n" +
      warning(
        "Warning: the file exists but is shorter than the provided offset (8). The file has 3 lines.",
      ),
  );
  assert.equal(
    formatReadTextOutput({
      ...empty,
      content: "x\r\ny",
      partialViewNotice: "partial",
      startLine: 3,
    }),
    warning("partial") + "\n\n3\tx\n4\ty",
  );
});

for (const [content, units] of [
  ["", 0],
  ["abc", 3],
  ["中", 2],
  ["😀", 2],
  ["a中😀", 5],
  ["\u4dff\u4e00\u9fff\ua000", 6],
  ["\ud800", 1],
] as const) {
  test(`token estimator preserves UTF-16 and CJK boundaries for ${JSON.stringify(content)}`, () => {
    assert.equal(estimateTokens(content), Math.ceil(units / ESTIMATED_TOKEN_CHAR_DIVISOR));
  });
}

test("line labels add each index to the base rather than accumulating rounded increments", () => {
  const base = 2 ** 53;
  assert.equal(
    addReadLineNumbers({ content: "a\nb\nc", startLine: base }),
    `${base}\ta\n${base + 1}\tb\n${base + 2}\tc`,
  );
});
