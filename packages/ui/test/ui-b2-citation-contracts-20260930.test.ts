// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const url = process.env.KNORVIA_UI_B2_LIB_DIR
  ? pathToFileURL(
      resolve(
        process.env.KNORVIA_UI_B2_LIB_DIR,
        `fileCitation.${process.env.KNORVIA_UI_B2_LIB_EXT ?? "ts"}`,
      ),
    ).href
  : new URL("../src/lib/fileCitation.js", import.meta.url).href;
const {
  FILE_CITATION_DIRECTIVE_NAMES: names,
  extractKnorviaFileCitationDirectives: directives,
  extractKnorviaFileCitations: citations,
  projectKnorviaFileCitations: project,
  resolveKnorviaFileCitationPreviewKind: preview,
} = await import(url);

test("B2 citation: retained names, source order, UTF-16 offsets and raw slices", () => {
  assert.deepEqual(names, ["knorvia-file-citation", "zcode-file-citation"]);
  const first =
    '::zcode-file-citation{path=" old.pdf " purpose=" source " artifact_kind="document"}';
  const second = ':knorvia-file-citation{path="new.docx" purpose="" artifact_kind=""}';
  const input = `🌙 ${first}\n${second}`;
  assert.deepEqual(directives(input), [
    {
      start: 3,
      end: 3 + first.length,
      raw: first,
      path: "old.pdf",
      purpose: " source ",
      artifactKind: "document",
    },
    {
      start: 4 + first.length,
      end: input.length,
      raw: second,
      path: "new.docx",
      purpose: "",
      artifactKind: "",
    },
  ]);
  assert.deepEqual(citations(input), directives(input));
});

const parsedCases: Array<[string, string, Record<string, unknown>]> = [
  ["double colon", '::knorvia-file-citation{path="a.pdf"}', { path: "a.pdf" }],
  ["single colon", ':knorvia-file-citation{path="a.pdf"}', { path: "a.pdf" }],
  ["triple colon", ':::knorvia-file-citation{path="a.pdf"}', { path: "a.pdf" }],
  ["smart double quote", "::knorvia-file-citation{path=“a b.pdf”}", { path: "a b.pdf" }],
  ["smart single quote", "::knorvia-file-citation{path=‘a b.pdf’}", { path: "a b.pdf" }],
  ["single quote", "::knorvia-file-citation{path='a b.pdf'}", { path: "a b.pdf" }],
  [
    "unquoted and comma separators",
    "::knorvia-file-citation {path=a.pdf,purpose=output}",
    { path: "a.pdf", purpose: "output" },
  ],
  ["last duplicate value", "::knorvia-file-citation{path=a.pdf path=b.pdf}", { path: "b.pdf" }],
  [
    "empty optional fields",
    '::knorvia-file-citation{path=" " purpose="" artifact_kind=" "}',
    { purpose: "", artifactKind: " " },
  ],
  ["absent path", "::knorvia-file-citation{purpose=output}", { purpose: "output" }],
  ["unknown field omitted", "::knorvia-file-citation{path=a.pdf extra=ignored}", { path: "a.pdf" }],
  [
    "malformed parameter consumes directive interval",
    "::knorvia-file-citation{path=a.pdf broken}",
    {},
  ],
  ["quoted brace retained", '::knorvia-file-citation{path="a}b.pdf"}', { path: "a}b.pdf" }],
  [
    "unknown escapes retain Windows separators",
    String.raw`::knorvia-file-citation{path="C:\Users\fixture\a.pdf"}`,
    { path: String.raw`C:\Users\fixture\a.pdf` },
  ],
  [
    "known slash and quote escapes",
    String.raw`::knorvia-file-citation{path="a\\b\"c.pdf"}`,
    { path: 'a\\b"c.pdf' },
  ],
  [
    "leading backslash is not an extractor escape",
    String.raw`\::knorvia-file-citation{path=a.pdf}`,
    { path: "a.pdf" },
  ],
];
for (const [name, input, fields] of parsedCases) {
  test(`B2 citation: ${name}`, () => {
    const records = directives(input);
    assert.equal(records.length, 1);
    const record = records[0]!;
    assert.deepEqual(record, {
      start: input.indexOf(":"),
      end: input.length,
      raw: input.slice(input.indexOf(":")),
      ...fields,
    });
    assert.equal(citations(input).length, typeof fields.path === "string" ? 1 : 0);
    assert.deepEqual(Object.keys(record), ["start", "end", "raw", ...Object.keys(fields)]);
  });
}

for (const input of [
  "",
  "  ",
  "::::knorvia-file-citation{path=a.pdf}",
  "::KNORVIA-file-citation{path=a.pdf}",
  "::knorvia-file-citation-other{path=a.pdf}",
  '::knorvia-file-citation{path="unclosed}',
  "::knorvia-file-citation{path=a.pdf",
]) {
  test(`B2 citation: incomplete or unrelated syntax stays unparsed ${JSON.stringify(input)}`, () =>
    assert.deepEqual(directives(input), []));
}

test("B2 citation: full extractor retains code examples; streaming owner protects code", () => {
  const complete = "::knorvia-file-citation{path=a.pdf}";
  assert.equal(citations(`\`${complete}\``).length, 1);
  for (const input of [
    '`::knorvia-file-citation{path="a`',
    '```text\n::knorvia-file-citation{path="a',
    "~~~\n::zcode-file-citation{path=",
    "<code>::knorvia-file-citation{path=</code>",
    "<pre>::knor</pre>",
  ]) {
    assert.deepEqual(project(input, { streaming: true }), { visibleText: input });
  }
});

test("B2 citation: streaming preserves complete text and cuts supported tail prefixes", () => {
  for (const suffix of [
    "::",
    "::knor",
    ":::knor",
    ":knorv",
    "::zcode-file-citation",
    "::code-com",
    "::knorvia-file-citation{path=",
    ':::zcode-file-citation{path="a',
    ":knorvia-file-citation{path=“a",
  ]) {
    const input = `Result  ${suffix}`;
    assert.deepEqual(project(input, { streaming: true }), { visibleText: "Result  " }, suffix);
    assert.deepEqual(project(input, { streaming: false }), { visibleText: input });
  }
  for (const suffix of [
    ":knor",
    "::::knor",
    "::unrelated",
    "::knorvia-file-citation{path=a.pdf}",
    '::knorvia-file-citation{path="a.pdf"\nordinary prose.',
  ]) {
    const input = `Result ${suffix}`;
    assert.deepEqual(project(input, { streaming: true }), { visibleText: input }, suffix);
  }
  assert.deepEqual(
    project('Result ::knorvia-file-citation{path="a.pdf"\nordinary prose', { streaming: true }),
    { visibleText: "Result " },
  );
});

test("B2 citation: preview-kind extension agreement and exact suffix semantics", () => {
  const formats = {
    docx: "docx",
    xlsx: "xlsx",
    pptx: "pptx",
    pdf: "pdf",
    mp4: "video",
    mov: "video",
    webm: "video",
    m4v: "video",
    mp3: "audio",
    wav: "audio",
    m4a: "audio",
    ogg: "audio",
    opus: "audio",
    flac: "audio",
    weba: "audio",
  };
  for (const [extension, kind] of Object.entries(formats)) {
    assert.equal(preview({ path: ` A.${extension.toUpperCase()} ` }), kind);
    for (const suffix of ["?query", "#hash", ":10", "/"])
      assert.equal(preview({ path: `a.${extension}${suffix}` }), null);
  }
  for (const [artifactKind, path, result] of [
    [" document ", "a.docx", "docx"],
    ["WORKBOOK", "a.xlsx", "xlsx"],
    ["presentation", "a.pptx", "pptx"],
    ["video", "a.mp4", "video"],
    ["audio", "a.flac", "audio"],
    ["document", "a.pdf", null],
    ["pdf", "a.pdf", null],
    ["", "a.docx", null],
    ["constructor", "a.docx", null],
    ["video", "a.mp3", null],
  ]) {
    assert.equal(preview({ artifactKind, path }), result);
  }
});

test("B2 citation: unsupported runtime inputs keep public failures", () => {
  assert.throws(() => directives(undefined), TypeError);
  assert.throws(() => project("text", null), TypeError);
  assert.throws(() => preview({ path: null }), TypeError);
  assert.throws(() => preview({ path: "a.pdf", artifactKind: null }), TypeError);
});
