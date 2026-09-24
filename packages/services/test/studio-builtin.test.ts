import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import type { IKnorviaTaskService } from "../src/index.js";
import type {
  StudioKernelAnswer,
  StudioKernelEvent,
  StudioKernelInteraction,
  StudioKernelTurn,
} from "../src/studio-runtime/kernelTypes.js";
import { createBuiltinStudioKernel } from "../src/studio-runtime/adapters/builtinKernel.js";

function emitter() {
  const listeners = new Set<(value: any) => void>();
  return {
    event: (listener: (value: any) => void) => {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },
    emit: (value: unknown) => {
      for (const listener of listeners) listener(value);
    },
    listeners,
  };
}
const turn: StudioKernelTurn = {
  runId: "run",
  turnId: "input-1",
  conversationId: "chat",
  kernel: "knorvia",
  workspacePath: "C:/fixture",
  permission: "ask",
  text: "Hello",
};
function fixture() {
  const stream = emitter();
  const terminal = emitter();
  const ready = emitter();
  const errors = emitter();
  const calls: Array<[string, any]> = [];
  const outputs: StudioKernelEvent[] = [];
  const interactions: StudioKernelInteraction[] = [];
  let answer: (interaction: StudioKernelInteraction) => Promise<StudioKernelAnswer> = async () => ({
    decision: "deny",
  });
  let submit!: () => void;
  const submitted = new Promise<void>((resolve) => {
    submit = resolve;
  });
  const record = (name: string) => async (params: unknown) => {
    calls.push([name, params]);
    return true;
  };
  const service = {
    createTask: async (params: unknown) => {
      calls.push(["create", params]);
      return { taskId: "native" };
    },
    resumeTask: async (params: unknown) => {
      calls.push(["resume", params]);
      return { taskId: "native" };
    },
    setMode: record("mode"),
    sendPrompt: async (params: unknown) => {
      calls.push(["send", params]);
      submit();
    },
    stopGeneration: async (params: unknown) => {
      calls.push(["stop", params]);
      terminal.emit({ taskId: "native", inputId: turn.turnId, outcome: "stopped" });
      ready.emit({ taskId: "native", reason: "prompt_completed" });
    },
    respondPermission: record("permission"),
    respondElicitation: record("question"),
    onDynamicTaskEvent: (params: unknown) => {
      calls.push(["subscription", params]);
      return stream.event;
    },
    onDynamicTaskTerminalOutcome: () => terminal.event,
    onDynamicTaskReady: () => ready.event,
    onError: errors.event,
  } as unknown as IKnorviaTaskService;
  const sink = {
    emit: async (event: StudioKernelEvent) => {
      outputs.push(event);
    },
    ask: async (interaction: StudioKernelInteraction) => {
      interactions.push(interaction);
      return answer(interaction);
    },
  };
  const finish = (outcome = "succeeded") => {
    terminal.emit({ taskId: "native", inputId: turn.turnId, outcome });
    ready.emit({ taskId: "native", reason: "prompt_completed" });
  };
  const emit = (value: Record<string, unknown>) =>
    stream.emit({ taskId: "native", traceId: turn.turnId, inputId: turn.turnId, ...value });
  return {
    service,
    sink,
    outputs,
    interactions,
    calls,
    submitted,
    terminal,
    ready,
    errors,
    stream,
    finish,
    emit,
    setAnswer: (value: typeof answer) => {
      answer = value;
    },
  };
}

test("ACK and terminal alone cannot finish; ordered stream drains only after ready", async () => {
  const f = fixture();
  let completed = false;
  const pending = createBuiltinStudioKernel(f.service)
    .run(turn, f.sink, new AbortController().signal)
    .then((result) => {
      completed = true;
      return result;
    });
  await f.submitted;
  await setImmediate();
  assert.equal(completed, false);
  f.emit({ type: "agent_message_chunk", content: "Hello " });
  f.emit({ type: "agent_message_chunk", content: "world" });
  f.emit({ type: "agent_message_chunk", inputId: "old-input", content: "stale" });
  f.terminal.emit({ taskId: "native", inputId: turn.turnId, outcome: "succeeded" });
  await setImmediate();
  assert.equal(completed, false);
  f.ready.emit({ taskId: "native", reason: "prompt_completed" });
  assert.deepEqual(await pending, {
    status: "succeeded",
    text: "Hello world",
    nativeSessionId: "native",
    error: undefined,
    resultKnown: true,
    retryable: false,
  });
  assert.equal(
    f.stream.listeners.size +
      f.terminal.listeners.size +
      f.ready.listeners.size +
      f.errors.listeners.size,
    0,
  );
  assert.equal(f.outputs.filter((event) => event.type === "text").length, 2);
});

test("ready arriving before terminal still requires the matching turn's terminal", async () => {
  const f = fixture();
  let completed = false;
  const pending = createBuiltinStudioKernel(f.service)
    .run(turn, f.sink, new AbortController().signal)
    .then((result) => {
      completed = true;
      return result;
    });
  await f.submitted;
  f.ready.emit({ taskId: "native", reason: "prompt_completed" });
  f.terminal.emit({ taskId: "native", inputId: "old-input", outcome: "succeeded" });
  await setImmediate();
  assert.equal(completed, false);
  f.terminal.emit({
    taskId: "native",
    inputId: turn.turnId,
    outcome: "failed",
    error: "model error",
  });
  assert.equal((await pending).error, "model error");
});

test("resume reuses native session and explicitly downgrades yolo to ask mode", async () => {
  const f = fixture();
  const pending = createBuiltinStudioKernel(f.service).run(
    { ...turn, nativeSessionId: "native", model: "provider/model" },
    f.sink,
    new AbortController().signal,
  );
  await f.submitted;
  f.finish();
  await pending;
  assert.equal(
    f.calls.some(([name]) => name === "create"),
    false,
  );
  assert.deepEqual(f.calls.find(([name]) => name === "resume")?.[1], {
    taskId: "native",
    workspacePath: turn.workspacePath,
    model: "provider/model",
  });
  assert.deepEqual(f.calls.find(([name]) => name === "mode")?.[1], {
    taskId: "native",
    mode: "build",
  });
});

test("approval never maps session authorization to persistent project authorization", async () => {
  const f = fixture();
  f.setAnswer(async () => ({ decision: "allow-session" }));
  const pending = createBuiltinStudioKernel(f.service).run(
    turn,
    f.sink,
    new AbortController().signal,
  );
  await f.submitted;
  f.emit({
    type: "permission_request",
    requestId: "approval",
    title: "Write",
    description: "Write source",
    options: [
      { kind: "allow_once", optionId: "once", response: { decision: "allow" } },
      {
        kind: "allow_always",
        optionId: "project",
        response: { decision: "allow", permissionUpdates: [] },
      },
      { kind: "deny", optionId: "deny", response: { decision: "deny" } },
    ],
  });
  const result = await pending;
  assert.equal(result.status, "failed");
  assert.deepEqual(f.interactions[0]?.choices, ["allow-once", "deny"]);
  assert.equal(
    f.calls.some(([name]) => name === "permission"),
    false,
  );
});

test("native questions preserve option values, multiple answers, and duplicate request id", async () => {
  const f = fixture();
  f.setAnswer(async () => ({ answers: { answer_0: ["Blue"], answer_1: ["A", "B"] } }));
  const pending = createBuiltinStudioKernel(f.service).run(
    turn,
    f.sink,
    new AbortController().signal,
  );
  await f.submitted;
  const event = {
    type: "elicitation_request",
    requestId: "q",
    message: "Choose",
    options: [],
    questions: [
      { question: "Color?", header: "Color", options: [{ label: "Blue", value: "blue-id" }] },
      {
        question: "Letters?",
        header: "Letters",
        multiSelect: true,
        options: [
          { label: "A", value: "a" },
          { label: "B", value: "b" },
        ],
      },
    ],
  };
  f.emit(event);
  f.emit(event);
  await setImmediate();
  f.finish();
  await pending;
  assert.equal(f.interactions.length, 1);
  assert.deepEqual(f.calls.find(([name]) => name === "question")?.[1].content, {
    answer_0: "blue-id",
    answer_1: ["a", "b"],
    answers: { "Color?": "blue-id", "Letters?": "a, b" },
  });
});

test("abort waits for stop terminal/ready and ignores a late approval answer", async () => {
  const f = fixture();
  let respond!: (answer: StudioKernelAnswer) => void;
  f.setAnswer(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const controller = new AbortController();
  const pending = createBuiltinStudioKernel(f.service).run(turn, f.sink, controller.signal);
  await f.submitted;
  f.emit({
    type: "permission_request",
    requestId: "p",
    description: "write",
    options: [{ kind: "allow_once", optionId: "once", response: { decision: "allow" } }],
  });
  controller.abort();
  assert.equal((await pending).status, "cancelled");
  respond({ decision: "allow-once" });
  await setImmediate();
  assert.equal(f.calls.filter(([name]) => name === "stop").length, 1);
  assert.equal(
    f.calls.some(([name]) => name === "permission"),
    false,
  );
});

test("unsupported read-only mode and pre-abort do not launch any task", async () => {
  const f = fixture();
  const adapter = createBuiltinStudioKernel(f.service);
  const result = await adapter.run(
    { ...turn, permission: "read-only" },
    f.sink,
    new AbortController().signal,
  );
  assert.equal(result.status, "failed");
  assert.equal(result.retryable, false);
  const controller = new AbortController();
  controller.abort();
  assert.equal((await adapter.run(turn, f.sink, controller.signal)).status, "cancelled");
  assert.equal(f.calls.length, 0);
});

test("native transport failure is unknown, with no retry or lingering listeners", async () => {
  const f = fixture();
  const pending = createBuiltinStudioKernel(f.service).run(
    turn,
    f.sink,
    new AbortController().signal,
  );
  await f.submitted;
  f.errors.emit({ taskId: "native", message: "transport lost", code: "CLOSED" });
  assert.equal((await pending).resultKnown, false);
  assert.equal(f.stream.listeners.size, 0);
});

test("two turns cannot concurrently mutate one native session", async () => {
  const f = fixture();
  const adapter = createBuiltinStudioKernel(f.service);
  const first = adapter.run(turn, f.sink, new AbortController().signal);
  await f.submitted;
  await assert.rejects(
    adapter.run(turn, f.sink, new AbortController().signal),
    /already has an active/,
  );
  f.finish();
  await first;
});
