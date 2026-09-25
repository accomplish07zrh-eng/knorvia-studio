import assert from "node:assert/strict";
import { test } from "node:test";
import type { StudioRun, StudioWorkspaceChange } from "@knorvia/services";
import {
  STUDIO_BATCH_APPLY,
  StudioRunHistoryActions,
  studioReviewApplying,
} from "../src/studio/runtime/studioRunHistoryActions.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const run: StudioRun = {
  id: "run",
  targetId: "target",
  kind: "group",
  state: "succeeded",
  input: "",
  createdAt: 1,
  updatedAt: 1,
  attempt: 1,
  checkpoint: { steps: {}, values: {}, completedRounds: 0 },
};
const changed = (path: string): StudioWorkspaceChange[] => [
  { path, kind: "modified", before: "before", after: "after" },
];
function fixture() {
  const actions = new StudioRunHistoryActions();
  const unsubscribe = actions.subscribe(() => {});
  return { actions, unsubscribe };
}

test("synchronous double activation is ignored while independent run controls stay available", async () => {
  const { actions, unsubscribe } = fixture();
  const gate = deferred<void>();
  let retries = 0;
  let stops = 0;
  const first = actions.action("retry:first:1", async () => {
    retries++;
    await gate.promise;
  });
  await actions.action("retry:first:1", async () => {
    retries++;
  });
  await actions.action(
    "stop:other:1",
    async () => {
      stops++;
    },
    true,
  );
  assert.equal(retries, 1);
  assert.equal(stops, 1);
  assert.equal(actions.getSnapshot().busy.has("stop:other:1"), true);
  gate.resolve();
  await first;
  unsubscribe();
});

test("leaving target or service invalidates pending confirmations and late UI errors", async () => {
  const { actions, unsubscribe } = fixture();
  const answer = deferred<void>();
  let submitted = 0;
  const retry = actions.action("retry:run:1", async (current) => {
    await answer.promise;
    if (current()) submitted++;
    throw new Error("old error");
  });
  unsubscribe();
  const nextSubscribe = actions.subscribe(() => {});
  answer.resolve();
  await retry;
  assert.equal(submitted, 0);
  assert.equal(actions.getSnapshot().error, "");
  assert.equal(actions.getSnapshot().busy.size, 0);
  nextSubscribe();
});

test("closing a loading review and reopening another excludes the first late read", async () => {
  const { actions, unsubscribe } = fixture();
  const read = deferred<StudioWorkspaceChange[]>();
  const old = actions.openReview(run, "old", () => read.promise);
  assert.equal(actions.getSnapshot().review?.loading, true);
  actions.closeReview();
  await actions.openReview(run, "new", async () => changed("new.txt"));
  read.resolve(changed("old.txt"));
  await old;
  assert.equal(actions.getSnapshot().review?.stepId, "new");
  assert.equal(actions.getSnapshot().review?.changes?.[0]?.path, "new.txt");
  unsubscribe();
});

test("accepted application finishes after closing without fetching or reopening its old review", async () => {
  const { actions, unsubscribe } = fixture();
  await actions.openReview(run, "old", async () => changed("old.txt"));
  const applied = deferred<void>();
  let completed = false;
  let readAgain = 0;
  const operation = actions.applyReview(
    "old.txt",
    async () => {
      await applied.promise;
      completed = true;
    },
    async () => {
      readAgain++;
      return [];
    },
  );
  actions.closeReview();
  await actions.openReview(run, "new", async () => changed("new.txt"));
  applied.resolve();
  await operation;
  assert.equal(completed, true);
  assert.equal(readAgain, 0);
  assert.equal(actions.getSnapshot().review?.stepId, "new");
  unsubscribe();
});

test("apply errors stay inside the review, can be retried, and never block stopping another run", async () => {
  const { actions, unsubscribe } = fixture();
  await actions.openReview(run, "step", async () => changed("file.txt"));
  const apply = deferred<void>();
  let submissions = 0;
  let stops = 0;
  const operation = actions.applyReview(
    "file.txt",
    async () => {
      submissions++;
      await apply.promise;
    },
    async () => [],
  );
  await actions.applyReview(
    "file.txt",
    async () => {
      submissions++;
    },
    async () => [],
  );
  await actions.action(
    "stop:other:1",
    async () => {
      stops++;
    },
    true,
  );
  apply.reject(new Error("Conflict: user edit retained"));
  await operation;
  assert.equal(submissions, 1);
  assert.equal(stops, 1);
  assert.match(actions.getSnapshot().review?.error ?? "", /Conflict/);
  assert.equal(actions.getSnapshot().error, "");
  assert.equal(actions.getSnapshot().review?.applying, undefined);
  await actions.reloadReview(async () => changed("file.txt"));
  assert.equal(actions.getSnapshot().review?.error, "");
  await actions.applyReview(
    "file.txt",
    async () => {
      submissions++;
    },
    async () => [],
  );
  assert.equal(submissions, 2);
  unsubscribe();
});

test("acknowledged stop remains disabled until a later attempt and load failures remain retryable", async () => {
  const { actions, unsubscribe } = fixture();
  let stops = 0;
  await actions.action(
    "stop:run:1",
    async () => {
      stops++;
    },
    true,
  );
  await actions.action(
    "stop:run:1",
    async () => {
      stops++;
    },
    true,
  );
  assert.equal(stops, 1);
  actions.observeRuns([{ ...run, attempt: 2 }]);
  assert.equal(actions.getSnapshot().busy.size, 0);
  await actions.action(
    "stop:run:2",
    async () => {
      stops++;
    },
    true,
  );
  assert.equal(stops, 2);
  await actions.openReview(run, "step", async () => {
    throw new Error("Read failed");
  });
  assert.equal(actions.getSnapshot().review?.error, "Read failed");
  assert.equal(actions.getSnapshot().review?.loading, false);
  await actions.reloadReview(async () => changed("readable.txt"));
  assert.equal(actions.getSnapshot().review?.changes?.[0]?.path, "readable.txt");
  assert.equal(actions.getSnapshot().review?.error, "");
  unsubscribe();
});

test("closing during post-apply reload excludes its late result and reload failure does not imply apply failure", async () => {
  const { actions, unsubscribe } = fixture();
  await actions.openReview(run, "step", async () => changed("file.txt"));
  const refresh = deferred<StudioWorkspaceChange[]>();
  const started = deferred<void>();
  const operation = actions.applyReview(
    "file.txt",
    async () => {},
    () => {
      started.resolve();
      return refresh.promise;
    },
  );
  await started.promise;
  actions.closeReview();
  refresh.resolve(changed("late.txt"));
  await operation;
  assert.equal(actions.getSnapshot().review, null);
  await actions.openReview(run, "step", async () => changed("file.txt"));
  await actions.applyReview(
    "file.txt",
    async () => {},
    async () => {
      throw new Error("reload unavailable");
    },
  );
  assert.equal(actions.getSnapshot().review?.readAfterApplyFailed, true);
  assert.equal(actions.getSnapshot().review?.error, "reload unavailable");
  await actions.reloadReview(async () => []);
  assert.equal(actions.getSnapshot().review?.readAfterApplyFailed, false);
  unsubscribe();
});

const conflicted = (path: string): StudioWorkspaceChange => ({
  ...changed(path)[0]!,
  conflict: true,
});

test("multi-select submits exactly one paths[] and ignores conflicted cards", async () => {
  const { actions, unsubscribe } = fixture();
  await actions.openReview(run, "step", async () => [
    ...changed("a.txt"),
    ...changed("b.txt"),
    conflicted("c.txt"),
  ]);
  assert.deepEqual(actions.getSnapshot().review?.selected, []);
  actions.toggleReviewSelection("a.txt");
  actions.toggleReviewSelection("b.txt");
  // 冲突文件不能进入选择集。
  actions.toggleReviewSelection("c.txt");
  assert.deepEqual(actions.getSnapshot().review?.selected, ["a.txt", "b.txt"]);
  // 全选同样只收敛到可应用路径。
  actions.setReviewSelection(["a.txt", "b.txt", "c.txt", "missing.txt"]);
  assert.deepEqual(actions.getSnapshot().review?.selected, ["a.txt", "b.txt"]);
  const submissions: string[][] = [];
  await actions.applyReviewSelection(
    async (paths) => {
      submissions.push(paths);
    },
    async () => [],
  );
  assert.deepEqual(submissions, [["a.txt", "b.txt"]]);
  // 应用后重新读取：已经不在待应用集合里的路径会被移出选择集。
  assert.deepEqual(actions.getSnapshot().review?.selected, []);
  assert.equal(actions.getSnapshot().review?.applying, undefined);
  unsubscribe();
});

test("a reload prunes selection to still-applicable paths", async () => {
  const { actions, unsubscribe } = fixture();
  await actions.openReview(run, "step", async () => [...changed("a.txt"), ...changed("b.txt")]);
  actions.setReviewSelection(["a.txt", "b.txt"]);
  await actions.reloadReview(async () => [conflicted("a.txt"), ...changed("b.txt")]);
  assert.deepEqual(actions.getSnapshot().review?.selected, ["b.txt"]);
  await actions.reloadReview(async () => [conflicted("b.txt"), ...changed("a.txt")]);
  assert.deepEqual(actions.getSnapshot().review?.selected, []);
  unsubscribe();
});

test("a batch apply marks every card busy and keeps the previous selection on failure", async () => {
  const { actions, unsubscribe } = fixture();
  await actions.openReview(run, "step", async () => [...changed("a.txt"), ...changed("b.txt")]);
  actions.toggleReviewSelection("a.txt");
  actions.toggleReviewSelection("b.txt");
  const apply = deferred<void>();
  const operation = actions.applyReviewSelection(
    async () => {
      await apply.promise;
    },
    async () => [],
  );
  const review = actions.getSnapshot().review!;
  assert.equal(review.applying, STUDIO_BATCH_APPLY);
  assert.equal(studioReviewApplying(review, "a.txt"), true);
  assert.equal(studioReviewApplying(review, "b.txt"), true);
  apply.reject(new Error("Conflict: user edit retained"));
  await operation;
  assert.match(actions.getSnapshot().review?.error ?? "", /Conflict/);
  assert.deepEqual(actions.getSnapshot().review?.selected, ["a.txt", "b.txt"]);
  unsubscribe();
});

test("single applies stay scoped to their own card", async () => {
  const { actions, unsubscribe } = fixture();
  await actions.openReview(run, "step", async () => [...changed("a.txt"), ...changed("b.txt")]);
  const apply = deferred<void>();
  const operation = actions.applyReview(
    "a.txt",
    async () => {
      await apply.promise;
    },
    async () => [],
  );
  const review = actions.getSnapshot().review!;
  assert.equal(studioReviewApplying(review, "a.txt"), true);
  assert.equal(studioReviewApplying(review, "b.txt"), false);
  apply.resolve();
  await operation;
  unsubscribe();
});

test("selection is cleared by closing, reopening and by leaving the target", async () => {
  const { actions, unsubscribe } = fixture();
  await actions.openReview(run, "step", async () => [...changed("a.txt"), ...changed("b.txt")]);
  actions.toggleReviewSelection("a.txt");
  assert.deepEqual(actions.getSnapshot().review?.selected, ["a.txt"]);
  actions.closeReview();
  assert.equal(actions.getSnapshot().review, null);
  await actions.openReview(run, "step", async () => [...changed("a.txt"), ...changed("b.txt")]);
  assert.deepEqual(actions.getSnapshot().review?.selected, []);
  actions.toggleReviewSelection("a.txt");
  unsubscribe();
  const nextSubscribe = actions.subscribe(() => {});
  assert.equal(actions.getSnapshot().review, null);
  await actions.openReview(run, "step", async () => [...changed("a.txt")]);
  assert.deepEqual(actions.getSnapshot().review?.selected, []);
  // 迟到的读取结果不会复活旧选择。
  const late = deferred<StudioWorkspaceChange[]>();
  const pending = actions.reloadReview(() => late.promise);
  actions.toggleReviewSelection("a.txt");
  late.resolve([...changed("a.txt"), ...changed("b.txt")]);
  await pending;
  assert.deepEqual(actions.getSnapshot().review?.selected, []);
  nextSubscribe();
});

test("an empty selection never submits a batch apply", async () => {
  const { actions, unsubscribe } = fixture();
  await actions.openReview(run, "step", async () => changed("a.txt"));
  let submissions = 0;
  await actions.applyReviewSelection(
    async () => {
      submissions++;
    },
    async () => [],
  );
  assert.equal(submissions, 0);
  assert.equal(actions.getSnapshot().review?.applying, undefined);
  unsubscribe();
});
