import assert from "node:assert/strict";
import { messageAppendCases } from "./runtime-task-registry-message-append-fixture.js";
import {
  TASK_ID,
  task,
  message,
  install,
  type MessageCase,
} from "./runtime-task-registry-message-common.js";

export const messageDrainCases: MessageCase[] = [
  {
    name: "drain returns the third read, copies the fourth and preserves reentrant id commit",
    async observe(create) {
      const owner = create();
      const effects: string[] = [];
      const arrays = [1, 2, 3, 4].map((index) => [message(`read-${index}`)]);
      let reads = 0;
      let cleanups = 0;
      const snapshot = Object.defineProperties(task(), {
        before: {
          enumerable: true,
          get() {
            effects.push("copy-before");
            return "before";
          },
        },
        pendingMessages: {
          enumerable: true,
          get() {
            effects.push(`messages:${++reads}`);
            if (reads === 3) owner.register(task({ description: "reentrant replacement" }));
            return arrays[reads - 1];
          },
        },
        after: {
          enumerable: true,
          get() {
            effects.push("copy-after");
            return "after";
          },
        },
      });
      install(owner, snapshot);
      const waiting = owner.waitForTerminal(TASK_ID, {
        signal: {
          aborted: false,
          addEventListener() {},
          removeEventListener() {
            cleanups++;
          },
        } as unknown as AbortSignal,
      });
      assert.equal(owner.drainMessages(TASK_ID), arrays[2]);
      assert.deepEqual(effects, [
        "messages:1",
        "messages:2",
        "messages:3",
        "copy-before",
        "messages:4",
        "copy-after",
      ]);
      assert.equal(owner.get(TASK_ID)?.description, snapshot.description);
      assert.deepEqual(owner.get(TASK_ID)?.pendingMessages, []);
      assert.equal(cleanups, 0, "drain must not publish terminal observations");
      owner.remove(TASK_ID);
      assert.equal(await waiting, undefined);
      assert.equal(cleanups, 1);
      return {
        effects,
        thirdReadIdentity: true,
        outerCommit: true,
        noDrainPublication: true,
        cleanups,
      };
    },
  },
  {
    name: "drain fourth-read failure keeps reentrant effects and never uses public update",
    observe(create) {
      const owner = create();
      const effects: string[] = [];
      const failure = new Error("owned fourth-read failure");
      const original = [message("original")];
      let reads = 0;
      const snapshot = Object.defineProperty(task(), "pendingMessages", {
        enumerable: true,
        get() {
          effects.push(`messages:${++reads}`);
          if (reads === 4) {
            owner.register(task({ description: "retained drain reentry" }));
            throw failure;
          }
          return original;
        },
      });
      install(owner, snapshot);
      owner.update = () => assert.fail("drain used public update");
      assert.throws(
        () => owner.drainMessages(TASK_ID),
        (error) => error === failure,
      );
      assert.deepEqual(effects, ["messages:1", "messages:2", "messages:3", "messages:4"]);
      assert.equal(owner.get(TASK_ID)?.description, "retained drain reentry");
      return { effects, originalError: true, reentryRetained: true, noOuterCommit: true };
    },
  },
  {
    name: "missing and empty drains allocate fresh arrays without copying or committing",
    observe(create) {
      const owner = create();
      const first = owner.drainMessages(TASK_ID);
      assert.deepEqual(first, []);
      assert.notEqual(owner.drainMessages(TASK_ID), first);
      for (const pendingMessages of [undefined, []]) {
        let reads = 0;
        const snapshot = Object.defineProperties(task(), {
          pendingMessages: {
            get() {
              reads++;
              return pendingMessages;
            },
          },
          neverCopy: {
            enumerable: true,
            get() {
              return assert.fail("empty drain copied fields");
            },
          },
        });
        install(owner, snapshot);
        const empty = owner.drainMessages(TASK_ID);
        assert.deepEqual(empty, []);
        assert.notEqual(owner.drainMessages(TASK_ID), empty);
        assert.equal(owner.get(TASK_ID), snapshot);
        assert.equal(reads, pendingMessages ? 4 : 2);
      }
      return { freshEmptyArrays: true, originalSnapshots: true, noCopy: true };
    },
  },
];

export const messageBufferCases = [...messageAppendCases, ...messageDrainCases];
