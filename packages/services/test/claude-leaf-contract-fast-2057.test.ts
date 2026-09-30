// New contract fixtures; prior source exposure is disclosed in the package-local specification.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm, mkdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const target = process.env.KNORVIA_CLAUDE_LEAF_TARGET ?? "src";
const root = process.env.KNORVIA_CLAUDE_LEAF_ROOT;
const folder = root ? pathToFileURL(`${resolve(root)}/`) : new URL("../", import.meta.url);
const load = (name: string) =>
  import(
    new URL(`${target}/session/claude-native/${name}.${target === "src" ? "ts" : "js"}`, folder)
      .href
  );
const record: typeof import("../src/session/claude-native/jsonLineRecord.js") =
  await load("jsonLineRecord");
const history: typeof import("../src/session/claude-native/sessionHistoryJsonl.js") =
  await load("sessionHistoryJsonl");
const filter: typeof import("../src/session/claude-native/importedClaudeTaskFileFilter.js") =
  await load("importedClaudeTaskFileFilter");
const head: typeof import("../src/session/claude-native/claudeNativeSessionHeadParser.js") =
  await load("claudeNativeSessionHeadParser");
const build: typeof import("../src/session/claude-native/buildImportedClaudeTaskFile.js") =
  await load("buildImportedClaudeTaskFile");
const parser: typeof import("../src/session/claude-native/claudeNativeSessionImportParser.js") =
  await load("claudeNativeSessionImportParser");
const {
  claudeNativeSessionImportRepo: importRepo,
}: typeof import("../src/session/claude-native/claudeNativeSessionImportRepo.js") = await load(
  "claudeNativeSessionImportRepo",
);
const codec: typeof import("../src/session/legacyTaskSessionFile.js") = await import(
  new URL(`${target}/session/legacyTaskSessionFile.${target === "src" ? "ts" : "js"}`, folder).href
);

async function fixture(
  t: { after: (fn: () => Promise<void>) => void },
  contents: string | Uint8Array,
) {
  const dir = await mkdtemp(join(tmpdir(), "knorvia-claude-leaf-2057-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "synthetic.jsonl");
  await writeFile(path, contents);
  return { dir, path };
}
const error = (name: string, message: string) => (value: unknown) => {
  assert.ok(value instanceof Error);
  assert.equal(value.name, name);
  assert.equal(value.message, message);
  return true;
};
const nativeJsonError = (line: string) => {
  try {
    JSON.parse(line);
  } catch (value) {
    return (value as Error).message;
  }
  throw new Error("fixture must be invalid JSON");
};
const user = (content: unknown, extra: object = {}) => ({
  type: "user",
  message: { content },
  ...extra,
});
const assistant = (content: unknown, extra: object = {}) => ({
  type: "assistant",
  message: { content },
  ...extra,
});
const source = (extra: object = {}) => ({
  provider: "claude" as const,
  sessionId: "fixture-session",
  workspacePath: "/synthetic/project",
  sourcePath: "/synthetic/transcript.jsonl",
  createdAt: 1700000000123,
  updatedAt: 1700000000999,
  messages: [{ role: "user" as const, content: "Hello", timestamp: 1700000000123, turnIndex: 0 }],
  ...extra,
});
function stableTrace(t: { after: (fn: () => void) => void }) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  let calls = 0;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      randomUUID: () => {
        calls++;
        return "00000000-0000-4000-8000-000000000001";
      },
    },
  });
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, "crypto", prior);
  });
  return () => calls;
}

for (const [name, value, expected] of [
  ["null", null, false],
  ["array", [], false],
  ["number", 1, false],
  ["function", () => {}, false],
  ["plain", {}, true],
  ["date", new Date(0), true],
  ["map", new Map(), true],
  ["boxed", new String("x"), true],
  ["null prototype", Object.create(null), true],
] as const) {
  test(`object guard ${name}`, () => assert.equal(record.isObjectRecord(value), expected));
}
for (const [name, value, expected] of [
  ["empty", "", undefined],
  ["whitespace", " \n\t\ufeff ", undefined],
  ["trimmed", " \u00a0Text\r\n ", "Text"],
  ["zero", 0, undefined],
  ["boxed", new String("x"), undefined],
  ["null", null, undefined],
] as const) {
  test(`string guard ${name}`, () => assert.equal(record.readTrimmedString(value), expected));
}

for (const [name, bytes, fullExpected, headExpected] of [
  [
    "LF",
    '\n {"unknown":{"a":1}}\n\t\nnull\n[1,2]\ntrue\n3\n"text"',
    [{ unknown: { a: 1 } }, null, [1, 2], true, 3, "text"],
    [{ unknown: { a: 1 } }, null, [1, 2], true, 3, "text"],
  ],
  ["CRLF", '\r\n{"x":1}\r\n\r\n{"x":2}', [{ x: 1 }, { x: 2 }], [{ x: 1 }, { x: 2 }]],
  ["blank BOM", '\ufeff\n{"x":1}\n', [{ x: 1 }], [{ x: 1 }]],
  ["UTF8 multibyte", '{"text":"雪🙂 café"}\n', [{ text: "雪🙂 café" }], [{ text: "雪🙂 café" }]],
  [
    "invalid UTF8 in string",
    Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125, 10]),
    [{ x: "�" }],
    [{ x: "�" }],
  ],
  ["blank only", " \t\r\n\n", [], []],
] as const) {
  test(`JSONL decoding ${name}`, async (t) => {
    const { path } = await fixture(t, bytes);
    assert.deepEqual(await history.readJsonLinesFile(path), fullExpected);
    assert.deepEqual(await history.readJsonLinesFileHead(path, Infinity), headExpected);
  });
}
test("head UTF8 decoding across stream chunks and truncated tail", async (t) => {
  const { path } = await fixture(t, " ".repeat(65523) + '{"text":"雪🙂"}\n{"cut":');
  assert.deepEqual(await history.readJsonLinesFileHead(path, 1), [{ text: "雪🙂" }]);
  await assert.rejects(
    history.readJsonLinesFile(path),
    error("Error", `[claude-native] 解析 JSONL 失败 ${path}:2 ${nativeJsonError('{"cut":')}`),
  );
});
test("bare CR is full-read content and head framing delimiter", async (t) => {
  const line = '{"a":1}\r{"a":2}';
  const { path } = await fixture(t, line);
  await assert.rejects(
    history.readJsonLinesFile(path),
    error("Error", `[claude-native] 解析 JSONL 失败 ${path}:1 ${nativeJsonError(line)}`),
  );
  assert.deepEqual(await history.readJsonLinesFileHead(path, Infinity), [{ a: 1 }, { a: 2 }]);
});
for (const bad of ['{"cut":', '\ufeff{"bom":1}', '{"bad":"\u0000"}']) {
  test(`JSONL malformed/truncated ${JSON.stringify(bad)}`, async (t) => {
    const { path } = await fixture(t, '\n \t\n{"ok":1}\n\n' + bad);
    await assert.rejects(
      history.readJsonLinesFile(path),
      error("Error", `[claude-native] 解析 JSONL 失败 ${path}:2 ${nativeJsonError(bad)}`),
    );
    await assert.rejects(
      history.readJsonLinesFileHead(path, Infinity),
      error("Error", `[claude-native] 解析 JSONL 失败 ${path}:5 ${nativeJsonError(bad)}`),
    );
    assert.deepEqual(await history.readJsonLinesFileHead(path, 1), [{ ok: 1 }]);
  });
}
for (const [limit, expected] of [
  [0, []],
  [-1, []],
  [NaN, [1, 2, 3]],
  [Infinity, [1, 2, 3]],
  [0.1, [1]],
  [1.1, [1, 2]],
  [2, [1, 2]],
] as const) {
  test(`head limit ${String(limit)}`, async (t) => {
    const { path } = await fixture(t, "\n1\n\n2\n3");
    assert.deepEqual(await history.readJsonLinesFileHead(path, limit), expected);
  });
}
test("zero head limit skips file access; native missing/directory/path errors remain", async (t) => {
  assert.deepEqual(await history.readJsonLinesFileHead("/synthetic/missing-2057", 0), []);
  const { dir, path } = await fixture(t, "");
  for (const reader of [
    (p: string) => history.readJsonLinesFile(p),
    (p: string) => history.readJsonLinesFileHead(p, 1),
  ]) {
    await assert.rejects(reader(join(dir, "missing")), { code: "ENOENT" });
    if (process.platform !== "freebsd") await assert.rejects(reader(dir), { code: "EISDIR" });
    await assert.rejects(reader(null as never), TypeError);
    assert.deepEqual(await reader(path), []);
  }
});

test("default paths, clone isolation, unknown fields and order", () => {
  assert.deepEqual(filter.DEFAULT_IMPORTED_CLAUDE_TASK_FILTER_PATHS, [
    "meta.mode",
    "meta.model",
    "meta.provider",
    "messages[].model",
  ]);
  const value = {
    meta: { taskId: "a", mode: "x", model: "m", provider: "p", unknown: { keep: 1 } },
    messages: [{ model: "m", content: "x", unknown: 2 }],
    extra: 3,
  };
  const result = filter.filterImportedClaudeTaskFilePaths(
    value,
    filter.DEFAULT_IMPORTED_CLAUDE_TASK_FILTER_PATHS,
  );
  assert.equal(
    JSON.stringify(result),
    '{"meta":{"taskId":"a","unknown":{"keep":1}},"messages":[{"content":"x","unknown":2}],"extra":3}',
  );
  assert.equal(value.meta.mode, "x");
  assert.notEqual(result.meta.unknown, value.meta.unknown);
});
for (const [paths, expected] of [
  [["arr[].x"], { arr: [{ keep: 2 }, { keep: 3 }], a: { b: 1 }, "": { x: 1 } }],
  [
    ["arr[]"],
    {
      arr: [
        { x: 1, keep: 2 },
        { x: 2, keep: 3 },
      ],
      a: { b: 1 },
      "": { x: 1 },
    },
  ],
  [
    ["arr.0.x", "a..b", "", ".x"],
    {
      arr: [
        { x: 1, keep: 2 },
        { x: 2, keep: 3 },
      ],
      a: { b: 1 },
      "": { x: 1 },
    },
  ],
  [
    ["a.b", "a.b"],
    {
      arr: [
        { x: 1, keep: 2 },
        { x: 2, keep: 3 },
      ],
      a: {},
      "": { x: 1 },
    },
  ],
  [
    ["a", "a.b"],
    {
      arr: [
        { x: 1, keep: 2 },
        { x: 2, keep: 3 },
      ],
      "": { x: 1 },
    },
  ],
] as const) {
  test(`path traversal ${JSON.stringify(paths)}`, () => {
    assert.deepEqual(
      filter.filterImportedClaudeTaskFilePaths(
        {
          arr: [
            { x: 1, keep: 2 },
            { x: 2, keep: 3 },
          ],
          a: { b: 1 },
          "": { x: 1 },
        },
        paths,
      ),
      expected,
    );
  });
}
test("wildcard empty key, nested arrays and sparse cyclic clones", () => {
  const sparse: unknown[] = [];
  sparse.length = 3;
  sparse[1] = { x: 1, keep: 2 };
  const value = { "": [{ x: 1 }], rows: [[{ x: 1 }]], sparse, self: null as unknown };
  value.self = value;
  const result = filter.filterImportedClaudeTaskFilePaths(value, [
    "[].x",
    "rows[].x",
    "sparse[].x",
  ]);
  assert.deepEqual(result[""], [{}]);
  assert.deepEqual(result.rows, [[{ x: 1 }]]);
  assert.equal(0 in result.sparse, false);
  assert.deepEqual(result.sparse[1], { keep: 2 });
  assert.equal(result.self, result);
});
test("clone failure precedes malformed paths; invalid paths keep native errors", () => {
  assert.throws(() => filter.filterImportedClaudeTaskFilePaths({ fn: () => {} }, [null as never]), {
    name: "DataCloneError",
  });
  assert.throws(() => filter.filterImportedClaudeTaskFilePaths({}, [null as never]), TypeError);
  assert.throws(() => filter.filterImportedClaudeTaskFilePaths({}, null as never), TypeError);
  assert.equal(filter.filterImportedClaudeTaskFilePaths(3, ["a"]), 3);
});

test("head first visible user and earlier assistant workspace retain file order", () => {
  const entries = [
    assistant("prior", { cwd: " /first " }),
    user("Later title", { cwd: "/second", timestamp: "2026-01-01T00:00:00Z" }),
    user("earlier time", { timestamp: "2020-01-01" }),
  ];
  const before = structuredClone(entries);
  assert.equal(
    JSON.stringify(head.extractClaudeNativeSessionHeadInfo(entries)),
    '{"workspacePath":"/first","previewTitle":"Later title","createdAt":1767225600000}',
  );
  assert.deepEqual(entries, before);
  assert.deepEqual(head.extractClaudeNativeSessionHeadInfo([]), { workspacePath: undefined });
});
test("head tag sanitization, array role differences and content fallback", () => {
  assert.equal(
    head.extractClaudeNativeSessionHeadInfo([
      user(
        " <IDE_OPENED_FILE>secret\n</IDE_OPENED_FILE>A\r\nB<command-x>hidden</local-command-y>C ",
      ),
    ]).previewTitle,
    "A\nB C",
  );
  assert.equal(
    head.extractClaudeNativeSessionHeadInfo([
      user([
        { type: "tool_result", text: "skip" },
        { type: "other", text: " A " },
        { content: " B " },
        " C ",
      ]),
    ]).previewTitle,
    "A\n\nB\n\nC",
  );
  assert.equal(
    head.extractClaudeNativeSessionHeadInfo([{ type: "user", request: { prompt: " request " } }])
      .previewTitle,
    "request",
  );
  assert.deepEqual(
    head.extractClaudeNativeSessionHeadInfo([
      assistant([{ type: "other", text: "skip" }], { cwd: "/hidden" }),
      assistant([{ type: "text", text: "x" }], { cwd: "/visible" }),
    ]),
    { workspacePath: "/visible" },
  );
  assert.equal(
    head.extractClaudeNativeSessionHeadInfo([user("<command-x>unclosed")]).previewTitle,
    "<command-x>unclosed",
  );
});
test("head arrays retain native method/species errors and proxy access order", () => {
  const overridden = ["ignored"];
  overridden.flatMap = (() => ["", "override"]) as never;
  assert.equal(
    head.extractClaudeNativeSessionHeadInfo([user(overridden)]).previewTitle,
    "override",
  );
  const failing = ["x"];
  Object.defineProperty(failing, "constructor", {
    get() {
      throw new Error("species failure");
    },
  });
  assert.throws(
    () => head.extractClaudeNativeSessionHeadInfo([user(failing)]),
    error("Error", "species failure"),
  );
  const calls: string[] = [];
  const proxy = new Proxy(["x", "y"], {
    get(target, key, receiver) {
      calls.push(String(key));
      return Reflect.get(target, key, receiver);
    },
    has(target, key) {
      calls.push(`has:${String(key)}`);
      return Reflect.has(target, key);
    },
  });
  assert.equal(head.extractClaudeNativeSessionHeadInfo([user(proxy)]).previewTitle, "x\n\ny");
  assert.deepEqual(calls, ["flatMap", "length", "constructor", "has:0", "0", "has:1", "1"]);
});
test("head indexed projection captures length and skips deleted slots", () => {
  const content = ["x", "deleted"];
  Object.defineProperty(content, "0", {
    get() {
      delete content[1];
      content.push("appended");
      return "first";
    },
  });
  assert.equal(head.extractClaudeNativeSessionHeadInfo([user(content)]).previewTitle, "first");
});
test("filter retains recursive overflow on a cloneable cyclic selector", () => {
  const value = { self: null as unknown };
  value.self = value;
  assert.throws(
    () => filter.filterImportedClaudeTaskFilePaths(value, [Array(10000).fill("self").join(".")]),
    RangeError,
  );
  assert.equal(value.self, value);
});

test("head meta/api-error/synthetic markers are strict and sparse text arrays skip holes", () => {
  const content: unknown[] = [];
  content.length = 3;
  content[2] = { text: "good" };
  assert.equal(
    head.extractClaudeNativeSessionHeadInfo([
      user("hidden", { isMeta: true }),
      assistant("error", { isApiErrorMessage: true, cwd: "/error" }),
      assistant("placeholder", { model: " <synthetic> ", cwd: "/placeholder" }),
      user(content, { isMeta: 1, cwd: "/good" }),
    ]).workspacePath,
    "/good",
  );
  assert.equal(head.extractClaudeNativeSessionHeadInfo([user(content)]).previewTitle, "good");
});
for (const [timestamp, expected] of [
  [1000000000, undefined],
  [1000000001, 1000000001000],
  [1000000000000, 1000000000000000],
  [1000000000001.9, 1000000000001],
  ["1700000000.5", 1700000000500],
  [" 2026-01-01T00:00:00Z ", 1767225600000],
  [Infinity, undefined],
  ["NaN", undefined],
  ["", undefined],
] as const) {
  test(`head timestamp ${String(timestamp)}`, () =>
    assert.equal(
      head.extractClaudeNativeSessionHeadInfo([user("x", { timestamp })]).createdAt,
      expected,
    ));
}
test("head nested timestamp/cwd fallback and first valid candidate wins", () => {
  assert.deepEqual(
    head.extractClaudeNativeSessionHeadInfo([
      {
        type: "user",
        timestamp: "bad",
        createdAt: 1700000000,
        message: { content: "x", cwd: " /message ", timestamp: 1800000000 },
        request: { cwd: "/request", timestamp: 1900000000 },
      },
    ]),
    { workspacePath: "/message", previewTitle: "x", createdAt: 1700000000000 },
  );
  assert.deepEqual(head.extractClaudeNativeSessionHeadInfo([assistant("x", { cwd: "/a" })]), {
    workspacePath: "/a",
  });
});
test("sidechain any marker uses strict true, short circuits and skips holes", () => {
  assert.equal(
    head.hasClaudeNativeSidechainMarker([
      { type: "user", isSidechain: 1 },
      user("x", { message: { content: "x", isSidechain: true } }),
    ]),
    true,
  );
  assert.equal(head.hasClaudeNativeSidechainMarker([{ request: { isSidechain: true } }]), true);
  const sparse: Record<string, unknown>[] = [];
  sparse.length = 2;
  assert.equal(head.hasClaudeNativeSidechainMarker(sparse), false);
  assert.throws(() => head.extractClaudeNativeSessionHeadInfo(sparse), TypeError);
  assert.throws(() => head.hasClaudeNativeSidechainMarker([null as never]), TypeError);
});

for (const [workspace, session, expected] of [
  ["/synthetic/project", "fixture-session", "claude-import-d9c1afb654bbe402e8c0b6e6"],
  ["", "", "claude-import-0d7717e9f45611a250f0b8a0"],
  ["/a/../b", " s ", "claude-import-4668d023f3f9c99870cd14e5"],
  ["雪🙂", "é", "claude-import-20890dc4eae0e6f04c3e4507"],
  ["\ud800", "\udc00", "claude-import-ea4f7f715c27587cb739ba15"],
  [null, 5, "claude-import-070f435da3b411ba51463113"],
] as const) {
  test(`stable identity ${JSON.stringify([workspace, session])}`, () =>
    assert.equal(build.buildImportedClaudeTaskId(workspace as never, session as never), expected));
}
test("identity coercion order and Symbol failure stay native", () => {
  const calls: string[] = [];
  const input = (label: string) => ({
    [Symbol.toPrimitive](hint: string) {
      calls.push(`${label}:${hint}`);
      return label;
    },
  });
  build.buildImportedClaudeTaskId(input("workspace") as never, input("session") as never);
  assert.deepEqual(calls, ["workspace:string", "session:string"]);
  assert.throws(() => build.buildImportedClaudeTaskId(Symbol("x") as never, "s"), TypeError);
});
test("builder getter order, ignored source fields and failure-stage trace count", (t) => {
  const count = stableTrace(t);
  const calls: string[] = [];
  const value = new Proxy(source(), {
    get(target, key, receiver) {
      calls.push(String(key));
      if (key === "provider" || key === "sourcePath") throw new Error("not projection inputs");
      return Reflect.get(target, key, receiver);
    },
  });
  build.buildImportedClaudeTaskFile(value);
  assert.deepEqual(calls, [
    "messages",
    "workspacePath",
    "sessionId",
    "createdAt",
    "createdAt",
    "updatedAt",
    "updatedAt",
    "title",
    "messages",
    "workspacePath",
    "model",
    "messages",
  ]);
  assert.equal(count(), 1);
  assert.throws(() => build.buildImportedClaudeTaskFile(source({ title: 1 }) as never), TypeError);
  assert.equal(count(), 2);
});

test("builder exact metadata/message serialization, defaults and trace count", (t) => {
  const count = stableTrace(t);
  const value = source({
    model: "m",
    unknown: "not copied",
    messages: [
      {
        role: "user",
        content: "Hello",
        timestamp: 1700000000123,
        turnIndex: 0,
        model: "old",
        unknown: { keep: 1 },
      },
    ],
  });
  const result = build.buildImportedClaudeTaskFile(value);
  assert.equal(
    JSON.stringify(result),
    `{"meta":{"taskId":"${build.buildImportedClaudeTaskId(value.workspacePath, value.sessionId)}","traceId":"00000000-0000-4000-8000-000000000001","title":"Hello","workspacePath":"/synthetic/project","createdAt":1700000000123,"updatedAt":1700000000999,"migrationSource":"claudeCode","status":"completed"},"messages":[{"role":"user","content":"Hello","timestamp":1700000000123,"turnIndex":0,"unknown":{"keep":1}}]}`,
  );
  assert.equal(count(), 1);
  assert.equal((value.messages[0] as unknown as { model: string }).model, "old");
  assert.ok(codec.safeParseLegacyTaskSessionFile(result).success);
});
test("builder title, nullish override and custom filter retain exact fields", (t) => {
  stableTrace(t);
  const result = build.buildImportedClaudeTaskFile(
    source({ title: " Explicit ", model: "m" }),
    [],
    "",
  );
  assert.equal(result.meta.taskId, "");
  assert.equal(result.meta.title, "Explicit");
  assert.equal(result.meta.mode, "build");
  assert.equal(result.meta.model, "m");
  assert.equal(
    build.buildImportedClaudeTaskFile(
      source({ title: " ", messages: [{ role: "assistant", content: "x", timestamp: 1 }] }),
    ).meta.title,
    "Imported session",
  );
  assert.equal(
    build.buildImportedClaudeTaskFile(
      source({ messages: [{ role: "user", content: "  body ", timestamp: 1 }] }),
    ).meta.title,
    "  body ",
  );
});
test("builder nonfinite clocks, input sparse slots and clone-before-filter errors", (t) => {
  const count = stableTrace(t);
  const sparse: unknown[] = [];
  sparse.length = 1;
  const result = build.buildImportedClaudeTaskFile(
    source({ title: "Explicit", createdAt: NaN, updatedAt: Infinity, messages: sparse }) as never,
    [],
  );
  assert.equal(result.meta.createdAt, Infinity);
  assert.equal(result.meta.updatedAt, Infinity);
  assert.equal(0 in result.messages, true);
  assert.equal(result.messages[0], undefined);
  assert.throws(() => build.buildImportedClaudeTaskFile(source({ model: () => {} }) as never), {
    name: "DataCloneError",
  });
  assert.equal(count(), 2);
  assert.throws(
    () => build.buildImportedClaudeTaskFile(source({ messages: sparse }) as never),
    TypeError,
  );
  assert.equal(count(), 3);
  assert.throws(
    () => build.buildImportedClaudeTaskFile(source({ messages: [] }) as never),
    error("Error", "[claude-native] external session fixture-session 没有可导入的可见消息"),
  );
  assert.equal(count(), 3);
});
test("builder default filter list remains mutable without stale cache", (t) => {
  stableTrace(t);
  const paths = filter.DEFAULT_IMPORTED_CLAUDE_TASK_FILTER_PATHS as unknown as string[];
  const prior = paths.slice();
  try {
    paths.length = 0;
    assert.equal(build.buildImportedClaudeTaskFile(source()).meta.mode, "build");
  } finally {
    paths.splice(0, paths.length, ...prior);
  }
});

test("real full import parser keeps message chronology, API-error difference and builder codec", async (t) => {
  stableTrace(t);
  const entries = [
    user("first", { cwd: "/from-record", timestamp: 1700000000 }),
    assistant("A", { model: "m", timestamp: 1700000001 }),
    assistant("B", { timestamp: 1700000002 }),
    user("next", { timestamp: 1699999999 }),
    assistant("API Error: sample", { isApiErrorMessage: true, timestamp: 1700000003 }),
  ];
  const { path } = await fixture(t, entries.map((entry) => JSON.stringify(entry)).join("\n"));
  const result = await parser.parseClaudeNativeSessionFile({
    filePath: path,
    workspacePath: "/fallback",
    sessionId: "fixture",
    fallbackCreatedAt: 1,
    fallbackUpdatedAt: 2,
  });
  assert.equal(result.workspacePath, "/from-record");
  assert.equal(result.createdAt, 1700000000000);
  assert.deepEqual(
    result.messages.map((message) => [message.role, message.content, message.turnIndex]),
    [
      ["user", "first", 0],
      ["assistant", "AB", 0],
      ["user", "next", 1],
      ["assistant", "API Error: sample", 1],
    ],
  );
  const built = build.buildImportedClaudeTaskFile(result);
  assert.ok(codec.safeParseLegacyTaskSessionFile(built).success);
  assert.equal(built.meta.migrationSource, "claudeCode");
});
test("real import repository scan preserves sort/filter/ignored directories and dirty tails", async (t) => {
  const { dir } = await fixture(t, "");
  const projects = join(dir, "projects");
  await mkdir(projects);
  const entry = (text: string, cwd = "/synthetic/project") =>
    JSON.stringify(user(text, { cwd, timestamp: 1700000000 }));
  for (const [name, text, mtime] of [
    ["older", entry("Old"), 1700000001],
    ["newer", entry("New"), 1700000003],
    ["sidechain", entry("Side") + "\n" + JSON.stringify({ isSidechain: true }), 1700000004],
    ["other", entry("Other", "/other"), 1700000005],
    ["broken", "bad", 1700000006],
  ] as const) {
    const path = join(projects, `${name}.jsonl`);
    await writeFile(path, text);
    await utimes(path, mtime, mtime);
  }
  const tailPath = join(projects, "dirty-tail.jsonl");
  await writeFile(
    tailPath,
    [
      entry("Tail", "/tail"),
      ...Array(15).fill('{"type":"progress"}'),
      '{"isSidechain":true}',
      '{"cut":',
    ].join("\n"),
  );
  await utimes(tailPath, 1700000002, 1700000002);
  await mkdir(join(projects, "subagents"));
  await writeFile(join(projects, "subagents", "hidden.jsonl"), entry("hidden"));
  const owner = importRepo as unknown as { getNativeProjectsRoots: () => string[] };
  const prior = owner.getNativeProjectsRoots;
  owner.getNativeProjectsRoots = () => [projects];
  t.after(async () => {
    owner.getNativeProjectsRoots = prior;
  });
  const result = await importRepo.scanImportableSessions({ workspacePath: "/synthetic/project" });
  assert.deepEqual(
    result.map((item) => [item.sessionId, item.previewTitle, item.createdAt]),
    [
      ["newer", "New", 1700000000000],
      ["older", "Old", 1700000000000],
    ],
  );
  assert.deepEqual(
    (
      await importRepo.scanImportableSessions({ workspacePath: "/synthetic/project", limit: 1 })
    ).map((item) => item.sessionId),
    ["newer"],
  );
  assert.deepEqual(
    (
      await importRepo.scanImportableSessions({
        workspacePath: "/synthetic/project",
        modifiedSince: 1700000002000,
      })
    ).map((item) => item.sessionId),
    ["newer"],
  );
  assert.deepEqual(
    (await importRepo.scanImportableSessions({ workspacePath: "/tail" })).map((item) => [
      item.sessionId,
      item.previewTitle,
    ]),
    [["dirty-tail", "Tail"]],
  );
  await assert.rejects(history.readJsonLinesFile(tailPath));
  assert.equal(
    await importRepo.findImportableSession({
      workspacePath: "/synthetic/project",
      sessionId: "sidechain",
    }),
    null,
  );
});
