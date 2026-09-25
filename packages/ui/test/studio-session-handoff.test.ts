import assert from "node:assert/strict";
import test from "node:test";
import type { StudioKernelStatus, StudioMessage, StudioTimeline } from "@knorvia/services";
import {
  parseCommandEnvelope,
  type CommandAck,
  type CommandEnvelope,
} from "@knorvia/shared/protocol-v4";
import {
  availableHandoffTargets,
  buildStudioHandoffDraft,
  createNativeHandoffAttempt,
  exportStudioConversationMarkdown,
  performNativeHandoff,
  performStudioHandoff,
  saveHandoffMarkdownWithDialog,
  studioExportFileName,
} from "../src/studio/agents/sessionHandoff.js";

const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
function message(
  id: string,
  sequence: number,
  sender: StudioMessage["sender"],
  kind: StudioMessage["kind"],
  text: string,
): StudioMessage {
  return {
    id,
    sequence,
    targetId: "source",
    runId: "run",
    sender,
    kind,
    text,
    createdAt: sequence * 1000,
    updatedAt: sequence * 1000,
  };
}
function page(messages: StudioMessage[], nextBefore?: number): StudioTimeline {
  return {
    revision: 1,
    messages,
    interactions: [],
    runs: [],
    ...(nextBefore ? { nextBefore } : {}),
  };
}

test("handoff draft is local, editable context without reasoning, tool output or credentials", () => {
  const messages = [
    message("u", 1, "user", "text", `Check release. token=${secret}`),
    message("r", 2, "codex", "reasoning", "hidden plan"),
    {
      ...message("t", 3, "codex", "tool", `raw output ${secret}`),
      name: "git status",
      state: "completed",
    },
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
    targetId: "stable",
    sourceKernel: "knorvia" as const,
    targetKernel: "codex" as const,
    workspacePath: "C:/project",
    text: "Reviewed summary",
  };
  await assert.rejects(performStudioHandoff(service, attempt), /reply lost/);
  await performStudioHandoff(service, attempt);
  assert.deepEqual(attempted, [
    "handoff:stable:create",
    "handoff:stable:send",
    "handoff:stable:create",
    "handoff:stable:send",
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
    targetId: "new-session",
    sourceKernel: "codex" as const,
    targetKernel: "qoder-cn" as const,
    workspacePath: "C:/project",
    text: "User-confirmed edited summary",
  };
  // Preparing or cancelling a draft never calls the destination service.
  buildStudioHandoffDraft([message("u", 1, "user", "text", "Local preview")], "Codex");
  assert.deepEqual(commands, []);
  const result = await performStudioHandoff(service, attempt);
  assert.equal(result.id, "new-run");
  assert.deepEqual(
    commands.map((item) => item.commandId),
    ["handoff:new-session:create", "handoff:new-session:send"],
  );
  assert.equal(commands[1]?.text, attempt.text);
  await performStudioHandoff(service, attempt);
  assert.deepEqual(
    commands.slice(2).map((item) => item.commandId),
    ["handoff:new-session:create", "handoff:new-session:send"],
  );
  await assert.rejects(
    performStudioHandoff(service, { ...attempt, targetKernel: "codex" }),
    /不同内核/,
  );
  assert.equal(commands.length, 4);
});

test("external chat offers the native owner only when its local V4 route is available", () => {
  const capabilities = {
    resume: true,
    approval: true,
    questions: true,
    readOnly: true,
    fullAccess: true,
  };
  const statuses: StudioKernelStatus[] = [
    { id: "knorvia", installed: true, origin: "builtin", capabilities },
    { id: "codex", installed: true, origin: "external", capabilities },
    { id: "claude-code", installed: false, origin: "missing", capabilities },
    {
      id: "ssh:example:codex" as StudioKernelStatus["id"],
      installed: true,
      origin: "external",
      capabilities,
    },
  ];
  assert.deepEqual(
    availableHandoffTargets(statuses, "codex", false).map((item) => item.id),
    [],
  );
  assert.deepEqual(
    availableHandoffTargets(statuses, "codex", true).map((item) => item.id),
    ["knorvia"],
  );
  assert.deepEqual(
    availableHandoffTargets(statuses, "knorvia", true).map((item) => item.id),
    ["codex"],
  );
});

test("confirmed native handoff uses one frozen V4 createSession(firstInput) envelope", async () => {
  const source = {
    sourceKernel: "codex" as const,
    workspacePath: "C:/project",
    text: "Reviewed text",
  };
  const draft = buildStudioHandoffDraft(
    [message("user", 1, "user", "text", "Local preview")],
    "Codex",
  );
  assert.match(draft.text, /Local preview/);
  const sent: CommandEnvelope[] = [];
  assert.deepEqual(sent, []);
  const attempt = createNativeHandoffAttempt(source);
  const parsed = parseCommandEnvelope(attempt.envelope);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.envelope.type, "createSession");
  assert.equal(parsed.envelope.sessionId, null);
  assert.deepEqual(parsed.envelope.payload, {
    workspaceId: "C:/project",
    firstInput: { text: "Reviewed text" },
  });
  let replyLost = true;
  const send = async (envelope: CommandEnvelope): Promise<CommandAck> => {
    sent.push(envelope);
    if (replyLost) {
      replyLost = false;
      throw new Error("reply lost");
    }
    return {
      commandId: envelope.commandId,
      status: "duplicate",
      revisionAtDecision: 1,
      result: { type: "createSession", sessionId: "native-session" },
    };
  };
  await assert.rejects(performNativeHandoff(send, attempt), /reply lost/);
  assert.equal(await performNativeHandoff(send, attempt), "native-session");
  assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]);
  assert.equal(sent[0]?.commandId, attempt.envelope.commandId);
  assert.throws(() => createNativeHandoffAttempt({ ...source, sourceKernel: "knorvia" }), /不同/);
  assert.throws(() => createNativeHandoffAttempt({ ...source, text: " " }), /为空/);
});

test("native handoff refuses a rejected or incomplete ACK instead of navigating", async () => {
  const attempt = createNativeHandoffAttempt({
    sourceKernel: "qoder-cn",
    workspacePath: "C:/project",
    text: "Reviewed text",
  });
  const ack = (status: CommandAck["status"], result?: CommandAck["result"]): CommandAck => ({
    commandId: attempt.envelope.commandId,
    status,
    revisionAtDecision: 1,
    result,
  });
  await assert.rejects(
    performNativeHandoff(async () => ack("rejected"), attempt),
    /未接受/,
  );
  await assert.rejects(
    performNativeHandoff(async () => ack("accepted"), attempt),
    /sessionId/,
  );
  await assert.rejects(
    performNativeHandoff(
      async () =>
        ack("duplicate", {
          type: "forkAssistant",
          sessionId: "wrong",
        }),
      attempt,
    ),
    /sessionId/,
  );
});

test("canceling the file picker does not report a Markdown export", async () => {
  const bytes = new TextEncoder().encode("# Review\n");
  const selected: Array<{ data: ArrayBuffer; suggestedName: string }> = [];
  const canceled = await saveHandoffMarkdownWithDialog(
    async (request) => {
      selected.push(request);
      return { success: false, canceled: true };
    },
    bytes,
    "Review.md",
  );
  assert.equal(canceled, false);
  assert.equal(selected[0]?.suggestedName, "Review.md");
  assert.equal(new TextDecoder().decode(selected[0]?.data), "# Review\n");
  await assert.rejects(
    saveHandoffMarkdownWithDialog(
      async () => ({ success: false, error: "disk full" }),
      bytes,
      "Review.md",
    ),
    /disk full/,
  );
});

test("Markdown export reads all pages, keeps tool summaries and removes secret values", async () => {
  const calls: Array<number | undefined> = [];
  const service = {
    timeline: async (_targetId: string, before?: number) => {
      calls.push(before);
      return before === undefined
        ? page(
            [
              {
                ...message("tool", 3, "codex", "tool", `tool output ${secret}`),
                name: "read_file",
                state: "completed",
              },
              message("answer", 4, "codex", "text", "Done"),
            ],
            3,
          )
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
  const huge = {
    timeline: async () => page([message("huge", 1, "user", "text", "a".repeat(8 * 1024 * 1024))]),
  };
  await assert.rejects(exportStudioConversationMarkdown(huge, "source", "Review", "Codex"), /大小/);
});
