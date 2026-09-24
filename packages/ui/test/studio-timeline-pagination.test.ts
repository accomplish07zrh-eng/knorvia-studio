import assert from "node:assert/strict";
import test from "node:test";
import type { StudioTimeline } from "@knorvia/services";
import { mergeStudioTimelinePage } from "../src/studio/runtime/studioTimelinePagination.js";

function page(
  from: number,
  to: number,
  revision = to,
  nextBefore: number | undefined = from > 1 ? from : undefined,
): StudioTimeline {
  return {
    revision,
    nextBefore,
    messages: Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => {
      const number = from + index;
      return {
        id: `m-${number}`,
        targetId: "chat",
        runId: "run",
        sender: "user",
        kind: "text",
        text: `message ${number}`,
        sequence: number,
        createdAt: number,
        updatedAt: number,
      };
    }),
    runs: [],
    interactions: [],
    turns: [],
  };
}

test("late history cannot regress a streaming message updated twice in the same millisecond", () => {
  const latest = page(2, 2, 20, 2);
  latest.messages[0]!.text = "full response";
  const stale = page(1, 2, 19);
  stale.messages[1]!.text = "full";
  const merged = mergeStudioTimelinePage(latest, stale, 2);
  assert.equal(merged.revision, 20);
  assert.equal(merged.messages.length, 2);
  assert.equal(merged.messages[1]!.text, "full response");
  const newer = page(2, 2, 21);
  newer.messages[0]!.text = "full response complete";
  assert.equal(mergeStudioTimelinePage(merged, newer).messages[1]!.text, "full response complete");
});

test("returning after more than a page of activity exposes and fills the missing history interval", () => {
  const initial = page(1, 10);
  const latest = page(111, 610);
  const visible = mergeStudioTimelinePage(initial, latest);
  assert.equal(visible.messages.length, 510);
  assert.equal(visible.nextBefore, 111);
  const complete = mergeStudioTimelinePage(visible, page(1, 110, 610), visible.nextBefore);
  assert.equal(complete.messages.length, 610);
  assert.equal(complete.nextBefore, undefined);
  assert.deepEqual(
    complete.messages.map((item) => item.id),
    page(1, 610).messages.map((item) => item.id),
  );
});

test("ordinary overlapping refresh keeps older paging progress and deduplicates message updates", () => {
  const old = page(1, 510, 510, undefined);
  const refreshed = page(21, 520);
  refreshed.messages[0] = { ...refreshed.messages[0]!, text: "updated response", updatedAt: 600 };
  const visible = mergeStudioTimelinePage(old, refreshed);
  assert.equal(visible.messages.length, 520);
  assert.equal(visible.nextBefore, undefined);
  assert.equal(visible.messages.find((item) => item.id === "m-21")?.text, "updated response");
  const reverse = mergeStudioTimelinePage(visible, page(1, 30, 520), 21);
  assert.equal(reverse.messages.find((item) => item.id === "m-21")?.text, "updated response");
});

test("late older-page response cannot move the cursor past a newer gap discovered by refresh", () => {
  const initial = page(501, 1000);
  const requestedBefore = initial.nextBefore;
  const refreshed = mergeStudioTimelinePage(initial, page(1601, 2100));
  assert.equal(refreshed.nextBefore, 1601);
  const late = mergeStudioTimelinePage(refreshed, page(1, 500, 1000), requestedBefore);
  assert.equal(late.nextBefore, 1601);
  assert.equal(late.revision, 2100);
  const middle = mergeStudioTimelinePage(late, page(1101, 1600, 2100), 1601);
  assert.equal(middle.nextBefore, 1101);
  const overlap = mergeStudioTimelinePage(middle, page(601, 1100, 2100), 1101);
  const older = mergeStudioTimelinePage(overlap, page(101, 600, 2100), 601);
  const complete = mergeStudioTimelinePage(older, page(1, 100, 2100), 101);
  assert.equal(complete.messages.length, 2100);
  assert.equal(complete.nextBefore, undefined);
});

test("duplicate paging replies cannot reopen an already exhausted cursor or regress runtime state", () => {
  const initial = page(101, 600);
  const firstReply = page(1, 100, 601);
  firstReply.runs = [
    {
      id: "r",
      targetId: "chat",
      kind: "chat",
      input: "",
      state: "succeeded",
      createdAt: 1,
      updatedAt: 601,
      attempt: 1,
      checkpoint: { steps: {}, values: {}, completedRounds: 0 },
    },
  ];
  const complete = mergeStudioTimelinePage(initial, firstReply, 101);
  const staleReply = page(1, 100, 600);
  staleReply.runs = [{ ...firstReply.runs[0]!, state: "running", updatedAt: 500 }];
  const replay = mergeStudioTimelinePage(complete, staleReply, 101);
  assert.equal(replay.nextBefore, undefined);
  assert.equal(replay.runs[0]?.state, "succeeded");
  assert.equal(replay.messages.length, 600);
});

test("multiple unwatched bursts stay recoverable even before the earlier gap has been loaded", () => {
  const old = page(1, 5);
  const firstGap = mergeStudioTimelinePage(old, page(506, 1005));
  const secondGap = mergeStudioTimelinePage(firstGap, page(1506, 2005));
  assert.equal(secondGap.nextBefore, 1506);
  const firstFill = mergeStudioTimelinePage(secondGap, page(1006, 1505), 1506);
  const secondFill = mergeStudioTimelinePage(firstFill, page(506, 1005), 1006);
  const thirdFill = mergeStudioTimelinePage(secondFill, page(6, 505), 506);
  const complete = mergeStudioTimelinePage(thirdFill, page(1, 5), 6);
  assert.equal(complete.messages.length, 2005);
  assert.equal(complete.nextBefore, undefined);
});

test("a complete latest snapshot clears stale paging controls", () => {
  const previous = page(20, 80);
  const latest = page(1, 90);
  assert.equal(mergeStudioTimelinePage(previous, latest).nextBefore, undefined);
});
