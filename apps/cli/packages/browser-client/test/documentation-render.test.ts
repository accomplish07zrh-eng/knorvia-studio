// documentation-render 的行为测试：渲染结果的结构与边界。
import assert from "node:assert/strict";
import test from "node:test";
import { BROWSER_FALLBACK_GUIDE, renderBrowserDocumentation } from "../src/documentation-render.js";
import type { BrowserApiManifest } from "../src/api-contract.js";
import type { BrowserBackendDescriptor } from "@knorvia/contracts/browser-control";

/** 一份最小的 API 清单：只有一个对象、没有入口点。 */
function minimalManifest(): BrowserApiManifest {
  return {
    objects: {},
    entrypoints: [],
    semantics: {},
    types: {},
  } as unknown as BrowserApiManifest;
}

/** 一个最小的后端描述。 */
function descriptor(): BrowserBackendDescriptor {
  return { id: "alpha", generation: 3, type: "iab", name: "Alpha", capabilities: {} };
}

test("renderBrowserDocumentation always emits the title heading", () => {
  const text = renderBrowserDocumentation(minimalManifest(), "Tab", []);
  assert.match(text, /^# Tab$/mu);
});

test("renderBrowserDocumentation strips newlines from the title", () => {
  const text = renderBrowserDocumentation(minimalManifest(), "Bad\nTitle\r\nHere", []);
  // 标题行里不能有换行；三行会被压成一行。
  assert.match(text, /^# Bad Title Here$/mu);
});

test("renderBrowserDocumentation includes the browser context block when a descriptor is given", () => {
  const text = renderBrowserDocumentation(minimalManifest(), "Tab", [], descriptor());
  assert.match(text, /^# Browser context$/mu);
  assert.match(text, /- Name: "Alpha"/u);
  assert.match(text, /- Type: iab/u);
  assert.match(text, /- ID: "alpha"/u);
});

test("renderBrowserDocumentation omits the browser context block without a descriptor", () => {
  const text = renderBrowserDocumentation(minimalManifest(), "Tab", []);
  assert.doesNotMatch(text, /# Browser context/u);
});

test("renderBrowserDocumentation keeps every supplied content block", () => {
  const text = renderBrowserDocumentation(minimalManifest(), "Tab", [
    "first block",
    "second block",
  ]);
  assert.match(text, /first block/u);
  assert.match(text, /second block/u);
  // 内容顺序与传入顺序一致。
  assert.ok(text.indexOf("first block") < text.indexOf("second block"));
});

test("BROWSER_FALLBACK_GUIDE is a non-empty markdown document", () => {
  assert.ok(BROWSER_FALLBACK_GUIDE.length > 100);
  assert.match(BROWSER_FALLBACK_GUIDE, /^# /mu);
});
