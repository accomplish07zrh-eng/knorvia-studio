import assert from "node:assert/strict";
import test from "node:test";
import { createStudioAgentStore, STUDIO_AGENT_STORAGE_KEY } from "../src/store/studioAgentStore.js";
import type { StudioCommand, StudioImageInput, IStudioRuntimeService } from "@knorvia/services";
const image = (id: string): StudioImageInput => ({
  id,
  filename: "合成.png",
  mimeType: "image/png",
  sizeBytes: 3,
  width: 1,
  height: 1,
  sha256: "a".repeat(64),
  dataBase64: "AAAA",
});
const service = {} as IStudioRuntimeService;
function fixture() {
  const disk = new Map<string, string>();
  const storage = {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => {
      disk.set(key, value);
    },
  };
  return { store: createStudioAgentStore(storage), disk, storage };
}
test("image drafts persist only bounded metadata; reload exposes missing content and original uncertain command", () => {
  const { store, disk, storage } = fixture();
  store.getState().setDraftImages("chat", "codex", [image("captured")]);
  const command: StudioCommand = {
    type: "send",
    commandId: "cid",
    targetId: "chat",
    kind: "chat",
    text: "compare",
    attachments: [image("captured")],
  };
  store.getState().sealImageSubmission("chat", service, command);
  const raw = disk.get(STUDIO_AGENT_STORAGE_KEY)!;
  assert.equal(raw.includes("dataBase64"), false);
  const reloaded = createStudioAgentStore(storage);
  assert.equal(reloaded.getState().drafts.chat.images?.[0].dataBase64, undefined);
  assert.equal(reloaded.getState().drafts.chat.imageSubmission?.commandId, "cid");
  assert.equal(reloaded.getState().pendingImages.chat, undefined);
  assert.equal(store.getState().deleteDraft("chat"), false);
});
test("late ACK clears submitted capture IDs only; removal/re-add and newly edited text survive", () => {
  const { store } = fixture();
  store.getState().saveDraft("chat", "codex", "old");
  store.getState().setDraftImages("chat", "codex", [image("old")]);
  const command: StudioCommand = {
    type: "send",
    commandId: "cid",
    targetId: "chat",
    kind: "chat",
    text: "old",
    attachments: [image("old")],
  };
  store.getState().sealImageSubmission("chat", service, command);
  store.getState().removeDraftImage("chat", "old");
  store.getState().setDraftImages("chat", "codex", [image("readded")]);
  store.getState().saveDraft("chat", "codex", "new");
  store.getState().setDraftSelection("chat", "codex", { model: "new-model" });
  store.getState().acknowledgeImages("chat", "wrong-cid");
  assert.ok(store.getState().pendingImages.chat);
  store.getState().acknowledgeImages("chat", "cid");
  assert.equal(store.getState().drafts.chat.text, "new");
  assert.equal(store.getState().drafts.chat.images?.[0].id, "readded");
  assert.equal(store.getState().drafts.chat.selection?.model, "new-model");
  assert.equal(store.getState().pendingImages.chat, undefined);
});
test("Host refusal releases pending submission without discarding editable pictures; images prevent empty draft reconciliation", () => {
  const { store } = fixture();
  store.getState().setDraftImages("chat", "codex", [image("captured")]);
  store.getState().sealImageSubmission("chat", service, {
    type: "send",
    commandId: "cid",
    targetId: "chat",
    kind: "chat",
    text: "",
    attachments: [image("captured")],
  });
  store.getState().rejectImages("chat", "cid");
  store.getState().reconcileConversations([
    {
      id: "chat",
      kernel: "codex",
      workspacePath: "/synthetic",
      title: "image",
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  assert.equal(store.getState().drafts.chat.images?.length, 1);
  assert.equal(store.getState().drafts.chat.imageSubmission, undefined);
  assert.equal(store.getState().setDraftImages("chat", "claude-code", [image("other")]), false);
});
