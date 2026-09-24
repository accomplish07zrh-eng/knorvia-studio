import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopQuitLifecycle } from "../src/main/desktopQuitLifecycle.js";
import {
  createUnsavedChangesGuard,
  unsavedChangesDialogOptions,
} from "../src/main/desktopUnsavedChanges.js";

function event() {
  return {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

function harness(confirmQuit = () => true) {
  const calls: string[] = [];
  const forceQuitRef = { current: false };
  const explicitQuitRef = { current: false };
  let release!: () => void;
  const cleaned = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lifecycle = createDesktopQuitLifecycle({
    forceQuitRef,
    explicitQuitRef,
    confirmQuit,
    prepare: async () => {
      calls.push("prepare");
      await cleaned;
    },
    requestQuit: () => calls.push("request"),
    relaunch: () => calls.push("relaunch"),
    exit: () => calls.push("exit"),
    onError: () => calls.push("error"),
  });
  return { lifecycle, calls, forceQuitRef, explicitQuitRef, release };
}

test("quit intent leaves background intact; staying resets intent and permits a later exit", async () => {
  const h = harness();
  h.explicitQuitRef.current = true;
  const begin = event();
  h.lifecycle.beforeQuit(begin);
  assert.equal(begin.prevented, false);
  assert.equal(h.forceQuitRef.current, true);
  assert.deepEqual(h.calls, []);
  const unload = event();
  createUnsavedChangesGuard({
    confirm: () => false,
    stay: h.lifecycle.cancel,
    onError: assert.fail,
  })(unload);
  assert.equal(unload.prevented, false);
  assert.equal(h.forceQuitRef.current, false);
  assert.equal(h.explicitQuitRef.current, false);
  assert.deepEqual(h.calls, []);
  h.lifecycle.beforeQuit(event());
  const accepted = event();
  createUnsavedChangesGuard({
    confirm: () => true,
    stay: h.lifecycle.cancel,
    onError: assert.fail,
  })(accepted);
  assert.equal(accepted.prevented, true);
  const final = event();
  const completion = h.lifecycle.willQuit(final);
  assert.equal(final.prevented, true);
  await Promise.resolve();
  assert.deepEqual(h.calls, ["prepare"]);
  h.release();
  await completion;
  assert.deepEqual(h.calls, ["prepare", "exit"]);
});

test("cancelled relaunch does not leak into the next ordinary quit", async () => {
  const h = harness();
  h.lifecycle.requestRelaunch();
  h.lifecycle.beforeQuit(event());
  h.lifecycle.cancel();
  h.lifecycle.beforeQuit(event());
  const completion = h.lifecycle.willQuit(event());
  h.release();
  await completion;
  assert.deepEqual(h.calls, ["request", "prepare", "exit"]);
});

test("repeated quit and restart requests share one final cleanup and relaunch", async () => {
  const h = harness();
  h.lifecycle.requestRelaunch();
  h.lifecycle.beforeQuit(event());
  const first = h.lifecycle.willQuit(event());
  assert.equal(h.lifecycle.willQuit(event()), first);
  const repeated = event();
  h.lifecycle.beforeQuit(repeated);
  h.lifecycle.requestRelaunch();
  assert.equal(repeated.prevented, true);
  h.release();
  await first;
  assert.deepEqual(h.calls, ["request", "prepare", "relaunch", "exit"]);
});

test("running-session confirmation cancellation also resets tray and restart intent", () => {
  const h = harness(() => false);
  h.lifecycle.requestRelaunch();
  const begin = event();
  h.lifecycle.beforeQuit(begin);
  assert.equal(begin.prevented, true);
  assert.equal(h.forceQuitRef.current, false);
  assert.equal(h.explicitQuitRef.current, false);
  assert.deepEqual(h.calls, ["request"]);
});

test("native confirmation avoids reentrant prompts and fails safely", () => {
  let prompts = 0;
  let stays = 0;
  let errors = 0;
  const nested = event();
  const guard = createUnsavedChangesGuard({
    confirm: () => {
      prompts++;
      guard(nested);
      throw new Error("dialog unavailable");
    },
    stay: () => {
      stays++;
    },
    onError: () => {
      errors++;
    },
  });
  const first = event();
  guard(first);
  assert.equal(prompts, 1);
  assert.equal(stays, 1);
  assert.equal(errors, 1);
  assert.equal(first.prevented, false);
  assert.equal(nested.prevented, false);
  guard(event());
  assert.equal(prompts, 2);
});

test("both desktop locales default and cancel to keeping the application", () => {
  for (const locale of ["zh-CN", "en-US"] as const) {
    const copy = unsavedChangesDialogOptions(locale);
    assert.equal(copy.defaultId, 0);
    assert.equal(copy.cancelId, 0);
    assert.equal(copy.buttons?.length, 2);
  }
  assert.equal(unsavedChangesDialogOptions("zh-CN").buttons?.[0], "留在应用");
  assert.equal(unsavedChangesDialogOptions("en-US").buttons?.[0], "Stay in app");
});

test("a cleanup failure retains the existing final-exit policy after windows have closed", async () => {
  const calls: string[] = [];
  const lifecycle = createDesktopQuitLifecycle({
    forceQuitRef: { current: false },
    explicitQuitRef: { current: false },
    confirmQuit: () => true,
    prepare: async () => {
      throw new Error("host cleanup unavailable");
    },
    requestQuit: () => {},
    relaunch: () => {},
    onError: () => {
      calls.push("error");
    },
    exit: () => {
      calls.push("exit");
    },
  });
  lifecycle.beforeQuit(event());
  await lifecycle.willQuit(event());
  assert.deepEqual(calls, ["error", "exit"]);
});
