// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  V4InteractionRegistry,
  type V4InteractionAutoResolution,
} from "../src/protocol-v4/interaction-registry.js";

test("cold registration accepts answers without starting countdown or notifications", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const registry = new V4InteractionRegistry({
    hiddenGraceMs: 5,
    autoResolutionMs: 10,
    now: () => 0,
  });
  const states: V4InteractionAutoResolution[] = [],
    answers: unknown[] = [];
  const handle = registry.prepare("fixture", (answer) => answers.push(answer), {
    sessionId: "session",
    kind: "askUserQuestion",
    onAutoResolutionUpdated: (state) => {
      states.push(state);
    },
  });
  t.mock.timers.tick(100);
  assert.equal(states.length, 0);
  assert.equal(answers.length, 0);
  assert.equal(registry.resolve("fixture", { freeText: "A" }), true);
  handle.activate();
  t.mock.timers.tick(100);
  assert.equal(states.length, 0);
  assert.equal(answers.length, 1);
});

test("activation is idempotent and starts timing only for the active queue head", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const registry = new V4InteractionRegistry({
    hiddenGraceMs: 5,
    autoResolutionMs: 10,
    now: () => 0,
  });
  const updates: string[] = [];
  const first = registry.prepare("first", () => {}, {
    sessionId: "session",
    kind: "askUserQuestion",
    onAutoResolutionUpdated: () => {
      updates.push("first");
    },
  });
  const second = registry.prepare("second", () => {}, {
    sessionId: "session",
    kind: "askUserQuestion",
    onAutoResolutionUpdated: () => {
      updates.push("second");
    },
  });
  second.activate();
  assert.deepEqual(updates, []);
  t.mock.timers.tick(100);
  assert.equal(
    registry.has("first"),
    true,
    "a later activation must not start the cold head timer",
  );
  first.activate();
  first.activate();
  assert.deepEqual(updates, ["first"]);
  first.dispose();
  assert.deepEqual(updates, ["first", "second"]);
  second.dispose();
  t.mock.timers.tick(100);
  assert.deepEqual(updates, ["first", "second"]);
});

test("restored expired answers remain silent until activation and preserve generation ownership", async () => {
  const registry = new V4InteractionRegistry({ now: () => 100 });
  const answers: string[] = [];
  const initialAutoResolution = {
    state: "visibleCountdown" as const,
    startedAt: 0,
    visibleAt: 1,
    deadlineAt: 2,
  };
  const first = registry.prepare("same", () => answers.push("old"), {
    sessionId: "session",
    kind: "askUserQuestion",
    initialAutoResolution,
  });
  await Promise.resolve();
  assert.equal(answers.length, 0);
  first.activate();
  first.dispose();
  const next = registry.prepare("same", () => answers.push("new"));
  await Promise.resolve();
  assert.equal(answers.length, 0);
  assert.equal(registry.has("same"), true);
  first.dispose();
  assert.equal(registry.has("same"), true);
  next.dispose();
});

test("turning auto-continue off while cold persists only after activation and cannot be undone for that request", async () => {
  const registry = new V4InteractionRegistry({ now: () => 100 });
  const states: V4InteractionAutoResolution[] = [];
  const handle = registry.prepare("fixture", () => {}, {
    sessionId: "session",
    kind: "askUserQuestion",
    initialAutoResolution: {
      state: "visibleCountdown",
      startedAt: 0,
      visibleAt: 1,
      deadlineAt: 200,
    },
    onAutoResolutionUpdated: (state) => {
      states.push(state);
    },
  });
  await registry.setAskUserQuestionAutoResolutionEnabled(false);
  await registry.setAskUserQuestionAutoResolutionEnabled(true);
  assert.equal(states.length, 0);
  handle.activate();
  assert.equal(states.length, 1);
  assert.equal(states[0].state, "snoozed");
  handle.dispose();
});

test("a user can snooze during publication without emitting an update before activation", async () => {
  const registry = new V4InteractionRegistry({ now: () => 10 });
  const states: V4InteractionAutoResolution[] = [];
  const handle = registry.prepare("fixture", () => {}, {
    sessionId: "session",
    kind: "askUserQuestion",
    initialAutoResolution: { state: "hiddenGrace", startedAt: 0, visibleAt: 50, deadlineAt: 100 },
    onAutoResolutionUpdated: (state) => {
      states.push(state);
    },
  });
  assert.equal(await registry.snoozeAutoResolution("fixture"), true);
  assert.equal(states.length, 0);
  handle.activate();
  assert.equal(states.length, 1);
  assert.equal(states[0].state, "snoozed");
  handle.dispose();
});

test("full access failure keeps the same prepared request available for a later committed retry", async () => {
  const registry = new V4InteractionRegistry();
  let attempts = 0,
    answers = 0;
  const handle = registry.prepare(
    "fixture",
    () => {
      answers++;
    },
    {
      sessionId: "session",
      kind: "other",
      fullAccess: async () => {
        if (++attempts === 1) throw new Error("fixture commit failure");
      },
    },
  );
  handle.activate();
  await assert.rejects(registry.resolveFullAccess("fixture", "session"), /fixture commit failure/);
  assert.equal(registry.has("fixture"), true);
  assert.equal(answers, 0);
  assert.equal(await registry.resolveFullAccess("fixture", "session"), true);
  assert.equal(answers, 1);
  assert.equal(registry.has("fixture"), false);
});

test("an activated restored follower resumes when it becomes queue head", async () => {
  const registry = new V4InteractionRegistry({ now: () => 100 });
  const first = registry.prepare("first", () => {}, { sessionId: "session", kind: "other" });
  let answers = 0;
  const next = registry.prepare(
    "next",
    () => {
      answers++;
    },
    {
      sessionId: "session",
      kind: "askUserQuestion",
      initialAutoResolution: {
        state: "visibleCountdown",
        startedAt: 0,
        visibleAt: 1,
        deadlineAt: 2,
      },
    },
  );
  first.activate();
  next.activate();
  await Promise.resolve();
  assert.equal(answers, 0);
  first.dispose();
  await Promise.resolve();
  assert.equal(answers, 1);
  assert.equal(registry.has("next"), false);
  next.dispose();
});
test("snooze and global off cancel a queued expired recovery answer", async () => {
  for (const globalOff of [false, true]) {
    const registry = new V4InteractionRegistry({ now: () => 100 });
    const answers: unknown[] = [];
    const handle = registry.prepare(
      "fixture",
      (answer) => {
        answers.push(answer);
      },
      {
        sessionId: "session",
        kind: "askUserQuestion",
        initialAutoResolution: {
          state: "visibleCountdown",
          startedAt: 0,
          visibleAt: 1,
          deadlineAt: 2,
        },
      },
    );
    handle.activate();
    if (globalOff) await registry.setAskUserQuestionAutoResolutionEnabled(false);
    else await registry.snoozeAutoResolution("fixture");
    await Promise.resolve();
    assert.equal(answers.length, 0);
    assert.equal(registry.has("fixture"), true);
    handle.dispose();
  }
});

test("replacing an ID with a different session releases the old queue head", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const registry = new V4InteractionRegistry({
    hiddenGraceMs: 5,
    autoResolutionMs: 10,
    now: () => 0,
  });
  registry.prepare("same", () => {}, { sessionId: "old-session", kind: "other" });
  let starts = 0;
  const follower = registry.prepare("next", () => {}, {
    sessionId: "old-session",
    kind: "askUserQuestion",
    onAutoResolutionUpdated: () => {
      starts++;
    },
  });
  follower.activate();
  const replacement = registry.prepare("same", () => {}, {
    sessionId: "new-session",
    kind: "other",
  });
  try {
    assert.equal(starts, 1);
  } finally {
    replacement.dispose();
    follower.dispose();
  }
});
