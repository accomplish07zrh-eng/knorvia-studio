import assert from "node:assert/strict";
import test from "node:test";
import type {
  IStudioRuntimeService,
  StudioCommand,
  StudioOverview,
  StudioTimeline,
} from "@knorvia/services";
import { StudioClient } from "../src/studio/runtime/studioClient.js";
import {
  studioApprovalChoices,
  studioInteractionAnswers,
} from "../src/studio/runtime/studioInteractionAnswers.js";

const overview = (revision = 1): StudioOverview => ({
  revision,
  configs: {} as StudioOverview["configs"],
  conversations: [],
  groups: [],
  workflows: [],
  runs: [],
});
const page = (revision = 1, nextBefore?: number): StudioTimeline => ({
  revision,
  nextBefore,
  messages: [],
  interactions: [],
  runs: [],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function service(patch: Partial<IStudioRuntimeService> = {}): IStudioRuntimeService {
  return {
    overview: async () => overview(),
    timeline: async () => page(),
    onDidChange: () => ({ dispose() {} }),
    ...patch,
  } as IStudioRuntimeService;
}

test("one failed timeline does not freeze other chats or the overview; retry clears only its error", async () => {
  let fail = true;
  const client = new StudioClient(
    service({
      timeline: async (id) => {
        if (id === "bad" && fail) throw new Error("offline target");
        return page(2);
      },
    }),
  );
  client.watch("good");
  client.watch("bad");
  await client.refresh();
  assert.equal(client.snapshot.overview?.revision, 1);
  assert.equal(client.snapshot.timelines.get("good")?.revision, 2);
  assert.equal(client.snapshot.error, undefined);
  assert.equal(client.snapshot.timelineErrors.get("bad"), "offline target");
  fail = false;
  await client.refresh();
  assert.equal(client.snapshot.timelineErrors.size, 0);
});

test("a cached overview cannot admit work before the newly opened target's state is known", async () => {
  const reply = deferred<StudioTimeline>();
  let fail = false;
  const client = new StudioClient(
    service({
      timeline: () => {
        if (fail) return Promise.reject(new Error("timeline offline"));
        return reply.promise;
      },
    }),
  );
  await client.refresh();
  assert.equal(client.isReady(), true);
  client.watch("new-group");
  assert.equal(client.isReady("new-group"), false);
  const loading = client.refresh();
  assert.equal(client.isReady("new-group"), false);
  reply.resolve(page());
  await loading;
  assert.equal(client.isReady("new-group"), true);
  fail = true;
  await client.refresh();
  assert.equal(client.isReady("new-group"), false);
  assert.equal(client.isReady(), true);
});

test("overview failure still permits timeline updates and cannot be hidden by loading history", async () => {
  const client = new StudioClient(
    service({
      overview: async () => {
        throw new Error("overview failed");
      },
      timeline: async (_id, before) => page(2, before ? undefined : 10),
    }),
  );
  client.watch("chat");
  await client.refresh();
  await client.loadOlder("chat");
  assert.equal(client.snapshot.timelines.get("chat")?.revision, 2);
  assert.equal(client.snapshot.error, "overview failed");
});

test("history paging coalesces rapid requests and keeps the same cursor", async () => {
  const reply = deferred<StudioTimeline>();
  const cursors: Array<number | undefined> = [];
  const client = new StudioClient(
    service({
      timeline: async (_id, before) => {
        cursors.push(before);
        return before ? reply.promise : page(1, 20);
      },
    }),
  );
  client.watch("chat");
  await client.refresh();
  const first = client.loadOlder("chat");
  const duplicate = client.loadOlder("chat");
  assert.equal(first, duplicate);
  assert.deepEqual(cursors, [undefined, 20]);
  reply.resolve(page(1));
  await first;
  assert.equal(client.snapshot.timelines.get("chat")?.nextBefore, undefined);
});

test("cache bounds inactive histories while retaining every actively watched target", async () => {
  const client = new StudioClient(service());
  const pinned = Array.from({ length: 15 }, (_, i) => client.watch(`pinned-${i}`));
  await client.refresh();
  for (let i = 0; i < 30; i++) {
    const unwatch = client.watch(`visited-${i}`);
    await client.refresh();
    unwatch();
  }
  assert.equal(client.snapshot.timelines.size, 27);
  assert.ok(client.snapshot.timelines.has("pinned-0"));
  assert.ok(!client.snapshot.timelines.has("visited-0"));
  assert.ok(client.snapshot.timelines.has("visited-29"));
  for (const unwatch of pinned) unwatch();
  assert.equal(client.snapshot.timelines.size, 12);
});

test("late history page cannot bring an evicted target back into cache", async () => {
  const reply = deferred<StudioTimeline>();
  const client = new StudioClient(
    service({
      timeline: async (id, before) =>
        before ? reply.promise : page(1, id === "old" ? 20 : undefined),
    }),
  );
  const unwatch = client.watch("old");
  await client.refresh();
  const pending = client.loadOlder("old");
  unwatch();
  for (let i = 0; i < 13; i++) {
    const off = client.watch(`new-${i}`);
    await client.refresh();
    off();
  }
  assert.equal(client.snapshot.timelines.has("old"), false);
  reply.resolve(page(10));
  await pending;
  assert.equal(client.snapshot.timelines.has("old"), false);
});

test("refresh finishing after last unsubscribe cannot restart background polling", async () => {
  const reply = deferred<StudioOverview>();
  let calls = 0;
  let disposed = 0;
  const client = new StudioClient(
    service({
      overview: () => {
        calls++;
        return reply.promise;
      },
      onDidChange: () => ({
        dispose() {
          disposed++;
        },
      }),
    }),
  );
  const off = client.subscribe(() => {});
  const request = client.refresh();
  void client.refresh();
  off();
  reply.resolve(overview());
  await request;
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(calls, 1);
  assert.equal(disposed, 1);
});

test("uncertain command retry reuses the receipt ID and concurrent clicks send once", async () => {
  const commands: StudioCommand[] = [];
  let fail = true;
  const reply = deferred<{ id: string; revision: number }>();
  const client = new StudioClient(
    service({
      command: async (command) => {
        commands.push(command);
        if (fail) throw new Error("lost acknowledgement");
        return reply.promise;
      },
    }),
  );
  const input = { type: "cancel", runId: "run" } as const;
  await assert.rejects(client.execute(input));
  fail = false;
  const first = client.execute(input);
  const second = client.execute(input);
  assert.equal(commands.length, 2);
  assert.equal(commands[0]?.commandId, commands[1]?.commandId);
  reply.resolve({ id: "run", revision: 2 });
  await Promise.all([first, second]);
});

test("custom multi-select answers preserve selected options without splitting commas", () => {
  const questions = [{ id: "q", title: "Pick", options: ["red", "blue"], multiple: true }];
  assert.deepEqual(
    studioInteractionAnswers(questions, { q: ["red", "blue", "forged"] }, { q: "  green, cyan  " }),
    { q: ["red", "blue", "green, cyan"] },
  );
  assert.deepEqual(studioInteractionAnswers(questions, { q: ["red"] }, { q: "red" }), {
    q: ["red"],
  });
  assert.deepEqual(
    studioInteractionAnswers(
      [{ ...questions[0]!, multiple: false }],
      { q: ["red"] },
      { q: "cyan" },
    ),
    { q: ["cyan"] },
  );
});

test("approval buttons expose only native scopes; omission retains the legacy one-shot contract", () => {
  assert.deepEqual(studioApprovalChoices({ choices: ["allow-session", "deny"] }), [
    "allow-session",
    "deny",
  ]);
  assert.deepEqual(studioApprovalChoices({ choices: [] }), []);
  assert.deepEqual(studioApprovalChoices({}), ["allow-once", "deny"]);
});
