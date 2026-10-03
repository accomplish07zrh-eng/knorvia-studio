import assert from "node:assert/strict";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodeTest from "node:test";
import { build } from "esbuild";
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
const test = (name, fn) => {
  if (!only || name.startsWith(only)) nodeTest(name, fn);
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../");
const owners = {
  "image-index": "image/index.ts",
  "image-compression": "image/jimp-compression.ts",
  "pdf-index": "pdf/index.ts",
};
async function load(name, ports) {
  const entry = process.argv.includes("--baseline")
    ? `/tmp/knorvia-cli-media-baseline/${name}.ts`
    : path.join(root, "apps/cli/packages/adapters/src", owners[name]);
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "synthetic-ports",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (arg) =>
            arg.kind === "entry-point" ? undefined : { path: arg.path, namespace: "synthetic" },
          );
          builder.onLoad({ filter: /.*/, namespace: "synthetic" }, (arg) => {
            if (!(arg.path in ports)) throw new Error(`Unexpected runtime import ${arg.path}`);
            return {
              contents: Object.keys(ports[arg.path])
                .map(
                  (key) =>
                    `export const ${key}=globalThis.ports[${JSON.stringify(arg.path)}][${JSON.stringify(key)}];`,
                )
                .join("\n"),
              loader: "js",
            };
          });
        },
      },
    ],
  });
  const sandbox = { module: { exports: {} }, ports, Buffer, Uint8Array };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(output.outputFiles[0].text, sandbox, { filename: `${name}-synthetic.cjs` });
  return sandbox.module.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const mime = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
};
const media = {
  normalizeMediaType: (value) =>
    value.toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(value.toLowerCase())
        ? value.toLowerCase()
        : "image/png",
  detectImageMediaType: () => undefined,
  jimpOutputMediaType: (requested, detected) =>
    Object.values(mime).includes(requested)
      ? requested
      : Object.values(mime).includes(detected)
        ? detected
        : mime.png,
  throwIfAborted: (signal) => {
    if (signal?.aborted) throw new Error("Image resize was cancelled");
  },
};
function imagePorts(read) {
  return {
    jimp: { Jimp: { read }, JimpMime: mime, ResizeStrategy: { BICUBIC: "synthetic-bicubic" } },
    "./jimp-media.js": media,
  };
}

test("image facade preserves admission, WebP bytes, raw error and delegation identity", async () => {
  const decodeError = new Error("synthetic decoder failure"),
    encoded = Buffer.from([9, 8]);
  const calls = [];
  let readBehavior = async () => {
    throw decodeError;
  };
  const promise = Promise.resolve({ synthetic: true });
  const ports = imagePorts((data) => {
    calls.push(["read", data]);
    return readBehavior(data);
  });
  ports["./jimp-compression.js"] = {
    prepareJimpImageForModel: (request, options) => {
      calls.push(["prepare", request, options]);
      return promise;
    },
  };
  const { createJimpImageProcessorAdapter } = await load("image-index", ports);
  const adapter = createJimpImageProcessorAdapter(),
    request = { data: new Uint8Array([1, 2, 3]), mediaType: "image/webp", maxDimension: 2.5 };
  const pass = await adapter.resizeToFit(request);
  assert.deepEqual([...pass.data], [1, 2, 3]);
  assert.notEqual(pass.data, request.data);
  assert.deepEqual(Object.keys(pass), ["data", "mediaType", "resized"]);
  assert.equal(calls.length, 0);
  await assert.rejects(
    adapter.resizeToFit({ ...request, maxDimension: 0 }),
    /positive finite number/,
  );
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    adapter.resizeToFit({ ...request, maxDimension: 0 }, { signal: aborted.signal }),
    /Image resize was cancelled/,
  );
  await assert.rejects(
    adapter.resizeToFit({ ...request, mediaType: "image/png" }),
    (error) => error === decodeError,
  );
  const image = {
    bitmap: { width: 8, height: 4 },
    mime: mime.png,
    scaleToFit(options) {
      calls.push(["scale", plain(options)]);
      this.bitmap = { width: 2, height: 1 };
      return this;
    },
    async getBuffer(...args) {
      calls.push(["encode", ...args]);
      return encoded;
    },
  };
  readBehavior = async () => image;
  const resized = await adapter.resizeToFit({ ...request, mediaType: "IMAGE/PNG" });
  assert.equal(resized.data, encoded);
  assert.equal(resized.mediaType, mime.png);
  assert.deepEqual(plain(calls.find((call) => call[0] === "scale")[1]), {
    h: 2.5,
    mode: "synthetic-bicubic",
    w: 2.5,
  });
  assert.equal(calls.find((call) => call[0] === "encode").length, 2);
  assert.deepEqual(
    [resized.originalWidth, resized.originalHeight, resized.width, resized.height, resized.resized],
    [8, 4, 2, 1, true],
  );
  const options = { signal: new AbortController().signal };
  assert.equal(adapter.prepareForModel(request, options), promise);
  assert.equal(calls.at(-1)[1], request);
  assert.equal(calls.at(-1)[2], options);
});

test("image compression preserves PNG then JPEG budget order, bytes, admission and error cause", async () => {
  const calls = [],
    pngBytes = Buffer.alloc(30, 1),
    jpegBytes = Buffer.from([7, 6]);
  const decodeError = new Error("synthetic decode"),
    codecError = new Error("synthetic encode");
  let failure;
  function image(width, height) {
    return {
      bitmap: { width, height },
      mime: mime.png,
      clone() {
        calls.push(["clone", this.bitmap.width, this.bitmap.height]);
        return image(this.bitmap.width, this.bitmap.height);
      },
      scaleToFit(options) {
        calls.push(["scale", plain(options)]);
        this.bitmap = { width: options.w, height: options.h / 2 };
        return this;
      },
      async getBuffer(type, options) {
        calls.push(["encode", type, plain(options)]);
        if (failure === "codec") throw codecError;
        this.bitmap.width = 7;
        return type === mime.png ? pngBytes : jpegBytes;
      },
    };
  }
  const ports = imagePorts(async () => {
    calls.push(["read"]);
    if (failure === "decode") throw decodeError;
    return image(8, 4);
  });
  ports["@knorvia/contracts"] = {
    createImageProcessorError: ({ code, message, cause }) =>
      Object.assign(new Error(message, { cause }), { code, name: "ImageProcessorPortError" }),
  };
  ports["./image-budget.js"] = {
    validatePrepareRequest: (request) => {
      calls.push(["validate"]);
      for (const key of ["maxDimension", "maxRawBytes", "maxBase64Bytes"])
        if (!(Number.isFinite(request[key]) && request[key] > 0))
          throw Object.assign(new Error("invalid synthetic request"), { code: "invalid_request" });
    },
    createImageBudget: (request) => request,
    fitsImageBudget: (data, budget) =>
      data.length <= budget.maxRawBytes && Math.ceil(data.length / 3) * 4 <= budget.maxBase64Bytes,
  };
  ports["./webp-passthrough.js"] = {
    prepareWebpPassthrough: () => {
      throw new Error("unexpected WebP port");
    },
  };
  const { prepareJimpImageForModel: prepare } = await load("image-compression", ports);
  const request = {
    data: new Uint8Array(20),
    mediaType: mime.png,
    maxDimension: 10,
    maxRawBytes: 3,
    maxBase64Bytes: 4,
  };
  const result = await prepare(request);
  assert.deepEqual(
    calls.filter((call) => call[0] === "encode"),
    [
      ["encode", mime.png, { deflateLevel: 9, deflateStrategy: 3 }],
      ["encode", mime.jpeg, { quality: 80 }],
    ],
  );
  assert.equal(result.data, jpegBytes);
  assert.deepEqual(
    [
      result.mediaType,
      result.strategy,
      result.originalWidth,
      result.width,
      result.compressed,
      result.resized,
      result.originalSizeBytes,
      result.transformedSizeBytes,
    ],
    [mime.jpeg, "jpeg-quality", 8, 7, true, true, 20, 2],
  );
  assert.equal(calls.filter((call) => call[0] === "clone").length, 1);
  await assert.rejects(
    prepare({ ...request, data: new Uint8Array() }),
    (error) => error.code === "empty" && error.message === "Image file is empty (0 bytes)",
  );
  failure = "decode";
  await assert.rejects(
    prepare(request),
    (error) => error.code === "processing_failed" && error.cause === decodeError,
  );
  failure = "codec";
  await assert.rejects(prepare(request), (error) => error === codecError);
  calls.length = 0;
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(prepare(request, { signal: aborted.signal }), /Image resize was cancelled/);
  assert.equal(calls.length, 0);
});

class PdfError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.code = code;
    this.name = "PdfDocumentPortError";
  }
}
const result = (overrides = {}) => ({
  status: "completed",
  exitCode: 0,
  cancelled: false,
  timedOut: false,
  stdout: { text: "" },
  stderr: { text: "" },
  ...overrides,
});
function pdfPorts(fs) {
  return {
    "@knorvia/contracts": {
      PdfDocumentPortError: PdfError,
      READ_PDF_AVAILABILITY_TIMEOUT_MS: 5000,
      READ_PDF_INFO_TIMEOUT_MS: 10000,
      READ_PDF_MAX_PAGES_PER_REQUEST: 20,
      READ_PDF_RENDER_TIMEOUT_MS: 120000,
    },
    "node:fs/promises": fs,
    "node:os": { tmpdir: () => "synthetic-temp" },
    "node:path": { join: (...parts) => parts.join("/") },
  };
}

test("PDF ownership preserves failed-probe retry, successful cache, authority and sorted concurrent bytes", async () => {
  const calls = [],
    trace = { traceId: "synthetic-trace" };
  let probes = 0;
  const executionPort = {
    async run(request, options) {
      assert.equal(this, executionPort);
      assert.equal(request.trace, trace);
      calls.push(["run", plain(request.command), request.timeoutMs, options]);
      if (request.command.file === "pdfinfo")
        return result({ stdout: { text: "Title: synthetic\nPages: 0\n" } });
      if (request.command.args[0] === "-v")
        return ++probes === 1
          ? result({ status: "failed", exitCode: 127 })
          : result({ status: "failed", exitCode: 1, stderr: { text: "synthetic version" } });
      return result();
    },
  };
  const fs = {
    async mkdtemp(prefix) {
      calls.push(["temp", prefix]);
      return "synthetic-directory";
    },
    async readdir() {
      return ["other-2.JPG", "page-01.jpg", "ignore.txt", "page-0.jpg"];
    },
    async readFile(name, options) {
      calls.push(["read", name, options]);
      return Buffer.from([name.includes("01") ? 1 : 2]);
    },
    async rm(directory, options) {
      calls.push(["rm", directory, plain(options)]);
    },
  };
  const { createPopplerPdfDocumentAdapter } = await load("pdf-index", pdfPorts(fs));
  const factoryOptions = { executionPort, tempRoot: "initial-temp" },
    adapter = createPopplerPdfDocumentAdapter(factoryOptions);
  const request = { filePath: "synthetic.pdf", firstPage: 1, lastPage: 2, trace },
    signal = new AbortController().signal;
  assert.equal(await adapter.getPageCount(request), 0);
  assert.equal(probes, 0);
  await assert.rejects(
    adapter.renderPages(request, { signal }),
    (error) => error.code === "unavailable" && Object.hasOwn(error, "cause"),
  );
  assert.equal(calls.filter((call) => call[0] === "temp").length, 0);
  factoryOptions.tempRoot = "changed-temp";
  const pages = await adapter.renderPages(request, { signal });
  assert.deepEqual(
    Array.from(pages, (page) => [page.pageNumber, ...page.data]),
    [
      [1, 1],
      [2, 2],
    ],
  );
  assert.ok(pages.every((page) => page.mediaType === "image/jpeg"));
  assert.equal(calls.find((call) => call[0] === "temp")[1], "changed-temp/knorvia-read-pdf-");
  const render = calls.find((call) => call[0] === "run" && call[1].args[0] === "-jpeg");
  assert.deepEqual(render[1], {
    mode: "argv",
    file: "pdftoppm",
    args: ["-jpeg", "-r", "100", "-f", "1", "-l", "2", "synthetic.pdf", "synthetic-directory/page"],
  });
  assert.equal(render[2], 120000);
  assert.equal(render[3].signal, signal);
  assert.deepEqual(
    calls.filter((call) => call[0] === "read").map((call) => call[1]),
    ["synthetic-directory/page-01.jpg", "synthetic-directory/other-2.JPG"],
  );
  await adapter.renderPages(request);
  assert.equal(probes, 2);
  assert.deepEqual(
    calls.filter((call) => call[0] === "rm").map((call) => call[2]),
    [
      { recursive: true, force: true },
      { recursive: true, force: true },
    ],
  );
});

test("PDF cleanup preserves primary error identity and classifies cleanup and read cancellation", async () => {
  const cleanup = new Error("synthetic cleanup"),
    primary = new Error("synthetic execution"),
    readFailure = new Error("synthetic read");
  let mode = "primary",
    reads = [],
    cleanups = 0;
  const controller = new AbortController();
  const executionPort = {
    async run(request) {
      if (request.command.args[0] === "-v") return result();
      if (mode === "primary") throw primary;
      if (mode === "password")
        return result({ status: "failed", exitCode: 1, stderr: { text: "Password required" } });
      return result();
    },
  };
  const fs = {
    async mkdtemp() {
      return "synthetic-directory";
    },
    async readdir() {
      return ["p-1.jpg", "p-2.jpg"];
    },
    readFile(name) {
      reads.push(name);
      if (mode === "read") {
        controller.abort();
        throw readFailure;
      }
      return Promise.resolve(Buffer.from([1]));
    },
    async rm() {
      cleanups++;
      if (mode !== "read") throw cleanup;
    },
  };
  const { createPopplerPdfDocumentAdapter } = await load("pdf-index", pdfPorts(fs));
  const adapter = createPopplerPdfDocumentAdapter({ executionPort }),
    request = {
      filePath: "synthetic.pdf",
      firstPage: 1,
      lastPage: 1,
      trace: { traceId: "synthetic" },
    };
  await assert.rejects(adapter.renderPages(request), (error) => error === primary);
  mode = "password";
  await assert.rejects(
    adapter.renderPages(request),
    (error) =>
      error.code === "password_protected" &&
      error.message === "PDF is password-protected. Please provide an unprotected version.",
  );
  mode = "success";
  await assert.rejects(
    adapter.renderPages(request),
    (error) => error.code === "io_error" && error.cause === cleanup,
  );
  mode = "read";
  reads = [];
  await assert.rejects(
    adapter.renderPages(request, { signal: controller.signal }),
    (error) => error.code === "cancelled" && error.cause === readFailure,
  );
  assert.equal(reads.length, 2);
  assert.equal(cleanups, 4);
});

test("PDF temporal options preserve signal replacement across availability and temp admission", async () => {
  const before = new AbortController(),
    after = new AbortController(),
    trace = { traceId: "synthetic-temporal" };
  const callOptions = { signal: before.signal },
    calls = [];
  const executionPort = {
    async run(request, options) {
      calls.push([request.command.args[0], options?.signal]);
      if (request.command.args[0] === "-v") {
        callOptions.signal = after.signal;
        return result();
      }
      return result();
    },
  };
  const fs = {
    async mkdtemp() {
      return "synthetic-directory";
    },
    async readdir() {
      return ["p-1.jpg"];
    },
    async readFile(_name, options) {
      calls.push(["read", options?.signal]);
      return Buffer.from([1]);
    },
    async rm() {},
  };
  const { createPopplerPdfDocumentAdapter } = await load("pdf-index", pdfPorts(fs));
  const adapter = createPopplerPdfDocumentAdapter({ executionPort });
  await adapter.renderPages(
    { filePath: "synthetic.pdf", firstPage: 1, lastPage: 1, trace },
    callOptions,
  );
  assert.equal(calls[0][1], before.signal);
  assert.equal(calls[1][1], after.signal);
  assert.equal(calls[2][1], after.signal);
});
