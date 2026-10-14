// SPDX-License-Identifier: Apache-2.0
// core-tool-01 contract tests, part 5: the shared fixtures under fixtures/ drive the
// documented behaviors end to end (B36 edit matching, B49/B50 read state selection,
// B64/B65 background polling). Fixture data is fictional and in-repo only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

import { findEditMatch } from "../../../../apps/cli/packages/core/src/tool/edit-matchers.js";
import {
  findEditableReadFileState,
  findLatestReadFileState,
} from "../../../../apps/cli/packages/core/src/tool/read-file-state.js";
import { BackgroundTaskTracker } from "../../../../apps/cli/packages/core/src/tool/executor/background-tasks.js";

const load = (name: string): Record<string, any> =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

const trace = { traceId: "trace-1", sessionId: "s1" } as never;
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("B36 fixture: edit match strategies follow the documented order", () => {
  const fixture = load("edit-match-cases.json");
  for (const entry of fixture.cases) {
    const result = findEditMatch({
      content: entry.content,
      search: entry.search,
      replaceAll: entry.replaceAll,
    }) as Record<string, any>;
    assert.equal(result.status, entry.status, entry.name);
    if (entry.status !== "matched") continue;
    assert.equal(result.strategy, entry.strategy, entry.name);
    assert.equal(result.candidateCount, entry.candidateCount, entry.name);
    assert.equal(result.actualString, entry.actualString, entry.name);
  }
});

test("B49/B50 fixture: read state selection picks the newest entry per path", () => {
  const fixture = load("read-file-state-entries.json");
  const states = new Map(
    fixture.entries.map((entry: Record<string, any>) => [
      entry.key,
      { path: entry.path, readAt: new Date(entry.readAtMs) },
    ]),
  ) as never;
  const latestNotes = findLatestReadFileState(states, "/workspace/notes.md") as never as {
    readAt: Date;
  };
  assert.equal(latestNotes.readAt.getTime(), fixture.expected.latestForNotesMs);
  const latestOther = findLatestReadFileState(states, "/workspace/other.md") as never as {
    readAt: Date;
  };
  assert.equal(latestOther.readAt.getTime(), fixture.expected.latestForOtherMs);
  assert.equal(findLatestReadFileState(states, "/workspace/missing.md"), undefined);
  assert.equal(
    findEditableReadFileState(states, "/workspace/notes.md"),
    findLatestReadFileState(states, "/workspace/notes.md"),
  );
});

test("B64/B65 fixture: snapshot sequence publishes running once per signature then one terminal", async () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const fixture = load("background-snapshots.json");
    const queue: Record<string, unknown>[] = [...fixture.sequence];
    const events: Record<string, any>[] = [];
    const deps = {
      sessionId: "s1",
      emitEvent: async (event: Record<string, any>) => void events.push(event),
      runtimeTaskRegistry: undefined,
      executionPort: {
        getBackgroundTask: async () =>
          queue.shift() ?? fixture.sequence[fixture.sequence.length - 1],
      },
    } as never;
    const tracker = new BackgroundTaskTracker(deps);
    await tracker.trackBackgroundTask(
      { id: "c1", name: "Bash", input: { command: "x" } } as never,
      { status: "backgrounded", backgroundTaskId: "t1" },
      trace,
      undefined,
    );
    await flush();
    // 立即 poll 一次，随后每 1 秒一次；样例里前两条签名相同，第三条变化，第四条是终态。
    for (let tick = 0; tick < 3; tick += 1) {
      mock.timers.tick(1000);
      await flush();
    }
    const types = events.map((event) => event.type);
    assert.equal(
      types.filter((type) => type === "background_task_updated").length,
      fixture.expected.runningUpdates,
    );
    assert.equal(
      types.filter((type) => type === "background_task_completed").length,
      fixture.expected.completedEvents,
    );
    const terminal = events.filter((event) => event.type === "background_task_completed").pop();
    assert.equal(terminal!.payload.status, fixture.expected.terminalStatus);
  } finally {
    mock.timers.reset();
  }
});
