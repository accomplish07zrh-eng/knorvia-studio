// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  KNORVIA_AGENT_PROVIDER,
  sessionStateSnapshotSchema,
  type KnorviaSessionSettingsState,
} from "@knorvia/shared";
import {
  deepFreeze,
  message,
  projectionUrl,
  runtimeValue,
  settings,
  snapshot,
  withoutTrace,
} from "./ui-b3-projection-fixtures-20260930.js";

const projection = await import(projectionUrl());
const {
  formatModelPickerValue: format,
  parseModelPickerValue: parse,
  sessionSettingsToConfigOptions: config,
  knorviaWorkspacePresentationToConfigOptions: workspace,
  sessionSnapshotToTaskMeta: meta,
} = projection;
const modes = [
  { value: "build", name: "Ask before changes", description: "Ask before each file changes." },
  {
    value: "edit",
    name: "Edit automatically",
    description: "Edit selected files or relevant workspace files automatically.",
  },
  {
    value: "plan",
    name: "Plan mode",
    description: "Inspect the code and present a plan before editing.",
  },
  {
    value: "yolo",
    name: "Full access",
    description: "Edit and run commands with fewer confirmations.",
  },
];

test("B3 projection: public exports and real protocol fixture", () => {
  assert.deepEqual(Object.keys(projection).sort(), [
    "formatModelPickerValue",
    "knorviaWorkspacePresentationToConfigOptions",
    "parseModelPickerValue",
    "sessionSettingsToConfigOptions",
    "sessionSnapshotToTaskMeta",
  ]);
  assert.deepEqual(sessionStateSnapshotSchema.parse(snapshot()), snapshot());
});

test("B3 projection: settings output order, own undefined fields and fresh records", () => {
  const source = deepFreeze(settings());
  const first = config(source);
  const next = config(source);
  assert.deepEqual(first, [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "provider/default",
      options: [],
    },
    {
      id: "mode",
      name: "Mode",
      category: "mode",
      type: "select",
      currentValue: "build",
      options: modes,
    },
  ]);
  assert.deepEqual(Object.keys(first[0]!), [
    "id",
    "name",
    "category",
    "type",
    "currentValue",
    "options",
  ]);
  assert.notEqual(first, next);
  assert.notEqual(first[0], next[0]);
  assert.notEqual(first[1]!.options, next[1].options);
  assert.notEqual(first[1]!.options[0], next[1].options[0]);
});

for (const mode of ["build", "edit", "plan", "yolo", "auto", "unknown", "", null, undefined]) {
  test(`B3 projection: mode directory fallback ${String(mode)}`, () => {
    const result = workspace(mode);
    assert.deepEqual(result, [
      {
        id: "mode",
        name: "Mode",
        category: "mode",
        type: "select",
        currentValue: ["build", "edit", "plan", "yolo"].includes(mode as string) ? mode : "build",
        options: modes,
      },
    ]);
    const source = snapshot();
    source.session.mode = runtimeValue(mode);
    source.settings.mode.current = runtimeValue(mode);
    assert.equal(meta(source).mode, mode);
    assert.equal(config(source.settings)[1].currentValue, result[0]!.currentValue);
  });
}

test("B3 projection: model catalog does not invent descriptions or filter duplicate/disabled models", () => {
  const source = settings();
  source.model.available = runtimeValue([
    {
      ref: {
        providerId: "custom-provider",
        modelId: "a/b:free",
        options: { reasoningLevel: "high" },
      },
      label: "A",
      providerLabel: "",
      disabledReason: "disabled",
      reasoning: {
        levels: [
          { value: "high", label: "High" },
          { value: "high", label: "Duplicate" },
        ],
        defaultLevel: "high",
      },
    },
    {
      ref: { providerId: "custom-provider", modelId: "a/b:free" },
      label: "Again",
      description: "",
      reasoning: { levels: [], defaultLevel: "missing" },
    },
    { ref: { providerId: "other", modelId: "plain" }, label: "Plain" },
  ]);
  const options = config(deepFreeze(source))[0].options;
  assert.deepEqual(options, [
    {
      value: "custom-provider/a/b:free$high",
      name: "A",
      description: undefined,
      modelProviderId: "custom-provider",
      modelProviderName: "",
      modelThoughtLevels: ["high", "high"],
      modelDefaultThoughtLevel: "high",
    },
    {
      value: "custom-provider/a/b:free",
      name: "Again",
      description: "",
      modelProviderId: "custom-provider",
      modelProviderName: "custom-provider",
      modelThoughtLevels: [],
    },
    {
      value: "other/plain",
      name: "Plain",
      description: undefined,
      modelProviderId: "other",
      modelProviderName: "other",
    },
  ]);
  assert.deepEqual(Object.keys(options[0]!), [
    "value",
    "name",
    "description",
    "modelProviderId",
    "modelProviderName",
    "modelThoughtLevels",
    "modelDefaultThoughtLevel",
  ]);
  assert.equal(Object.hasOwn(options[2]!, "description"), true);
  assert.equal(Object.hasOwn(options[2]!, "modelThoughtLevels"), false);
});

const thoughtCases: Array<[string, unknown, unknown, string[], string]> = [
  ["current wins", "high", "low", ["low", "high"], "high"],
  ["unknown current", "missing", "high", ["low", "high"], "high"],
  ["unset current", undefined, "high", ["low", "high"], "high"],
  ["unknown defaults", "missing", "unknown", ["low", "high"], "low"],
  ["empty choices", undefined, undefined, [], ""],
  ["empty string invalid", "", "high", ["", "high"], "high"],
  ["duplicates retained", "high", undefined, ["high", "high"], "high"],
  ["whitespace is an exact choice", " high ", "high", ["high", " high "], " high "],
];
for (const [name, current, defaultLevel, available, expected] of thoughtCases) {
  test(`B3 projection: thought ${name}`, () => {
    const source = snapshot();
    source.settings.thoughtLevel = runtimeValue({
      enabled: true,
      current,
      defaultLevel,
      available: available.map((value) => ({ value, label: `label:${value}` })),
    });
    const item = config(deepFreeze(source.settings))[2];
    assert.deepEqual(item, {
      id: "thought_level",
      name: "Thought Level",
      category: "thought_level",
      type: "select",
      currentValue: expected,
      options: available.map((value) => ({
        value,
        name: `label:${value}`,
        description: undefined,
      })),
    });
    assert.equal(meta(source).thoughtLevel, current);
  });
}

test("B3 projection: disabled thought has no eager access and unknown fields stay omitted", () => {
  const source = settings();
  const failure = new Error("unused thought catalog");
  source.thoughtLevel = runtimeValue({
    enabled: false,
    get available(): never {
      throw failure;
    },
  });
  assert.equal(config(source).length, 2);
});

const parseCases: Array<[string, unknown]> = [
  [
    " provider/a/b:free$high ",
    { providerId: "provider", modelId: "a/b:free", options: { reasoningLevel: "high" } },
  ],
  ["provider/model$", { providerId: "provider", modelId: "model$" }],
  ["provider/$high", { providerId: "provider", modelId: "$high" }],
  ["custom:p%2Fid:m%3Aname", { providerId: "p/id", modelId: "m:name" }],
  ["custom:builtin:family:a:b", { providerId: "builtin:family", modelId: "a:b" }],
  ["custom:p:%ZZ", { providerId: "p", modelId: "%ZZ" }],
  ["custom:%20:%20", { providerId: " ", modelId: " " }],
  ["custom:p:m$high", { providerId: "p", modelId: "m$high" }],
];
for (const [input, expected] of parseCases) {
  test(`B3 projection: shared codec compatibility ${input}`, () =>
    assert.deepEqual(parse(input), expected));
}
test("B3 projection: formatter and public parser errors remain visible", () => {
  assert.equal(format(undefined), "");
  assert.equal(
    format({ providerId: "p", modelId: "a:b/free", options: { reasoningLevel: "high" } }),
    "p/a:b/free$high",
  );
  for (const input of [
    "",
    "custom:p",
    "custom:p:",
    "custom::model",
    " CUSTOM:p:model ",
    "model",
    "/model",
  ]) {
    assert.throws(() => parse(input), /模型选择缺少 Provider/);
  }
  assert.throws(
    () => parse("p/"),
    (error) => error instanceof Error && error.name === "ZodError",
  );
  assert.throws(() => parse(null), TypeError);
});

test("B3 projection: metadata own key order, new UUID and raw workspace identity", () => {
  const source = snapshot();
  source.session.traceId = "persisted-trace";
  source.session.workspace.workspacePath = String.raw` C:\fixture\a%20b\..\project `;
  source.session.workspace.workspaceIdentity = " remote:exact%2Fidentity ";
  const first = meta(deepFreeze(source));
  assert.deepEqual(Object.keys(first), [
    "taskId",
    "traceId",
    "title",
    "workspacePath",
    "workspaceIdentity",
    "createdAt",
    "updatedAt",
    "mode",
    "model",
    "thoughtLevel",
    "provider",
    "status",
    "lastError",
    "target",
  ]);
  assert.deepEqual(withoutTrace(first), {
    taskId: "fixture-session",
    title: "Fixture title",
    workspacePath: source.session.workspace.workspacePath,
    workspaceIdentity: source.session.workspace.workspaceIdentity,
    createdAt: 10,
    updatedAt: 20,
    mode: "build",
    model: "provider/default",
    thoughtLevel: undefined,
    provider: KNORVIA_AGENT_PROVIDER,
    status: undefined,
    lastError: undefined,
    target: undefined,
  });
  assert.match(
    first.traceId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.notEqual(meta(source).traceId, first.traceId);
});

test("B3 projection: resume model follows array order, including hidden user models", () => {
  const source = snapshot();
  const old = message("assistant", "old", "", { providerId: "p", modelId: "time-newer" });
  old.info.time.created = 900;
  const last = message("user", "hidden", "hidden", {
    providerId: "p",
    modelId: "array-latest",
    options: { reasoningLevel: "deep" },
  });
  if (last.info.role === "user") {
    last.info.visibility = "model-only";
    last.info.synthetic = true;
  }
  source.messages = [old, last, message("assistant", "unbound")];
  assert.equal(meta(deepFreeze(source)).model, "p/array-latest$deep");
  const empty = snapshot();
  delete empty.settings.model.current;
  assert.equal(meta(empty).model, "");
});

test("B3 projection: title uses visible first user then objective then fallback", () => {
  const source = snapshot();
  source.session.title = " ";
  const hidden = message("user", "hidden", "SECRET");
  if (hidden.info.role === "user") hidden.info.visibility = "model-only";
  source.messages = [
    hidden,
    message("user", "real", "  First visible  "),
    message("user", "next", "Next"),
  ];
  assert.equal(meta(source).title, "First visible");
  source.messages = [];
  source.projection.target = runtimeValue({ objective: " Goal title " });
  assert.equal(meta(source).title, "Goal title");
  source.projection.target = null;
  assert.equal(meta(source).title, "New session");
});

for (const status of ["idle", "running", "waiting", "paused", "error", "completed", "unknown"]) {
  test(`B3 projection: shared session status ${status}`, () => {
    const source = snapshot();
    source.session.status = runtimeValue(status);
    source.projection.status = "error";
    const expected = (
      {
        running: "running",
        waiting: "running",
        paused: "running",
        error: "error",
        completed: "completed",
      } as Record<string, string>
    )[status];
    assert.equal(meta(source).status, expected);
  });
}

test("B3 projection: completed messages, stale turn IDs and blocking approval/runtime", () => {
  const source = snapshot();
  source.session.status = "running";
  const done = message("assistant", "done", "Done");
  done.info.time.completed = 30;
  source.messages = [done];
  source.projection.currentTurnId = "stale-turn";
  assert.equal(meta(source).status, "completed");
  for (const field of ["activeTurnId", "activeTurnKind"]) {
    const blocked = structuredClone(source);
    Object.assign(blocked.runtime, { [field]: field === "activeTurnId" ? "turn" : "regular" });
    assert.equal(meta(blocked).status, "running");
  }
  source.projection.pendingPermissions = runtimeValue([
    { requestId: "request", input: { ignored: true } },
  ]);
  assert.equal(meta(source).status, "running");
  source.session.status = "completed";
  assert.equal(meta(source).status, "completed");
  source.projection.lastError = { type: "provider", message: "failed" };
  assert.equal(meta(source).status, "error");
});

for (const status of ["pending", "running", "completed", "failed", "denied"]) {
  test(`B3 projection: active tool status ${status}`, () => {
    const source = snapshot();
    source.projection.activeToolCalls = runtimeValue([
      { toolCallId: "tool", toolName: "read", status },
    ]);
    assert.equal(
      meta(source).status,
      status === "pending" || status === "running" ? "running" : undefined,
    );
  });
}

test("B3 projection: tool-call continuation remains running; error detail and attribution identity", () => {
  const source = snapshot();
  source.session.status = "running";
  const done = message("assistant", "done", "Done");
  if (done.info.role === "assistant") done.info.finish = " TOOL_CALLS ";
  done.info.time.completed = 30;
  source.messages = [done];
  assert.equal(meta(source).status, "running");
  const attribution = { marker: "unchanged" };
  source.projection.lastError = runtimeValue({
    code: "",
    type: "type",
    message: "message",
    detail: "",
    attribution,
  });
  const result = meta(source).lastError;
  assert.deepEqual(result, { code: "", attribution, message: "message" });
  assert.deepEqual(Object.keys(result), ["code", "attribution", "message"]);
  assert.equal(result.attribution, attribution);
});

test("B3 projection: goal aliases/defaults/finite numbers and target tri-state", () => {
  const source = snapshot();
  for (const target of [undefined, null, false, 0, ""]) {
    source.projection.target = runtimeValue(target);
    assert.equal(meta(source).target, target);
  }
  source.projection.target = runtimeValue({
    sessionID: "legacy",
    sessionId: "new",
    targetID: "",
    targetId: "new-target",
    objective: " ",
    summaryTitle: "",
    status: "unknown",
    tokenBudget: Infinity,
    tokensUsed: NaN,
    timeUsedSeconds: -2,
    activeInputId: "",
    activeRunStartedAtMs: 0,
    activeRunLastSeenAtMs: Infinity,
    time: { created: 0, updated: NaN },
    createdAt: 99,
    updatedAt: 88,
  });
  const goal = meta(deepFreeze(source)).target;
  assert.deepEqual(goal, {
    sessionID: "legacy",
    targetID: "new-target",
    objective: " ",
    summaryTitle: null,
    status: "active",
    tokenBudget: Infinity,
    tokensUsed: 0,
    timeUsedSeconds: -2,
    activeInputId: null,
    activeRunStartedAtMs: 0,
    activeRunLastSeenAtMs: null,
    time: { created: 0, updated: 88 },
  });
  assert.deepEqual(Object.keys(goal), [
    "sessionID",
    "targetID",
    "objective",
    "summaryTitle",
    "status",
    "tokenBudget",
    "tokensUsed",
    "timeUsedSeconds",
    "activeInputId",
    "activeRunStartedAtMs",
    "activeRunLastSeenAtMs",
    "time",
  ]);
});

test("B3 projection: goal status vocabulary and NaN token budget stay distinct", () => {
  const source = snapshot();
  for (const status of ["active", "paused", "budget_limited", "complete", "constructor", ""]) {
    source.projection.target = runtimeValue({ status, tokenBudget: NaN });
    const target = meta(source).target;
    assert.equal(
      target.status,
      ["active", "paused", "budget_limited", "complete"].includes(status) ? status : "active",
    );
    assert.equal(Number.isNaN(target.tokenBudget), true);
  }
});

test("B3 projection: supplied revision is projected without a stale-result cache", () => {
  const newer = snapshot();
  newer.runtime.stateRevision = 100;
  newer.session.title = "Newer";
  const older = snapshot();
  older.runtime.stateRevision = 1;
  older.session.title = "Older";
  assert.equal(meta(newer).title, "Newer");
  assert.equal(meta(older).title, "Older");
  assert.equal(meta(newer).title, "Newer");
});

test("B3 projection: shallow cyclic/deep payloads and inherited goal fields are not cloned", () => {
  const source = snapshot();
  const target: Record<string, unknown> = Object.create({
    sessionID: "inherited",
    status: "paused",
  });
  target.objective = "Goal";
  target.time = target;
  target.created = 17;
  target.unknown = target;
  Object.defineProperty(target, "unusedGetter", {
    enumerable: true,
    get(): never {
      throw new Error("unknown field traversed");
    },
  });
  source.projection.target = runtimeValue(target);
  const attachment = { type: "file", url: "file:///C:/a%20b.pdf", metadata: { cycle: target } };
  source.messages = [message("assistant", "attachment")];
  source.messages[0]!.parts = runtimeValue([attachment]);
  let deep: Record<string, unknown> = {};
  const root = deep;
  for (let index = 0; index < 20000; index++) {
    const next = {};
    deep.child = next;
    deep = next;
  }
  source.projection.backgroundJobs = [root];
  const result = meta(source);
  assert.equal(result.target.sessionID, "inherited");
  assert.equal(result.target.status, "paused");
  assert.equal(result.target.time.created, 17);
  assert.notEqual(result.target, target);
  assert.notEqual(result.target.time, target);
  assert.equal(Object.hasOwn(result, "messages"), false);
  assert.equal(Object.hasOwn(result, "attachments"), false);
  assert.equal(source.messages[0]!.parts[0], attachment);
});

test("B3 projection: public malformed structure failures and UUID-before-title order", (t) => {
  const events: string[] = [];
  t.mock.method(globalThis.crypto, "randomUUID", () => {
    events.push("trace");
    return "00000000-0000-4000-8000-000000000000";
  });
  const failure = new Error("title getter");
  const source = snapshot();
  Object.defineProperty(source.session, "title", {
    get() {
      events.push("title");
      throw failure;
    },
  });
  assert.throws(
    () => meta(source),
    (error) => error === failure,
  );
  assert.deepEqual(events, ["trace", "title"]);
  assert.throws(() => meta(null), TypeError);
  const invalid = snapshot();
  invalid.settings = runtimeValue(null);
  assert.throws(() => meta(invalid), TypeError);
  assert.throws(() => config(null), TypeError);
  const malformed: KnorviaSessionSettingsState = settings();
  malformed.model.available = runtimeValue(null);
  assert.throws(() => config(malformed), TypeError);
});
