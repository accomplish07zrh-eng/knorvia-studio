import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { test, after } from "node:test";

// Supplemental DOM gate: keep jsdom outside the product dependency graph.
const require = createRequire(import.meta.url);
const domRequire = process.env.KNORVIA_UI_B5_DOM_DEPS
  ? createRequire(`${process.env.KNORVIA_UI_B5_DOM_DEPS}/package.json`)
  : require;
const { JSDOM } = domRequire("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
for (const key of ["window", "document", "HTMLElement", "Node", "Event", "MutationObserver"])
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement: h, act, createRef } = require("react");
const { createRoot } = require("react-dom/client");
const ui = process.env.KNORVIA_UI_B5_DIR ?? fileURLToPath(new URL("../src/", import.meta.url));
const ext = process.env.KNORVIA_UI_B5_EXT ?? "tsx";
const { ScrollFadeViewport } = await import(
  pathToFileURL(`${ui}/components/ui/scroll-fade-viewport.${ext}`).href
);
const { ExecuteOutput } = await import(
  pathToFileURL(`${ui}/ToolCallBlocks/renderers/ExecuteOutput.${ext}`).href
);
let frameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++frameId, callback);
  return frameId;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
const observed = [];
class Observer {
  nodes = [];
  disconnected = false;
  constructor(callback) {
    this.callback = callback;
    observed.push(this);
  }
  observe(node) {
    this.nodes.push(node);
  }
  disconnect() {
    this.disconnected = true;
  }
}
const geometry = { scrollHeight: 101, clientHeight: 100, scrollTop: 0 };
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", {
  configurable: true,
  get() {
    return geometry.scrollHeight;
  },
});
Object.defineProperty(dom.window.HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() {
    return geometry.clientHeight;
  },
});
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollTop", {
  configurable: true,
  get() {
    return geometry.scrollTop;
  },
  set(value) {
    geometry.scrollTop = value;
  },
});
after(() => dom.window.close());

async function fixture({ observer = true, props = {} } = {}) {
  Object.assign(geometry, { scrollHeight: 101, clientHeight: 100, scrollTop: 0 });
  observed.length = 0;
  frames.clear();
  globalThis.ResizeObserver = observer ? Observer : undefined;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const ref = createRef();
  const render = async (children = "fixture") => {
    await act(() => root.render(h(ScrollFadeViewport, { ref, ...props }, children)));
    return host.firstChild;
  };
  const node = await render();
  const close = async () => {
    await act(() => root.unmount());
    host.remove();
  };
  return { root, ref, node, render, close };
}
async function scroll(node, values) {
  Object.assign(geometry, values);
  await act(() => node.dispatchEvent(new Event("scroll", { bubbles: true })));
}
async function flush() {
  const work = [...frames.values()];
  frames.clear();
  await act(() => work.forEach((callback) => callback(0)));
}

test("B5 scroll: DOM, same ref, caller events/attributes and class merge", async () => {
  let target;
  const f = await fixture({
    props: {
      className: "h-full overflow-auto",
      tabIndex: 0,
      "aria-label": "Output",
      onScroll: (event) => {
        target = event.currentTarget;
      },
    },
  });
  try {
    assert.equal(f.ref.current, f.node);
    assert.equal(f.node.tagName, "DIV");
    assert.equal(f.node.children.length, 1);
    assert.equal(f.node.firstChild.tagName, "DIV");
    assert.equal(f.node.firstChild.textContent, "fixture");
    assert.equal(f.node.tabIndex, 0);
    assert.equal(f.node.getAttribute("aria-label"), "Output");
    assert.equal(f.node.className, "min-h-0 flex-1 h-full overflow-auto");
    await scroll(f.node, { scrollHeight: 200 });
    assert.equal(target, f.node);
  } finally {
    await f.close();
  }
  assert.equal(f.ref.current, null);
});

test("B5 scroll: frozen 1px thresholds, fractional geometry and unclamped overscroll", async () => {
  const f = await fixture();
  try {
    for (const [height, top, mask] of [
      [101, 0, "none"],
      [100, 20, "none"],
      [200, 0, "bottom"],
      [200, 1, "bottom"],
      [200, 1.01, "both"],
      [200, 98.99, "both"],
      [200, 99, "top"],
      [200, 100, "top"],
      [200, -1, "bottom"],
      [200, 105, "top"],
      [101.1, 0.5, "none"],
      [NaN, 2, "top"],
    ]) {
      await scroll(f.node, { scrollHeight: height, scrollTop: top });
      assert.equal(f.node.dataset.scrollMask, mask, `${height}/${top}`);
      assert.equal(geometry.scrollTop, top);
    }
  } finally {
    await f.close();
  }
});

test("B5 scroll: exact standard/WebKit fade classes", async () => {
  const f = await fixture();
  const expected = {
    bottom:
      "[mask-image:linear-gradient(to_bottom,black_0,black_calc(100%_-_24px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0,black_calc(100%_-_24px),transparent_100%)]",
    both: "[mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_calc(100%_-_24px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_calc(100%_-_24px),transparent_100%)]",
    top: "[mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_24px,black_100%)]",
  };
  try {
    for (const [top, state] of [
      [0, "bottom"],
      [50, "both"],
      [100, "top"],
    ]) {
      await scroll(f.node, { scrollHeight: 200, scrollTop: top });
      assert.equal(f.node.className, `min-h-0 flex-1 overflow-y-auto ${expected[state]}`);
    }
  } finally {
    await f.close();
  }
});

test("B5 scroll: passive listener, observer targets, coalescing and cleanup", async () => {
  const adds = [],
    removes = [];
  const originalAdd = HTMLElement.prototype.addEventListener;
  const originalRemove = HTMLElement.prototype.removeEventListener;
  HTMLElement.prototype.addEventListener = function (...args) {
    if (args[0] === "scroll") adds.push([this, ...args]);
    return originalAdd.apply(this, args);
  };
  HTMLElement.prototype.removeEventListener = function (...args) {
    if (args[0] === "scroll") removes.push([this, ...args]);
    return originalRemove.apply(this, args);
  };
  const f = await fixture();
  try {
    assert.deepEqual(observed[0].nodes, [f.node, f.node.firstChild]);
    const entry = adds.find(([node, , , options]) => node === f.node && options?.passive);
    assert.ok(entry);
    geometry.scrollHeight = 200;
    await act(() => {
      observed[0].callback();
      observed[0].callback();
      window.dispatchEvent(new Event("resize"));
    });
    assert.equal(frames.size, 1);
    assert.equal(f.node.dataset.scrollMask, "none");
    await flush();
    assert.equal(f.node.dataset.scrollMask, "bottom");
    observed[0].callback();
    assert.equal(frames.size, 1);
    await f.close();
    assert.equal(frames.size, 0);
    assert.equal(observed[0].disconnected, true);
    assert.ok(removes.some(([node, , callback]) => node === f.node && callback === entry[2]));
    window.dispatchEvent(new Event("resize"));
    assert.equal(frames.size, 0);
  } finally {
    HTMLElement.prototype.addEventListener = originalAdd;
    HTMLElement.prototype.removeEventListener = originalRemove;
  }
});

test("B5 scroll: fallback resize and children lifecycle read without writing position", async () => {
  const f = await fixture({ observer: false });
  try {
    geometry.scrollHeight = 200;
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    assert.equal(frames.size, 1);
    await flush();
    assert.equal(f.node.dataset.scrollMask, "bottom");
    geometry.scrollTop = 50;
    await f.render("changed content");
    assert.equal(f.node.dataset.scrollMask, "both");
    assert.equal(geometry.scrollTop, 50);
    window.dispatchEvent(new Event("resize"));
  } finally {
    await f.close();
  }
  assert.equal(frames.size, 0);
});

test("B5 scroll: caller override order and callback ref", async () => {
  const values = [];
  const f = await fixture({
    props: { ref: (node) => values.push(node), "data-scroll-mask": "caller" },
  });
  assert.equal(values[0], f.node);
  assert.equal(f.node.dataset.scrollMask, "caller");
  await f.close();
  assert.equal(values.at(-1), null);
});

test("B5 actual ExecuteOutput consumer retains following, frozen output and resume", async () => {
  const f = await fixture();
  try {
    geometry.scrollHeight = 200;
    await act(() => f.root.render(h(ExecuteOutput, { text: "first", running: true })));
    const node = document.querySelector('[data-testid="bash-output-scroll"]');
    assert.equal(geometry.scrollTop, 200);
    assert.equal(node.dataset.following, "true");
    assert.equal(node.tabIndex, 0);
    assert.ok(node.className.includes("max-h-[5lh]"));
    await scroll(node, { scrollTop: 40 });
    assert.equal(node.dataset.following, "false");
    await act(() => f.root.render(h(ExecuteOutput, { text: "second", running: true })));
    assert.equal(node.textContent, "first");
    await scroll(node, { scrollTop: 100 });
    assert.equal(node.dataset.following, "true");
    assert.equal(node.textContent, "second");
    await act(() => f.root.render(h(ExecuteOutput, { text: "second", running: false })));
    assert.ok(node.querySelector('[data-testid="bash-result-output"]'));
  } finally {
    await f.close();
  }
});
