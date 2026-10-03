// SPDX-License-Identifier: Apache-2.0
// Source-exposed DOM resource owner; source/runtime review pending, original selectors/parameters retained.
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import { projectGroupedLayoutMotion, projectStickyGroupedId, type GroupedLayoutBox, type GroupedLayoutMotion, type GroupedStickyFact } from "./groupedSectionGeometry.js";

type LayoutSnapshot = { layout: Map<string, GroupedLayoutBox>; task: Map<string, GroupedLayoutBox> };
type Resource = { accepts: () => boolean; own: (cleanup: () => void) => void; release: () => void };
export type GroupedSectionDomPorts = {
  root: () => HTMLElement | null;
  window: Window;
  setView: (view: KnorviaGroupedTaskView) => void;
  escape: (value: string) => string;
  resizeObserver: (callback: () => void) => ResizeObserver | null;
};
const attributes = { layout: "data-grouped-layout-key", task: "data-grouped-task-key" } as const;

function releaseAll(operations: readonly (() => void)[]): void {
  let failed = false, failure: unknown;
  for (const operation of operations) {
    try { operation(); } catch (error) { if (!failed) failure = error; failed = true; }
  }
  if (failed) throw failure;
}
function nearestScroller(element: HTMLElement, window: Window): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(window.getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return null;
}
function capture(root: HTMLElement | null): LayoutSnapshot {
  const snapshot: LayoutSnapshot = { layout: new Map(), task: new Map() };
  if (!root) return snapshot;
  for (const kind of ["layout", "task"] as const) {
    for (const element of root.querySelectorAll<HTMLElement>(`[${attributes[kind]}]`)) {
      const key = element.getAttribute(attributes[kind]);
      if (!key) continue;
      const { height, left, top } = element.getBoundingClientRect();
      snapshot[kind].set(key, { height, left, top });
    }
  }
  return snapshot;
}

/** The resource set owns leases. Frame/element entries are revocable indices into that set. */
export class GroupedSectionDomOwner {
  private scope: object | null = null;
  private readonly resources = new Set<Resource>();
  private frame: Resource | null = null;
  private layout: object | null = null;
  private readonly animations = new Map<HTMLElement, Resource>();

  constructor(private readonly ports: () => GroupedSectionDomPorts) {}
  activate(): () => void {
    this.scope = null;
    this.layout = null;
    releaseAll([...this.resources].map((resource) => resource.release));
    const scope = {};
    this.scope = scope;
    return () => {
      if (this.scope !== scope) return;
      this.scope = null;
      this.layout = null;
      releaseAll([...this.resources].map((resource) => resource.release));
    };
  }
  private resource(): Resource {
    const scope = this.scope, cleanups: Array<() => void> = [];
    let active = true;
    const resource: Resource = {
      accepts: () => active && scope !== null && this.scope === scope,
      own: (cleanup) => { if (active) cleanups.push(cleanup); else cleanup(); },
      release: () => {
        if (!active) return;
        active = false;
        this.resources.delete(resource);
        const operations = cleanups.splice(0);
        releaseAll(operations);
      },
    };
    this.resources.add(resource);
    return resource;
  }
  private install<T>(resource: Resource, acquire: () => T): T {
    try { return acquire(); } catch (error) {
      try { resource.release(); } catch { /* keep the first installation error */ }
      throw error;
    }
  }
  clearLayout = (): void => {
    this.layout = null;
    const resources = new Set(this.animations.values());
    if (this.frame) resources.add(this.frame);
    releaseAll([...resources].map((resource) => resource.release));
  };
  applyView = (view: KnorviaGroupedTaskView): void => {
    if (!this.scope) return;
    const scope = this.scope, layout = {};
    this.layout = layout;
    const ports = this.ports(), previous = capture(ports.root());
    ports.setView(view);
    if (this.scope !== scope || this.layout !== layout) return;
    this.frame?.release();
    const resource = this.resource();
    this.frame = resource;
    let frameId: number | null = null;
    resource.own(() => { if (this.frame === resource) this.frame = null; });
    resource.own(() => { if (frameId !== null) ports.window.cancelAnimationFrame(frameId); });
    this.install(resource, () => {
      frameId = ports.window.requestAnimationFrame(() => {
        if (!resource.accepts() || this.frame !== resource) return;
        frameId = null;
        resource.release();
        this.animate(previous, layout);
      });
    });
  };
  private animate(previous: LayoutSnapshot, layout: object): void {
    const ports = this.ports(), root = ports.root();
    if (!this.scope || this.layout !== layout || !root || (!previous.layout.size && !previous.task.size) || ports.window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const acquired: Resource[] = [];
    try {
      for (const element of root.querySelectorAll<HTMLElement>("[data-grouped-layout-key], [data-grouped-task-key]")) {
        if (!this.scope || this.layout !== layout) break;
        const layoutKey = element.getAttribute(attributes.layout), taskKey = element.getAttribute(attributes.task);
        const before = layoutKey ? previous.layout.get(layoutKey) : taskKey ? previous.task.get(taskKey) : undefined;
        if (!before) continue;
        const motion = projectGroupedLayoutMotion(before, element.getBoundingClientRect(), Boolean(layoutKey));
        if (!motion) continue;
        this.animations.get(element)?.release();
        releaseAll(element.getAnimations().map((animation) => () => animation.cancel()));
        if (!this.scope || this.layout !== layout) break;
        const resource = this.resource();
        acquired.push(resource);
        this.startAnimation(element, motion, resource);
      }
      if (this.layout !== layout) releaseAll(acquired.map((resource) => resource.release));
    } catch (error) {
      try { releaseAll(acquired.map((resource) => resource.release)); } catch { /* keep the first animation error */ }
      throw error;
    }
  }
  private startAnimation(element: HTMLElement, motion: GroupedLayoutMotion, resource: Resource): void {
    const overflow = element.style.overflow;
    this.animations.set(element, resource);
    resource.own(() => { if (this.animations.get(element) === resource) this.animations.delete(element); });
    resource.own(() => { element.style.overflow = overflow; });
    this.install(resource, () => {
      if (motion.heights) element.style.overflow = "hidden";
      const animation = element.animate([
        { height: motion.heights ? `${motion.heights[0]}px` : undefined, transform: `translate(${motion.x}px, ${motion.y}px)` },
        { height: motion.heights ? `${motion.heights[1]}px` : undefined, transform: "translate(0, 0)" },
      ], { duration: 150, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      if (!resource.accepts()) { animation.cancel(); return; }
      let settled = false;
      const done = () => { if (!resource.accepts()) return; settled = true; resource.release(); };
      // Register cancellation before listeners so any partial installation still releases the animation.
      resource.own(() => animation.removeEventListener("finish", done));
      resource.own(() => animation.removeEventListener("cancel", done));
      resource.own(() => { if (!settled) animation.cancel(); });
      animation.addEventListener("finish", done, { once: true });
      animation.addEventListener("cancel", done, { once: true });
    });
  }
  measure = (kind: "group" | "task", key: string): number | null => {
    if (!this.scope) return null;
    const root = this.ports().root();
    if (!root) return null;
    const attribute = kind === "task" ? attributes.task : "data-grouped-group-item-id";
    const target = kind === "task" ? encodeURIComponent(key) : key;
    for (const element of root.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
      if (element.getAttribute(attribute) === target) return element.getBoundingClientRect().width;
    }
    return null;
  };
  watchSticky(publish: (id: string | null) => void): (() => void) | undefined {
    if (!this.scope) return;
    const ports = this.ports(), root = ports.root(), scroll = root ? nearestScroller(root, ports.window) : null;
    if (!root || !scroll) { publish(null); return; }
    const resource = this.resource();
    let frameId: number | null = null;
    const update = () => {
      if (!resource.accepts()) return;
      frameId = null;
      const ancestor = nearestScroller(root, ports.window);
      if (!ancestor) { publish(null); return; }
      const containerTop = ancestor.getBoundingClientRect().top;
      const facts: GroupedStickyFact[] = [];
      for (const element of root.querySelectorAll<HTMLElement>("[data-grouped-group-item-id]")) {
        if (element.getAttribute("data-group-collapsed") === "true") continue;
        const id = element.getAttribute("data-grouped-group-item-id");
        const header = id ? root.querySelector<HTMLElement>(`[data-grouped-group-header-id="${ports.escape(id)}"]`) : null;
        if (!id || !header) continue;
        facts.push({ id, collapsed: false, bottom: element.getBoundingClientRect().bottom, header: header.getBoundingClientRect() });
      }
      publish(projectStickyGroupedId(facts, containerTop));
    };
    const schedule = () => {
      if (!resource.accepts() || frameId !== null) return;
      this.install(resource, () => { frameId = ports.window.requestAnimationFrame(update); });
    };
    this.install(resource, () => {
      resource.own(() => { if (frameId !== null) ports.window.cancelAnimationFrame(frameId); frameId = null; });
      update();
      if (!resource.accepts()) return;
      resource.own(() => scroll.removeEventListener("scroll", schedule));
      scroll.addEventListener("scroll", schedule, { passive: true });
      resource.own(() => ports.window.removeEventListener("resize", schedule));
      ports.window.addEventListener("resize", schedule);
      const observer = ports.resizeObserver(schedule);
      if (observer) { resource.own(() => observer.disconnect()); if (resource.accepts()) observer.observe(root); }
    });
    return resource.release;
  }
  scrollTopDraft(): (() => void) | undefined {
    if (!this.scope) return;
    const ports = this.ports(), root = ports.root();
    if (!root) return;
    const resource = this.resource();
    let frameId: number | null = null;
    resource.own(() => { if (frameId !== null) ports.window.cancelAnimationFrame(frameId); });
    this.install(resource, () => {
      frameId = ports.window.requestAnimationFrame(() => {
        if (!resource.accepts()) return;
        frameId = null;
        try { nearestScroller(root, ports.window)?.scrollTo({ top: 0 }); } finally { resource.release(); }
      });
    });
    return resource.release;
  }
  grabCursor(body: HTMLElement): (() => void) | undefined {
    if (!this.scope) return;
    const resource = this.resource(), previous = body.style.cursor;
    resource.own(() => { body.style.cursor = previous; });
    this.install(resource, () => { body.style.cursor = "grabbing"; });
    return resource.release;
  }
}
