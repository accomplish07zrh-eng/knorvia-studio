import assert from "node:assert/strict";
import test from "node:test";
import type { StudioMessage, StudioTimeline } from "@knorvia/services";
import {
  buildStudioHandoffDraft,
  exportStudioConversationMarkdown,
  performStudioHandoff,
  studioExportFileName,
} from "../src/studio/agents/sessionHandoff.js";

const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
function message(id: string, sequence: number, sender: StudioMessage["sender"], kind: StudioMessage["kind"], text: string): StudioMessage {
  return {
    id, sequence, targetId: "source", runId: "run", sender, kind, text,
    createdAt: sequence * 1000, updatedAt: sequence * 1000,
  };
}
function page(messages: StudioMessage[], nextBefore?: number): StudioTimeline {
  return { revision: 1, messages, interactions: [], runs: [], ...(nextBefore ? { nextBefore } : {}) };
}

test("handoff draft is local, editable context without reasoning, tool output or credentials", () => {
  const messages = [
    message("u", 1, "user", "text", `Check release. token=${secret}`),
    message("r", 2, "codex", "reasoning", "hidden plan"),
    { ...message("t", 3, "codex", "tool", `raw output ${secret}`), name: "git status", state: "completed" },
    message("a", 4, "codex", "text", "Two files changed."),
  ];
  const draft = buildStudioHandoffDraft(messages, "Codex");
  assert.match(draft.text, /Check release/);
  assert.match(draft.text, /Two files changed/);
  assert.match(draft.text, /git status/);
  assert.equal(draft.text.includes("hidden plan"), false);
  assert.equal(draft.text.includes("raw output"), false);
  assert.equal(draft.text.includes(secret), false);
  assert.equal(draft.includedCount, 3);
  const english = buildStudioHandoffDraft(messages, "Codex", false);
  assert.match(english.text, /Continue the current project/);
  assert.match(english.text, /Tool: git status/);
});

test("a failed send can retry the same target and command IDs", async () => {
  const accepted = new Set<string>();
  const attempted: string[] = [];
  let loseReply = true;
  const service = {
    command: async (command: { commandId: string; type: string }) => {
      attempted.push(command.commandId);
      if (command.type === "send" && loseReply) {
        loseReply = false;
        accepted.add(command.commandId);
        throw new Error("reply lost");
      }
      accepted.add(command.commandId);
      return { id: "run", revision: 1 };
    },
  };
  const attempt = {
    targetId: "stable", sourceKernel: "knorvia" as const,
    targetKernel: "codex" as const, workspacePath: "C:/project", text: "Reviewed summary",
  };
  await assert.rejects(performStudioHandoff(service, attempt), /reply lost/);
  await performStudioHandoff(service, attempt);
  assert.deepEqual(attempted, [
    "handoff:stable:create", "handoff:stable:send",
    "handoff:stable:create", "handoff:stable:send",
  ]);
  assert.equal(accepted.size, 2);
});

test("handoff uses a new target and stable commands only after explicit submit", async () => {
  const commands: Array<{ commandId: string; type: string; text?: string }> = [];
  const service = {
    command: async (command: { commandId: string; type: string; text?: string }) => {
      commands.push(command);
      return { id: command.type === "send" ? "new-run" : "new-session", revision: 1 };
    },
  };
  const attempt = {
    targetId: "new-session", sourceKernel: "codex" as const,
    targetKernel: "qoder-cn" as const, workspacePath: "C:/project",
    text: "User-confirmed edited summary",
  };
  // Preparing or cancelling a draft never calls the destination service.
  buildStudioHandoffDraft([message("u", 1, "user", "text", "Local preview")], "Codex");
  assert.deepEqual(commands, []);
  const result = await performStudioHandoff(service, attempt);
  assert.equal(result.id, "new-run");
  assert.deepEqual(commands.map((item) => item.commandId), [
    "handoff:new-session:create", "handoff:new-session:send",
  ]);
  assert.equal(commands[1]?.text, attempt.text);
  await performStudioHandoff(service, attempt);
  assert.deepEqual(commands.slice(2).map((item) => item.commandId), [
    "handoff:new-session:create", "handoff:new-session:send",
  ]);
  await assert.rejects(performStudioHandoff(service, { ...attempt, targetKernel: "codex" }), /不同内核/);
  assert.equal(commands.length, 4);
});

test("Markdown export reads all pages, keeps tool summaries and removes secret values", async () => {
  const calls: Array<number | undefined> = [];
  const service = {
    timeline: async (_targetId: string, before?: number) => {
      calls.push(before);
      return before === undefined
        ? page([
            { ...message("tool", 3, "codex", "tool", `tool output ${secret}`), name: "read_file", state: "completed" },
            message("answer", 4, "codex", "text", "Done"),
          ], 3)
        : page([
            message("user", 1, "user", "text", `Please check ${secret}`),
            message("reasoning", 2, "codex", "reasoning", "hidden chain"),
          ]);
    },
  };
  const markdown = await exportStudioConversationMarkdown(service, "source", "Review", "Codex");
  assert.deepEqual(calls, [undefined, 3]);
  assert.ok(markdown.indexOf("Please check") < markdown.indexOf("read_file"));
  assert.ok(markdown.indexOf("read_file") < markdown.indexOf("Done"));
  assert.equal(markdown.includes(secret), false);
  assert.equal(markdown.includes("tool output"), false);
  assert.equal(markdown.includes("hidden chain"), false);
  assert.match(markdown, /read_file.*completed/);
  assert.equal(studioExportFileName("Review: /today?"), "Review- -today-.md");
});

test("Markdown export rejects an incomplete or oversized history", async () => {
  const loop = { timeline: async () => page([message("one", 1, "user", "text", "hello")], 1) };
  await assert.rejects(exportStudioConversationMarkdown(loop, "source", "Review", "Codex"), /分页/);
  const huge = { timeline: async () => page([message("huge", 1, "user", "text", "a".repeat(8 * 1024 * 1024))]) };
  await assert.rejects(exportStudioConversationMarkdown(huge, "source", "Review", "Codex"), /大小/);
});
