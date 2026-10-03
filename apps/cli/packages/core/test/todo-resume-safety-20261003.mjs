import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { contracts, deferred, load, plain, repo, trace } from "./todo-resume-fixture-20261003.mjs";
import { fixture } from "./resume-ports-20261003.mjs";
import { invocation } from "./tool-invocation-fixture.ts";
import { executeToolCall } from "../dist/tool/executor/call-runner.js";
const mode = process.argv.includes("--current") ? "current" : "baseline";
const todo = await load(mode, "todo.ts");
const declaration = JSON.parse(
  fs.readFileSync(
    path.join(repo, "docs/evidence/todo-resume-author-20261003/todo/declaration.json"),
  ),
);
const item = (status = "pending") => ({ content: "Owned task", status, priority: "low" });
const context = (sessionStore) => ({
  sessionStore,
  sessionId: "owned-session",
  toolCallId: "owned-call",
});
const setup = async () => {
  const f = fixture();
  Object.assign(f.runtime, await load(mode, "resume.ts", f.modules));
  return f;
};

test("Todo schemas, complete public declaration, admission and returned reference", async () => {
  for (const [name, expected] of Object.entries(declaration)) {
    const entry = todo[name];
    assert.deepEqual(Object.keys(entry), Object.keys(expected));
    for (const [key, value] of Object.entries(expected)) {
      if (key === "handler") assert.equal(entry.handler.constructor.name, "AsyncFunction");
      else if (key.startsWith("runtime")) assert.equal(entry[key], contracts[value]);
      else assert.deepEqual(plain(entry[key]), value);
    }
  }
  await assert.rejects(
    todo.todoReadToolEntry.handler({ unexpected: 1 }, context()),
    (e) => e.name === "ZodError",
  );
  await assert.rejects(
    todo.todoWriteToolEntry.handler({}, context()),
    (e) => e.name === "ZodError",
  );
  for (const name of ["TodoRead", "TodoWrite"]) {
    const e = todo[name === "TodoRead" ? "todoReadToolEntry" : "todoWriteToolEntry"];
    await assert.rejects(
      e.handler(name === "TodoRead" ? {} : { todos: [] }, context()),
      (error) => {
        assert.equal(error.type, contracts.CoreErrorType.ConfigurationError);
        assert.equal(error.message, "SessionStorePort is not configured for " + name);
        assert.deepEqual(plain(error.context), { toolCallId: "owned-call", toolName: name });
        assert.equal(error.recoverable, false);
        return true;
      },
    );
  }
  const todos = [item()];
  const store = {
    async readTodos(input) {
      assert.equal(this, store);
      assert.deepEqual(plain(input), { sessionID: "owned-session" });
      return todos;
    },
  };
  const output = await todo.todoReadToolEntry.handler({}, context(store));
  assert.equal(output.todos, todos);
});

test("Todo post-write summary, parsed array identity, status reads and original failures", async () => {
  const input = { todos: [item("in_progress"), item("in_progress")] },
    old = [item("completed")],
    calls = [],
    reads = [];
  let written;
  const store = {
    async readTodos(value) {
      assert.equal(this, store);
      calls.push("read");
      assert.equal(value.sessionID, "owned-session");
      return old;
    },
    async updateTodos(value) {
      assert.equal(this, store);
      assert.equal(value.sessionID, "owned-session");
      calls.push("write");
      written = value.todos;
      assert.notEqual(written, input.todos);
      assert.notEqual(written[0], input.todos[0]);
      written.splice(
        0,
        written.length,
        {
          ...item(),
          get status() {
            reads.push("pending");
            return "pending";
          },
        },
        {
          ...item(),
          get status() {
            reads.push("completed");
            return "completed";
          },
        },
      );
    },
  };
  const output = await todo.todoWriteToolEntry.handler(input, context(store));
  assert.equal(output.oldTodos, old);
  assert.equal(output.todos, written);
  assert.deepEqual(calls, ["read", "write"]);
  assert.deepEqual(reads, ["pending", "completed", "pending", "completed", "pending", "completed"]);
  assert.deepEqual(plain(output.summary), { total: 2, pending: 1, inProgress: 0, completed: 1 });
  const failure = new Error("Owned write failure");
  store.readTodos = () => {
    throw failure;
  };
  await assert.rejects(
    todo.todoWriteToolEntry.handler(input, context(store)),
    (e) => e === failure,
  );
  assert.deepEqual(calls, ["read", "write"]);
  store.readTodos = async () => old;
  store.updateTodos = async (value) => {
    written = value.todos;
    throw failure;
  };
  await assert.rejects(
    todo.todoWriteToolEntry.handler(input, context(store)),
    (e) => e === failure,
  );
  assert.notEqual(written, input.todos);
});

test("Todo native delayed write, captured session phase and direct aborted context", async () => {
  const gate = deferred(),
    seen = [],
    c = context(undefined),
    old = [];
  const store = {
    readTodos(value) {
      assert.equal(this, store);
      seen.push(["read", value.sessionID]);
      return gate.promise;
    },
    async updateTodos(value) {
      assert.equal(this, store);
      seen.push(["write", value.sessionID]);
    },
  };
  c.sessionStore = store;
  c.abortSignal = AbortSignal.abort("Owned early abort");
  const pending = todo.todoWriteToolEntry.handler({ todos: [] }, c);
  assert.deepEqual(seen, [["read", "owned-session"]]);
  c.sessionId = "owned-later";
  gate.resolve(old);
  const result = await pending;
  assert.equal(result.oldTodos, old);
  assert.deepEqual(seen, [
    ["read", "owned-session"],
    ["write", "owned-later"],
  ]);
});

test("Actual full call-runner TodoWrite publication and early-cancel authority", async () => {
  const f = invocation(todo.todoWriteToolEntry),
    writes = [],
    old = [];
  f.deps.sessionStore = {
    async getSession() {
      return undefined;
    },
    async readTodos(input) {
      assert.equal(this, f.deps.sessionStore);
      assert.equal(input.sessionID, f.deps.sessionId);
      return old;
    },
    async updateTodos(input) {
      assert.equal(this, f.deps.sessionStore);
      writes.push(input);
    },
  };
  f.call.input = { todos: [item()] };
  const output = await f.run(undefined, executeToolCall);
  assert.equal(output.error, undefined);
  assert.equal(writes.length, 1);
  assert.deepEqual(plain(output.output.summary), {
    total: 1,
    pending: 1,
    inProgress: 0,
    completed: 0,
  });
  assert.deepEqual(
    f.terminal().map((t) => t.name),
    ["finishCompleted"],
  );
  assert.ok(f.events.some((e) => e.type === contracts.SessionEventType.ToolCallResult));
  const denied = await f.run({ signal: AbortSignal.abort("Owned cancel") }, executeToolCall);
  assert.equal(denied.error.type, contracts.CoreErrorType.ToolCancelled);
  assert.equal(writes.length, 1);
  assert.equal(f.terminal().at(-1).name, "finishCancelled");
});

test("Resume store/session admission and schedule reference projection", async () => {
  const f = await setup(),
    ns = f.runtime;
  ns.sessionStore = undefined;
  await assert.rejects(
    ns.resumeFromStore(),
    (e) => e.type === contracts.CoreErrorType.ConfigurationError && e.recoverable === false,
  );
  assert.deepEqual(f.calls, []);
  const g = await setup();
  g.session.time.archived = 0;
  await assert.rejects(
    g.runtime.resumeFromStore(),
    (e) => e.type === contracts.CoreErrorType.SessionNotFound && e.recoverable === true,
  );
  assert.deepEqual(g.calls, ["getSession"]);
  const dependencies = ["owned-dependency"],
    groups = [["owned-call"]],
    order = ["owned-call"];
  const schedule = {
    items: [{ toolCallId: "owned-call", dependencies, canRunParallel: true }],
    parallelGroups: groups,
    executionOrder: order,
  };
  const projected = ns.toScheduleState(schedule);
  assert.notEqual(projected.items, schedule.items);
  assert.notEqual(projected.items[0], schedule.items[0]);
  assert.equal(projected.items[0].dependencies, dependencies);
  assert.equal(projected.parallelGroups, groups);
  assert.equal(projected.executionOrder, order);
});

test("Resume exact restore/publication order, captured identity and final output", async () => {
  const f = await setup(),
    r = f.runtime,
    result = await r.resumeFromStore();
  assert.deepEqual(f.calls, [
    "getSession",
    "repair",
    "messages",
    "branch",
    "shell",
    "read-hydrate",
    "context",
    "compact",
    "history-hydrate",
    "shell-notice",
    "active",
    "timeline",
    "checkpoint",
    "file-rewind",
    "events",
    "resolve-mode",
    "executionEntries",
    "parse-state",
    "grant",
    "usage",
    "append:session_title_updated",
    "discard-steer",
    "todos",
    "target",
    "append:session_resumed",
    "hooks",
    "hook-context",
    "info:session.resumed",
  ]);
  assert.equal(r.config.envInfo, f.env);
  assert.equal(r.config.memory.workspaceIdentity, f.session.workspaceID);
  assert.equal(r.config.mode, f.saved.mode);
  assert.equal(r.config.planEnabled, true);
  assert.equal(r.latestConversationMessageId, "owned-assistant");
  assert.equal(r.latestAssistantMessageId, "owned-assistant");
  assert.equal(r.latestAssistantTurnId, "owned-turn");
  assert.equal(r.lastAssistantCompletedAtMs, 123);
  assert.equal(r.turnNumber, 1);
  assert.equal(r.sessionPersisted, true);
  assert.deepEqual(plain(result), {
    ...f.hydration,
    directory: f.session.directory,
    persistedMessagesReloadRequired: true,
    readFileStateRestoredCount: 4,
    readFileStateSkippedRangeReadCount: 5,
    readFileStateSkippedUnreadableEditCount: 6,
    traceId: trace.traceId,
  });
  assert.deepEqual(plain(f.events), [
    {
      type: "session_title_updated",
      payload: { previousTitle: "", source: "generated", title: "Owned title" },
    },
    {
      type: "session_resumed",
      payload: {
        directory: f.session.directory,
        interruptedToolCount: 1,
        messageCount: 2,
        partCount: 3,
        recoveredCompactTimelineCount: 1,
        recoveredSteerInputCount: 0,
        resumedTodoCount: 1,
        resumedTarget: "active",
      },
    },
  ]);
  const texts = JSON.parse(
    fs.readFileSync(
      path.join(repo, "docs/evidence/todo-resume-author-20261003/resume/public-text.json"),
    ),
  );
  assert.equal(f.attachments[0][0], "resume_goal_state");
  assert.equal(f.attachments[0][1].split("\n")[1], "Owned goal state");
  assert.equal(texts.logs.find((l) => l.level === "info").message, "Session resumed");
});

test("Resume explicit mode, duplicate title and grant failure partial effects", async () => {
  const f = await setup();
  f.events.push({
    type: contracts.SessionEventType.SessionTitleUpdated,
    payload: { title: "Owned title", source: "generated" },
  });
  await f.runtime.resumeFromStore({ modeOverride: "yolo", persistedMessages: f.messages });
  assert.equal(f.runtime.config.mode, "yolo");
  assert.equal(f.runtime.config.planEnabled, false);
  assert.ok(!f.calls.includes("messages"));
  assert.ok(!f.calls.includes("append:session_title_updated"));
  const g = fixture(),
    error = Object.assign(new Error("Owned grant cancellation"), { name: "AbortError" });
  g.modules["runtime/helpers/permission-grant-resume.js"].restorePermissionGrantMarker =
    async () => {
      g.calls.push("grant");
      throw error;
    };
  Object.assign(g.runtime, await load(mode, "resume.ts", g.modules));
  await assert.rejects(g.runtime.resumeFromStore(), (e) => e === error);
  assert.equal(g.runtime.config.mode, g.saved.mode);
  assert.equal(g.runtime.workingDirectory, g.session.directory);
  assert.equal(g.runtime.sessionPersisted, undefined);
  assert.deepEqual(g.events, []);
  assert.equal(g.calls.at(-1), "grant");
  assert.ok(!g.calls.includes("usage"));
});

test("Resume hook cancellation retains writes; continuity failures retain fallbacks", async () => {
  const f = await setup(),
    controller = new AbortController(),
    error = Object.assign(new Error("Owned hook abort"), { name: "AbortError" });
  f.runtime.runSessionStartHooks = async function (source, eventTrace, signal) {
    assert.equal(this, f.runtime);
    assert.equal(source, "resume");
    assert.equal(eventTrace, trace);
    assert.equal(signal, controller.signal);
    controller.abort(error);
    throw error;
  };
  await assert.rejects(
    f.runtime.resumeFromStore({ abortSignal: controller.signal }),
    (e) => e === error,
  );
  assert.equal(f.runtime.sessionPersisted, true);
  assert.deepEqual(
    f.events.map((e) => e.type),
    ["session_title_updated", "session_resumed"],
  );
  assert.ok(!f.calls.includes("info:session.resumed"));
  f.runtime.sessionStore.readTodos = async () => {
    throw error;
  };
  f.runtime.sessionStore.readTarget = () => {
    throw error;
  };
  assert.deepEqual(plain(await f.runtime.readSessionTodosForContext(trace)), []);
  assert.equal(await f.runtime.readSessionTargetForContext(trace), null);
  assert.deepEqual(f.calls.slice(-2), [
    "warn:todo.context.read.failed",
    "warn:target.context.read.failed",
  ]);
  f.runtime.logger.warn = () => {
    throw error;
  };
  await assert.rejects(f.runtime.readSessionTodosForContext(trace), (e) => e === error);
});
