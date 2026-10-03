// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 修复合同：真实 Markdown 的大 text node 必须完整投影，不能依赖引擎参数数量上限。
// parent/children 与未替换节点仍是原 owner；顺序、位置/data 元数据、安全插件顺序保持。
// 沿用 B2：新生成的 text/link 不继承被替换 text 的 position/data。
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { defaultRehypePlugins } from "streamdown";
import { windowsFileLinkEscapeRemarkPlugin } from "../src/lib/windowsFileLinkEscapeRemarkPlugin.js";

const target = process.env.KNORVIA_UI_CITATION_SCALE_LIB_DIR
  ? pathToFileURL(
      resolve(
        process.env.KNORVIA_UI_CITATION_SCALE_LIB_DIR,
        `fileCitationRemarkPlugin.${process.env.KNORVIA_UI_CITATION_SCALE_LIB_EXT ?? "ts"}`,
      ),
    ).href
  : new URL("../src/lib/fileCitationRemarkPlugin.js", import.meta.url).href;
const { createKnorviaFileCitationRemarkPlugin: create } = await import(target);

interface Node {
  type: string;
  value?: string;
  url?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
  position?: unknown;
  data?: unknown;
}

const citation = (path: string) =>
  `::knorvia-file-citation{path="${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"}`;
const text = (value: string): Node => ({ type: "text", value });
const link = (url: string, label: string): Node => ({
  type: "link",
  url,
  children: [text(label)],
});
function transform(tree: Node): unknown {
  return create("/synthetic")()(tree);
}
function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  node.children?.forEach((child) => walk(child, visit));
}

test("citation scale: real remark-parse renders 65,000 citations and preserves owner metadata", () => {
  const count = 65_000;
  const body = Array.from({ length: count }, (_, index) => citation(`f${index}.pdf`)).join(" ");
  const markdown = `prefix \`guard\` ${body} \`tail guard\` suffix`;
  const processor = unified().use(remarkParse).use(create("/synthetic"));
  const parsed = processor.parse(markdown);
  const tree = parsed as unknown as Node;
  const paragraph = tree.children![0]!;
  const children = paragraph.children!;
  assert.equal(children.length, 5);
  const [prefix, guard, original, tailGuard, suffix] = children;
  assert.equal(original!.type, "text");
  const positions = [tree.position, paragraph.position, guard!.position, tailGuard!.position];
  const positionSnapshot = structuredClone(positions);
  const data = { owner: "synthetic" };
  paragraph.data = data;
  guard!.data = data;
  assert.equal(processor.runSync(parsed), tree);
  assert.equal(tree.children![0], paragraph);
  assert.equal(paragraph.children, children);
  assert.equal(children[0], prefix);
  assert.equal(children[1], guard);
  assert.equal(children.at(-2), tailGuard);
  assert.equal(children.at(-1), suffix);
  assert.equal(paragraph.data, data);
  assert.equal(guard!.data, data);
  assert.deepEqual(
    [tree.position, paragraph.position, guard!.position, tailGuard!.position],
    positionSnapshot,
  );
  assert.equal(tree.position, positions[0]);
  assert.equal(paragraph.position, positions[1]);
  const links = children.filter((node) => node.type === "link");
  assert.equal(links.length, count);
  for (const [index, node] of links.entries()) {
    assert.equal(node.url, `f${index}.pdf`);
    assert.equal(node.children![0]!.value, `f${index}.pdf`);
    assert.equal(Object.hasOwn(node, "position"), false);
    assert.equal(Object.hasOwn(node, "data"), false);
  }
  assert.equal(children.includes(original!), false);
});

test("citation scale: ordinary edits preserve rejected bytes, sibling positions and key order", () => {
  const rejected = citation("../escape.pdf");
  const before = { ...text("before"), position: { start: 0 }, data: { fixture: true } };
  const after = { ...text("after"), position: { end: 100 } };
  const source = {
    ...text(`left ${citation("a.pdf")} ${rejected} ${citation("b.pdf")} right`),
    position: { start: 10 },
  };
  const paragraph = {
    type: "paragraph",
    position: { end: 100 },
    children: [before, source, after],
  };
  const children = paragraph.children;
  assert.equal(transform(paragraph), undefined);
  assert.equal(paragraph.children, children);
  assert.equal(children[0], before);
  assert.equal(children.at(-1), after);
  assert.deepEqual(children.slice(1, -1), [
    text("left "),
    link("a.pdf", "a.pdf"),
    text(` ${rejected} `),
    link("b.pdf", "b.pdf"),
    text(" right"),
  ]);
  assert.deepEqual(Object.keys(children[2]!), ["type", "url", "children"]);
  assert.deepEqual(before.position, { start: 0 });
  assert.deepEqual(after.position, { end: 100 });
});

test("citation scale: many edits keep subsequent sibling order and do not revisit new links", () => {
  const count = 5_000;
  const body = Array.from({ length: count }, (_, index) => citation(`a${index}.pdf`)).join(" ");
  const sentinel = { type: "inlineCode", value: citation("protected.pdf"), position: { start: 1 } };
  const paragraph: Node = {
    type: "paragraph",
    children: [text(body), sentinel, text(citation("last.pdf"))],
  };
  const children = paragraph.children!;
  transform(paragraph);
  assert.equal(paragraph.children, children);
  assert.equal(children.filter((node) => node.type === "link").length, count + 1);
  assert.equal(children.at(-2), sentinel);
  assert.deepEqual(children.at(-1), link("last.pdf", "last.pdf"));
  const firstLink = children[0];
  const snapshot = structuredClone(paragraph);
  transform(paragraph);
  assert.deepEqual(paragraph, snapshot);
  assert.equal(children[0], firstLink);
});

test("citation scale: later sibling failure retains already committed large replacement", () => {
  const count = 5_000;
  const failure = new Error("later text failure");
  const failing: Node = {
    type: "text",
    get value(): string {
      throw failure;
    },
  };
  const paragraph: Node = {
    type: "paragraph",
    children: [text(Array(count).fill(citation("a.pdf")).join(" ")), failing],
  };
  const children = paragraph.children!;
  assert.throws(
    () => transform(paragraph),
    (error) => error === failure,
  );
  assert.equal(paragraph.children, children);
  assert.equal(children.filter((node) => node.type === "link").length, count);
  assert.equal(children.at(-1), failing);
});

test("citation scale: escaping and malicious paths retain the real safety-chain boundary", () => {
  for (const path of [
    "JaVaScRiPt:alert(1)",
    "java\nscript:alert(1)",
    "java\tscript:alert(1)",
    "javascript&#58;alert(1)",
    "&#106;avascript:alert(1)",
    "javascript%253Aalert(1)",
    "data:text/html,<svg/onload=alert(1)>",
    "vbscript:msgbox(1)",
    "folder/<img src=x onerror=alert(1)>.pdf",
    'folder/a" onclick="alert(1).pdf',
    String.raw`C:\synthetic\.knorvia\a.pdf`,
    "file:///tmp/a%2520b.pdf",
    "./safe/%2e%2e/%2e%2e/escape.pdf",
  ]) {
    const processor = unified()
      .use(remarkParse)
      .use(windowsFileLinkEscapeRemarkPlugin)
      .use(create("/synthetic"))
      .use(remarkRehype)
      .use(Object.values(defaultRehypePlugins));
    const source = citation(path);
    const tree = processor.runSync(processor.parse(source)) as unknown as Node;
    walk(tree, (node) => {
      if (node.type !== "element") return;
      assert.equal(["script", "iframe", "svg"].includes(node.tagName!), false);
      assert.equal(
        Object.keys(node.properties ?? {}).some((key) => /^on/i.test(key)),
        false,
      );
      const href = node.properties?.href;
      if (typeof href !== "string") return;
      const parsed = new URL(href, "https://synthetic.invalid");
      assert.equal(["javascript:", "data:", "vbscript:"].includes(parsed.protocol), false);
    });
  }
});
