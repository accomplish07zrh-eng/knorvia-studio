import assert from "node:assert/strict";
import test from "node:test";
import type { StudioChatSelection, StudioKernelOptions } from "@knorvia/services";
import { createStudioAgentStore, type StudioAgentStorage } from "../src/store/studioAgentStore.js";
import {
  isStudioChatSelection,
  resolveStudioChatSelection,
  selectStudioChatModel,
  selectStudioChatReasoning,
  studioEffectiveModel,
  studioModelOptionValue,
  studioReportedDefaultReasoning,
  STUDIO_CLI_DEFAULT_VALUE,
} from "../src/studio/agents/chatSelections.js";
import { submitStudioChat } from "../src/studio/agents/chatSubmission.js";

function memory(initial: string | null = null) {
  let raw = initial;
  let writes = 0;
  const storage: StudioAgentStorage = {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
      writes += 1;
    },
  };
  return { storage, raw: () => raw, writes: () => writes };
}

const models: StudioKernelOptions = {
  defaultModel: "model-a",
  models: [
    {
      id: "model-a",
      label: "Model A",
      reasoning: [
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ],
      defaultReasoning: "low",
    },
    {
      id: "model-b",
      label: "Model B",
      reasoning: [{ id: "medium", label: "Medium" }],
      defaultReasoning: "medium",
    },
    { id: "no-reasoning", label: "No reasoning", reasoning: [] },
    {
      id: STUDIO_CLI_DEFAULT_VALUE,
      label: "An actual model with a reserved-looking name",
      reasoning: [],
    },
  ],
};

test("selection persists independently per conversation, across text clearing and project changes", () => {
  const disk = memory();
  const store = createStudioAgentStore(disk.storage);
  const originalConfigs = structuredClone(store.getState().configs);
  const selection = { model: "model-a", reasoningEffort: "high" };
  assert.equal(store.getState().setDraftSelection("a", "codex", selection), true);
  selection.model = "changed-outside-store";
  store.getState().setDraftSelection("b", "codex", { model: "model-b" });
  store.getState().setDraftSelection("c", "claude-code", { model: "claude-a" });
  store.getState().saveDraft("a", "codex", "draft text");
  store.getState().setDraftWorkspace("a", "codex", "D:/project-one");
  store.getState().saveDraft("a", "codex", "");
  store.getState().setDraftWorkspace("a", "codex", "D:/project-two");
  store.getState().setDraftWorkspace("a", "codex", "");
  const reopened = createStudioAgentStore(disk.storage);
  assert.deepEqual(reopened.getState().drafts.a?.selection, {
    model: "model-a",
    reasoningEffort: "high",
  });
  assert.equal(reopened.getState().drafts.a?.text, "");
  assert.deepEqual(reopened.getState().drafts.b?.selection, { model: "model-b" });
  assert.deepEqual(reopened.getState().drafts.c?.selection, { model: "claude-a" });
  assert.deepEqual(reopened.getState().configs, originalConfigs);
  assert.equal(store.getState().setDraftSelection("a", "grok-build", {}), false);
});

test("explicit CLI-default selection survives an otherwise empty draft and is distinct from legacy data", () => {
  const disk = memory();
  const store = createStudioAgentStore(disk.storage);
  store.getState().saveDraft("legacy", "codex", "old draft");
  store.getState().setDraftSelection("explicit", "codex", {});
  store.getState().saveDraft("explicit", "codex", "");
  store.getState().setDraftWorkspace("explicit", "codex", "");
  const reopened = createStudioAgentStore(disk.storage);
  assert.equal(reopened.getState().drafts.legacy?.selection, undefined);
  assert.deepEqual(reopened.getState().drafts.explicit?.selection, {});
  reopened.getState().deleteDraft("explicit");
  assert.equal(createStudioAgentStore(disk.storage).getState().drafts.explicit, undefined);
});

test("malformed selection data remains protected and store rejects unsafe or excessive fields", () => {
  const disk = memory();
  const store = createStudioAgentStore(disk.storage);
  store.getState().saveDraft("a", "codex", "original");
  const invalidSelections: unknown[] = [
    null,
    [],
    "model-a",
    { model: 5 },
    { model: "m".repeat(257) },
    { reasoningEffort: "h".repeat(65) },
    { model: "m\0x" },
    { model: "m\nx" },
    { unexpected: "value" },
    JSON.parse('{"__proto__":{"model":"model-a"}}'),
  ];
  for (const selection of invalidSelections) {
    assert.equal(isStudioChatSelection(selection), false);
    assert.equal(
      store.getState().setDraftSelection("a", "codex", selection as StudioChatSelection),
      false,
    );
    const payload = JSON.parse(disk.raw()!);
    payload.data.drafts.a.selection = selection;
    const corrupt = memory(JSON.stringify(payload));
    const restored = createStudioAgentStore(corrupt.storage);
    assert.equal(restored.getState().storageIssue, "corrupt");
    assert.equal(restored.getState().setDraftSelection("a", "codex", {}), false);
    assert.equal(corrupt.writes(), 0);
  }
  assert.equal(isStudioChatSelection(Object.create({ model: "inherited" })), false);
  assert.equal(
    isStudioChatSelection({ model: "m".repeat(256), reasoningEffort: "h".repeat(64) }),
    true,
  );
  assert.equal(store.getState().drafts.a?.text, "original");
});

test("selection write failure retains in-memory choice and can be retried without modifying other drafts", () => {
  const disk = memory();
  let fail = false;
  const store = createStudioAgentStore({
    getItem: disk.storage.getItem,
    setItem: (key, value) => {
      if (fail) throw new Error("full");
      disk.storage.setItem(key, value);
    },
  });
  store.getState().saveDraft("other", "grok-build", "keep me");
  fail = true;
  assert.equal(store.getState().setDraftSelection("a", "codex", { model: "model-a" }), false);
  assert.equal(store.getState().storageIssue, "write-failed");
  assert.deepEqual(store.getState().drafts.a?.selection, { model: "model-a" });
  assert.equal(store.getState().drafts.other?.text, "keep me");
  fail = false;
  assert.equal(store.getState().retrySave(), true);
  assert.deepEqual(createStudioAgentStore(disk.storage).getState().drafts.a?.selection, {
    model: "model-a",
  });
});

test("selection-only drafts obey the existing count and session identity limits", () => {
  const store = createStudioAgentStore(memory().storage);
  for (let i = 0; i < 100; i += 1)
    assert.equal(store.getState().setDraftSelection(`s-${i}`, "codex", {}), true);
  assert.equal(store.getState().setDraftSelection("overflow", "codex", {}), false);
  assert.equal(store.getState().actionError, "draft-limit");
  assert.equal(store.getState().setDraftSelection("__proto__", "codex", {}), false);
  assert.equal(store.getState().setDraftSelection("builtin", "knorvia", {}), false);
  assert.equal(Object.keys(store.getState().drafts).length, 100);
});

test("selection priority is draft, conversation, then configuration without fieldwise leakage", () => {
  const defaults = { model: "global", reasoningEffort: "high" };
  const conversation = { model: "conversation", reasoningEffort: "medium" };
  assert.deepEqual(resolveStudioChatSelection(undefined, undefined, defaults), defaults);
  assert.deepEqual(resolveStudioChatSelection(undefined, conversation, defaults), conversation);
  assert.deepEqual(resolveStudioChatSelection({ model: "draft" }, conversation, defaults), {
    model: "draft",
  });
  assert.deepEqual(resolveStudioChatSelection({}, conversation, defaults), {});
  assert.deepEqual(resolveStudioChatSelection(undefined, {}, defaults), {});
  assert.deepEqual(resolveStudioChatSelection({ reasoningEffort: "low" }, conversation, defaults), {
    reasoningEffort: "low",
  });
  const copy = resolveStudioChatSelection(undefined, conversation, defaults);
  copy.model = "local-change";
  assert.equal(conversation.model, "conversation");
  assert.equal(defaults.model, "global");
});

test("changing models drops incompatible reasoning and uses only an actually reported default", () => {
  const old = { model: "model-a", reasoningEffort: "high" };
  assert.deepEqual(selectStudioChatModel(old, studioModelOptionValue("model-b"), models), {
    model: "model-b",
    reasoningEffort: "medium",
  });
  assert.deepEqual(selectStudioChatModel(old, studioModelOptionValue("no-reasoning"), models), {
    model: "no-reasoning",
  });
  assert.deepEqual(selectStudioChatModel(old, studioModelOptionValue("unknown"), models), old);
  assert.deepEqual(selectStudioChatModel(old, STUDIO_CLI_DEFAULT_VALUE, models), {});
  assert.deepEqual(
    selectStudioChatModel(old, studioModelOptionValue(STUDIO_CLI_DEFAULT_VALUE), models),
    { model: STUDIO_CLI_DEFAULT_VALUE },
  );
  const mismatched: StudioKernelOptions = {
    models: [
      {
        id: "mismatch",
        label: "Mismatch",
        reasoning: [{ id: "low", label: "Low" }],
        defaultReasoning: "imaginary",
      },
    ],
  };
  assert.equal(studioReportedDefaultReasoning(mismatched.models[0]), undefined);
  assert.deepEqual(selectStudioChatModel(old, studioModelOptionValue("mismatch"), mismatched), {
    model: "mismatch",
  });
});

test("reasoning controls are derived from the selected model and never invented for unavailable models", () => {
  assert.deepEqual(studioEffectiveModel({}, models), models.models[0]);
  assert.deepEqual(selectStudioChatReasoning({}, "high", models), { reasoningEffort: "high" });
  assert.deepEqual(selectStudioChatReasoning({ model: "model-b" }, "high", models), {
    model: "model-b",
  });
  assert.deepEqual(selectStudioChatReasoning({ model: "no-reasoning" }, "low", models), {
    model: "no-reasoning",
  });
  assert.equal(studioEffectiveModel({ model: "unlisted" }, models), undefined);
  assert.equal(studioEffectiveModel({}, { models: models.models }), undefined);
  const existing = { model: "unlisted", reasoningEffort: "custom" };
  const failed = { models: [], error: "CLI not found" };
  assert.deepEqual(resolveStudioChatSelection(existing, undefined, undefined), existing);
  assert.deepEqual(
    selectStudioChatModel(existing, studioModelOptionValue("unlisted"), failed),
    existing,
  );
  assert.deepEqual(selectStudioChatReasoning(existing, "high", failed), existing);
});

test("send freezes the exact model and reasoning before asynchronous creation", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: unknown[] = [];
  const selection = { model: "model-a", reasoningEffort: "low" };
  const input = {
    sessionId: "s",
    kernel: "codex" as const,
    workspacePath: "D:/p",
    text: "run this",
    selection,
  };
  const pending = submitStudioChat(input, async (command) => {
    calls.push(command);
    if (command.type === "create-conversation") await gate;
  });
  assert.equal(calls.length, 1);
  selection.model = "model-b";
  selection.reasoningEffort = "medium";
  input.text = "a newer draft";
  input.sessionId = "another-session";
  release();
  await pending;
  assert.deepEqual(calls[1], {
    type: "send",
    kind: "chat",
    targetId: "s",
    text: "run this",
    selection: { model: "model-a", reasoningEffort: "low" },
  });
});

test("an explicit empty selection reaches the backend; failed sends are not retried with defaults", async () => {
  const calls: unknown[] = [];
  await assert.rejects(
    submitStudioChat(
      { sessionId: "s", kernel: "grok-build", workspacePath: "D:/p", text: "hello", selection: {} },
      async (command) => {
        calls.push(command);
        if (command.type === "send") throw new Error("ambiguous delivery");
      },
    ),
    /ambiguous delivery/,
  );
  assert.deepEqual(calls[1], {
    type: "send",
    kind: "chat",
    targetId: "s",
    text: "hello",
    selection: {},
  });
  assert.equal(calls.length, 2);
});

test("conversation creation failure never submits a model turn", async () => {
  let count = 0;
  await assert.rejects(
    submitStudioChat(
      {
        sessionId: "s",
        kernel: "claude-code",
        workspacePath: "D:/p",
        text: "hello",
        selection: { model: "model-a" },
      },
      async () => {
        count += 1;
        throw new Error("project unavailable");
      },
    ),
    /project unavailable/,
  );
  assert.equal(count, 1);
});
