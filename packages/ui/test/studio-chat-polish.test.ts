import assert from "node:assert/strict";
import test from "node:test";
import type { StudioConversation } from "@knorvia/services";
import { createStudioAgentStore } from "../src/store/studioAgentStore.js";
import { studioConversationList } from "../src/studio/agents/conversationList.js";
import { editedStudioAgentConfig } from "../src/studio/agents/agentConfig.js";
import { submitStudioChat } from "../src/studio/agents/chatSubmission.js";

const memory = () => {
  let raw: string | null = null;
  return {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
};
const conversation = (overrides: Partial<StudioConversation> = {}): StudioConversation => ({
  id: "chat",
  kernel: "codex",
  workspacePath: "D:/current-project",
  title: "Accepted title",
  createdAt: 1,
  updatedAt: 20,
  ...overrides,
});

test("late send acknowledgement after navigating away cannot erase a newly typed draft", async () => {
  const store = createStudioAgentStore(memory());
  store.getState().saveDraft("chat", "codex", "original submission");
  let accept!: () => void;
  const gate = new Promise<void>((resolve) => {
    accept = resolve;
  });
  const submit = submitStudioChat(
    {
      sessionId: "chat",
      kernel: "codex",
      workspacePath: "D:/project",
      text: "original submission",
      selection: {},
    },
    async (command) => {
      if (command.type === "send") await gate;
    },
  ).then(() => store.getState().acknowledgeDraft("chat", "codex", "original submission"));
  // 视图卸载再重开后写入的新草稿；旧组件捕获的提交字符串仍然不变。
  store.getState().saveDraft("chat", "codex", "new text after reopening");
  accept();
  assert.equal(await submit, false);
  assert.equal(store.getState().drafts.chat?.text, "new text after reopening");
});

test("accepted message clears only matching text and preserves a selection edited while sending", () => {
  const storage = memory();
  const store = createStudioAgentStore(storage);
  store.getState().saveDraft("chat", "codex", "accepted");
  store.getState().setDraftWorkspace("chat", "codex", "D:/project");
  store
    .getState()
    .setDraftSelection("chat", "codex", { model: "next-model", reasoningEffort: "low" });
  assert.equal(store.getState().acknowledgeDraft("chat", "claude-code", "accepted"), false);
  assert.equal(store.getState().acknowledgeDraft("missing", "codex", "accepted"), false);
  assert.equal(store.getState().acknowledgeDraft("chat", "codex", "accepted"), true);
  const reopened = createStudioAgentStore(storage).getState().drafts.chat;
  assert.equal(reopened?.text, "");
  assert.equal(reopened?.workspacePath, "D:/project");
  assert.deepEqual(reopened?.selection, { model: "next-model", reasoningEffort: "low" });
});

test("failed admission retains the pending message without an acknowledgement", async () => {
  const store = createStudioAgentStore(memory());
  store.getState().saveDraft("chat", "codex", "retain me");
  await assert.rejects(
    submitStudioChat(
      {
        sessionId: "chat",
        kernel: "codex",
        workspacePath: "D:/project",
        text: "retain me",
        selection: {},
      },
      async () => {
        throw new Error("offline");
      },
    ).then(() => store.getState().acknowledgeDraft("chat", "codex", "retain me")),
    /offline/,
  );
  assert.equal(store.getState().drafts.chat?.text, "retain me");
});

test("formal metadata and newest modification win over a stale local draft", () => {
  const items = studioConversationList(
    [conversation(), conversation({ id: "other", updatedAt: 10 })],
    {
      chat: {
        sessionId: "chat",
        kernelId: "codex",
        workspacePath: "D:/old-project",
        text: "unsent",
        updatedAt: 2,
      },
    },
    "codex",
  );
  assert.deepEqual(
    items.map((item) => item.sessionId),
    ["chat", "other"],
  );
  assert.equal(items[0]?.workspacePath, "D:/current-project");
  assert.equal(items[0]?.updatedAt, 20);
  assert.equal(items[0]?.title, "Accepted title");
  assert.equal(items[0]?.text, "unsent");
  assert.equal(items[0]?.persisted, true);
});

test("new drafts remain local and another kernel's colliding draft cannot conceal a conversation", () => {
  const drafts = {
    chat: {
      sessionId: "chat",
      kernelId: "grok-build" as const,
      text: "other kernel private text",
      updatedAt: 99,
    },
    fresh: { sessionId: "fresh", kernelId: "codex" as const, text: "local draft", updatedAt: 50 },
  };
  const items = studioConversationList([conversation()], drafts, "codex");
  assert.equal(items.find((item) => item.sessionId === "fresh")?.persisted, false);
  assert.equal(items.find((item) => item.sessionId === "chat")?.text, "");
  assert.equal(items.find((item) => item.sessionId === "chat")?.updatedAt, 20);
  assert.deepEqual(studioConversationList([conversation()], drafts, "grok-build"), []);
});

test("unsent edits affect ordering without replacing a formal project's identity", () => {
  const items = studioConversationList(
    [conversation(), conversation({ id: "other", updatedAt: 40 })],
    {
      chat: { sessionId: "chat", kernelId: "codex", text: "new draft", updatedAt: 50 },
    },
    "codex",
  );
  assert.deepEqual(
    items.map((item) => item.sessionId),
    ["chat", "other"],
  );
  assert.equal(items[0]?.workspacePath, "D:/current-project");
});

test("ordinary agent setting edits retain reasoning while an explicit model change resets it", () => {
  const previous = {
    executablePath: "D:/agent.exe",
    permission: "ask" as const,
    model: "cheap-model",
    reasoningEffort: "low",
  };
  assert.deepEqual(
    editedStudioAgentConfig(previous, {
      executablePath: " D:/new-agent.exe ",
      permission: "read-only",
      model: " cheap-model ",
    }),
    {
      executablePath: "D:/new-agent.exe",
      permission: "read-only",
      model: "cheap-model",
      reasoningEffort: "low",
    },
  );
  assert.equal(
    editedStudioAgentConfig(previous, { ...previous, model: "another-model" }).reasoningEffort,
    undefined,
  );
  assert.equal(
    editedStudioAgentConfig(previous, { ...previous, model: "" }).reasoningEffort,
    undefined,
  );
  assert.equal(
    editedStudioAgentConfig(
      { ...previous, model: undefined },
      { executablePath: "", permission: "ask" },
    ).reasoningEffort,
    "low",
  );
  assert.equal(previous.reasoningEffort, "low");
});

test("confirmed empty conversation caches free draft capacity without losing pending model choices", () => {
  const store = createStudioAgentStore(memory());
  const saved: StudioConversation[] = [];
  for (let i = 0; i < 100; i++) {
    const id = `chat-${i}`;
    store.getState().setDraftWorkspace(id, "codex", "D:/project");
    store.getState().setDraftSelection(id, "codex", { model: "saved-model" });
    saved.push(conversation({ id, selection: { model: "saved-model" } }));
  }
  assert.equal(store.getState().saveDraft("new", "codex", "next question"), false);
  store.getState().saveDraft("chat-0", "codex", "unsent text");
  store.getState().setDraftSelection("chat-1", "codex", { model: "new-choice" });
  store.getState().setDraftSelection("chat-2", "codex", {});
  assert.equal(store.getState().reconcileConversations(saved), true);
  assert.deepEqual(Object.keys(store.getState().drafts), ["chat-0", "chat-1", "chat-2"]);
  assert.equal(store.getState().drafts["chat-0"]?.text, "unsent text");
  assert.deepEqual(store.getState().drafts["chat-1"]?.selection, { model: "new-choice" });
  assert.deepEqual(store.getState().drafts["chat-2"]?.selection, {});
  assert.equal(store.getState().saveDraft("new", "codex", "next question"), true);
});

test("unconfirmed explicit CLI defaults cannot be removed by a legacy conversation snapshot", () => {
  const store = createStudioAgentStore(memory());
  store.getState().setDraftSelection("chat", "codex", {});
  store.getState().reconcileConversations([conversation()]);
  assert.deepEqual(store.getState().drafts.chat?.selection, {});
  store.getState().reconcileConversations([conversation({ selection: {} })]);
  assert.equal(store.getState().drafts.chat, undefined);
});
