import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioAgentStore,
  STUDIO_AGENT_STORAGE_KEY,
  type StudioAgentStorage,
} from "../src/store/studioAgentStore.js";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(STUDIO_AGENT_STORAGE_KEY, initial);
  let writes = 0;
  let rejectWrites = false;
  const storage: StudioAgentStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (rejectWrites) throw new Error("Quota exceeded");
      writes += 1;
      values.set(key, value);
    },
  };
  return {
    storage,
    values,
    writes: () => writes,
    failWrites: (fail: boolean) => {
      rejectWrites = fail;
    },
  };
}

test("connection preferences round-trip without claiming installed or connected status", () => {
  const disk = memoryStorage();
  const first = createStudioAgentStore(disk.storage);
  assert.equal(
    first.getState().saveConfig("codex", {
      executablePath: "C:\\Tools\\Codex\\codex.exe",
      permission: "read-only",
    }),
    true,
  );
  const reopened = createStudioAgentStore(disk.storage);
  assert.deepEqual(reopened.getState().configs.codex, {
    executablePath: "C:\\Tools\\Codex\\codex.exe",
    permission: "read-only",
  });
  assert.equal("installed" in reopened.getState().configs.codex, false);
  assert.equal("connected" in reopened.getState().configs.codex, false);
  assert.equal(
    first.getState().saveConfig("knorvia", { executablePath: "", permission: "ask" }),
    false,
  );
});

test("drafts survive reopen and remain isolated by both session and kernel", () => {
  const disk = memoryStorage();
  const store = createStudioAgentStore(disk.storage);
  assert.equal(store.getState().saveDraft("session-a", "codex", "private codex draft"), true);
  assert.equal(
    store.getState().saveDraft("session-b", "claude-code", "private claude draft"),
    true,
  );
  assert.equal(store.getState().saveDraft("session-a", "grok-build", "wrong kernel"), false);
  assert.equal(store.getState().drafts["session-a"]?.text, "private codex draft");
  const reopened = createStudioAgentStore(disk.storage);
  assert.equal(reopened.getState().drafts["session-b"]?.text, "private claude draft");
  assert.equal(reopened.getState().drafts["fresh-session"], undefined);
  assert.equal(reopened.getState().deleteDraft("session-a"), true);
  assert.equal(createStudioAgentStore(disk.storage).getState().drafts["session-a"], undefined);
});

test("draft project selection survives edits and reopen without binding another kernel", () => {
  const disk = memoryStorage();
  const store = createStudioAgentStore(disk.storage);
  assert.equal(store.getState().setDraftWorkspace("codex-a", "codex", "D:/projects/a"), true);
  assert.equal(store.getState().saveDraft("codex-a", "codex", "keep this draft"), true);
  assert.equal(store.getState().setDraftWorkspace("codex-a", "claude-code", "D:/private"), false);
  assert.equal(
    store.getState().setDraftWorkspace("claude-b", "claude-code", "D:/projects/b"),
    true,
  );
  const reopened = createStudioAgentStore(disk.storage);
  assert.equal(reopened.getState().drafts["codex-a"]?.workspacePath, "D:/projects/a");
  assert.equal(reopened.getState().drafts["codex-a"]?.text, "keep this draft");
  assert.equal(reopened.getState().drafts["claude-b"]?.text, "");
  assert.equal(reopened.getState().setDraftWorkspace("codex-a", "codex", ""), true);
  assert.equal(reopened.getState().drafts["codex-a"]?.text, "keep this draft");
  assert.equal(reopened.getState().drafts["claude-b"]?.workspacePath, "D:/projects/b");
});

test("empty message preserves selected project and clearing the whole draft removes it", () => {
  const disk = memoryStorage();
  const store = createStudioAgentStore(disk.storage);
  store.getState().saveDraft("a", "grok-build", "old message");
  store.getState().setDraftWorkspace("a", "grok-build", "D:/workspace");
  store.getState().saveDraft("a", "grok-build", "");
  assert.equal(store.getState().drafts.a?.workspacePath, "D:/workspace");
  store.getState().setDraftWorkspace("a", "grok-build", "");
  assert.equal(store.getState().drafts.a, undefined);
});

test("legacy drafts without a project load; invalid project data stays protected", () => {
  const disk = memoryStorage();
  const store = createStudioAgentStore(disk.storage);
  store.getState().saveDraft("a", "codex", "legacy text");
  const raw = disk.values.get(STUDIO_AGENT_STORAGE_KEY)!;
  assert.equal(
    createStudioAgentStore(memoryStorage(raw).storage).getState().drafts.a?.text,
    "legacy text",
  );
  assert.equal(store.getState().setDraftWorkspace("a", "codex", "D:/bad\nfolder"), false);
  assert.equal(store.getState().drafts.a?.text, "legacy text");
  const corrupt = JSON.parse(raw);
  corrupt.data.drafts.a.workspacePath = { path: "wrong type" };
  const corruptDisk = memoryStorage(JSON.stringify(corrupt));
  const restored = createStudioAgentStore(corruptDisk.storage);
  assert.equal(restored.getState().storageIssue, "corrupt");
  assert.equal(restored.getState().setDraftWorkspace("a", "codex", "D:/safe"), false);
  assert.equal(corruptDisk.writes(), 0);
});

test("corrupt or future-version records are never overwritten by editing or retry", () => {
  for (const raw of [
    "{broken",
    '{"version":44,"data":{}}',
    '{"version":1,"data":{"configs":{},"drafts":{}}}',
  ]) {
    const disk = memoryStorage(raw);
    const store = createStudioAgentStore(disk.storage);
    assert.equal(store.getState().storageIssue, "corrupt");
    assert.equal(store.getState().saveDraft("safe-draft", "codex", "kept in memory"), false);
    assert.equal(store.getState().drafts["safe-draft"]?.text, "kept in memory");
    assert.equal(store.getState().retrySave(), false);
    assert.equal(disk.writes(), 0);
    assert.equal(disk.values.get(STUDIO_AGENT_STORAGE_KEY), raw);
    assert.equal(store.getState().resetLocalData(), true);
    assert.equal(store.getState().storageIssue, null);
    assert.equal(Object.keys(store.getState().drafts).length, 0);
  }
});

test("storage failure retains unsaved text and reports failure until an explicit retry succeeds", () => {
  const disk = memoryStorage();
  const store = createStudioAgentStore(disk.storage);
  disk.failWrites(true);
  assert.equal(store.getState().saveDraft("draft-a", "codex", "do not lose this"), false);
  assert.equal(store.getState().drafts["draft-a"]?.text, "do not lose this");
  assert.equal(store.getState().dirty, true);
  assert.equal(store.getState().storageIssue, "write-failed");
  disk.failWrites(false);
  assert.equal(store.getState().retrySave(), true);
  assert.equal(store.getState().dirty, false);
  assert.equal(
    createStudioAgentStore(disk.storage).getState().drafts["draft-a"]?.text,
    "do not lose this",
  );
});

test("a failed initial read cannot implicitly replace unknown existing data", () => {
  let writes = 0;
  const store = createStudioAgentStore({
    getItem: () => {
      throw new Error("Storage inaccessible");
    },
    setItem: () => {
      writes += 1;
    },
  });
  assert.equal(store.getState().storageIssue, "unavailable");
  assert.equal(store.getState().saveDraft("draft-a", "codex", "text"), false);
  assert.equal(store.getState().retrySave(), false);
  assert.equal(writes, 0);
});

test("invalid executable paths, session identifiers, and oversized text cannot change saved drafts", () => {
  const disk = memoryStorage();
  const store = createStudioAgentStore(disk.storage);
  assert.equal(
    store.getState().saveConfig("codex", { executablePath: "codex\nextra", permission: "ask" }),
    false,
  );
  assert.equal(store.getState().saveDraft("__proto__", "codex", "pollution"), false);
  assert.equal(store.getState().saveDraft("draft-a", "codex", "a".repeat(20_001)), false);
  assert.equal(store.getState().saveDraft("draft-a", "knorvia", "wrong surface"), false);
  assert.equal(disk.writes(), 0);
  assert.equal(Object.keys(store.getState().drafts).length, 1);
  assert.equal(store.getState().drafts["draft-a"]?.text, "a".repeat(20_001));
});

test("invalid persisted permissions and timestamps are rejected without destroying the source", () => {
  const valid = memoryStorage();
  const store = createStudioAgentStore(valid.storage);
  store.getState().saveDraft("draft-a", "codex", "saved text");
  const raw = valid.values.get(STUDIO_AGENT_STORAGE_KEY)!;
  const invalidTimestamp = JSON.parse(raw);
  invalidTimestamp.data.drafts["draft-a"].updatedAt = 1e100;
  const invalidPermission = JSON.parse(raw);
  invalidPermission.data.configs.codex.permission = ["ask"];
  for (const payload of [invalidTimestamp, invalidPermission]) {
    const source = JSON.stringify(payload);
    const disk = memoryStorage(source);
    const invalid = createStudioAgentStore(disk.storage);
    assert.equal(invalid.getState().storageIssue, "corrupt");
    assert.equal(disk.values.get(STUDIO_AGENT_STORAGE_KEY), source);
    assert.equal(disk.writes(), 0);
  }
});

test("draft limits retain all existing text until the user explicitly deletes a draft", () => {
  const disk = memoryStorage();
  const store = createStudioAgentStore(disk.storage);
  for (let index = 0; index < 100; index += 1) {
    assert.equal(store.getState().saveDraft(`draft-${index}`, "codex", `message ${index}`), true);
  }
  assert.equal(store.getState().saveDraft("draft-extra", "codex", "overflow"), false);
  assert.equal(store.getState().actionError, "draft-limit");
  assert.equal(store.getState().drafts["draft-0"]?.text, "message 0");
  assert.equal(store.getState().deleteDraft("draft-0"), true);
  assert.equal(store.getState().saveDraft("draft-extra", "codex", "after deletion"), true);
  assert.equal(
    createStudioAgentStore(disk.storage).getState().drafts["draft-extra"]?.text,
    "after deletion",
  );
});
