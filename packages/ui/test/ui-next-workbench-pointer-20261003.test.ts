// SPDX-License-Identifier: Apache-2.0
// Pending fake-document/registry contracts; no browser/React execution claim.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkbenchPointerPositionTracker } from "../src/v4/workbenchPointerPositionTracker.js";
import { WorkbenchPointerDropRegistry, type WorkbenchPointerDropTargetController } from "../src/v4/workbenchPointerDropRegistry.js";
import type { WorkbenchSessionDragPayload } from "../src/v4/workbenchDragDrop.js";

const payload: WorkbenchSessionDragPayload = { kind: "knorvia/session", workspacePath: "/fixture", workspaceIdentity: "identity-fixture", remoteSessionId: "attachment-fixture", sessionId: "session-fixture" };
const event = (type: string, x = 1, y = 2) => ({ type, clientX: x, clientY: y }) as unknown as Event;

function documentFixture() {
  const attached = new Map<string, EventListener>(), journal: string[] = [];
  let failAdd: string | undefined, failRemove: string | undefined;
  const failure = new Error("observer operation failed");
  const document = {
    addEventListener: (type: string, listener: EventListener, capture: boolean) => {
      assert.equal(capture, true);
      attached.set(type, listener);
      journal.push(`add:${type}`);
      if (type === failAdd) throw failure;
    },
    removeEventListener: (type: string, listener: EventListener, capture: boolean) => {
      assert.equal(capture, true);
      assert.equal(attached.get(type), listener);
      journal.push(`remove:${type}`);
      if (type === failRemove) throw failure;
      attached.delete(type);
    },
  } as unknown as Document;
  return { document, journal, failure, attached,
    emit: (type: string, x: number, y: number) => attached.get(type)?.(event(type, x, y)),
    failAdd: (type: string) => { failAdd = type; }, failRemove: (type: string) => { failRemove = type; },
  };
}

test("numeric activation owns three capture listeners; move/up retain viewport numbers and stable read references", () => {
  const h = documentFixture();
  const tracker = createWorkbenchPointerPositionTracker(h.document, event("pointerdown", 4, 5))!;
  assert.deepEqual(h.journal, ["add:pointermove", "add:pointerup", "add:pointercancel"]);
  const initial = tracker.getPosition();
  assert.equal(tracker.getPosition(), initial);
  h.emit("pointermove", 11, 12);
  assert.deepEqual(tracker.getPosition(), { x: 11, y: 12 });
  assert.notEqual(tracker.getPosition(), initial);
  h.emit("pointerup", 21, 22);
  assert.deepEqual(tracker.getPosition(), { x: 21, y: 22 });
  assert.equal(h.attached.size, 0);
  const count = h.journal.length;
  tracker.dispose();
  assert.equal(h.journal.length, count);
});

test("cancel keeps the last move and nonnumeric activation installs nothing; NaN remains a number", () => {
  const h = documentFixture();
  assert.equal(createWorkbenchPointerPositionTracker(h.document, {} as Event), null);
  assert.equal(createWorkbenchPointerPositionTracker(h.document, { clientX: "1", clientY: 2 } as unknown as Event), null);
  assert.deepEqual(h.journal, []);
  const tracker = createWorkbenchPointerPositionTracker(h.document, event("pointerdown", NaN, -1))!;
  assert.equal(Number.isNaN(tracker.getPosition().x), true);
  h.emit("pointermove", 2, 3);
  const position = tracker.getPosition();
  h.emit("pointercancel", 100, 101);
  assert.equal(tracker.getPosition(), position);
  assert.equal(h.attached.size, 0);
});

test("partial installation and removal failures attempt every owned cleanup and rethrow the original error", () => {
  const installation = documentFixture();
  installation.failAdd("pointerup");
  assert.throws(() => createWorkbenchPointerPositionTracker(installation.document, event("pointerdown")), (error) => error === installation.failure);
  assert.equal(installation.attached.size, 0);
  assert.deepEqual(installation.journal, ["add:pointermove", "add:pointerup", "remove:pointermove", "remove:pointerup"]);
  const removal = documentFixture();
  const tracker = createWorkbenchPointerPositionTracker(removal.document, event("pointerdown"))!;
  removal.failRemove("pointermove");
  assert.throws(() => tracker.dispose(), (error) => error === removal.failure);
  assert.deepEqual(removal.journal.slice(-3), ["remove:pointermove", "remove:pointerup", "remove:pointercancel"]);
  const before = tracker.getPosition();
  removal.emit("pointermove", 90, 91);
  assert.equal(tracker.getPosition(), before);
  tracker.dispose();
});

function element(left = 0, width = 100) {
  return { getBoundingClientRect: () => ({ left, top: 0, width, height: 100 }) } as HTMLElement;
}
function controller(journal: unknown[], name: string): WorkbenchPointerDropTargetController {
  return { onPreview: (side) => { journal.push([name, "preview", side]); },
    onDrop: (side, dropped) => { journal.push([name, "drop", side, dropped]); } };
}

test("registry chooses the first admitted geometric hit, repeats preview, and clears before drop", () => {
  const registry = new WorkbenchPointerDropRegistry(), journal: unknown[] = [];
  registry.register(element(), { ...controller(journal, "disabled"), canDrop: () => false });
  const unregisterFirst = registry.register(element(), controller(journal, "first"));
  registry.register(element(), controller(journal, "second"));
  assert.equal(registry.update(payload, 10, 50), true);
  assert.equal(registry.update(payload, 15, 50), true);
  assert.deepEqual(journal, [["first", "preview", "left"], ["first", "preview", "left"]]);
  assert.equal(registry.finish(payload, 10, 50), true);
  assert.deepEqual(journal.slice(-2), [["first", "preview", null], ["first", "drop", "left", payload]]);
  unregisterFirst();
  assert.equal(registry.update(payload, 90, 50), true);
  assert.deepEqual(journal.at(-1), ["second", "preview", "right"]);
  registry.cancel();
});

test("target changes and misses clear previews; zero size, center and out-of-bounds stay misses", () => {
  const registry = new WorkbenchPointerDropRegistry(), journal: unknown[] = [];
  registry.register(element(0, 0), controller(journal, "zero"));
  registry.register(element(), controller(journal, "left-pane"));
  registry.register(element(100), controller(journal, "right-pane"));
  registry.update(payload, 10, 50);
  registry.update(payload, 190, 50);
  assert.deepEqual(journal, [["left-pane", "preview", "left"], ["left-pane", "preview", null], ["right-pane", "preview", "right"]]);
  assert.equal(registry.update(payload, 150, 50), false);
  assert.deepEqual(journal.at(-1), ["right-pane", "preview", null]);
  const count = journal.length;
  assert.equal(registry.finish(payload, -1, 50), false);
  registry.cancel();
  assert.equal(journal.length, count);
});

test("unregister removes ownership before its clear callback and is safe when that callback unregisters again", () => {
  const registry = new WorkbenchPointerDropRegistry(), journal: unknown[] = [];
  let unregister = () => {};
  unregister = registry.register(element(), {
    ...controller(journal, "reentrant"),
    onPreview: (side) => { journal.push(side); if (side === null) unregister(); },
  });
  registry.update(payload, 10, 50);
  unregister();
  unregister();
  assert.deepEqual(journal, ["left", null]);
  assert.equal(registry.update(payload, 10, 50), false);
});

test("canDrop revocation and clear callback revocation prevent delivering drop to removed targets", () => {
  const registry = new WorkbenchPointerDropRegistry(), journal: unknown[] = [];
  let remove = () => {}, revoke = false;
  remove = registry.register(element(), { ...controller(journal, "revoked"), canDrop: () => { if (revoke) remove(); return true; } });
  registry.update(payload, 10, 50);
  revoke = true;
  assert.equal(registry.finish(payload, 10, 50), false);
  assert.deepEqual(journal, [["revoked", "preview", "left"], ["revoked", "preview", null]]);
  const removeOnClear = registry.register(element(), {
    ...controller(journal, "clear-revoked"), onPreview: (side) => { if (side === null) removeOnClear(); },
  });
  registry.update(payload, 10, 50);
  assert.equal(registry.finish(payload, 10, 50), false);
  assert.equal(journal.some((entry) => Array.isArray(entry) && entry[1] === "drop"), false);
});

test("a clear callback's newer update keeps its preview and makes the outer update stop", () => {
  const registry = new WorkbenchPointerDropRegistry(), journal: unknown[] = [];
  let reenter = false;
  registry.register(element(), { ...controller(journal, "old"), onPreview: (side) => {
    journal.push(["old", side]);
    if (side === null && reenter) registry.update(payload, 290, 50);
  } });
  registry.register(element(100), controller(journal, "outer"));
  registry.register(element(200), controller(journal, "newer"));
  registry.update(payload, 10, 50);
  reenter = true;
  assert.equal(registry.update(payload, 190, 50), false);
  assert.deepEqual(journal, [["old", "left"], ["old", null], ["newer", "preview", "right"]]);
  registry.cancel();
  assert.deepEqual(journal.at(-1), ["newer", "preview", null]);
});

test("preview/drop callback errors remain visible and a thrown clear is not repeated", () => {
  const registry = new WorkbenchPointerDropRegistry(), failure = new Error("callback failed");
  let clears = 0;
  const remove = registry.register(element(), { onDrop: () => { throw failure; }, onPreview: (side) => {
    if (side === null) { clears += 1; throw failure; }
  } });
  registry.update(payload, 10, 50);
  assert.throws(() => registry.cancel(), (error) => error === failure);
  registry.cancel();
  assert.equal(clears, 1);
  assert.throws(() => registry.finish(payload, 10, 50), (error) => error === failure);
  remove();
});
