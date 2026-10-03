// SPDX-License-Identifier: Apache-2.0
// Pending geometry/frame/resource contracts; not run or claimed as browser/DndKit acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import { GroupedSectionDomOwner, type GroupedSectionDomPorts } from "../src/workspace-grouped-tasks/groupedSectionDomOwner.js";
import { projectGroupedLayoutMotion, projectStickyGroupedId } from "../src/workspace-grouped-tasks/groupedSectionGeometry.js";

type Rect = { height: number; left: number; top: number; width: number; bottom: number };
class FakeAnimation {
  readonly listeners = new Map<string, Set<() => void>>();
  canceled = false;
  finished = false;
  constructor(readonly journal: unknown[]) {}
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, new Set([...(this.listeners.get(type) ?? []), listener])); }
  removeEventListener(type: string, listener: () => void) { this.listeners.get(type)?.delete(listener); }
  cancel() { this.canceled = true; this.journal.push("animation-cancel"); for (const listener of [...(this.listeners.get("cancel") ?? [])]) listener(); }
  finish() { this.finished = true; for (const listener of [...(this.listeners.get("finish") ?? [])]) listener(); }
}
class FakeElement {
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, Set<() => void>>();
  readonly journal: unknown[] = [];
  readonly animations: FakeAnimation[] = [];
  readonly headers = new Map<string, FakeElement>();
  nodes: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  style = { overflow: "visible", overflowY: "visible", cursor: "crosshair" };
  scrollHeight = 100;
  clientHeight = 100;
  failRemove = false;
  failAnimate = false;
  rect: Rect = { height: 100, left: 0, top: 0, width: 123, bottom: 100 };
  constructor(attrs: Record<string, string> = {}) { for (const [key, value] of Object.entries(attrs)) this.attrs.set(key, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  getBoundingClientRect() { return this.rect; }
  querySelectorAll(selector: string) { return this.nodes.filter((node) => selector.split(", ").some((part) => node.attrs.has(part.slice(1, -1)))); }
  querySelector(selector: string) { return this.headers.get(selector) ?? null; }
  getAnimations() { return this.animations.filter((animation) => !animation.canceled && !animation.finished); }
  animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
    this.journal.push(["animate", frames, options]);
    if (this.failAnimate) throw new Error("animate-failed");
    const animation = new FakeAnimation(this.journal);
    this.animations.push(animation);
    return animation;
  }
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions) {
    this.journal.push(["listen", type, options]);
    this.listeners.set(type, new Set([...(this.listeners.get(type) ?? []), listener]));
  }
  removeEventListener(type: string, listener: () => void) {
    this.journal.push(["remove", type]);
    if (this.failRemove) throw new Error("remove-scroll");
    this.listeners.get(type)?.delete(listener);
  }
  scrollTo(options: ScrollToOptions) { this.journal.push(["scroll-to", options]); }
  emit(type: string) { for (const listener of [...(this.listeners.get(type) ?? [])]) listener(); }
  dom(): HTMLElement { return this as unknown as HTMLElement; }
}
function fixture(nodes: FakeElement[] = []) {
  const root = new FakeElement(), scroll = new FakeElement();
  root.nodes = nodes;
  root.parentElement = scroll;
  scroll.style.overflowY = "auto";
  scroll.scrollHeight = 200;
  scroll.rect.top = 10;
  const frames = new Map<number, () => void>(), listeners = new Map<string, Set<() => void>>(), journal: unknown[] = [];
  const observers: Array<{ callback: () => void; disconnected: boolean }> = [];
  let id = 0, reduced = false, failObserve = false;
  let updateView = (_view: KnorviaGroupedTaskView) => {};
  const window = {
    getComputedStyle: (element: HTMLElement) => ({ overflowY: (element as unknown as FakeElement).style.overflowY }),
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: (callback: () => void) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (frame: number) => { journal.push(["cancel-frame", frame]); },
    addEventListener: (type: string, listener: () => void) => { listeners.set(type, new Set([...(listeners.get(type) ?? []), listener])); },
    removeEventListener: (type: string, listener: () => void) => { journal.push(["remove-window", type]); listeners.get(type)?.delete(listener); },
  } as unknown as Window;
  const ports: GroupedSectionDomPorts = {
    root: () => root.dom(), window,
    setView: (view) => { journal.push(["view", view]); updateView(view); },
    escape: (value) => { journal.push(["escape", value]); return value; },
    resizeObserver: (callback) => {
      const observer = { callback, disconnected: false };
      observers.push(observer);
      return { observe: () => { if (failObserve) throw new Error("observe-failed"); }, disconnect: () => { observer.disconnected = true; journal.push("disconnect"); } } as unknown as ResizeObserver;
    },
  };
  const owner = new GroupedSectionDomOwner(() => ports), stop = owner.activate();
  const run = (frame: number) => { const callback = frames.get(frame)!; frames.delete(frame); callback(); };
  return { owner, stop, ports, root, scroll, frames, listeners, journal, observers, run,
    update: (callback: typeof updateView) => { updateView = callback; }, reduced: (value: boolean) => { reduced = value; }, failObserve: () => { failObserve = true; } };
}
const empty: KnorviaGroupedTaskView = { nodes: [] };

test("geometry preserves half-pixel admission, layout-only heights and last eligible sticky group", () => {
  const before = { height: 40, left: 1, top: 1 };
  assert.equal(projectGroupedLayoutMotion(before, { height: 40, left: 1.49, top: 1.49 }, true), null);
  assert.deepEqual(projectGroupedLayoutMotion(before, { height: 39.5, left: 1, top: 1 }, true), { x: 0, y: 0, heights: [40, 39.5] });
  assert.equal(projectGroupedLayoutMotion(before, { height: 10, left: 1, top: 1 }, false), null);
  assert.deepEqual(projectGroupedLayoutMotion(before, { height: 10, left: 1.5, top: 1 }, false), { x: -0.5, y: 0, heights: null });
  const facts = [
    { id: "first", collapsed: false, bottom: 80, header: { top: 0, height: 0 } },
    { id: "last", collapsed: false, bottom: 80, header: { top: 9, height: 32 } },
    { id: "excluded", collapsed: true, bottom: 100, header: { top: 0, height: 32 } },
  ];
  assert.equal(projectStickyGroupedId(facts, 10), "last");
  facts[1]!.header!.top = 9.5;
  assert.equal(projectStickyGroupedId(facts, 10), "first");
  facts[0]!.bottom = 42.5;
  assert.equal(projectStickyGroupedId(facts, 10), null);
});

test("snapshot duplicate keys use the last old DOM box and layout takes precedence over task key", () => {
  const first = new FakeElement({ "data-grouped-layout-key": "dup", "data-grouped-task-key": "individual" });
  const last = new FakeElement({ "data-grouped-layout-key": "dup" });
  first.rect = { height: 30, left: 0, top: 0, width: 100, bottom: 30 };
  last.rect = { height: 45, left: 5, top: 7, width: 100, bottom: 52 };
  const h = fixture([first, last]);
  h.update(() => { first.rect = { height: 10, left: 10, top: 10, width: 100, bottom: 20 }; });
  h.owner.applyView(empty);
  assert.equal(first.animations.length, 0);
  h.run(1);
  assert.deepEqual(first.journal[0], ["animate", [
    { height: "45px", transform: "translate(-5px, -3px)" }, { height: "10px", transform: "translate(0, 0)" },
  ], { duration: 150, easing: "cubic-bezier(0.2, 0, 0, 1)" }]);
  assert.equal(last.animations.length, 0);
  h.stop();
});

test("replaced layout frames and reduced motion cannot execute old animation commands", () => {
  const node = new FakeElement({ "data-grouped-layout-key": "g" }), h = fixture([node]);
  h.update(() => { node.rect.top += 10; });
  h.owner.applyView(empty);
  const old = h.frames.get(1)!;
  h.owner.applyView(empty);
  old();
  assert.equal(node.animations.length, 0);
  h.reduced(true);
  h.run(2);
  assert.equal(node.animations.length, 0);
  assert.deepEqual(h.journal.filter((entry) => Array.isArray(entry) && entry[0] === "cancel-frame"), [["cancel-frame", 1]]);
  h.stop();
});

test("a synchronous nested layout command owns the frame without the older call cancelling it", () => {
  const node = new FakeElement({ "data-grouped-layout-key": "g" }), h = fixture([node]);
  let reenter = true;
  h.update(() => {
    node.rect.height = 50;
    if (reenter) { reenter = false; h.owner.applyView(empty); }
  });
  h.owner.applyView(empty);
  assert.equal(h.frames.size, 1);
  h.run(1);
  assert.equal(node.animations.length, 0);
  h.stop();
});

test("owned overflow restores on replacement and a queued old finish cannot overwrite the new animation", () => {
  const node = new FakeElement({ "data-grouped-layout-key": "g" }), h = fixture([node]);
  h.update(() => { node.rect.height -= 10; });
  h.owner.applyView(empty);
  h.run(1);
  const first = node.animations[0]!, lateFinish = [...first.listeners.get("finish")!][0]!;
  assert.equal(node.style.overflow, "hidden");
  h.owner.applyView(empty);
  h.run(2);
  const second = node.animations[1]!;
  assert.equal(first.canceled, true);
  assert.equal(node.style.overflow, "hidden");
  lateFinish();
  assert.equal(node.style.overflow, "hidden");
  second.finish();
  assert.equal(node.style.overflow, "visible");
  h.stop();
});

test("animation installation failure restores overflow and releases earlier resources from the same batch", () => {
  const first = new FakeElement({ "data-grouped-layout-key": "a" }), second = new FakeElement({ "data-grouped-layout-key": "b" });
  const h = fixture([first, second]);
  second.failAnimate = true;
  h.update(() => { first.rect.height = 50; second.rect.height = 50; });
  h.owner.applyView(empty);
  assert.throws(() => h.run(1), /animate-failed/);
  assert.equal(first.style.overflow, "visible");
  assert.equal(second.style.overflow, "visible");
  assert.equal(first.animations[0]!.canceled, true);
  h.stop();
});

test("preview widths retain first-hit raw group and encoded task keys", () => {
  const taskKey = "remote:/w::task", encoded = encodeURIComponent(taskKey);
  const task = new FakeElement({ "data-grouped-task-key": encoded }), duplicate = new FakeElement({ "data-grouped-task-key": encoded });
  const group = new FakeElement({ "data-grouped-group-item-id": "g" });
  duplicate.rect.width = 456;
  const h = fixture([task, duplicate, group]);
  assert.equal(h.owner.measure("task", taskKey), 123);
  assert.equal(h.owner.measure("group", "g"), 123);
  assert.equal(h.owner.measure("task", "missing"), null);
  h.stop();
});

function stickyFixture() {
  const first = new FakeElement({ "data-grouped-group-item-id": "first" }), last = new FakeElement({ "data-grouped-group-item-id": "last" });
  const firstHeader = new FakeElement(), lastHeader = new FakeElement(), h = fixture([first, last]);
  firstHeader.rect.top = 0;
  lastHeader.rect.top = 0;
  firstHeader.rect.height = 32;
  lastHeader.rect.height = 32;
  h.root.headers.set('[data-grouped-group-header-id="first"]', firstHeader);
  h.root.headers.set('[data-grouped-group-header-id="last"]', lastHeader);
  return { ...h, lastHeader };
}

test("sticky sources coalesce while top draft and cursor leases release without late publication", () => {
  const h = stickyFixture(), published: Array<string | null> = [], body = new FakeElement();
  const sticky = h.owner.watchSticky((id) => published.push(id))!;
  assert.deepEqual(published, ["last"]);
  h.scroll.emit("scroll");
  for (const callback of h.listeners.get("resize")!) callback();
  h.observers[0]!.callback();
  assert.equal(h.frames.size, 1);
  h.lastHeader.rect.top = 9.5;
  h.run(1);
  assert.deepEqual(published, ["last", "first"]);
  const top = h.owner.scrollTopDraft()!;
  h.run(2);
  assert.deepEqual(h.scroll.journal.at(-1), ["scroll-to", { top: 0 }]);
  top();
  const cursor = h.owner.grabCursor(body.dom())!;
  assert.equal(body.style.cursor, "grabbing");
  h.scroll.emit("scroll");
  const queued = h.frames.get(3)!;
  h.stop();
  queued();
  h.observers[0]!.callback();
  assert.equal(body.style.cursor, "crosshair");
  assert.equal(h.observers[0]!.disconnected, true);
  assert.deepEqual(published, ["last", "first"]);
  sticky();
  cursor();
});

test("teardown attempts observer/window/cursor resources after a listener failure and leaves the callback revoked", () => {
  const h = stickyFixture(), published: Array<string | null> = [], body = new FakeElement();
  h.owner.watchSticky((id) => published.push(id));
  const leftover = [...h.scroll.listeners.get("scroll")!][0]!;
  h.owner.grabCursor(body.dom());
  h.scroll.failRemove = true;
  assert.throws(() => h.stop(), /remove-scroll/);
  assert.equal(h.observers[0]!.disconnected, true);
  assert.equal(body.style.cursor, "crosshair");
  assert.equal(h.listeners.get("resize")!.size, 0);
  leftover();
  assert.deepEqual(published, ["last"]);
});

test("grouped scope layout cleanup leaves physical sticky and cursor leases active", () => {
  const h = stickyFixture(), body = new FakeElement();
  h.owner.watchSticky(() => {});
  h.owner.grabCursor(body.dom());
  h.owner.applyView(empty);
  h.owner.clearLayout();
  assert.equal(h.observers[0]!.disconnected, false);
  assert.equal(h.scroll.listeners.get("scroll")!.size, 1);
  assert.equal(body.style.cursor, "grabbing");
  h.stop();
  assert.equal(h.observers[0]!.disconnected, true);
  assert.equal(body.style.cursor, "crosshair");
});

test("observer installation failure cleans listeners, disconnects and preserves the original error", () => {
  const h = stickyFixture();
  h.failObserve();
  assert.throws(() => h.owner.watchSticky(() => {}), /observe-failed/);
  assert.equal(h.scroll.listeners.get("scroll")!.size, 0);
  assert.equal(h.listeners.get("resize")!.size, 0);
  assert.equal(h.observers[0]!.disconnected, true);
  h.stop();
});
