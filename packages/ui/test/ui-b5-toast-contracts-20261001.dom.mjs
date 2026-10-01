import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test, after } from "node:test";
const require = createRequire(import.meta.url);
const domRequire = process.env.KNORVIA_UI_B5_DOM_DEPS
  ? createRequire(`${process.env.KNORVIA_UI_B5_DOM_DEPS}/package.json`)
  : require;
const { JSDOM } = domRequire("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "SVGElement",
  "Node",
  "Event",
  "MutationObserver",
])
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, createElement: h } = require("react");
const { createRoot } = require("react-dom/client");
// jsdom delivers mutation records in a microtask; put their React updates in act.
globalThis.MutationObserver = class extends dom.window.MutationObserver {
  constructor(callback) {
    super((records, observer) => act(() => callback(records, observer)));
  }
};
const dir = process.env.KNORVIA_UI_B5_DIR ?? new URL("../src/", import.meta.url).pathname;
const ext = process.env.KNORVIA_UI_B5_EXT ?? "tsx";
const toast = await import(pathToFileURL(`${dir}/components/ui/toast.${ext}`).href);
let frameId = 0,
  timerId = 0,
  clock = 0;
const frames = new Map(),
  timers = new Map();
const originalTimeout = globalThis.setTimeout,
  originalClear = globalThis.clearTimeout;
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++frameId, callback);
  return frameId;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.setTimeout = window.setTimeout = (callback, duration) => {
  timers.set(++timerId, { callback, at: clock + Number(duration) });
  return timerId;
};
globalThis.clearTimeout = window.clearTimeout = (id) => timers.delete(id);
const observers = [];
class Observer {
  nodes = new Set();
  disconnected = false;
  constructor(callback) {
    this.callback = callback;
    observers.push(this);
  }
  observe(node) {
    this.nodes.add(node);
  }
  unobserve(node) {
    this.nodes.delete(node);
  }
  disconnect() {
    this.disconnected = true;
    this.nodes.clear();
  }
}
globalThis.ResizeObserver = Observer;
after(() => {
  globalThis.setTimeout = originalTimeout;
  globalThis.clearTimeout = originalClear;
  dom.window.close();
});
async function frame() {
  const work = [...frames.values()];
  frames.clear();
  await act(() => work.forEach((callback) => callback(clock)));
}
async function tick(milliseconds) {
  const end = clock + milliseconds;
  while (true) {
    const due = [...timers]
      .filter(([, timer]) => timer.at <= end)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    clock = due[1].at;
    timers.delete(due[0]);
    await act(() => due[1].callback());
  }
  clock = end;
}
async function add(message, options) {
  let id;
  await act(() => {
    id = toast.toast(message, options);
  });
  await frame();
  await frame();
  return id;
}
const find = (text) =>
  [...document.querySelectorAll(".bg-toast\\/60")].find((node) => node.textContent.includes(text));
const patch = async (id, changes) => act(() => toast.updateToast(id, changes));
const dismiss = async (id) => act(() => toast.dismissToast(id));

test("B5 toast command/runtime and DOM contracts on one real React owner", async (t) => {
  await t.test("pre-mount patches, dismissal and original repeated-host behavior", async () => {
    let first, removed;
    await act(() => {
      first = toast.toast("pending", { durationMs: 0 });
      toast.updateToast(first, { message: "merged", variant: "info" });
      toast.updateToast(first, { actionLabel: "Open" });
      removed = toast.toast("suppressed", { durationMs: 0 });
      toast.updateToast(removed, { message: "never" });
      toast.dismissToast(removed);
    });
    assert.equal(first, 0);
    assert.equal(removed, 1);
    assert.equal(document.querySelectorAll("#knorvia-toast-host").length, 2);
    await frame();
    await frame();
    assert.ok(find("merged"));
    assert.ok(find("merged").querySelector("button"));
    assert.equal(find("pending"), undefined);
    assert.equal(find("never"), undefined);
    await dismiss(first);
  });
  await t.test("four fixed stacks and cross-position dedupe tail", async () => {
    const a = await add("A", { durationMs: 0, dedupeKey: "key" });
    const b = await add("B", { durationMs: 0, position: "bottom-left" });
    const c = await add("C", { durationMs: 0, dedupeKey: "key", position: "bottom-left" });
    assert.equal(find("A"), undefined);
    assert.equal(find("B").parentNode, find("C").parentNode);
    assert.deepEqual(
      [...find("B").parentNode.children].map((node) => node.textContent),
      ["B", "C"],
    );
    const host = document.querySelectorAll("#knorvia-toast-host")[1];
    assert.equal(host.children.length, 4);
    assert.ok(host.children[0].className.includes("top-16 left-1/2"));
    assert.ok(host.children[1].className.includes("right-4 top-16"));
    assert.ok(host.children[2].className.includes("safe-area-inset-bottom"));
    assert.ok(host.children[3].className.includes("left-1/2"));
    for (const id of [a, b, c]) await dismiss(id);
  });
  await t.test("default 3000ms lifetime then exact 200ms exit", async () => {
    const id = await add("default timer");
    assert.ok(find("default timer").className.includes("opacity-100"));
    await tick(2999);
    assert.ok(find("default timer").className.includes("opacity-100"));
    await tick(1);
    assert.ok(find("default timer").className.includes("opacity-0"));
    await tick(199);
    assert.ok(find("default timer"));
    await tick(1);
    assert.equal(find("default timer"), undefined);
    await dismiss(id);
  });
  await t.test("unrelated update preserves timer; sticky→timed resets only duration", async () => {
    const id = await add("sticky", { durationMs: 0, position: "bottom-center" });
    await tick(5000);
    assert.ok(find("sticky"));
    await patch(id, { message: "timed", durationMs: 100 });
    await frame();
    await tick(60);
    await patch(id, { message: "updated" });
    await tick(39);
    assert.ok(find("updated").className.includes("opacity-100"));
    await tick(1);
    assert.ok(find("updated").className.includes("opacity-0"));
    await tick(200);
    assert.equal(find("updated"), undefined);
    const next = await add("reset", { durationMs: 100 });
    await tick(60);
    await patch(next, { durationMs: 200 });
    await frame();
    await tick(199);
    assert.ok(find("reset").className.includes("opacity-100"));
    await tick(1);
    assert.ok(find("reset").className.includes("opacity-0"));
    await tick(200);
  });
  await t.test("nonfinite/nonpositive sticky duration and unknown commands", async () => {
    for (const durationMs of [0, -1, NaN, Infinity]) {
      const id = await add(`sticky ${durationMs}`, { durationMs });
      await tick(4000);
      assert.ok(find(`sticky ${durationMs}`));
      await dismiss(id);
    }
    await patch(-100, { message: "unknown" });
    await dismiss(-100);
    assert.equal(find("unknown"), undefined);
  });
  await t.test("update stays in place even when dedupe key becomes equal", async () => {
    const a = await add("first", { durationMs: 0, dedupeKey: "one" });
    const b = await add("second", { durationMs: 0, dedupeKey: "two" });
    await patch(a, { dedupeKey: "two", message: "patched" });
    assert.deepEqual(
      [...find("patched").parentNode.children].map((node) => node.textContent),
      ["patched", "second"],
    );
    await dismiss(a);
    await dismiss(b);
  });
  await t.test("action order, native button attributes, close label and transition", async () => {
    const calls = [];
    const id = await add("notice\nbody", {
      durationMs: 0,
      variant: "warning",
      position: "top-right",
      actionLabel: "Open",
      onAction: () => calls.push(Boolean(find("notice"))),
      dismissible: true,
      dismissLabel: "Close notice",
    });
    const node = find("notice"),
      buttons = node.querySelectorAll("button");
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].type, "button");
    assert.equal(buttons[1].getAttribute("aria-label"), "Close notice");
    assert.equal(node.querySelector("svg").getAttribute("aria-hidden"), "true");
    buttons[0].focus();
    assert.equal(document.activeElement, buttons[0]);
    await act(() => buttons[0].click());
    assert.deepEqual(calls, [true]);
    assert.ok(node.className.includes("translate-x-[calc(100%+1rem)] opacity-0"));
    await tick(199);
    assert.ok(find("notice"));
    await tick(1);
    assert.equal(find("notice"), undefined);
    await dismiss(id);
    const close = await add("close only", { durationMs: 0, variant: "info", dismissible: true });
    assert.equal(find("close only").querySelector("button").getAttribute("aria-label"), "Close");
    await act(() => find("close only").querySelector("button").click());
    await tick(200);
    assert.equal(find("close only"), undefined);
    await dismiss(close);
  });
  await t.test("thrown action retains notice and does not schedule dismissal", async () => {
    const failure = new Error("fixture action failure");
    let observed;
    const failed = (event) => {
      observed = event.error;
      event.preventDefault();
    };
    window.addEventListener("error", failed);
    const id = await add("throwing action", {
      durationMs: 0,
      variant: "info",
      actionLabel: "Run",
      onAction() {
        throw failure;
      },
    });
    try {
      const before = timers.size;
      await act(() => find("throwing action").querySelector("button").click());
      assert.equal(observed, failure);
      assert.equal(timers.size, before);
      assert.ok(find("throwing action").className.includes("opacity-100"));
    } finally {
      window.removeEventListener("error", failed);
      await dismiss(id);
    }
  });
  await t.test("baseline pending entry and exit work remains uncancelled", async () => {
    const id = await add("old exit", { durationMs: 100 });
    await tick(100);
    await patch(id, { message: "new lifetime", durationMs: 1000 });
    await frame();
    assert.ok(find("new lifetime").className.includes("opacity-100"));
    await tick(200);
    assert.equal(find("new lifetime"), undefined);
    let next;
    await act(() => {
      next = toast.toast("pending entry", { durationMs: 0 });
    });
    assert.ok(frames.size > 0);
    await dismiss(next);
    assert.ok(frames.size > 0);
    await frame();
    assert.equal(find("pending entry"), undefined);
  });
  await t.test(
    "anchor groups follow insertion order and non-center anchors are ignored",
    async () => {
      const a = await add("anchored A", { durationMs: 0, anchorId: "A" });
      const b = await add("anchored B", { durationMs: 0, anchorId: "B" });
      const c = await add("anchored C", { durationMs: 0, anchorId: "A" });
      assert.equal(find("anchored A").parentNode, find("anchored C").parentNode);
      assert.notEqual(find("anchored A").parentNode, find("anchored B").parentNode);
      assert.equal(find("anchored A").parentNode.nextSibling, find("anchored B").parentNode);
      const right = await add("right anchor", {
        durationMs: 0,
        position: "top-right",
        anchorId: "A",
      });
      assert.ok(find("right anchor").parentNode.className.includes("right-4"));
      for (const id of [a, b, c, right]) await dismiss(id);
    },
  );
});

test("B5 anchored view follows resize, mutation/replacement, scroll and cleans observers", async () => {
  const anchor = document.createElement("div");
  anchor.id = "pane";
  let rect = { left: 10, width: 30 };
  anchor.getBoundingClientRect = () => rect;
  await act(() => document.body.append(anchor));
  const host = document.createElement("div");
  await act(() => document.body.append(host));
  const root = createRoot(host);
  const render = async () =>
    act(() =>
      root.render(
        h(toast.AnchoredToastStack, {
          anchorId: "pane",
          items: [],
          onDone() {},
        }),
      ),
    );
  await render();
  const observer = observers.at(-1);
  assert.equal(host.firstChild.style.left, "25px");
  assert.ok(observer.nodes.has(anchor));
  rect = { left: 30, width: 50 };
  await act(() => observer.callback());
  assert.equal(host.firstChild.style.left, "55px");
  rect = { left: 20, width: 20 };
  await act(() => document.dispatchEvent(new Event("scroll")));
  assert.equal(host.firstChild.style.left, "30px");
  const replacement = document.createElement("div");
  replacement.id = "pane";
  replacement.getBoundingClientRect = () => ({ left: 100, width: 20 });
  await act(() => anchor.replaceWith(replacement));
  assert.equal(host.firstChild.style.left, "110px");
  assert.ok(observer.nodes.has(replacement));
  assert.equal(observer.nodes.has(anchor), false);
  await act(() => replacement.remove());
  assert.equal(host.firstChild.style.left, "");
  await act(() => root.unmount());
  assert.equal(observer.disconnected, true);
  await act(() => host.remove());
});
