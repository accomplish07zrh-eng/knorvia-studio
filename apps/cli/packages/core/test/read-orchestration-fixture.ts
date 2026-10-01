// Source-exposed freeze harness; every reader/state/model/approval effect is an owned fixture.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createFileSystemError } from "@knorvia/contracts";
import { normalRange, normalStat, type ReadScenario } from "./read-orchestration-cases.js";
export const emitted = process.env.KNORVIA_READ_ORCHESTRATION_TEST_EMITTED === "1";
export const load = async (path: string) => {
  const url = new URL(
    `../${emitted ? "dist" : "src"}/${path}.${emitted ? "js" : "ts"}`,
    import.meta.url,
  );
  if (emitted) await readFile(url);
  return import(url.href);
};
export const readModule = await load("tool/handlers/read");
export const entry = readModule.readToolEntry;
export const readers = await Promise.all(
  [
    "read-text",
    "read-image",
    "read-video",
    "read-pdf",
    "read-model-content",
    "read-file-suggestion",
  ].map((n) => load(`tool/handlers/${n}`)),
);
export const stateModule = await load("tool/read-file-state");
export const stateMetadata = await load("tool/read-file-state-metadata");
export const publicDeclaration = await readFile(
  new URL("../dist/tool/handlers/read.d.ts", import.meta.url),
  "utf8",
);
export const ROOT = join(tmpdir(), "knorvia-owned-read-orchestration");
export const CWD = join(ROOT, "workspace");
export const json = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (key === "stack") return undefined;
      return typeof item === "string" && (item.includes(ROOT) || item.includes(ROOT.toLowerCase()))
        ? item
            .replaceAll(ROOT, "$FIXTURE")
            .replaceAll(ROOT.toLowerCase(), "$FIXTURE")
            .replaceAll("\\", "/")
        : item;
    }),
  );
export const errorShape = (e: any): any =>
  json({
    name: e?.name,
    type: e?.type,
    code: e?.code,
    message: e?.message,
    context: e?.context,
    recoverable: e?.recoverable,
    retryable: e?.retryable,
    issues: e?.issues,
    cause: e?.cause instanceof Error ? errorShape(e.cause) : e?.cause,
  });
export const clockEvents: string[] = [];
export async function clock<T>(run: () => T | Promise<T>): Promise<T> {
  const Original = Date,
    base = Original.UTC(2026, 1, 3, 4, 5, 6);
  let tick = 0;
  clockEvents.length = 0;
  class SyntheticDate extends Original {
    constructor(value?: string | number | Date) {
      const now = value === undefined;
      super(now ? base + tick++ : value);
      if (now) clockEvents.push(`date/${tick - 1}`);
    }
    static override now() {
      return base;
    }
  }
  globalThis.Date = SyntheticDate as DateConstructor;
  try {
    return await run();
  } finally {
    globalThis.Date = Original;
  }
}
export function fixture(c: ReadScenario) {
  const input: any = Object.hasOwn(c, "input")
    ? c.input
    : { file_path: `synthetic.${c.suffix ?? "txt"}` };
  const filePath = resolve(
    CWD,
    typeof input?.file_path === "string" ? input.file_path : "synthetic.txt",
  );
  const reads: string[] = [],
    calls: any[] = [],
    rawCalls: any[] = [],
    metadata: any[] = [];
  const controller = new AbortController();
  const stat = c.stat === null ? null : { path: filePath, ...normalStat, ...c.stat };
  const range = c.range === null ? null : { path: filePath, ...normalRange, ...c.range };
  const states = new Map();
  if (Object.hasOwn(c, "cache"))
    states.set(
      stateModule.createReadFileStateKey(filePath, input?.offset ?? 1, input?.limit),
      typeof c.cache === "object" && c.cache !== null
        ? { path: filePath, readAt: new Date(1), sourceTool: "Read", ...c.cache }
        : c.cache,
    );
  const originalError =
    c.fault?.kind === "filesystem"
      ? createFileSystemError({
          code: c.fault.code as any,
          path: filePath,
          message: `Synthetic ${c.fault.code}`,
          cause: new Error("Synthetic filesystem cause"),
        })
      : new Error("Synthetic owned port failure", { cause: { synthetic: true } });
  let context: any;
  const fail = (target: string) => {
    if (c.fault?.target !== target) return { failed: false };
    if (c.fault.kind === "value") throw "Synthetic thrown value";
    if (c.fault.kind === "reject") {
      const rejection = Promise.reject(originalError);
      // 非法同步 callback 返回 rejected Promise 时由 fixture 持有观察器，避免未处理拒绝污染其他用例。
      void rejection.catch(() => {});
      return { failed: true, value: rejection };
    }
    if (c.fault.kind !== "nonfunction") throw originalError;
    return { failed: false };
  };
  const make = (owner: any, target: string, result: (request: any) => any) => {
    if (c.fault?.target === target && c.fault.kind === "nonfunction") return 7;
    return function (this: unknown, ...args: any[]) {
      const [request, options] = args;
      reads.push(`call:${target}`);
      rawCalls.push({ target, args });
      calls.push({
        target,
        receiver: this === owner,
        argc: args.length,
        request: json(request),
        keys: request && typeof request === "object" ? Object.keys(request) : undefined,
        optionKeys: options ? Object.keys(options) : undefined,
        signalIdentity: options?.signal === controller.signal,
        aborted: options?.signal?.aborted,
      });
      const failure = fail(target);
      return failure.failed ? failure.value : result(request);
    };
  };
  const fs: any = {},
    image: any = {},
    pdf: any = {};
  fs.stat = make(fs, "stat", () => Promise.resolve(stat));
  fs.readTextFileRange = make(fs, "readTextFileRange", () => Promise.resolve(range));
  fs.readBinaryFile = make(fs, "readBinaryFile", () =>
    Promise.resolve({
      path: filePath,
      content: new Uint8Array(Buffer.from(c.pdf === true ? "%PDF-synthetic" : [1, 2, 3])),
      bytesRead: c.range?.bytesRead ?? 3,
      sizeBytes: 15,
    }),
  );
  fs.listDirectory = make(fs, "listDirectory", () =>
    Promise.resolve({
      path: CWD,
      entries: [{ kind: "file", name: "synthetic.md", path: join(CWD, "synthetic.md") }],
      numEntries: 1,
      durationMs: 0,
    }),
  );
  image.prepareForModel = make(image, "prepareForModel", () =>
    Promise.resolve({
      data: new Uint8Array([4, 5, 6]),
      mediaType: "image/jpeg",
      originalSizeBytes: 3,
      transformedSizeBytes: 3,
      width: 2,
      height: 1,
      resized: true,
      compressed: false,
      strategy: "original",
    }),
  );
  pdf.getPageCount = make(pdf, "getPageCount", () => Promise.resolve(2));
  pdf.renderPages = make(pdf, "renderPages", (r) =>
    Promise.resolve(
      Array.from({ length: r.lastPage - r.firstPage + 1 }, (_, i) => ({
        pageNumber: r.firstPage + i,
        data: new Uint8Array([1]),
        mediaType: "image/jpeg",
      })),
    ),
  );
  const get = states.get,
    set = states.set;
  states.get = make(states, "state.get", (key) => get.call(states, key));
  states.set = make(states, "state.set", (key) => set.call(states, key, rawCalls.at(-1).args[1]));
  context = {
    fileSystemPort: c.noFileSystem ? undefined : fs,
    imageProcessorPort: c.noImage ? undefined : image,
    pdfDocumentPort: c.noPdf ? undefined : pdf,
    workingDirectory: Object.hasOwn(c, "cwd") ? c.cwd : CWD,
    workspaceRoot: Object.hasOwn(c, "workspace") ? c.workspace : ROOT,
    readFileState: c.fallback ? undefined : states,
    toolCallId: "synthetic-read-call",
    sessionId: "synthetic-read-session",
    turnId: "synthetic-read-turn",
    traceId: "synthetic-read-trace",
    spanId: "synthetic-read-span",
    parentSpanId: "synthetic-read-parent",
    traceContext: { traceId: "ignored-synthetic-trace" },
    abortSignal: controller.signal,
    model: { properties: { inputFormat: { supportsPdf: c.pdf, supportsImage: c.image ?? true } } },
  };
  context.recordReadFileStateMetadata = c.noMetadata
    ? undefined
    : make(context, "metadata", (m) => metadata.push(m));
  const watched = new WeakMap<object, Map<string, unknown>>();
  const snapshot = () =>
    json(
      Array.from(Map.prototype.entries.call(states), ([key, value]: any) => [
        key,
        value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value).map((field) => [
                field,
                watched.get(value)?.has(field) ? watched.get(value).get(field) : value[field],
              ]),
            )
          : value,
      ]),
    );
  function instrument(target: string, at: number) {
    const watch = (object: any, key: string, label: string) => {
      const value = object?.[key];
      if (!object) return;
      const originals = watched.get(object) ?? new Map();
      originals.set(key, value);
      watched.set(object, originals);
      let count = 0;
      Object.defineProperty(object, key, {
        configurable: true,
        get() {
          reads.push(label);
          if (label === target && ++count === at)
            throw new Error(`Synthetic getter ${label}/${at}`);
          return value;
        },
      });
    };
    for (const key of Object.keys(context)) watch(context, key, `context.${key}`);
    for (const [owner, key, label] of [
      [fs, "stat", "stat"],
      [fs, "readTextFileRange", "readTextFileRange"],
      [fs, "readBinaryFile", "readBinaryFile"],
      [image, "prepareForModel", "prepareForModel"],
      [pdf, "getPageCount", "getPageCount"],
      [states, "get", "state.get"],
      [states, "set", "state.set"],
      [stat, "revision", "stat.revision"],
    ] as const)
      watch(owner, key, label);
    const cache = get.call(
      states,
      stateModule.createReadFileStateKey(filePath, input?.offset ?? 1, input?.limit),
    );
    if (cache && typeof cache === "object") watch(cache, "isPartialView", "cache.isPartialView");
  }
  return {
    input,
    filePath,
    context,
    fs,
    image,
    pdf,
    states,
    reads,
    calls,
    rawCalls,
    metadata,
    controller,
    stat,
    range,
    snapshot,
    instrument,
    originalError,
  };
}
export function declaration() {
  return json({
    ...entry,
    handler: undefined,
    validateInput: undefined,
    resolveModelContract: undefined,
    resolveTimeoutBudgetMs: undefined,
    formatModelContent: undefined,
    runtimeInputSchema: undefined,
    runtimeOutputSchema: undefined,
  });
}
export async function observe(c: ReadScenario, probe?: { target: string; at: number }) {
  return clock(async () => {
    const f = fixture(c);
    if (probe) f.instrument(probe.target, probe.at);
    const outcomes = [];
    for (let i = 0; i < (c.repeats ?? 1); i++) {
      try {
        const output = await entry.handler(f.input, f.context);
        let format;
        try {
          format = { content: entry.formatModelContent(output) };
        } catch (error) {
          format = { error: errorShape(error) };
        }
        outcomes.push({
          output,
          keys: output && typeof output === "object" ? Object.keys(output) : undefined,
          format,
        });
      } catch (error) {
        outcomes.push({
          error: errorShape(error),
          thrown: error instanceof Error ? undefined : error,
          originalIdentity: error === f.originalError,
        });
      }
    }
    return json({
      outcomes,
      reads: f.reads,
      calls: f.calls,
      metadata: f.metadata,
      state: f.snapshot(),
      clock: clockEvents.slice(),
      traceIdentity: f.rawCalls
        .filter((c) => ["stat", "readTextFileRange"].includes(c.target))
        .map((c) => c.args[0].trace === f.rawCalls.find((c) => c.target === "stat")?.args[0].trace),
    });
  });
}
