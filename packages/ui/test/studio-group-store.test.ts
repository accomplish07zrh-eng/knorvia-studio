import assert from "node:assert/strict";
import test from "node:test";
import { createStudioGroupStore, STUDIO_GROUP_STORAGE_KEY } from "../src/store/studioGroupStore.js";
import { insertGroupMention, newGroupConfig } from "../src/studio/groups/groupModel.js";

function memoryStorage(initial: string | null = null) {
  let raw = initial;
  let writes = 0;
  let rejectWrites = false;
  return {
    get raw() {
      return raw;
    },
    get writes() {
      return writes;
    },
    set rejectWrites(value: boolean) {
      rejectWrites = value;
    },
    getItem(key: string) {
      assert.equal(key, STUDIO_GROUP_STORAGE_KEY);
      return raw;
    },
    setItem(key: string, next: string) {
      assert.equal(key, STUDIO_GROUP_STORAGE_KEY);
      if (rejectWrites) throw new Error("quota");
      raw = next;
      writes++;
    },
  };
}

test("groups use stable identities, enforce members and repair a removed host", () => {
  const storage = memoryStorage();
  const store = createStudioGroupStore(storage);
  const config = { ...newGroupConfig(), name: "  Planning  " };
  const first = store.getState().createGroup(config)!;
  const second = store.getState().createGroup(config)!;
  assert.notEqual(first, second);
  assert.equal(store.getState().groups[0]?.name, "Planning");
  store.getState().saveDraft(first, "Keep my draft");
  const stale = { ...store.getState().groups[0]!, draft: "Old stale draft" };
  assert.equal(
    store.getState().updateGroup(first, { ...stale, members: ["codex", "codex"] }),
    true,
  );
  const changed = store.getState().groups[0]!;
  assert.deepEqual(changed.members, ["codex"]);
  assert.equal(changed.host, "codex");
  assert.equal(changed.draft, "Keep my draft", "config changes cannot overwrite composer state");
  const writes = storage.writes;
  assert.equal(store.getState().updateGroup(first, { ...config, members: [] }), false);
  assert.equal(store.getState().createGroup({ ...config, name: " " }), null);
  assert.equal(storage.writes, writes, "invalid edits do not write storage");
});

test("group configurations and isolated unsent drafts survive reload and deletion", () => {
  const storage = memoryStorage();
  const store = createStudioGroupStore(storage);
  const first = store.getState().createGroup({
    ...newGroupConfig(),
    name: "First",
    goal: "A shared goal",
    sharedSummary: "Only shared context",
    members: ["claude-code", "grok-build"],
    host: "grok-build",
    mode: "task",
    workspaceMode: "shared",
  })!;
  const second = store.getState().createGroup({ ...newGroupConfig(), name: "Second" })!;
  store.getState().saveDraft(first, "@Claude Code first draft");
  store.getState().saveDraft(second, "Independent second draft");
  const restored = createStudioGroupStore(storage);
  assert.deepEqual(restored.getState().groups, store.getState().groups);
  assert.equal(restored.getState().groups[0]?.host, "grok-build");
  assert.equal(restored.getState().groups[0]?.mode, "task");
  restored.getState().deleteGroup(first);
  const afterDeletion = createStudioGroupStore(storage).getState().groups;
  assert.equal(afterDeletion.length, 1);
  assert.equal(afterDeletion[0]?.id, second);
  assert.equal(afterDeletion[0]?.draft, "Independent second draft");
  assert.equal(JSON.parse(storage.raw!).version, 1);
});

test("malformed and future-version storage is reported and never overwritten", () => {
  for (const raw of [
    "not json",
    "null",
    '{"version":2,"groups":[]}',
    '{"version":1,"groups":[{}]}',
  ]) {
    const storage = memoryStorage(raw);
    const store = createStudioGroupStore(storage);
    assert.equal(store.getState().storageIssue, "corrupt");
    assert.deepEqual(store.getState().groups, []);
    const id = store.getState().createGroup({ ...newGroupConfig(), name: "Session-only draft" })!;
    store.getState().saveDraft(id, "Not persisted over original data");
    store.getState().retrySave();
    assert.equal(storage.raw, raw);
    assert.equal(storage.writes, 0);
  }
});

test("unknown members and duplicate identities do not silently discard old group data", () => {
  const storage = memoryStorage();
  const store = createStudioGroupStore(storage);
  store.getState().createGroup({ ...newGroupConfig(), name: "Original" });
  const group = store.getState().groups[0]!;
  for (const groups of [[group, group], [{ ...group, members: ["unknown-runtime"] }]]) {
    const raw = JSON.stringify({ version: 1, groups });
    const protectedStorage = memoryStorage(raw);
    const restored = createStudioGroupStore(protectedStorage);
    assert.equal(restored.getState().storageIssue, "corrupt");
    restored.getState().retrySave();
    assert.equal(protectedStorage.raw, raw);
  }
});

test("failed writes retain the latest in-memory draft and explicit retry recovers it", () => {
  const storage = memoryStorage();
  const store = createStudioGroupStore(storage);
  const id = store.getState().createGroup({ ...newGroupConfig(), name: "Recoverable" })!;
  storage.rejectWrites = true;
  store.getState().saveDraft(id, "Latest unsent draft");
  assert.equal(store.getState().storageIssue, "write-failed");
  assert.equal(store.getState().groups[0]?.draft, "Latest unsent draft");
  storage.rejectWrites = false;
  store.getState().retrySave();
  assert.equal(store.getState().storageIssue, null);
  assert.equal(createStudioGroupStore(storage).getState().groups[0]?.draft, "Latest unsent draft");
});

test("unreadable storage remains protected from later writes", () => {
  let writes = 0;
  const store = createStudioGroupStore({
    getItem() {
      throw new Error("access denied");
    },
    setItem() {
      writes++;
    },
  });
  assert.equal(store.getState().storageIssue, "unavailable");
  store.getState().createGroup({ ...newGroupConfig(), name: "Local only" });
  assert.equal(writes, 0);
});

test("mention insertion respects the current selection and replaces only an active mention", () => {
  assert.deepEqual(insertGroupMention("hello @co", 9, 9, "Codex"), {
    text: "hello @Codex ",
    cursor: 13,
  });
  assert.deepEqual(insertGroupMention("@", 1, 1, "Claude Code"), {
    text: "@Claude Code ",
    cursor: 13,
  });
  assert.deepEqual(insertGroupMention("before after", 7, 12, "Knorvia"), {
    text: "before @Knorvia ",
    cursor: 16,
  });
  assert.deepEqual(insertGroupMention("hello", 5, 5, "Codex"), {
    text: "hello @Codex ",
    cursor: 13,
  });
});
