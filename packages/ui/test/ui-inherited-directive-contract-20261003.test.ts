// SPDX-License-Identifier: Apache-2.0
// Source-exposed behavior contracts; retained syntax and streaming compatibility are intentional.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractAssistantDirectives,
  findAssistantDirectivePrefixStart,
  findMarkdownCodeRanges,
  findUnclosedAssistantDirectiveStart,
  overlapsAssistantTextRanges,
} from "../src/lib/assistantDirectiveParser.js";
import { projectKnorviaFileCitations } from "../src/lib/fileCitation.js";

const permissive = { allowSingleColon: true, allowTripleColon: true, allowSmartQuotes: true };

test("directive coordinates, duplicate parameters, brace quoting and Windows escapes remain exact", () => {
  const raw = String.raw`::file{path="C:\users\new folder\x.ts",note='a}b',path="D:\last\x.ts" quote="a\"b\\c\q"}`;
  const source = `before ${raw} after`;
  const [directive] = extractAssistantDirectives(source, "file");
  assert.deepEqual(directive, {
    start: 7,
    end: 7 + raw.length,
    name: "file",
    raw,
    parameters: { path: String.raw`D:\last\x.ts`, note: "a}b", quote: String.raw`a"b\c\q` },
  });
});

test("strict and opted-in colon/quote grammar preserve the original protocols", () => {
  const source =
    ':file{p=“folder with space”} ::file{p="strict"} :::file{p=‘中文 路径’} ::::file{p=no} ::File{p=no}';
  assert.deepEqual(
    extractAssistantDirectives(source, "file").map((d) => d.parameters),
    [{ p: "strict" }],
  );
  assert.deepEqual(
    extractAssistantDirectives(source, "file", permissive).map((d) => d.parameters),
    [{ p: "folder with space" }, { p: "strict" }, { p: "中文 路径" }],
  );
  assert.equal(extractAssistantDirectives("::a.b{x=ok} ::axb{x=no}", "a.b").length, 1);
});

test("closed invalid parameters keep raw directives; empty bodies and separators remain compatible", () => {
  const bodies = [
    "",
    " , \t",
    "key=one, _x-2='two'",
    'key="x"tail',
    "key=",
    "2key=x",
    "key=x prose",
    "key=x;other=y",
  ];
  assert.deepEqual(
    bodies.map((body) => extractAssistantDirectives(`::file{${body}}`, "file")[0]?.parameters),
    [{}, {}, { key: "one", "_x-2": "two" }, null, null, null, null, { key: "x;other=y" }],
  );
  assert.deepEqual(extractAssistantDirectives("  ", "file"), []);
});

test("closed outer spans consume nested candidates while incomplete quoted starts do not", () => {
  const nested = '::file{p="::file{x=inside}"} ::file{x=outside}';
  assert.deepEqual(
    extractAssistantDirectives(nested, "file").map((d) => d.parameters),
    [{ p: "::file{x=inside}" }, { x: "outside" }],
  );
  assert.deepEqual(
    extractAssistantDirectives('::file{p="unterminated ::file{x=ok}', "file").map(
      (d) => d.parameters,
    ),
    [{ x: "ok" }],
  );
});

test("fenced, HTML and inline code ranges preserve newline coordinates and merging", () => {
  const fence = "  ```ts\n::file{x=hidden}\n ````extra\n";
  const source = `lead\n${fence}outside \`inline\` <code class=x>html</code><pre>x</pre>\n~~~\nopen`;
  const inlineStart = source.indexOf("`inline`");
  const htmlStart = source.indexOf("<code");
  const openFence = source.indexOf("~~~");
  assert.deepEqual(findMarkdownCodeRanges(source), [
    [5, 5 + fence.length],
    [inlineStart, inlineStart + 8],
    [htmlStart, source.indexOf("</pre>") + 6],
    [openFence, source.length],
  ]);
  assert.equal(overlapsAssistantTextRanges(4, 5, [[5, 10]]), false);
  assert.equal(overlapsAssistantTextRanges(9, 11, [[5, 10]]), true);
  assert.deepEqual(findMarkdownCodeRanges("    ```\nplain"), []);
  assert.deepEqual(findMarkdownCodeRanges("`before\n```\ninside\n```\nafter`"), [[8, 23]]);
});

test("streaming unfinished parameters hide only a viable suffix and leave prose visible", () => {
  for (const tail of [
    "",
    "path",
    "path =",
    'path="open',
    "path=unquoted",
    'path="closed" , next',
  ]) {
    assert.equal(findUnclosedAssistantDirectiveStart(`hello ::file{${tail}`, "file"), 6, tail);
  }
  assert.equal(
    findUnclosedAssistantDirectiveStart('hello ::file{path="closed" ordinary prose.', "file"),
    null,
  );
  // 旧尾部规则只判断最后一个 bare word；无标点末词仍被当作未完成参数名。
  assert.equal(
    findUnclosedAssistantDirectiveStart('hello ::file{path="closed" ordinary prose', "file"),
    6,
  );
  assert.equal(findUnclosedAssistantDirectiveStart("hello ::file{x=ok}", "file"), null);
  const protectedSource = "```\n::file{path=\n```";
  assert.equal(
    findUnclosedAssistantDirectiveStart(
      protectedSource,
      "file",
      findMarkdownCodeRanges(protectedSource),
    ),
    null,
  );
});

test("streaming name prefixes retain per-name opt-ins and minimum length", () => {
  const options = {
    singleColonDirectiveNames: ["file"],
    tripleColonDirectiveNames: ["file"],
    minimumSingleColonPrefixLength: 4,
  };
  const tails = [
    ":",
    "::",
    "::fi",
    "::file  ",
    "::files",
    ":fi",
    ":fil",
    ":::fi",
    "::::fi",
    "::file{",
  ];
  assert.deepEqual(
    tails.map((t) => findAssistantDirectivePrefixStart(`hello ${t}`, ["file"], [], options)),
    [null, 6, 6, 6, null, null, 6, 6, null, null],
  );
  assert.equal(findAssistantDirectivePrefixStart("hello ::fi", ["file"], [[6, 10]]), null);
});

test("actual citation consumer preserves stored legacy names, Markdown code and prose", () => {
  assert.equal(
    projectKnorviaFileCitations("Hello :::zcode-file-cit", { streaming: true }).visibleText,
    "Hello ",
  );
  assert.equal(
    projectKnorviaFileCitations("Hello :knorvia-file-citation{path=“C:\\new folder", {
      streaming: true,
    }).visibleText,
    "Hello ",
  );
  const code = "`::knorvia-file-citation{path=unfinished`";
  assert.equal(projectKnorviaFileCitations(code, { streaming: true }).visibleText, code);
  const prose = '::knorvia-file-citation{path="done" ordinary prose.';
  assert.equal(projectKnorviaFileCitations(prose, { streaming: true }).visibleText, prose);
});
