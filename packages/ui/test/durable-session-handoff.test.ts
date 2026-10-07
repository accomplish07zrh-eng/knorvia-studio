import assert from "node:assert/strict";
import test from "node:test";
import type { StudioMessage } from "@knorvia/services";
import {
  HANDOFF_FIELD_KEYS,
  HANDOFF_TEXT_LIMIT,
  createHandoffField,
  editHandoffRecord,
  emptyHandoffRecord,
  handoffScopeKey,
  parseHandoffRecord,
  sanitizeHandoffText,
  type HandoffFieldKey,
  type HandoffScope,
} from "@knorvia/shared";
import { createStudioAgentStore, STUDIO_AGENT_STORAGE_KEY } from "../src/store/studioAgentStore.js";
import { emptyStudioAgentData } from "../src/studio/agents/agentDrafts.js";
import {
  buildStudioHandoffDraft,
  createNativeHandoffAttempt,
  performNativeHandoff,
  performStudioHandoff,
} from "../src/studio/agents/sessionHandoff.js";
import { captureHandoffGoal, verifyHandoffReferences } from "../src/studio/agents/taskHandoff.js";

const scope: HandoffScope = { sessionId: "source", kernelId: "codex", workspacePath: "C:/project" };
const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
function message(id: number, text: string, extra: Partial<StudioMessage> = {}): StudioMessage {
  return {
    id: `msg-${id}`,
    sequence: id,
    targetId: "source",
    runId: "run",
    sender: "user",
    kind: "text",
    text,
    createdAt: id,
    updatedAt: id,
    ...extra,
  };
}
function disk(initial?: string) {
  let value = initial ?? null;
  let reject = false;
  let writes = 0;
  return {
    storage: {
      getItem: (key: string) => {
        assert.equal(key, STUDIO_AGENT_STORAGE_KEY);
        return value;
      },
      setItem: (_key: string, next: string) => {
        if (reject) throw new Error("quota");
        value = next;
        writes++;
      },
    },
    raw: () => value,
    writes: () => writes,
    fail: (next: boolean) => {
      reject = next;
    },
  };
}
function fields(record = emptyHandoffRecord(scope)): Record<HandoffFieldKey, string> {
  return Object.fromEntries(
    HANDOFF_FIELD_KEYS.map((key) => [key, record.fields[key]?.text ?? ""]),
  ) as Record<HandoffFieldKey, string>;
}

test("original objective survives growing history, partial reload, and unrelated draft writes", () => {
  const memory = disk();
  const store = createStudioAgentStore(memory.storage);
  const initial = captureHandoffGoal({ scope, historyStartKnown: true }, [
    message(1, "Ship accessible search; preserve data."),
  ]);
  assert.equal(store.getState().saveHandoff(initial), true);
  const longHistory = Array.from({ length: 130 }, (_, n) => message(n + 2, `Later change ${n}`));
  const captured = captureHandoffGoal(
    { scope, record: initial, historyStartKnown: false },
    longHistory,
  );
  assert.equal(captured, initial);
  store.getState().saveDraft("draft", "codex", "keep draft");
  store.getState().saveConfig("codex", { permission: "read-only", executablePath: "codex" });
  const reopened = createStudioAgentStore(memory.storage);
  const record = reopened.getState().handoffs[handoffScopeKey(scope)];
  const draft = buildStudioHandoffDraft(longHistory.slice(-30), "Codex", false, {
    scope,
    record,
    historyStartKnown: false,
  });
  assert.match(draft.text, /Ship accessible search; preserve data/);
  assert.match(draft.text, /Visible user message #msg-1/);
  assert.match(draft.text, /omitted count unknown/);
  assert.equal(draft.includedCount, 24);
  assert.equal(draft.omittedCount, 6);
  assert.equal(reopened.getState().drafts.draft?.text, "keep draft");
});

test("a partial old conversation cannot fabricate an original goal, decisions or progress", () => {
  const tail = [
    message(90, "Fix one more detail"),
    message(91, "Tests passed", { sender: "codex" }),
  ];
  const record = captureHandoffGoal({ scope, historyStartKnown: false }, tail);
  assert.equal(record.fields.goal, undefined);
  assert.deepEqual(record.fields, {});
  const draft = buildStudioHandoffDraft(tail, "Codex", false, {
    scope,
    record,
    historyStartKnown: false,
  });
  assert.match(draft.text, /Task goal\nMissing: ask the user/);
  assert.match(draft.text, /Current progress\nMissing: ask the user/);
  assert.match(draft.text, /claims not independently verified/);
});

test("structured user edits and intentional clearing survive automatic observation", () => {
  const original = captureHandoffGoal({ scope, historyStartKnown: true }, [message(1, "Original")]);
  const edited = editHandoffRecord(
    original,
    { ...fields(original), goal: "", constraints: "No mobile", decisions: "Use current store" },
    [],
  );
  const observed = captureHandoffGoal({ scope, record: edited, historyStartKnown: true }, [
    message(1, "Original"),
  ]);
  assert.equal(observed.fields.goal?.text, "");
  assert.equal(observed.fields.goal?.origin, "user-edit");
  assert.equal(observed.fields.constraints?.text, "No mobile");
  assert.equal(observed.fields.constraints?.origin, "user-edit");
  assert.match(
    buildStudioHandoffDraft([], "Codex", false, {
      scope,
      record: observed,
      historyStartKnown: true,
    }).text,
    /\[User edited\]\nUse current store/,
  );
});

test("scope excludes wrong conversation, kernel and identity records", () => {
  const wrong = captureHandoffGoal(
    { scope: { ...scope, sessionId: "other" }, historyStartKnown: true },
    [message(1, "Other goal", { targetId: "other" })],
  );
  const messages = [
    message(2, "Selected text"),
    message(3, "Other conversation", { targetId: "other" }),
    message(4, "Other kernel", { sender: "grok-build" }),
  ];
  const draft = buildStudioHandoffDraft(messages, "Codex", false, {
    scope,
    record: wrong,
    historyStartKnown: false,
  });
  assert.equal(draft.text.includes("Other goal"), false);
  assert.equal(draft.text.includes("Other conversation"), false);
  assert.equal(draft.text.includes("Other kernel"), false);
  assert.equal(draft.includedCount, 1);
  const identityRecord = { ...wrong, scope: { ...scope, workspaceIdentity: "remote-A" } };
  assert.equal(
    captureHandoffGoal({ scope, record: identityRecord, historyStartKnown: false }, []).fields.goal,
    undefined,
  );
  assert.notEqual(
    handoffScopeKey(scope),
    handoffScopeKey({ ...scope, workspaceIdentity: "remote-A" }),
  );
});

test("redaction happens before persistence and after full-text user edits on both transports", async () => {
  const content = `API_KEY=${secret}\nBearer abc123\npostgres://alice:password@db/x\n-----BEGIN PRIVATE KEY-----\nsecret content`;
  const record = editHandoffRecord(emptyHandoffRecord(scope), { ...fields(), goal: content }, []);
  const memory = disk();
  const store = createStudioAgentStore(memory.storage);
  assert.equal(store.getState().saveHandoff(record), true);
  assert.equal(memory.raw()?.includes(secret), false);
  assert.equal(memory.raw()?.includes("alice:password"), false);
  assert.equal(memory.raw()?.includes("secret content"), false);
  const attempt = createNativeHandoffAttempt({
    sourceKernel: "codex",
    workspacePath: scope.workspacePath,
    text: content,
  });
  assert.equal(JSON.stringify(attempt.envelope).includes(secret), false);
  assert.equal(attempt.text, sanitizeHandoffText(content));
  const commands: unknown[] = [];
  await performStudioHandoff(
    {
      command: async (command) => {
        commands.push(command);
        return { id: "run", revision: 1 };
      },
    },
    {
      sourceKernel: "knorvia",
      targetKernel: "codex",
      targetId: "target",
      workspacePath: scope.workspacePath,
      text: content,
    },
  );
  assert.equal(JSON.stringify(commands).includes(secret), false);
});

test("version 1 preferences migrate without destructive writes; malformed task notes do not erase drafts", () => {
  const data = emptyStudioAgentData();
  data.drafts.old = {
    sessionId: "old",
    kernelId: "codex",
    text: "Existing user data",
    updatedAt: 1,
  };
  for (const bad of [undefined, null, [], { broken: { version: 99 } }]) {
    const memory = disk(JSON.stringify({ version: 1, data: { ...data, handoffs: bad } }));
    const store = createStudioAgentStore(memory.storage);
    assert.equal(store.getState().storageIssue, null);
    assert.equal(store.getState().drafts.old?.text, "Existing user data");
    assert.equal(memory.writes(), 0);
    const record = captureHandoffGoal({ scope, historyStartKnown: true }, [
      message(1, "Objective"),
    ]);
    assert.equal(store.getState().saveHandoff(record), true);
    assert.equal(JSON.parse(memory.raw()!).version, 2);
    assert.equal(
      createStudioAgentStore(memory.storage).getState().drafts.old?.text,
      "Existing user data",
    );
  }
  assert.equal(
    parseHandoffRecord({
      version: 1,
      scope,
      fields: { goal: { text: "Claim", origin: "visible-message", omittedChars: 0 } },
      references: [],
    }),
    null,
  );
});

test("failed persistence remains retryable without losing task notes or composer data", () => {
  const memory = disk();
  const store = createStudioAgentStore(memory.storage);
  store.getState().saveDraft("draft", "codex", "old draft");
  const oldDisk = memory.raw();
  memory.fail(true);
  const record = captureHandoffGoal({ scope, historyStartKnown: true }, [message(1, "Keep goal")]);
  assert.equal(store.getState().saveHandoff(record), false);
  assert.equal(store.getState().handoffs[handoffScopeKey(scope)]?.fields.goal?.text, "Keep goal");
  assert.equal(memory.raw(), oldDisk);
  memory.fail(false);
  assert.equal(store.getState().retrySave(), true);
  const reopened = createStudioAgentStore(memory.storage);
  assert.equal(
    reopened.getState().handoffs[handoffScopeKey(scope)]?.fields.goal?.text,
    "Keep goal",
  );
  assert.equal(reopened.getState().drafts.draft?.text, "old draft");
});

test("reference checks reject stale files, credentials, traversal and symlink escape without reading contents", async () => {
  const record = {
    ...emptyHandoffRecord(scope),
    references: [
      "src/main.ts",
      "report.pdf",
      "deleted.txt",
      "../outside.txt",
      "C:/other/file",
      ".env",
      ".ssh/id_rsa",
      "escape/link.txt",
      "nested/.env.local",
    ],
  };
  const visited: string[] = [];
  let reportDeleted = false;
  const fileService = {
    resolvePath: async ({ path }: { path: string }) => {
      visited.push(path);
      if (path.endsWith("deleted.txt") || (reportDeleted && path.endsWith("report.pdf")))
        throw new Error("missing");
      return path.endsWith("escape/link.txt") ? "C:/other/file" : path;
    },
    stat: async ({ path }: { path: string }) => ({ path, type: "file" as const }),
  };
  const refs = await verifyHandoffReferences(fileService, record);
  assert.deepEqual(refs, ["src/main.ts", "report.pdf"]);
  assert.equal(
    visited.some((path) => /\.env|\.ssh|\.\./.test(path)),
    false,
  );
  assert.deepEqual(await verifyHandoffReferences(undefined, record), []);
  const draft = buildStudioHandoffDraft([], "Codex", false, {
    scope,
    record,
    historyStartKnown: false,
    verifiedReferences: refs,
  });
  assert.equal(draft.omittedReferences, 7);
  assert.equal(draft.text.includes("deleted.txt"), false);
  reportDeleted = true;
  assert.deepEqual(await verifyHandoffReferences(fileService, record), ["src/main.ts"]);
});

test("full task fields, references and long history stay under the visible payload budget", () => {
  const record = emptyHandoffRecord(scope);
  for (const key of HANDOFF_FIELD_KEYS)
    record.fields[key] = createHandoffField(key, `${key}: ${"x".repeat(5000)}`, "user-edit");
  record.references = Array.from({ length: 20 }, (_, i) => `artifact-${i}-${"f".repeat(220)}.txt`);
  const messages = Array.from({ length: 90 }, (_, i) =>
    message(i, "body".repeat(400), { sender: "codex" }),
  );
  messages.push(
    message(91, "hidden reasoning", { kind: "reasoning" }),
    message(92, "raw tool output", { kind: "tool", name: "git status", state: "completed" }),
  );
  const draft = buildStudioHandoffDraft(messages, "Codex", false, {
    scope,
    record,
    historyStartKnown: false,
    verifiedReferences: record.references,
  });
  assert.ok(draft.text.length <= HANDOFF_TEXT_LIMIT);
  assert.match(draft.text, /goal: xxxx/);
  assert.ok(draft.omittedCount > 24);
  assert.ok(draft.omittedChars > 10000);
  assert.equal(draft.text.includes("hidden reasoning"), false);
  assert.equal(draft.text.includes("raw tool output"), false);
  assert.match(draft.text, /Tool: git status/);
});

test("a native ACK for a different command cannot navigate the new handoff", async () => {
  const attempt = createNativeHandoffAttempt({
    sourceKernel: "codex",
    workspacePath: "C:/project",
    text: "Reviewed",
  });
  await assert.rejects(
    performNativeHandoff(
      async () => ({
        commandId: "unrelated",
        status: "accepted",
        revisionAtDecision: 1,
        result: { type: "createSession", sessionId: "wrong" },
      }),
      attempt,
    ),
    /ACK/,
  );
});

test("record cap rejects overflow without evicting existing objectives or writing duplicates", () => {
  const memory = disk();
  const store = createStudioAgentStore(memory.storage);
  for (let i = 0; i < 100; i++) {
    const ownScope = { ...scope, sessionId: `task-${i}` };
    const record = emptyHandoffRecord(ownScope);
    record.fields.goal = createHandoffField("goal", `Objective ${i}`, "user-edit");
    assert.equal(store.getState().saveHandoff(record), true);
  }
  const previous = memory.raw();
  assert.equal(store.getState().saveHandoff(emptyHandoffRecord(scope)), false);
  assert.equal(store.getState().actionError, "handoff-limit");
  assert.equal(memory.raw(), previous);
  const record = store.getState().handoffs[handoffScopeKey({ ...scope, sessionId: "task-0" })];
  assert.equal(record.fields.goal?.text, "Objective 0");
  assert.equal(store.getState().saveHandoff(record), true);
  assert.equal(memory.writes(), 100);
  assert.equal(store.getState().actionError, null);
});

test("native adapter exclusions remain visible without treating total rows as visible messages", () => {
  const draft = buildStudioHandoffDraft([message(1, "Visible user goal")], "Knorvia", false, {
    scope,
    historyStartKnown: true,
    totalRecordCount: 9,
    excludedRecordCount: 8,
  });
  assert.match(draft.text, /Loaded visible 1;/);
  assert.match(draft.text, /non-visible\/other conversation excluded 8/);
  assert.match(draft.text, /Total records \(including non-visible\): 9/);
});

test("editing other notes leaves a missing goal available for later original-history capture", () => {
  const edited = editHandoffRecord(
    emptyHandoffRecord(scope),
    { ...fields(), constraints: "Keep UI" },
    [],
  );
  assert.equal(edited.fields.goal, undefined);
  const captured = captureHandoffGoal({ scope, record: edited, historyStartKnown: true }, [
    message(1, "Original goal"),
  ]);
  assert.equal(captured.fields.goal?.text, "Original goal");
  assert.equal(captured.fields.constraints?.text, "Keep UI");
});
