import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioGroupStore,
  LEGACY_STUDIO_GROUP_STORAGE_KEY,
  STUDIO_GROUP_STORAGE_KEY,
} from "../src/store/studioGroupStore.js";
import {
  insertGroupMention,
  newGroupConfig,
  type StudioGroup,
} from "../src/studio/groups/groupModel.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  let writes = 0;
  let rejectWrites = false;
  return {
    values,
    get writes() {
      return writes;
    },
    set rejectWrites(value: boolean) {
      rejectWrites = value;
    },
    getItem(key: string) {
      assert.ok([STUDIO_GROUP_STORAGE_KEY, LEGACY_STUDIO_GROUP_STORAGE_KEY].includes(key));
      return values.get(key) ?? null;
    },
    setItem(key: string, next: string) {
      assert.equal(key, STUDIO_GROUP_STORAGE_KEY);
      if (rejectWrites) throw new Error("quota");
      values.set(key, next);
      writes++;
    },
    removeItem(key: string) {
      assert.equal(key, LEGACY_STUDIO_GROUP_STORAGE_KEY);
      if (rejectWrites) throw new Error("quota");
      values.delete(key);
    },
  };
}

function legacyGroup(id: string, draft = ""): StudioGroup {
  return {
    ...newGroupConfig(),
    id,
    name: `Group ${id}`,
    draft,
    createdAt: 1,
    updatedAt: 1,
  };
}

const definition = (id: string, name = `Group ${id}`) => {
  const { draft: _draft, ...value } = legacyGroup(id);
  return { ...value, name };
};

test("only unsent drafts are persisted; definitions come from the service", () => {
  const storage = memoryStorage();
  const store = createStudioGroupStore(storage);
  store.getState().ensureDraft(definition("a"));
  store.getState().ensureDraft(definition("b"));
  store.getState().saveDraft("a", "@Codex first draft");
  store.getState().saveDraft("b", "Independent second draft");
  const saved = JSON.parse(storage.values.get(STUDIO_GROUP_STORAGE_KEY)!);
  assert.deepEqual(saved, {
    version: 2,
    drafts: { a: "@Codex first draft", b: "Independent second draft" },
  });
  const restored = createStudioGroupStore(storage);
  assert.deepEqual(restored.getState().groups, []);
  restored.getState().ensureDraft(definition("a", "Renamed on server"));
  assert.equal(restored.getState().groups[0]?.name, "Renamed on server");
  assert.equal(restored.getState().groups[0]?.draft, "@Codex first draft");
});

test("typing a draft never changes the definition version used for conflict checks", () => {
  const store = createStudioGroupStore(memoryStorage());
  store.getState().ensureDraft(definition("a"));
  store.getState().saveDraft("a", "typing");
  assert.equal(store.getState().groups[0]?.updatedAt, 1);
});

test("legacy v1 groups are deleted immediately after every one is confirmed by the Host", () => {
  const legacy = [legacyGroup("a", "Unsent A"), legacyGroup("b")];
  const storage = memoryStorage({
    [LEGACY_STUDIO_GROUP_STORAGE_KEY]: JSON.stringify({ version: 1, groups: legacy }),
  });
  const store = createStudioGroupStore(storage);
  assert.deepEqual(
    store.getState().legacyGroups.map((group) => group.id),
    ["a", "b"],
  );
  store.getState().markImported("a");
  assert.ok(storage.values.has(LEGACY_STUDIO_GROUP_STORAGE_KEY), "partial import keeps v1");
  store.getState().markImported("b");
  assert.equal(storage.values.has(LEGACY_STUDIO_GROUP_STORAGE_KEY), false);
  assert.deepEqual(store.getState().legacyGroups, []);
  assert.deepEqual(JSON.parse(storage.values.get(STUDIO_GROUP_STORAGE_KEY)!).drafts, {
    a: "Unsent A",
  });
});

test("a failed draft write keeps the legacy copy instead of deleting it", () => {
  const storage = memoryStorage({
    [LEGACY_STUDIO_GROUP_STORAGE_KEY]: JSON.stringify({
      version: 1,
      groups: [legacyGroup("a", "keep")],
    }),
  });
  const store = createStudioGroupStore(storage);
  storage.rejectWrites = true;
  store.getState().markImported("a");
  assert.equal(store.getState().storageIssue, "write-failed");
  assert.ok(storage.values.has(LEGACY_STUDIO_GROUP_STORAGE_KEY));
});

test("malformed legacy or draft storage is reported and never overwritten", () => {
  for (const [key, raw] of [
    [LEGACY_STUDIO_GROUP_STORAGE_KEY, "not json"],
    [LEGACY_STUDIO_GROUP_STORAGE_KEY, '{"version":1,"groups":[{}]}'],
    [STUDIO_GROUP_STORAGE_KEY, '{"version":3,"drafts":{}}'],
    [STUDIO_GROUP_STORAGE_KEY, '{"version":2,"drafts":{"a":1}}'],
  ] as const) {
    const storage = memoryStorage({ [key]: raw });
    const store = createStudioGroupStore(storage);
    assert.equal(store.getState().storageIssue, "corrupt");
    store.getState().ensureDraft(definition("a"));
    store.getState().saveDraft("a", "Not persisted over original data");
    store.getState().markImported("a");
    store.getState().retrySave();
    assert.equal(storage.values.get(key), raw);
    assert.equal(storage.writes, 0);
  }
});

test("unknown members and duplicate identities in legacy data are preserved, not discarded", () => {
  const group = legacyGroup("a");
  for (const groups of [[group, group], [{ ...group, members: ["unknown-runtime"] }]]) {
    const raw = JSON.stringify({ version: 1, groups });
    const storage = memoryStorage({ [LEGACY_STUDIO_GROUP_STORAGE_KEY]: raw });
    const restored = createStudioGroupStore(storage);
    assert.equal(restored.getState().storageIssue, "corrupt");
    restored.getState().retrySave();
    assert.equal(storage.values.get(LEGACY_STUDIO_GROUP_STORAGE_KEY), raw);
  }
});

test("failed writes retain the latest in-memory draft and explicit retry recovers it", () => {
  const storage = memoryStorage();
  const store = createStudioGroupStore(storage);
  store.getState().ensureDraft(definition("a"));
  storage.rejectWrites = true;
  store.getState().saveDraft("a", "Latest unsent draft");
  assert.equal(store.getState().storageIssue, "write-failed");
  assert.equal(store.getState().groups[0]?.draft, "Latest unsent draft");
  storage.rejectWrites = false;
  store.getState().retrySave();
  assert.equal(store.getState().storageIssue, null);
  const restored = createStudioGroupStore(storage);
  restored.getState().ensureDraft(definition("a"));
  assert.equal(restored.getState().groups[0]?.draft, "Latest unsent draft");
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
    removeItem() {
      writes++;
    },
  });
  assert.equal(store.getState().storageIssue, "unavailable");
  store.getState().ensureDraft(definition("a"));
  store.getState().saveDraft("a", "Local only");
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
