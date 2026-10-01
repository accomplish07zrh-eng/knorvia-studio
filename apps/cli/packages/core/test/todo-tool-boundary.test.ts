// Synthetic session ports only; no user data or real persistence.
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType } from "@knorvia/contracts";
import * as source from "../src/tool/handlers/todo.js";
import * as emitted from "../dist/tool/handlers/todo.js";
import type { ToolExecutionContext } from "../src/tool/types.js";
const item = (status = "pending") => ({ content: "owned task", status, priority: "medium" });
function fixture() {
  const calls: unknown[][] = [];
  const old = [item("completed")];
  const port = {
    async readTodos(this: unknown, input: unknown) {
      assert.equal(this, port);
      calls.push(["read", input]);
      return old;
    },
    async updateTodos(this: unknown, input: unknown) {
      assert.equal(this, port);
      calls.push(["write", input]);
    },
  };
  const context = {
    sessionId: "owned-session",
    toolCallId: "owned-call",
    sessionStore: port,
    abortSignal: new AbortController().signal,
  } as unknown as ToolExecutionContext;
  return { calls, old, port, context };
}
assert.notEqual(source.todoReadToolEntry, emitted.todoReadToolEntry);
for (const [surface, entries] of [
  ["source", source],
  ["emitted", emitted],
] as const) {
  for (const [name, entry, valid, invalid] of [
    ["TodoRead", entries.todoReadToolEntry, {}, [null, { extra: 1 }, []]],
    [
      "TodoWrite",
      entries.todoWriteToolEntry,
      { todos: [] },
      [null, {}, { todos: [item("bad")] }, { todos: [], extra: 1 }],
    ],
  ] as const) {
    for (const input of invalid)
      test(`${surface} ${name} validates before owner: ${JSON.stringify(input)}`, async () => {
        const f = fixture();
        f.context.sessionStore = undefined;
        await assert.rejects(entry.handler(input, f.context), { name: "ZodError" });
        assert.deepEqual(f.calls, []);
      });
    test(`${surface} ${name} missing owner keeps structured error`, async () => {
      const f = fixture();
      f.context.sessionStore = undefined;
      await assert.rejects(entry.handler(valid, f.context), (e: any) => {
        assert.equal(e.type, CoreErrorType.ConfigurationError);
        assert.equal(e.recoverable, false);
        assert.equal(e.message, `SessionStorePort is not configured for ${name}`);
        assert.deepEqual(e.context, { toolCallId: "owned-call", toolName: name });
        return true;
      });
    });
  }
  test(`${surface} read preserves owner list identity and session`, async () => {
    const f = fixture();
    const result: any = await entries.todoReadToolEntry.handler({}, f.context);
    assert.equal(result.todos, f.old);
    assert.deepEqual(f.calls, [["read", { sessionID: "owned-session" }]]);
  });
  for (const todos of [
    [],
    [item()],
    [
      item("in_progress"),
      item("in_progress"),
      item("completed"),
      { ...item(), content: "  ", extra: true },
    ],
  ]) {
    test(`${surface} write replaces complete list of ${todos.length}`, async () => {
      const f = fixture();
      const result: any = await entries.todoWriteToolEntry.handler({ todos }, f.context);
      const expected = todos.map(({ content, status, priority }) => ({
        content,
        status,
        priority,
      }));
      assert.deepEqual(f.calls, [
        ["read", { sessionID: "owned-session" }],
        ["write", { sessionID: "owned-session", todos: expected }],
      ]);
      assert.equal(result.oldTodos, f.old);
      assert.equal(result.todos, (f.calls[1][1] as any).todos);
      assert.notEqual(result.todos, todos);
      assert.deepEqual(result.summary, {
        total: todos.length,
        pending: todos.filter((x) => x.status === "pending").length,
        inProgress: todos.filter((x) => x.status === "in_progress").length,
        completed: todos.filter((x) => x.status === "completed").length,
      });
    });
  }
  for (const stage of ["read", "write"] as const)
    test(`${surface} ${stage} failure propagates without retry`, async () => {
      const f = fixture();
      const failure = new Error(`owned ${stage} failure`);
      if (stage === "read")
        f.port.readTodos = async () => {
          f.calls.push(["failed read"]);
          throw failure;
        };
      else
        f.port.updateTodos = async () => {
          f.calls.push(["failed write"]);
          throw failure;
        };
      await assert.rejects(
        entries.todoWriteToolEntry.handler({ todos: [item()] }, f.context),
        (e) => e === failure,
      );
      assert.equal(f.calls.length, stage === "read" ? 1 : 2);
    });
  test(`${surface} read owner error remains identical`, async () => {
    const f = fixture();
    const failure = new Error("owned read failure");
    f.port.readTodos = async () => {
      throw failure;
    };
    await assert.rejects(entries.todoReadToolEntry.handler({}, f.context), (e) => e === failure);
  });
  test(`${surface} summary is projected after awaited update`, async () => {
    const f = fixture();
    f.port.updateTodos = async (input: any) => {
      await Promise.resolve();
      input.todos[0].status = "completed";
    };
    const result: any = await entries.todoWriteToolEntry.handler({ todos: [item()] }, f.context);
    assert.deepEqual(result.summary, { total: 1, pending: 0, inProgress: 0, completed: 1 });
  });
  test(`${surface} direct handler does not introduce independent abort admission`, async () => {
    const f = fixture();
    f.context.abortSignal = AbortSignal.abort();
    await entries.todoWriteToolEntry.handler({ todos: [] }, f.context);
    assert.equal(f.calls.length, 2);
  });
}
