// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  bundle,
  child,
  enriched,
  fixture,
  mid,
  other,
  parent,
  textPart,
  user,
  type Bundle,
  type Part,
} from "./session-store-facade.fixture.js";

function put(root: object, path: readonly (string | number)[], value: unknown) {
  let cursor = root as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]!;
    if (cursor[key] === undefined) cursor[key] = typeof path[i + 1] === "number" ? [] : {};
    cursor = cursor[key] as Record<string | number, unknown>;
  }
  cursor[path.at(-1)!] = value;
}
function syntheticPart(patch: Record<string, unknown>): Part {
  return { ...textPart(), ...patch } as unknown as Part;
}

test("new fork accepts exactly the three fork result subtypes and trims only new result locality", async (t) => {
  for (const result of [
    { type: "forkAssistant", sessionId: ` ${child} ` },
    { type: "createSelectionSideSession", sessionId: child },
    { type: "editUserQuery", disposition: "fork", sessionId: child },
  ]) {
    const f = await fixture(t);
    const input = bundle();
    input.commandFact.ack.result = result as Bundle["commandFact"]["ack"]["result"];
    assert.equal((await f.store.commitForkBundle(input)).id, child);
    assert.deepEqual(
      (
        f.data("session_entry", `v4_command_fact:child:${parent}:facade-command`).ack as {
          result: unknown;
        }
      ).result,
      result,
    );
  }
});

test("new result rejects missing/array/nonfork/nonstring/empty/foreign identities before message checks", async (t) => {
  const f = await fixture(t);
  const before = f.snapshot();
  for (const result of [
    undefined,
    null,
    [],
    {},
    { type: "other", sessionId: child },
    { type: "editUserQuery", disposition: "replace", sessionId: child },
    { type: "forkAssistant", sessionId: 1 },
    { type: "forkAssistant", sessionId: " " },
    { type: "forkAssistant", sessionId: other },
  ]) {
    const input = bundle();
    put(input, ["commandFact", "ack", "result"], result);
    input.messages[0]!.info.sessionID = other;
    await assert.rejects(f.store.commitForkBundle(input), {
      message: "Fork bundle command result is missing, invalid, or not child-local",
    });
    assert.deepEqual(f.snapshot(), before);
  }
});

test("message, assistant-parent, part-owner, goal and verifier-owner failures retain contract precedence", async (t) => {
  const f = await fixture(t);
  const valid = await enriched(f);
  const before = f.snapshot();
  const cases: [readonly (string | number)[], unknown, string][] = [
    [["messages", 0, "info", "sessionID"], other, "message session"],
    [["messages", 0, "parts", 0, "sessionID"], other, "part owner"],
    [["messages", 0, "parts", 0, "messageID"], "missing", "part owner"],
    [["goal", "source", "sessionID"], other, "goal session"],
    [["entries", 0, "sessionID"], other, "verifier entry session"],
  ];
  for (const [path, value, label] of cases) {
    const input = structuredClone(valid);
    put(input, path, value);
    await assert.rejects(f.store.commitForkBundle(input), {
      message: `Fork bundle ${label} is not child-local`,
    });
    assert.deepEqual(f.snapshot(), before);
  }
  const input = bundle();
  put(input, ["messages", 0, "info", "role"], "assistant");
  put(input, ["messages", 0, "info", "parentID"], 7);
  await assert.rejects(f.store.commitForkBundle(input), {
    message: "Fork bundle assistant parent is not child-local",
  });
  assert.deepEqual(f.snapshot(), before);
});

test("anchor ordered refs precede boundary refs and snapshot checks apply only to snapshot kind", async (t) => {
  const f = await fixture(t);
  const before = f.snapshot();
  for (const [key, value, label] of [
    ["orderedMessageIds", ["outside"], "orderedMessageId"],
    ["boundaryMessageId", "outside", "boundaryMessageId"],
  ] as const) {
    const input = bundle();
    put(input, ["messages", 0, "info", "anchor", key], value);
    await assert.rejects(f.store.commitForkBundle(input), {
      message: `Fork bundle anchor ${label} is not child-local: outside`,
    });
    assert.deepEqual(f.snapshot(), before);
  }
  const input = bundle();
  put(input, ["messages", 0, "info", "anchor", "goalBoundary"], {
    kind: "snapshot",
    target: { sessionID: other, targetID: "t" },
  });
  await assert.rejects(f.store.commitForkBundle(input), {
    message: "Fork bundle anchor goal session is not child-local",
  });
  put(input, ["messages", 0, "info", "anchor", "goalBoundary", "kind"], "none");
  await f.store.commitForkBundle(input);
});

test("timeline common anchor and context-compaction summary are the only message references checked", async (t) => {
  const f = await fixture(t);
  for (const [patch, label] of [
    [
      { type: "timeline", timelineType: "model_change", anchorMessageId: "outside" },
      "timeline anchorMessageId",
    ],
    [
      { type: "timeline", timelineType: "context_compaction", summaryMessageId: "outside" },
      "timeline summaryMessageId",
    ],
  ] as const) {
    const input = bundle();
    input.messages[0]!.parts = [syntheticPart(patch)];
    await assert.rejects(f.store.commitForkBundle(input), {
      message: `Fork bundle ${label} is not child-local: outside`,
    });
  }
  const accepted = bundle();
  accepted.messages[0]!.parts = [
    syntheticPart({
      type: "timeline",
      display: "worklog",
      timelineType: "model_change",
      summaryMessageId: "outside",
    }),
  ];
  await f.store.commitForkBundle(accepted);
});

test("compaction checks each defined string reference including arrays and preserved segment", async (t) => {
  const f = await fixture(t);
  const before = f.snapshot();
  const cases: [readonly (string | number)[], string][] = [
    [["tail_start_id"], "compaction tail_start_id"],
    [["summaryMessageId"], "compaction summaryMessageId"],
    [["compactBoundary", "lastSummarizedMessageId"], "compact lastSummarizedMessageId"],
    [["compactBoundary", "summaryMessageIds", 0], "compact summaryMessageId"],
    [["compactBoundary", "attachmentMessageIds", 0], "compact attachmentMessageId"],
    [["compactBoundary", "hookResultMessageIds", 0], "compact hookResultMessageId"],
    [["compactBoundary", "preservedSegment", "headMessageId"], "compact preserved head"],
    [["compactBoundary", "preservedSegment", "anchorMessageId"], "compact preserved anchor"],
    [["compactBoundary", "preservedSegment", "tailMessageId"], "compact preserved tail"],
  ];
  for (const [path, label] of cases) {
    const part = syntheticPart({ type: "compaction", auto: false });
    put(part, path, "outside");
    const input = bundle();
    input.messages[0]!.parts = [part];
    await assert.rejects(f.store.commitForkBundle(input), {
      message: `Fork bundle ${label} is not child-local: outside`,
    });
    assert.deepEqual(f.snapshot(), before);
  }
});

test("only completed tool attachments enforce child and current-message ownership", async (t) => {
  const f = await fixture(t);
  for (const ownership of [
    { sessionID: other, messageID: mid },
    { sessionID: child, messageID: "outside" },
  ]) {
    const input = bundle();
    input.messages[0]!.parts = [
      syntheticPart({
        type: "tool",
        callID: "call",
        tool: "fixture",
        state: {
          status: "completed",
          input: {},
          output: "",
          title: "",
          metadata: {},
          time: { start: 1, end: 2 },
          attachments: [
            { ...ownership, id: "attachment", type: "file", mime: "text/plain", url: "synthetic:" },
          ],
        },
      }),
    ];
    await assert.rejects(f.store.commitForkBundle(input), {
      message: "Fork bundle tool attachment owner is not child-local",
    });
  }
  const input = bundle();
  input.messages[0]!.parts = [
    syntheticPart({
      type: "tool",
      callID: "call",
      tool: "fixture",
      state: {
        status: "error",
        input: {},
        error: "synthetic",
        time: { start: 1, end: 2 },
        attachments: [{ sessionID: other, messageID: "outside" }],
      },
    }),
  ];
  await f.store.commitForkBundle(input);
});

test("verifier references use the complete goal and later-message target set", async (t) => {
  for (const source of ["goal", "anchor", "timeline"] as const) {
    const f = await fixture(t);
    const input = await enriched(f);
    const targetID = input.goal!.source.targetID;
    if (source !== "goal") {
      const target = input.goal!.source;
      delete input.goal;
      const laterMessage = "later-message" as typeof mid;
      input.messages.push({ info: user(laterMessage), parts: [] });
      if (source === "anchor")
        put(input, ["messages", 1, "info", "anchor", "goalBoundary"], {
          kind: "snapshot",
          target,
          verificationEntryIds: [],
        });
      else
        input.messages[1]!.parts = [
          syntheticPart({
            id: "later-timeline",
            messageID: laterMessage,
            type: "timeline",
            timelineType: "goal_verification",
            targetId: targetID,
            verificationId: "v",
            display: "worklog",
          }),
        ];
    }
    await f.store.commitForkBundle(input);
    assert.equal((await f.store.sessionEntries({ sessionID: child })).length, 1);
  }
});

test("verifier invalid assistant anchor precedes target membership and array payload is ignored", async (t) => {
  const f = await fixture(t);
  const input = await enriched(f);
  input.entries[0]!.data = {
    payload: { anchorAssistantMessageId: "outside", targetId: "outside" },
  };
  await assert.rejects(f.store.commitForkBundle(input), {
    message: "Fork bundle verifier assistant anchor is not child-local: outside",
  });
  input.entries[0]!.data = { payload: { targetId: "outside" } };
  await assert.rejects(f.store.commitForkBundle(input), {
    message: "Fork bundle verifier target is not child-local",
  });
  input.entries[0]!.data = { payload: [] };
  await f.store.commitForkBundle(input);
});

test("nonstring references, nullish optional collections and unknown metadata do not gain extra validation", async (t) => {
  const f = await fixture(t);
  const input = bundle();
  put(input, ["messages", 0, "info", "anchor"], {
    orderedMessageIds: [7, null],
    boundaryMessageId: false,
  });
  put(input, ["messages", 0, "info", "metadata"], {
    anchorAssistantMessageId: "outside",
    targetId: "outside",
  });
  input.messages[0]!.parts = [
    syntheticPart({
      type: "compaction",
      auto: false,
      tail_start_id: 7,
      summaryMessageId: null,
      compactBoundary: {
        summaryMessageIds: [3, false],
        attachmentMessageIds: null,
        hookResultMessageIds: undefined,
        preservedSegment: { headMessageId: false },
      },
    }),
  ];
  input.messages[0]!.parts.push(
    syntheticPart({
      id: "nullish-attachments",
      type: "tool",
      callID: "call",
      tool: "fixture",
      state: {
        status: "completed",
        input: {},
        output: "",
        title: "",
        metadata: {},
        time: { start: 1, end: 2 },
        attachments: null,
      },
    }),
  );
  input.messages.push({ info: user("nullish-anchor" as typeof mid), parts: [] });
  put(input, ["messages", 1, "info", "anchor"], { orderedMessageIds: null });
  await f.store.commitForkBundle(input);
  assert.ok(await f.store.getSession(child));
});
