// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { defaultRehypePlugins } from "streamdown";
import { extractAssistantFileReferences } from "../src/lib/assistantFileReferences.js";

const url = process.env.KNORVIA_UI_B2_LIB_DIR
  ? pathToFileURL(
      resolve(
        process.env.KNORVIA_UI_B2_LIB_DIR,
        `fileCitationRemarkPlugin.${process.env.KNORVIA_UI_B2_LIB_EXT ?? "ts"}`,
      ),
    ).href
  : new URL("../src/lib/fileCitationRemarkPlugin.js", import.meta.url).href;
const { createKnorviaFileCitationRemarkPlugin: create } = await import(url);

interface Node {
  type: string;
  value?: string;
  url?: string;
  children?: Node[];
  [key: string]: unknown;
}
const syntax = (path: string) => `::knorvia-file-citation{path="${path}"}`;
const text = (value: string): Node => ({ type: "text", value });
const link = (url: string, label: string): Node => ({ type: "link", url, children: [text(label)] });
function transform(tree: Node, workspace = "/synthetic", home?: string): unknown {
  return create(workspace, home)()(tree);
}

test("B2 markdown: buffered replacements preserve prefix, rejected syntax, suffix and arrays", () => {
  const rejected = syntax("https://example.com/a.pdf");
  const original = {
    ...text(`Before ${syntax("a.pdf")} between ${rejected} then ${syntax("folder/b.docx")} tail`),
    position: { start: 0 },
  };
  const tree = { type: "paragraph", children: [original] };
  const children = tree.children;
  assert.equal(transform(tree), undefined);
  assert.equal(tree.children, children);
  assert.deepEqual(tree.children, [
    text("Before "),
    link("a.pdf", "a.pdf"),
    text(` between ${rejected} then `),
    link("folder/b.docx", "b.docx"),
    text(" tail"),
  ]);
  assert.deepEqual(Object.keys(tree.children[1]!), ["type", "url", "children"]);
});

test("B2 markdown: absent/rejected citations retain original text node identity", () => {
  for (const value of [
    "plain",
    syntax("../escape.pdf"),
    syntax("./a/../../escape.pdf"),
    syntax("https://example.com/a.pdf"),
    syntax("~/a.pdf"),
    "::knorvia-file-citation{path=a.pdf broken}",
  ]) {
    const node = text(value);
    const tree = { type: "paragraph", children: [node] };
    const children = tree.children;
    transform(tree);
    assert.equal(tree.children, children);
    assert.equal(tree.children[0], node);
  }
  const empty = { type: "text", children: [text(syntax("a.pdf"))] };
  const tree = { type: "root", children: [empty] };
  transform(tree);
  assert.equal(tree.children[0], empty);
  assert.equal(empty.children[0]?.type, "text");
});

for (const type of ["code", "html", "image", "inlineCode", "link"]) {
  test(`B2 markdown: ${type} protects its entire subtree`, () => {
    const protectedNode = {
      type,
      children: [{ type: "paragraph", children: [text(syntax("a.pdf"))] }],
    };
    const before = structuredClone(protectedNode);
    const tree = { type: "root", children: [protectedNode] };
    transform(tree);
    assert.equal(tree.children[0], protectedNode);
    assert.deepEqual(protectedNode, before);
  });
}

test("B2 markdown: repeated/nested transformations do not nest links", () => {
  const sibling = text("unmodified");
  const tree = {
    type: "root",
    children: [
      {
        type: "blockquote",
        children: [
          { type: "paragraph", children: [text(syntax("a.pdf") + syntax("b.pdf")), sibling] },
        ],
      },
    ],
  };
  transform(tree);
  const once = structuredClone(tree);
  transform(tree);
  assert.deepEqual(tree, once);
  assert.equal(tree.children[0]?.children[0]?.children.at(-1), sibling);
});

test("B2 markdown: path owner resolves label while raw href remains unchanged", () => {
  for (const [path, label, home] of [
    ["file:///tmp/a%20b.pdf", "a b.pdf", undefined],
    ["a%2Fb.pdf", "a%2Fb.pdf", undefined],
    ["a%2520b.pdf", "a%2520b.pdf", undefined],
    ["folder/../a.pdf:20", "a.pdf", undefined],
    ["~/a.pdf", "a.pdf", "/home/fixture"],
  ]) {
    const tree = { type: "paragraph", children: [text(syntax(path!))] };
    transform(tree, "/synthetic", home);
    assert.deepEqual(tree.children, [link(path!, label!)]);
  }
  const raw = String.raw`::knorvia-file-citation{path="C:\Users\fixture\a.pdf"}`;
  const tree = { type: "paragraph", children: [text(raw)] };
  transform(tree, String.raw`C:\synthetic`);
  assert.deepEqual(tree.children, [link(String.raw`C:\Users\fixture\a.pdf`, "a.pdf")]);
});

test("B2 markdown: real remark pipeline protects code/link/HTML examples", () => {
  const processor = unified().use(remarkParse).use(create("/synthetic"));
  const markdown = `${syntax("a.pdf")}\n\n\`${syntax("inline.pdf")}\`\n\n\`\`\`text\n${syntax("code.pdf")}\n\`\`\`\n\n[${syntax("link.pdf")}](https://example.com)\n\n<pre>${syntax("html.pdf")}</pre>`;
  const tree = processor.runSync(processor.parse(markdown)) as unknown as Node;
  const urls: string[] = [];
  const walk = (node: Node) => {
    if (node.type === "link") urls.push(node.url!);
    node.children?.forEach(walk);
  };
  walk(tree);
  assert.deepEqual(urls, ["a.pdf", "https://example.com"]);
});

test("B2 markdown: unsafe schemes remain blocked by the existing real safety pipeline", () => {
  const processor = unified()
    .use(remarkParse)
    .use(create("/synthetic"))
    .use(remarkRehype)
    .use(Object.values(defaultRehypePlugins));
  for (const path of [
    "javascript:alert(1)",
    "data:text/html,<svg onload=alert(1)>",
    "vbscript:msgbox(1)",
  ]) {
    const mdast = { type: "paragraph", children: [text(syntax(path))] };
    transform(mdast);
    assert.equal(mdast.children[0]?.url, path);
    const hast = processor.runSync(processor.parse(syntax(path))) as unknown as Node;
    const values: string[] = [];
    const walk = (node: Node) => {
      const href = (node.properties as { href?: string } | undefined)?.href;
      if (href) values.push(href);
      node.children?.forEach(walk);
    };
    walk(hast);
    assert.equal(
      values.some((href) => /^(?:javascript|data|vbscript):/i.test(href)),
      false,
    );
  }
});

test("B2 markdown: HTML-like label is text and creates no event attributes", () => {
  const path = "folder/<svg onload=alert(1)>.pdf";
  const tree = { type: "paragraph", children: [text(syntax(path))] };
  transform(tree);
  assert.deepEqual(tree.children, [link(path, "<svg onload=alert(1)>.pdf")]);
  assert.equal(Object.hasOwn(tree.children[0]!, "properties"), false);
});

test("B2 markdown: card consumer keeps full directive protected and preview-kind restricted", () => {
  assert.deepEqual(extractAssistantFileReferences(syntax("a.md"), "/synthetic"), []);
  assert.deepEqual(
    extractAssistantFileReferences(syntax("a.docx"), "/synthetic").map(({ path, kind }) => ({
      path,
      kind,
    })),
    [{ path: "/synthetic/a.docx", kind: "docx" }],
  );
  assert.deepEqual(
    extractAssistantFileReferences(
      '::knorvia-file-citation{path="a.docx" artifact_kind="video"}',
      "/synthetic",
    ),
    [],
  );
});

test("B2 markdown: malformed tree/getter failures remain public", () => {
  assert.throws(() => transform(null as unknown as Node), TypeError);
  const failure = new Error("getter failure");
  assert.throws(
    () =>
      transform({
        type: "root",
        get children() {
          throw failure;
        },
      }),
    (error) => error === failure,
  );
  const first = text(syntax("a.pdf"));
  const next = {
    type: "text",
    get value() {
      throw failure;
    },
  };
  const tree = { type: "paragraph", children: [first, next] };
  assert.throws(
    () => transform(tree),
    (error) => error === failure,
  );
  assert.deepEqual(tree.children[0], link("a.pdf", "a.pdf"));
  assert.equal(tree.children[1], next);
});
