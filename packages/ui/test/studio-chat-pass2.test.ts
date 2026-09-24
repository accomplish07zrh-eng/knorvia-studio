import assert from "node:assert/strict";
import test from "node:test";
import type { IStudioRuntimeService } from "@knorvia/services";
import { createStudioAgentStore } from "../src/store/studioAgentStore.js";
import { watchStudioDraftUnload } from "../src/studio/agents/draftUnloadWarning.js";

const memory = () => {
  let raw: string | null = null;
  return {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
};
const oversized = "完整草稿".repeat(5_000) + "末尾也不能丢失";

test("oversized edits remain intact across view subscriptions without replacing the last saved draft", () => {
  const disk = memory();
  const store = createStudioAgentStore(disk);
  store.getState().saveDraft("chat", "codex", "saved draft");
  const lastSaved = disk.getItem();
  assert.equal(store.getState().saveDraft("chat", "codex", oversized), false);
  assert.equal(store.getState().drafts.chat?.text, oversized);
  assert.equal(store.getState().dirty, true);
  assert.equal(store.getState().actionError, "draft-too-long");
  assert.equal(store.getState().retrySave(), false);
  assert.equal(disk.getItem(), lastSaved);
  // 页面卸载只是取消订阅，回到同一窗口的会话仍读唯一 store。
  const unsubscribe = store.subscribe(() => {});
  unsubscribe();
  assert.equal(store.getState().drafts.chat?.text, oversized);
  assert.equal(store.getState().saveDraft("other", "claude-code", "also pending"), false);
  assert.equal(disk.getItem(), lastSaved);
  assert.equal(store.getState().saveDraft("chat", "codex", "shortened"), true);
  assert.equal(store.getState().dirty, false);
  assert.equal(store.getState().actionError, null);
  const restarted = createStudioAgentStore(disk);
  assert.equal(restarted.getState().drafts.chat?.text, "shortened");
  assert.equal(restarted.getState().drafts.other?.text, "also pending");
});

test("a stale send ACK and selection changes cannot erase or truncate the new long draft", () => {
  const store = createStudioAgentStore(memory());
  store.getState().saveDraft("chat", "codex", "submitted");
  store.getState().saveDraft("chat", "codex", oversized);
  assert.equal(store.getState().acknowledgeDraft("chat", "codex", "submitted"), false);
  store.getState().setDraftSelection("chat", "codex", { model: "new-model" });
  assert.equal(store.getState().drafts.chat?.text, oversized);
  assert.equal(store.getState().dirty, true);
});

test("draft unload warning lasts across page changes and clears only after saving or explicit reset", () => {
  const store = createStudioAgentStore(memory());
  let listener: ((event: BeforeUnloadEvent) => void) | undefined;
  const cleanup = watchStudioDraftUnload(store, {
    addEventListener: (_type, handler) => {
      listener = handler;
    },
    removeEventListener: (_type, handler) => {
      if (listener === handler) listener = undefined;
    },
  });
  assert.equal(listener, undefined);
  store.getState().saveDraft("chat", "codex", oversized);
  assert.ok(listener);
  let prevented = false;
  listener({
    preventDefault: () => {
      prevented = true;
    },
    returnValue: "unchanged",
  } as BeforeUnloadEvent);
  assert.equal(prevented, true);
  store.getState().retrySave();
  assert.ok(listener);
  store.getState().saveDraft("chat", "codex", "short enough");
  assert.equal(listener, undefined);
  store.getState().saveDraft("chat", "codex", oversized);
  assert.ok(listener);
  store.getState().resetLocalData();
  assert.equal(listener, undefined);
  cleanup();
});

test("management survives page changes, rejects duplicate requests and never configures an old snapshot", async () => {
  const store = createStudioAgentStore(memory());
  let finish!: () => void;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let calls = 0;
  // Proxy 拒绝管理之外的服务方法：若 UI 所有者重写 configure，本测试立即失败。
  const service = new Proxy(
    {},
    {
      get(_target, property) {
        assert.equal(property, "manageKernel");
        return async () => {
          calls++;
          await wait;
          return { installed: true, origin: "managed", executablePath: "D:/managed/cli.exe" };
        };
      },
    },
  ) as IStudioRuntimeService;
  const running = store.getState().manageKernel(service, { kernel: "codex", action: "install" });
  const unsubscribe = store.subscribe(() => {});
  unsubscribe();
  assert.equal(store.getState().management?.pending, true);
  assert.equal(
    await store.getState().manageKernel(service, { kernel: "codex", action: "update" }),
    false,
  );
  store
    .getState()
    .saveConfig("codex", { executablePath: "D:/external/cli.exe", permission: "read-only" });
  finish();
  assert.equal(await running, true);
  assert.equal(calls, 1);
  assert.equal(store.getState().management?.pending, false);
  assert.equal(store.getState().configs.codex.executablePath, "D:/external/cli.exe");
  assert.equal(store.getState().configs.codex.permission, "read-only");
});

test("management errors survive returning to settings and a retry clears the old error", async () => {
  const store = createStudioAgentStore(memory());
  let fail = true;
  const service = {
    manageKernel: async () => {
      if (fail) throw new Error("download failed");
    },
  } as unknown as IStudioRuntimeService;
  const params = { kernel: "codex", action: "install" } as const;
  assert.equal(await store.getState().manageKernel(service, params), false);
  assert.equal(store.getState().management?.pending, false);
  assert.equal(store.getState().management?.error, "download failed");
  fail = false;
  assert.equal(await store.getState().manageKernel(service, params), true);
  assert.equal(store.getState().management?.error, "");
});
