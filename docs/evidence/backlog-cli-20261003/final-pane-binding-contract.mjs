// Synthetic in-memory probe; no React, DOM, storage or application startup.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INITIAL_PANE_LAYOUT,
  V4_PRIMARY_PANE_ID,
  applyPaneLayoutCommand,
  splitPaneAt,
} from "../../../packages/ui/src/v4/paneLayoutTree.ts";

const scope = { workspacePath: "/fixture", workspaceIdentity: " fixture-identity " };
function fixture(binding) {
  const state = splitPaneAt(INITIAL_PANE_LAYOUT, V4_PRIMARY_PANE_ID, "row", binding);
  return { state, paneId: state.focusedPaneId };
}

test("bind and confirm missing panes leave the original snapshot untouched", () => {
  for (const kind of ["bind", "confirm"]) {
    assert.equal(
      applyPaneLayoutCommand(INITIAL_PANE_LAYOUT, { kind, paneId: "missing", sessionId: "s" }),
      INITIAL_PANE_LAYOUT,
    );
  }
});

test("same confirmed session is a no-op and keeps the existing read-only binding", () => {
  const binding = { workspaceScope: scope, sessionId: "s", readOnly: true };
  const { state, paneId } = fixture(binding);
  assert.equal(applyPaneLayoutCommand(state, { kind: "bind", paneId, sessionId: "s" }), state);
  assert.equal(applyPaneLayoutCommand(state, { kind: "confirm", paneId }), state);
  assert.equal(state.panes[paneId], binding);
});

test("bind clears restored state even for the same session and preserves scope, tree and focus", () => {
  const binding = {
    workspaceScope: scope,
    sessionId: "s",
    readOnly: true,
    restoredUnvalidated: true,
  };
  const { state, paneId } = fixture(binding);
  const next = applyPaneLayoutCommand(state, { kind: "bind", paneId, sessionId: "s" });
  assert.notEqual(next, state);
  assert.equal(next.root, state.root);
  assert.equal(next.focusedPaneId, paneId);
  assert.deepEqual(Object.keys(next.panes[paneId]), ["workspaceScope", "sessionId"]);
  assert.equal(next.panes[paneId].workspaceScope, scope);
  assert.equal(state.panes[paneId], binding);
  assert.equal(applyPaneLayoutCommand(next, { kind: "bind", paneId, sessionId: "s" }), next);
});

test("changed and empty session ids remain valid bind values", () => {
  const { state, paneId } = fixture({ workspaceScope: scope, sessionId: null });
  for (const sessionId of ["changed", ""]) {
    const next = applyPaneLayoutCommand(state, { kind: "bind", paneId, sessionId });
    assert.equal(next.panes[paneId].sessionId, sessionId);
    assert.equal(next.panes[paneId].workspaceScope, scope);
    assert.equal(next.root, state.root);
  }
});

test("confirm uses the stored session and never reads a bind-only command getter", () => {
  for (const sessionId of ["stored", null]) {
    const { state, paneId } = fixture({
      workspaceScope: scope,
      sessionId,
      restoredUnvalidated: true,
    });
    const next = applyPaneLayoutCommand(state, {
      kind: "confirm",
      paneId,
      get sessionId() {
        throw new Error("confirm must not read bind-only payload");
      },
    });
    assert.deepEqual(next.panes[paneId], { workspaceScope: scope, sessionId });
    assert.equal(next.root, state.root);
    assert.equal(applyPaneLayoutCommand(next, { kind: "confirm", paneId }), next);
  }
});

test("focus and close retain their own routes without reading a session payload", () => {
  const { state, paneId } = fixture({ workspaceScope: scope, sessionId: "s" });
  const command = (kind, target) => ({
    kind,
    paneId: target,
    get sessionId() {
      throw new Error("non-bind route read a session payload");
    },
  });
  const focused = applyPaneLayoutCommand(state, command("focus", V4_PRIMARY_PANE_ID));
  assert.equal(focused.focusedPaneId, V4_PRIMARY_PANE_ID);
  const closed = applyPaneLayoutCommand(focused, command("close", paneId));
  assert.deepEqual(closed.panes, {});
  assert.equal(closed.root.type, "leaf");
  assert.equal(closed.root.paneId, V4_PRIMARY_PANE_ID);
});
