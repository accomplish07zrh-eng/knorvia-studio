// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeCall, type ActiveNodeReplCall } from "../src/browser-bridge.js";
import {
  NODE_REPL_BROWSER_BRIDGE_SYMBOL,
  readNodeReplBrowserRuntimeBridge,
} from "../src/runtime-bridge.js";
import {
  CUA_UNAVAILABLE_IN_SUBAGENT_MESSAGE,
  NODE_REPL_CUA_BRIDGE_SYMBOL,
} from "../src/cua-bridge.js";

test("bridge symbols retain their public global registry identities", () => {
  assert.equal(
    Symbol.keyFor(NODE_REPL_BROWSER_BRIDGE_SYMBOL),
    "knorvia.node-repl.browser-control-bridge",
  );
  assert.equal(Symbol.keyFor(NODE_REPL_CUA_BRIDGE_SYMBOL), "knorvia.node-repl.computer-use-bridge");
  assert.equal(CUA_UNAVAILABLE_IN_SUBAGENT_MESSAGE, "Computer Use is not available in subagent");
});

test("the bridge reader validates shape without invoking or copying a capability", () => {
  const prototype = {
    list() {},
    execute() {},
    assertAvailable() {
      assert.fail("reader must not invoke availability");
    },
    documentationRoot: "",
  };
  for (const bridge of [
    prototype,
    Object.create(prototype) as object,
    Object.assign(() => {}, prototype),
  ]) {
    assert.equal(
      readNodeReplBrowserRuntimeBridge({ [NODE_REPL_BROWSER_BRIDGE_SYMBOL]: bridge }),
      bridge,
    );
  }
  for (const field of ["list", "execute", "assertAvailable", "documentationRoot"]) {
    for (const value of [undefined, null, 7, {}]) {
      assert.throws(
        () =>
          readNodeReplBrowserRuntimeBridge({
            [NODE_REPL_BROWSER_BRIDGE_SYMBOL]: { ...prototype, [field]: value },
          }),
        /Browser runtime bridge is unavailable/,
      );
    }
  }
  for (const value of [undefined, null, false, 42, "invalid"]) {
    assert.throws(
      () => readNodeReplBrowserRuntimeBridge({ [NODE_REPL_BROWSER_BRIDGE_SYMBOL]: value }),
      /Browser runtime bridge is unavailable/,
    );
  }
});

test("active call validation preserves generation, cancellation and subagent precedence", () => {
  const controller = new AbortController();
  let current: ActiveNodeReplCall | undefined = {
    generation: 7,
    signal: controller.signal,
    requestMeta: {},
  };
  const input = { generation: 7, getActiveCall: () => current };
  assert.equal(activeCall(input, "Browser"), current);
  current.requestMeta.runtime_scope = "subagent";
  assert.throws(() => activeCall(input, "Browser"), /Browser is not available in subagent/);
  assert.throws(
    () => activeCall(input, "Computer Use"),
    /Computer Use is not available in subagent/,
  );
  const reason = new Error("fixture cancelled");
  controller.abort(reason);
  assert.throws(
    () => activeCall(input, "Browser"),
    (error) => error === reason,
  );
  current.generation += 1;
  assert.throws(() => activeCall(input, "Browser"), /stale after kernel reset/);
  current = undefined;
  assert.throws(() => activeCall(input, "Computer Use"), /Computer Use runtime binding is stale/);
});
