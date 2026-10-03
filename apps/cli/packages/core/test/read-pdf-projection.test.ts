// Synthetic PDF port contracts; repository transition licence retained.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CoreErrorType,
  PdfDocumentPortError,
  ReadErrorCode,
  READ_PDF_NATIVE_MAX_INPUT_BYTES,
  READ_PDF_EXTRACT_MAX_INPUT_BYTES,
  READ_IMAGE_MAX_BASE64_BYTES,
  READ_IMAGE_MAX_DIMENSION,
  READ_IMAGE_TARGET_BYTES,
  READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO,
  READ_MAX_OUTPUT_TOKENS,
  ReadInputJsonSchema,
  ReadPdfInputJsonSchema,
  type CoreError,
  type PdfDocumentErrorCode,
} from "@knorvia/contracts";
import * as pdf from "../src/tool/handlers/read-pdf.js";
import type { ToolExecutionContext, ToolExecutionModelContext } from "../src/tool/types.js";

const path = "/synthetic/a.pdf";
const trace = {
  traceId: "trace",
  spanId: "span",
  parentSpanId: "parent",
  sessionId: "session",
  turnId: "turn",
};
function fixture() {
  const calls: { kind: string; args: any[] }[] = [];
  const controller = new AbortController();
  const raw = new Uint8Array([0, ...Buffer.from("%PDF-x"), 255]).subarray(1, 7);
  const cooked = new Uint8Array([9, 1, 2, 3, 8]).subarray(1, 4);
  const stat = { kind: "file", sizeBytes: 123 };
  const read = { content: raw, sizeBytes: 97, bytesRead: raw.length };
  const pages = [
    { pageNumber: 2, data: new Uint8Array([2, 3]), mediaType: "image/jpeg" },
    { pageNumber: 1, data: new Uint8Array([4]), mediaType: "image/jpeg" },
  ];
  const prepared = {
    data: cooked,
    mediaType: "image/webp",
    transformedSizeBytes: 3,
    resized: true,
    compressed: false,
    strategy: "preserve-format",
    originalWidth: 40,
    originalHeight: 50,
    width: 20,
    height: 25,
  };
  const context = {
    ...trace,
    abortSignal: controller.signal,
    model: { properties: { inputFormat: { supportsPdf: true, supportsImage: true } } },
    fileSystemPort: {
      stat: async (...args: any[]) => {
        calls.push({ kind: "stat", args });
        return stat;
      },
      readBinaryFile: async (...args: any[]) => {
        calls.push({ kind: "read", args });
        return read;
      },
    },
    pdfDocumentPort: {
      getPageCount: async (...args: any[]) => {
        calls.push({ kind: "count", args });
        return 2;
      },
      renderPages: async (...args: any[]) => {
        calls.push({ kind: "render", args });
        return pages;
      },
    },
    imageProcessorPort: {
      prepareForModel: async (...args: any[]) => {
        calls.push({ kind: "prepare", args });
        return prepared;
      },
    },
  } as unknown as ToolExecutionContext;
  return { calls, controller, raw, cooked, stat, read, pages, prepared, context };
}
const run = (f: ReturnType<typeof fixture>, pages?: string) =>
  pdf.readPdfFile({ filePath: path, pages }, f.context);
const errorCode = (output: any) => output.errorCode;

test("PDF image capability gate precedes filesystem configuration and stat", async () => {
  const f = fixture();
  (f.context.model as any).properties.inputFormat.supportsImage = false;
  f.context.fileSystemPort = undefined;
  assert.equal(errorCode(await run(f, "")), ReadErrorCode.PDF_PAGES_IMAGES_UNSUPPORTED);
  assert.deepEqual(f.calls, []);
  assert.equal(errorCode(await run(f)), ReadErrorCode.PDF_CONFIGURATION_ERROR);
});
for (const [kind, size, expected] of [
  ["directory", 0, ReadErrorCode.PDF_INVALID],
  ["file", 0, ReadErrorCode.PDF_INVALID],
] as const) {
  test(`PDF stat admission ${kind}/${size} stops before content ports`, async () => {
    const f = fixture();
    f.stat.kind = kind;
    f.stat.sizeBytes = size;
    assert.equal(errorCode(await run(f)), expected);
    assert.deepEqual(
      f.calls.map((c) => c.kind),
      ["stat"],
    );
  });
}
test("native PDF preserves exact requests, one trace, subview and adapter size", async () => {
  const f = fixture();
  assert.deepEqual(await run(f), {
    type: "pdf",
    filePath: path,
    base64: Buffer.from(f.raw).toString("base64"),
    originalSize: 97,
  });
  assert.deepEqual(f.calls, [
    { kind: "stat", args: [{ path, trace }, { signal: f.controller.signal }] },
    { kind: "count", args: [{ filePath: path, trace }, { signal: f.controller.signal }] },
    {
      kind: "read",
      args: [
        { path, maxBytes: READ_PDF_NATIVE_MAX_INPUT_BYTES, trace },
        { signal: f.controller.signal },
      ],
    },
  ]);
  assert.equal(f.calls[0]!.args[0].trace, f.calls[2]!.args[0].trace);
});
test("native PDF count port is optional and exactly-at-limit input remains admitted", async () => {
  const f = fixture();
  f.context.pdfDocumentPort = undefined;
  f.stat.sizeBytes = READ_PDF_NATIVE_MAX_INPUT_BYTES;
  assert.equal(((await run(f)) as any).type, "pdf");
  assert.deepEqual(
    f.calls.map((c) => c.kind),
    ["stat", "read"],
  );
});
for (const count of [10, 11, undefined, -1, NaN, Infinity]) {
  test(`native PDF page count boundary ${count}`, async () => {
    const f = fixture();
    f.context.pdfDocumentPort!.getPageCount = async () => count;
    const out = await run(f);
    assert.equal(
      count !== undefined && count > 10 ? errorCode(out) : (out as any).type,
      count !== undefined && count > 10 ? ReadErrorCode.PDF_TOO_MANY_PAGES : "pdf",
    );
  });
}
test("native size failure precedes count and read", async () => {
  const f = fixture();
  f.stat.sizeBytes = READ_PDF_NATIVE_MAX_INPUT_BYTES + 1;
  assert.equal(errorCode(await run(f)), ReadErrorCode.PDF_TOO_LARGE);
  assert.deepEqual(
    f.calls.map((c) => c.kind),
    ["stat"],
  );
});
for (const bytes of [
  new Uint8Array(),
  Buffer.from("%PDF"),
  Buffer.from("x%PDF-"),
  new Uint8Array([0xa5, 0xd0, 0xc4, 0xc6, 0xad]),
]) {
  test(`native magic retains ASCII header behavior ${Buffer.from(bytes).toString("hex")}`, async () => {
    const f = fixture();
    f.read.content = bytes;
    const accepted =
      bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
    assert.equal(
      accepted ? ((await run(f)) as any).type : errorCode(await run(f)),
      accepted ? "pdf" : ReadErrorCode.PDF_INVALID,
    );
  });
}
test("native content read selects the current filesystem after count resolves", async () => {
  const f = fixture();
  const old = f.context.fileSystemPort!;
  f.context.pdfDocumentPort!.getPageCount = async () => {
    f.context.fileSystemPort = {
      ...old,
      readBinaryFile: async (...args: any[]) => {
        f.calls.push({ kind: "replacement", args });
        return f.read as any;
      },
    };
    return 1;
  };
  await run(f);
  assert.deepEqual(
    f.calls.map((c) => c.kind),
    ["stat", "replacement"],
  );
});
for (const value of ["", "0", "2-1", "1-", "1-21", "1,2", "1.5"]) {
  test(`page range ${JSON.stringify(value)} fails before rendering`, async () => {
    const f = fixture();
    assert.equal(errorCode(await run(f, value)), ReadErrorCode.PDF_INVALID);
    assert.deepEqual(
      f.calls.map((c) => c.kind),
      ["stat"],
    );
  });
}
test("page input limit precedes malformed range and missing ports", async () => {
  const f = fixture();
  f.stat.sizeBytes = READ_PDF_EXTRACT_MAX_INPUT_BYTES + 1;
  f.context.pdfDocumentPort = undefined;
  f.context.imageProcessorPort = undefined;
  assert.equal(errorCode(await run(f, "invalid")), ReadErrorCode.PDF_TOO_LARGE);
});
test("page port admission selects PDF configuration before image configuration", async () => {
  const f = fixture();
  const port = f.context.pdfDocumentPort;
  f.context.pdfDocumentPort = undefined;
  f.context.imageProcessorPort = undefined;
  assert.match(((await run(f, "1")) as any).message, /PDF page extraction is not configured/);
  f.context.pdfDocumentPort = port;
  assert.match(((await run(f, "1")) as any).message, /ImageProcessorPort is not configured/);
});
test("page projection starts preparations in adapter order and returns sorted complete facts", async () => {
  const f = fixture();
  f.stat.sizeBytes = READ_PDF_EXTRACT_MAX_INPUT_BYTES;
  const out = (await run(f, " 1-20 ")) as any;
  assert.deepEqual(
    f.calls.map((c) => c.kind),
    ["stat", "render", "prepare", "prepare"],
  );
  assert.deepEqual(f.calls[1]!.args, [
    { filePath: path, firstPage: 1, lastPage: 20, trace },
    { signal: f.controller.signal },
  ]);
  const requests = f.calls.filter((c) => c.kind === "prepare");
  for (let i = 0; i < requests.length; i++) {
    assert.deepEqual(requests[i]!.args, [
      {
        data: f.pages[i]!.data,
        mediaType: "image/jpeg",
        trace,
        maxBase64Bytes: READ_IMAGE_MAX_BASE64_BYTES,
        maxDimension: READ_IMAGE_MAX_DIMENSION,
        maxRawBytes: READ_IMAGE_TARGET_BYTES,
        maxTokens: READ_MAX_OUTPUT_TOKENS,
        tokenToBase64CharRatio: READ_IMAGE_TOKEN_TO_BASE64_CHAR_RATIO,
      },
      { signal: f.controller.signal },
    ]);
    assert.equal(requests[i]!.args[0].trace, f.calls[0]!.args[0].trace);
  }
  assert.deepEqual(out, {
    type: "parts",
    filePath: path,
    numParts: 2,
    originalSize: READ_PDF_EXTRACT_MAX_INPUT_BYTES,
    pages: [f.pages[1], f.pages[0]].map((page) => ({
      type: "image",
      pageNumber: page!.pageNumber,
      base64: "AQID",
      mimeType: "image/webp",
      originalSize: page!.data.byteLength,
      transformedSize: 3,
      resized: true,
      compressed: false,
      compressionStrategy: "preserve-format",
      dimensions: { originalWidth: 40, originalHeight: 50, displayWidth: 20, displayHeight: 25 },
    })),
  });
});
for (const mime of [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "IMAGE/PNG",
  "",
]) {
  test(`page prepared MIME projection ${mime}`, async () => {
    const f = fixture();
    f.prepared.mediaType = mime;
    const out = (await run(f, "1")) as any;
    assert.equal(
      out.pages[0].mimeType,
      ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime) ? mime : "image/jpeg",
    );
  });
}
test("parallel page promises complete out of order without changing stable page ordering", async () => {
  const f = fixture();
  f.pages[1]!.pageNumber = 2;
  const gates = [Promise.withResolvers<any>(), Promise.withResolvers<any>()];
  let calls = 0;
  f.context.imageProcessorPort!.prepareForModel = () => gates[calls++]!.promise;
  const pending = run(f, "1-2");
  // 有界冲刷异步接纳；顺序化回归必须失败，不能让微任务死循环饿死测试超时。
  for (let turn = 0; turn < 32 && calls < 2; turn++) await Promise.resolve();
  assert.equal(calls, 2, "both page preparations must start before either gate resolves");
  gates[1]!.resolve({ ...f.prepared, data: new Uint8Array([22]) });
  gates[0]!.resolve({ ...f.prepared, data: new Uint8Array([11]) });
  const out = (await pending) as any;
  assert.deepEqual(
    out.pages.map((p: any) => p.base64),
    ["Cw==", "Fg=="],
  );
});
const mappings: Record<Exclude<PdfDocumentErrorCode, "cancelled">, number> = {
  corrupted: ReadErrorCode.PDF_INVALID,
  io_error: ReadErrorCode.PDF_IO_ERROR,
  page_out_of_range: ReadErrorCode.PDF_PAGE_OUT_OF_RANGE,
  password_protected: ReadErrorCode.PDF_PASSWORD_PROTECTED,
  permission_denied: ReadErrorCode.PDF_PERMISSION_DENIED,
  process_failed: ReadErrorCode.PDF_PROCESS_FAILED,
  timeout: ReadErrorCode.PDF_TIMEOUT,
  unavailable: ReadErrorCode.PDF_CONFIGURATION_ERROR,
};
for (const [code, expected] of Object.entries(mappings)) {
  test(`PDF port ${code} maps only within pages execution, not native count`, async () => {
    const f = fixture();
    const failure = new PdfDocumentPortError(code as PdfDocumentErrorCode, "fixture failure");
    f.context.pdfDocumentPort!.getPageCount = async () => {
      throw failure;
    };
    f.context.pdfDocumentPort!.renderPages = async () => {
      throw failure;
    };
    await assert.rejects(run(f), (e) => e === failure);
    assert.deepEqual(await run(f, "1"), {
      result: false,
      errorCode: expected,
      message: "fixture failure",
    });
    f.controller.abort();
    await assert.rejects(run(f, "1"), (e) => e === failure);
  });
}
for (const phase of ["count", "render", "prepare"] as const) {
  test(`PDF cancellation at ${phase} retains cause and ToolCancelled without an aborted signal`, async () => {
    const f = fixture();
    const failure = new PdfDocumentPortError("cancelled", "stopped");
    const reject = async () => {
      throw failure;
    };
    if (phase === "count") f.context.pdfDocumentPort!.getPageCount = reject;
    if (phase === "render") f.context.pdfDocumentPort!.renderPages = reject;
    if (phase === "prepare") f.context.imageProcessorPort!.prepareForModel = reject;
    await assert.rejects(run(f, phase === "count" ? undefined : "1"), (e) => {
      assert.equal((e as CoreError).type, CoreErrorType.ToolCancelled);
      assert.equal((e as Error).cause, failure);
      return true;
    });
  });
}
test("ordinary non-Error failures retain identity through every execution boundary", async () => {
  for (const phase of ["stat", "count", "read", "render", "prepare"]) {
    const f = fixture();
    const failure = { fixture: phase };
    const reject = async () => {
      throw failure;
    };
    if (phase === "stat") f.context.fileSystemPort!.stat = reject;
    if (phase === "count") f.context.pdfDocumentPort!.getPageCount = reject;
    if (phase === "read") f.context.fileSystemPort!.readBinaryFile = reject;
    if (phase === "render") f.context.pdfDocumentPort!.renderPages = reject;
    if (phase === "prepare") f.context.imageProcessorPort!.prepareForModel = reject;
    await assert.rejects(
      run(f, ["render", "prepare"].includes(phase) ? "1" : undefined),
      (e) => e === failure,
    );
  }
});
test("PDF schema, description, timeout and sizes keep public boundaries", () => {
  for (const capability of [true, false, undefined, 1, "true"]) {
    const context = {
      model: { properties: { inputFormat: { supportsPdf: capability } } },
    } as unknown as ToolExecutionModelContext;
    assert.equal(
      pdf.resolveReadInputSchema(context),
      capability === true ? ReadPdfInputJsonSchema : ReadInputJsonSchema,
    );
    assert.equal(
      pdf.resolveReadTimeoutBudgetMs({ file_path: "a.PDF", pages: "" }, context),
      capability === true ? 150000 : undefined,
    );
    assert.equal(
      pdf.resolveReadTimeoutBudgetMs({ file_path: "a.pdf", pages: 1 }, context),
      undefined,
    );
    const description = pdf.resolveReadProviderDescription(
      "first\n- Reads images fixture\nlast",
      context,
    );
    assert.equal(description.includes("- Reads PDFs"), capability === true);
    if (capability === true) assert.match(description, /images fixture\n- Reads PDFs[^\n]+\nlast/);
  }
  for (const input of [null, [], 1, "a"])
    assert.equal(pdf.resolveReadTimeoutBudgetMs(input), undefined);
  assert.equal(pdf.isPdfPath("a.PDF"), true);
  assert.equal(pdf.isPdfPath("a.pdf?x"), false);
  for (const [n, result] of [
    [0, "0 bytes"],
    [1023, "1023 bytes"],
    [1024, "1KB"],
    [1536, "1.5KB"],
    [1048576, "1MB"],
    [1073741824, "1GB"],
    [NaN, "NaNGB"],
    [Infinity, "InfinityGB"],
  ] as const)
    assert.equal(pdf.formatFileSize(n), result);
});

test("PDF model projection retains text, media identities, sizes and order", () => {
  const native = { type: "pdf" as const, filePath: path, base64: "AA==", originalSize: 1536 };
  const content = pdf.formatReadPdfOutput(native) as any[];
  assert.equal(content[0].text, `PDF file read: ${path} (1.5KB)`);
  assert.deepEqual(content[1], {
    type: "file",
    mediaType: "application/pdf",
    name: "a.pdf",
    dataUrl: "data:application/pdf;base64,AA==",
    source: {
      id: "read-pdf",
      kind: "inline",
      mimeType: "application/pdf",
      placeholder: "a.pdf",
      sizeBytes: 1536,
    },
  });
  const contentPages = pdf.formatReadPdfPagesOutput({
    type: "parts",
    filePath: path,
    originalSize: 1024,
    numParts: 2,
    pages: [0, undefined].map((transformedSize, i) => ({
      type: "image",
      pageNumber: i + 1,
      base64: "AQ==",
      mimeType: "image/jpeg",
      originalSize: 9,
      transformedSize,
      resized: false,
      compressed: false,
      compressionStrategy: "original",
      dimensions: {},
    })),
  }) as any[];
  assert.equal(contentPages[0].text, `PDF pages extracted: 2 page(s) from ${path} (1KB)`);
  assert.deepEqual(
    contentPages.slice(1).map((p) => [p.source.id, p.source.sizeBytes]),
    [
      ["read-pdf-page-1", 0],
      ["read-pdf-page-2", 9],
    ],
  );
});

test("empty render output remains a zero-page parts result", async () => {
  const f = fixture();
  f.pages.length = 0;
  assert.deepEqual(await run(f, "1"), {
    type: "parts",
    filePath: path,
    numParts: 0,
    originalSize: 123,
    pages: [],
  });
});
