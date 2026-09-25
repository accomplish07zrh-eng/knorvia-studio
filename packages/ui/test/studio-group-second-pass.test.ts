import assert from "node:assert/strict";
import test from "node:test";
import type { StudioRun } from "@knorvia/services";
import { createStudioGroupStore } from "../src/store/studioGroupStore.js";
import { newGroupConfig, type StudioGroup } from "../src/studio/groups/groupModel.js";
import { projectGroupDefinitions } from "../src/studio/groups/groupDefinitions.js";
import { submitGroupDraft } from "../src/studio/groups/groupSubmission.js";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
const group: StudioGroup = {
  ...newGroupConfig(),
  id: "g",
  name: "Group",
  workspacePath: "D:/project",
  createdAt: 1,
  updatedAt: 1,
  draft: "",
};

test("a stop epoch invalidates pending group submission even after terminal refresh clears the stop flag", async () => {
  let epoch = 0;
  let stopped: string | null = null;
  const captured = epoch;
  const calls: string[] = [];
  const accepted = await submitGroupDraft({
    group,
    active: { id: "r", state: "running", taskMode: false } as StudioRun,
    currentDraft: () => "Next input",
    clearDraft: () => assert.fail("Draft must remain"),
    canSubmit: () => captured === epoch && !stopped,
    command: async (command) => {
      calls.push(command.type);
      stopped = "r";
      epoch++; // Stop submitted while save is pending.
      stopped = null;
      epoch++; // Terminal snapshot arrives before that save acknowledgement.
    },
  });
  assert.equal(accepted, false);
  assert.deepEqual(calls, ["save-group"]);
});

test("mode ACK remains the source for immediate send before the overview catches up", async () => {
  const store = createStudioGroupStore(storage());
  store.getState().ensureDraft(group, 1);
  store.getState().saveDraft(group.id, "Run this task");
  store.getState().acknowledgeDefinition({ ...group, mode: "task", updatedAt: 2 }, 2);
  store.getState().ensureDraft(group, 1);
  const state = store.getState();
  const shown = projectGroupDefinitions([group], state.groups, state.backendRevisions, 1)[0]!;
  assert.equal(shown.mode, "task");
  assert.equal(shown.draft, "Run this task");
  await submitGroupDraft({
    group: shown,
    currentDraft: () => shown.draft,
    clearDraft: () => {},
    command: async (command) => {
      if (command.type === "save-group") assert.equal(command.group.mode, "task");
      if (command.type === "send") assert.equal(command.taskMode, true);
    },
  });
  const refreshed = projectGroupDefinitions(
    [{ ...group, mode: "manual", updatedAt: 3 }],
    state.groups,
    state.backendRevisions,
    3,
  );
  assert.equal(refreshed[0]!.mode, "manual");
});

test("create and delete ACKs resist stale overviews while only drafts survive restart", () => {
  const persistence = storage();
  let store = createStudioGroupStore(persistence);
  store.getState().acknowledgeDefinition(group, 4);
  store.getState().saveDraft(group.id, "Unsent");
  assert.equal(
    projectGroupDefinitions([], store.getState().groups, store.getState().backendRevisions, 3)[0]
      ?.id,
    group.id,
  );
  store.getState().ensureDraft({ ...group, name: "Stale" }, 3);
  assert.equal(store.getState().groups[0]!.name, "Group");
  // 重启后定义以 Host 快照为准，本地只恢复输入草稿。
  store = createStudioGroupStore(persistence);
  assert.deepEqual(store.getState().groups, []);
  store.getState().ensureDraft({ ...group, name: "Server" }, 4);
  assert.equal(store.getState().groups[0]!.name, "Server");
  assert.equal(store.getState().groups[0]!.draft, "Unsent");
  store.getState().deleteGroup(group.id, 5);
  store.getState().ensureDraft(group, 4);
  assert.deepEqual(
    projectGroupDefinitions([group], store.getState().groups, store.getState().backendRevisions, 4),
    [],
  );
  assert.deepEqual(createStudioGroupStore(persistence).getState().groups, []);
});

test("an older save ACK cannot replace a later accepted group definition", () => {
  const store = createStudioGroupStore(storage());
  store.getState().acknowledgeDefinition({ ...group, mode: "task" }, 8);
  store.getState().acknowledgeDefinition(group, 7);
  store.getState().deleteGroup(group.id, 6);
  assert.equal(store.getState().groups[0]!.mode, "task");
  assert.equal(store.getState().backendRevisions[group.id], 8);
});
