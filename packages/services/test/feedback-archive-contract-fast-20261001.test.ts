// Frozen against the inherited entrypoint before replacing it. Source exposure is disclosed.
import assert from "node:assert/strict";
import { link, readdir, stat } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { arch, platform, release } from "node:os";
import { test } from "node:test";
import { KNORVIA_VERSION, KNORVIA_COMMIT } from "@knorvia/shared";
import {
  archiveFixture,
  archiveEntries,
  archiveAbout,
  archiveSkips,
  archiveNow,
} from "./feedback-archive-fixtures-fast-20261001.js";

const emitted = process.env.KNORVIA_FEEDBACK_ARCHIVE_TARGET === "dist";
const {
  createFeedbackDiagnosticArchive: archive,
}: typeof import("../src/feedback/feedbackLogArchive.js") = await import(
  process.env.KNORVIA_FEEDBACK_ARCHIVE_MODULE ??
    new URL(
      `../${emitted ? "dist" : "src"}/feedback/feedbackLogArchive.${emitted ? "js" : "ts"}`,
      import.meta.url,
    ).href
);

test("empty archive metadata, output naming, progress and private creation mode", async (t) => {
  const f = await archiveFixture(t);
  const progress: object[] = [];
  let dates = 0;
  const result = await archive({
    sources: [],
    outputRootDir: f.outputRootDir,
    now: () => {
      dates++;
      return archiveNow;
    },
    onProgress: (event) => progress.push(event),
  });
  assert.equal(dates, 1);
  assert.equal(basename(result.path), "knorvia-diagnostic-logs.zip");
  assert.match(basename(dirname(result.path)), /^archive-/);
  assert.equal(dirname(dirname(result.path)), f.outputRootDir);
  const info = await stat(result.path);
  assert.equal(result.size, info.size);
  if (process.platform !== "win32") assert.equal(info.mode & 0o777, 0o600);
  assert.deepEqual(progress, [
    { processedBytes: 0, totalBytes: 0 },
    { processedBytes: result.size, totalBytes: result.size },
  ]);
  const entries = await archiveEntries(result.path);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["about.txt"],
  );
  assert.equal(
    archiveAbout(entries),
    [
      "Knorvia Studio diagnostic logs",
      `timestamp: ${archiveNow.toISOString()}`,
      `appVersion: ${KNORVIA_VERSION}`,
      `commit: ${KNORVIA_COMMIT}`,
      `node: ${process.version}`,
      `os: ${platform()} ${release()} (${arch()})`,
      "includedLogFiles: 0",
      "skippedLogFiles: 0",
      "skippedLogFilesByReason: {}",
      "Scope: diagnostic text log files modified today (local time); credentials and structured payloads redacted.",
    ].join("\n"),
  );
});

test("ZIP keeps source order, sorted depth-first siblings, duplicate names and POSIX prefixes", async (t) => {
  const f = await archiveFixture(t);
  await f.file("z.log", "z");
  await f.file("a/inside.log", "inside");
  await f.file("b.log", "b");
  const result = await archive({
    sources: [
      { directory: f.source, archivePrefix: "second/./logs" },
      { directory: f.source, archivePrefix: "first" },
      { directory: f.source, archivePrefix: "first" },
    ],
    outputRootDir: f.outputRootDir,
    now: () => archiveNow,
  });
  const entries = await archiveEntries(result.path);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    [
      "second/logs/a/inside.log",
      "second/logs/b.log",
      "second/logs/z.log",
      "first/a/inside.log",
      "first/b.log",
      "first/z.log",
      "first/a/inside.log",
      "first/b.log",
      "first/z.log",
      "about.txt",
    ],
  );
  assert.deepEqual(
    entries.slice(0, 3).map((entry) => entry.data.toString()),
    ["inside", "b", "z"],
  );
});

test("normal and exit-only extension admission stays distinct and ignores private files", async (t) => {
  const f = await archiveFixture(t);
  for (const name of [
    "a.LOG",
    "b.log.12",
    "c.JSONL",
    "d.NDJSON",
    "e.exit.log",
    "f.EXIT.LOG",
    "g.log.gz",
    "h.log.bad",
    "credentials.json",
    "broker.tokens",
    "raw.dmp",
    "nested/child.exit.log",
  ])
    await f.file(name, "synthetic");
  const result = await archive({
    sources: [
      { directory: f.source, archivePrefix: "normal" },
      { directory: f.source, archivePrefix: "exit", exitLogsOnly: true },
    ],
    outputRootDir: f.outputRootDir,
    now: () => archiveNow,
  });
  const entries = await archiveEntries(result.path);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    [
      "normal/a.LOG",
      "normal/b.log.12",
      "normal/c.JSONL",
      "normal/d.NDJSON",
      "normal/e.exit.log",
      "normal/f.EXIT.LOG",
      "normal/nested/child.exit.log",
      "exit/e.exit.log",
      "about.txt",
    ],
  );
  assert.deepEqual(archiveSkips(entries), {});
});

test("local natural day includes midnight and excludes the next midnight", async (t) => {
  const f = await archiveFixture(t);
  const start = new Date(archiveNow.getFullYear(), archiveNow.getMonth(), archiveNow.getDate());
  const end = new Date(archiveNow.getFullYear(), archiveNow.getMonth(), archiveNow.getDate() + 1);
  await f.file("a.log", "start", start);
  await f.file("b.log", "last", new Date(end.getTime() - 1));
  await f.file("c.log", "prior", new Date(start.getTime() - 1));
  await f.file("d.log", "next", end);
  const result = await archive({
    sources: [{ directory: f.source, archivePrefix: "logs" }],
    outputRootDir: f.outputRootDir,
    now: () => archiveNow,
  });
  const entries = await archiveEntries(result.path);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["logs/a.log", "logs/b.log", "about.txt"],
  );
  assert.deepEqual(archiveSkips(entries), { "metadata-policy": 2 });
});

test("DST days use calendar boundaries rather than a 24-hour window", async (t) => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
  for (const [month, date, hours] of [
    [2, 8, 23],
    [10, 1, 25],
  ]) {
    const now = new Date(2026, month!, date!, 12);
    const start = new Date(2026, month!, date!);
    const end = new Date(2026, month!, date! + 1);
    assert.equal(end.getTime() - start.getTime(), hours! * 3600000);
    const f = await archiveFixture(t);
    await f.file("a.log", "last", new Date(end.getTime() - 1));
    await f.file("b.log", "next", end);
    const result = await archive({
      sources: [{ directory: f.source, archivePrefix: "logs" }],
      outputRootDir: f.outputRootDir,
      now: () => now,
    });
    const entries = await archiveEntries(result.path);
    assert.deepEqual(
      entries.map((entry) => entry.name),
      ["logs/a.log", "about.txt"],
    );
    assert.deepEqual(archiveSkips(entries), { "metadata-policy": 1 });
  }
});

test("strict encodings preserve useful text and never fall back to unsupported bytes", async (t) => {
  const f = await archiveFixture(t);
  const text = "synthetic 文本\tline\n";
  const le = Buffer.from(text, "utf16le");
  await f.file("a.log", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]));
  await f.file("b.log", Buffer.concat([Buffer.from([0xff, 0xfe]), le]));
  await f.file("c.log", Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(le).swap16()]));
  await f.file("d.log", Buffer.from([0xc3, 0x28]));
  await f.file("e.log", "synthetic\0private");
  await f.file("f.log", le);
  await f.file("g.log", "synthetic\x01private");
  await f.file("h.log", "tab\tcr\rlf\ndel\x7f");
  const result = await archive({
    sources: [{ directory: f.source, archivePrefix: "logs" }],
    outputRootDir: f.outputRootDir,
    now: () => archiveNow,
  });
  const entries = await archiveEntries(result.path);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["logs/a.log", "logs/b.log", "logs/c.log", "logs/h.log", "about.txt"],
  );
  assert.deepEqual(
    entries.slice(0, 3).map((entry) => entry.data.toString()),
    [text, text, text],
  );
  assert.deepEqual(archiveSkips(entries), { "unsupported-text": 4 });
});

test("actual archive redacts synthetic credentials, bodies, email and diagnostic URLs", async (t) => {
  const f = await archiveFixture(t);
  const secrets = [
    "fake-password-never-export",
    "sk-abcdefghijklmnopqrstuvwxyz123456",
    "FAKE_PRIVATE_KEY_BODY",
    "synthetic-body-never-export",
    "fixture.person@example.invalid",
    "synthetic-url-path-never-export",
  ];
  await f.file(
    "privacy.log",
    [
      "useful lifecycle line",
      `password=${secrets[0]}`,
      `apiKey=${secrets[1]}`,
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      secrets[2],
      "-----END OPENSSH PRIVATE KEY-----",
      JSON.stringify({ status: "ready", payload: { nested: secrets[3] } }),
      `contact ${secrets[4]}`,
      `URL https://example.invalid/${secrets[5]}?token=synthetic-query`,
      "useful final line",
    ].join("\n"),
  );
  const result = await archive({
    sources: [{ directory: f.source, archivePrefix: "logs" }],
    outputRootDir: f.outputRootDir,
    now: () => archiveNow,
  });
  const all = (await archiveEntries(result.path)).map((entry) => entry.data.toString()).join("\n");
  for (const secret of secrets) assert.equal(all.includes(secret!), false);
  assert.match(all, /useful lifecycle line/);
  assert.match(all, /useful final line/);
  assert.match(all, /\[REDACTED\]/);
  assert.equal(all.includes(f.source), false);
});

test("budget admission retains zero, negative, NaN, Infinity and expansion semantics", async (t) => {
  for (const [budget, expected, reason] of [
    [0, 0, "metadata-policy"],
    [-1, 0, "metadata-policy"],
    [NaN, 1, ""],
    [Infinity, 1, ""],
    [7, 0, "redacted-size-limit"],
    [16, 1, ""],
  ] as const) {
    const f = await archiveFixture(t);
    await f.file("a.log", "token=x");
    const result = await archive({
      sources: [{ directory: f.source, archivePrefix: "logs" }],
      outputRootDir: f.outputRootDir,
      now: () => archiveNow,
      maxTotalBytes: budget,
    });
    const entries = await archiveEntries(result.path);
    assert.equal(entries.length - 1, expected);
    assert.deepEqual(archiveSkips(entries), reason ? { [reason]: 1 } : {});
  }
});

test("cost charges original bytes when redaction shrinks the first log", async (t) => {
  const f = await archiveFixture(t);
  const original = JSON.stringify({ content: "synthetic private body ".repeat(20) });
  await f.file("a.log", original);
  await f.file("b.log", "useful");
  const result = await archive({
    sources: [{ directory: f.source, archivePrefix: "logs" }],
    outputRootDir: f.outputRootDir,
    now: () => archiveNow,
    maxTotalBytes: Buffer.byteLength(original) + 5,
  });
  const entries = await archiveEntries(result.path);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["logs/a.log", "about.txt"],
  );
  assert.deepEqual(archiveSkips(entries), { "metadata-policy": 1 });
});

test("per-file eight-MiB limit, hardlinks and depth-five files are excluded", async (t) => {
  const f = await archiveFixture(t);
  await f.file("a.log", Buffer.alloc(8 * 1024 * 1024 + 1, 65));
  const linked = await f.file("b.log", "owned hardlink content");
  await link(linked, join(f.source, "c.log"));
  await f.file("l1/l2/l3/l4/accepted.log", "depth four");
  await f.file("l1/l2/l3/l4/l5/rejected.log", "depth five");
  const result = await archive({
    sources: [{ directory: f.source, archivePrefix: "logs" }],
    outputRootDir: f.outputRootDir,
    now: () => archiveNow,
  });
  const entries = await archiveEntries(result.path);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["logs/l1/l2/l3/l4/accepted.log", "about.txt"],
  );
  assert.deepEqual(archiveSkips(entries), { "metadata-policy": 3 });
});

test("initial and final progress callback failures reject identically and remove owned output", async (t) => {
  for (const failOn of [1, 2]) {
    const f = await archiveFixture(t);
    await f.file("a.log", "useful");
    let calls = 0;
    const failure = new Error(`synthetic progress ${failOn}`);
    await assert.rejects(
      archive({
        sources: [{ directory: f.source, archivePrefix: "logs" }],
        outputRootDir: f.outputRootDir,
        now: () => archiveNow,
        onProgress: () => {
          if (++calls === failOn) throw failure;
        },
      }),
      (error) => error === failure,
    );
    assert.deepEqual(await readdir(f.outputRootDir), []);
    assert.equal(calls, failOn);
  }
});

test("missing sources are tolerated and output-root native failures are not wrapped", async (t) => {
  const f = await archiveFixture(t);
  const result = await archive({
    sources: [{ directory: join(f.source, "missing"), archivePrefix: "logs" }],
    outputRootDir: f.outputRootDir,
    now: () => archiveNow,
  });
  assert.deepEqual(
    (await archiveEntries(result.path)).map((entry) => entry.name),
    ["about.txt"],
  );
  const path = await f.file("root-file.log", "synthetic root conflict");
  await assert.rejects(
    archive({ sources: [], outputRootDir: path, now: () => archiveNow }),
    (error: NodeJS.ErrnoException) => error.code === "EEXIST" || error.code === "ENOTDIR",
  );
});
