import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test, after } from "node:test";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(
  `${process.env.KNORVIA_UI_B5_DOM_DEPS ?? "/workspace/toolchain/b5-dom"}/package.json`,
)("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
for (const key of ["window", "document", "HTMLElement", "SVGElement", "Node", "Event"])
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
const { createElement: h, act } = require("react");
const { createRoot } = require("react-dom/client");
const dir = process.env.KNORVIA_UI_B5_DIR ?? new URL("../src/", import.meta.url).pathname;
const ext = process.env.KNORVIA_UI_B5_EXT ?? "tsx";
const { FlipMetricValue } = await import(
  pathToFileURL(`${dir}/components/ui/flip-metric-value.${ext}`).href
);
let modern, legacy, removed;
function query(matches, isModern = true) {
  const callbacks = new Set();
  const media = {
    matches,
    addListener(callback) {
      legacy++;
      callbacks.add(callback);
    },
    removeListener(callback) {
      removed++;
      callbacks.delete(callback);
    },
  };
  if (isModern)
    Object.assign(media, {
      addEventListener(event, callback) {
        assert.equal(event, "change");
        modern++;
        callbacks.add(callback);
      },
      removeEventListener(event, callback) {
        assert.equal(event, "change");
        removed++;
        callbacks.delete(callback);
      },
    });
  window.matchMedia = (pattern) => {
    assert.equal(pattern, "(prefers-reduced-motion: reduce)");
    return media;
  };
  return {
    change: async (next) => {
      media.matches = next;
      await act(() => callbacks.forEach((callback) => callback(media)));
    },
    callbacks,
  };
}
async function fixture(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (next = props) => {
    await act(() => root.render(h(FlipMetricValue, next)));
    return host.firstChild;
  };
  const node = await render();
  return {
    host,
    node,
    render,
    close: async () => {
      await act(() => root.unmount());
      host.remove();
    },
  };
}
after(() => dom.window.close());

test("B5 metric: Unicode slots, fixed widths, ARIA and no keyboard targets", async () => {
  modern = legacy = removed = 0;
  const media = query(true);
  const value = "09:.Ｋ١💡é";
  const f = await fixture({ value });
  try {
    assert.equal(f.node.tagName, "SPAN");
    assert.equal(f.node.getAttribute("role"), "text");
    assert.equal(f.node.getAttribute("aria-label"), value);
    assert.equal(f.node.title, value);
    assert.equal(f.node.hasAttribute("data-animate-initial"), false);
    assert.equal(f.node.children.length, Array.from(value).length);
    assert.equal(f.node.querySelectorAll("button,[tabindex]").length, 0);
    const widths = ["0.66", "0.66", "0.34", "0.34", "0.7", "0.7", "0.7", "0.7", "0.7"];
    [...f.node.children].forEach((slot, index) => {
      assert.equal(slot.getAttribute("aria-hidden"), "true");
      assert.ok(slot.className.includes(`w-[${widths[index]}em]`));
      assert.ok(slot.className.includes("h-[1.15em]"));
      assert.equal(slot.children.length, 0);
    });
    assert.equal(modern, 1);
    assert.equal(legacy, 0);
  } finally {
    await f.close();
  }
  assert.equal(removed, 1);
  assert.equal(media.callbacks.size, 0);
});

test("B5 metric: preference changes and positional slots survive value updates", async () => {
  modern = legacy = removed = 0;
  const media = query(true);
  const f = await fixture({ value: "1:2", animateInitial: true });
  try {
    const first = f.node.firstChild;
    await f.render({ value: "8:9", animateInitial: true });
    assert.equal(f.node.firstChild, first);
    assert.equal(f.node.textContent, "8:9");
    assert.equal(f.node.dataset.animateInitial, "true");
    await media.change(false);
    assert.equal(f.node.firstChild, first);
    assert.equal(f.node.children[0].children.length, 1);
    assert.equal(f.node.children[1].children.length, 0);
    assert.ok(f.node.children[0].className.includes("[perspective:8em]"));
    assert.equal(f.node.children[0].firstChild.style.transformOrigin, "50% 50%");
    await media.change(true);
    assert.equal(f.node.children[0].children.length, 0);
    assert.equal(f.node.textContent, "8:9");
  } finally {
    await f.close();
  }
  assert.equal(removed, 1);
});

test("B5 metric: legacy media listener lifecycle and missing matchMedia", async () => {
  modern = legacy = removed = 0;
  const media = query(true, false);
  const f = await fixture({ value: "7" });
  assert.equal(modern, 0);
  assert.equal(legacy, 1);
  await media.change(false);
  assert.equal(f.node.firstChild.children.length, 1);
  await f.close();
  assert.equal(removed, 1);
  assert.equal(media.callbacks.size, 0);
  delete window.matchMedia;
  const noMedia = await fixture({ value: "3" });
  assert.equal(noMedia.node.firstChild.children.length, 1);
  await noMedia.close();
});
