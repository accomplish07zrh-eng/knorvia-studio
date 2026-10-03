import assert from "node:assert/strict";
import type { RuntimeTaskRegistry, RuntimeTaskSnapshot } from "../src/runtime-task/registry.js";
import {
  TASK_ID,
  task,
  message,
  install,
  type MessageCase,
} from "./runtime-task-registry-message-common.js";

export const messageAppendCases: MessageCase[] = [
  {
    name: "message projection stays lazy behind the public update receiver",
    observe(create) {
      const owner = create();
      const effects: string[] = [];
      const supplied = new Proxy(message("opaque"), {
        get() {
          return assert.fail("queue read opaque message fields");
        },
      });
      const returned = task();
      let captured: ((snapshot: RuntimeTaskSnapshot) => RuntimeTaskSnapshot) | undefined;
      Object.defineProperty(owner, "update", {
        get() {
          effects.push("update-get");
          return function (this: RuntimeTaskRegistry, id: string, patcher: typeof captured) {
            assert.equal(this, owner);
            assert.equal(id, TASK_ID);
            captured = patcher;
            effects.push("update-call");
            return returned;
          };
        },
      });
      assert.equal(owner.queueMessage(TASK_ID, supplied), returned);
      assert.deepEqual(effects, ["update-get", "update-call"]);
      const projected = captured!(task());
      assert.equal(projected.pendingMessages?.[0], supplied);
      assert.equal(owner.get(TASK_ID), undefined);
      return { effects, returnedIdentity: true, untouchedStorage: true, opaqueMessage: true };
    },
  },
  {
    name: "append preserves enumerable fields, symbols, key order and iterable reads",
    observe(create) {
      const owner = create();
      const effects: string[] = [];
      const marker = Symbol("owned metadata");
      const metadata = { owned: true };
      const first = message("first");
      const second = message("second");
      const appended = message("appended");
      const prior = [first, second];
      Object.defineProperty(prior, Symbol.iterator, {
        get() {
          effects.push("iterator-get");
          return function (this: typeof prior) {
            assert.equal(this, prior);
            effects.push("iterator-call");
            let index = 0;
            return {
              next() {
                effects.push(`next:${index}`);
                return index < prior.length
                  ? { done: false, value: prior[index++] }
                  : { done: true, value: undefined };
              },
            };
          };
        },
      });
      let reads = 0;
      const snapshot = Object.defineProperties(task(), {
        before: {
          enumerable: true,
          get() {
            effects.push("before");
            return metadata;
          },
        },
        pendingMessages: {
          enumerable: true,
          get() {
            effects.push(`messages:${++reads}`);
            return reads === 1 ? [] : prior;
          },
        },
        after: {
          enumerable: true,
          get() {
            effects.push("after");
            return metadata;
          },
        },
        hidden: {
          get() {
            return assert.fail("non-enumerable getter was read");
          },
        },
        [marker]: {
          enumerable: true,
          get() {
            effects.push("symbol");
            return metadata;
          },
        },
      });
      // __proto__ 要作为自有元数据保留，不能被复制为目标对象的原型。
      Object.defineProperty(snapshot, "__proto__", { value: metadata, enumerable: true });
      install(owner, snapshot);
      const projected = owner.queueMessage(TASK_ID, appended)!;
      assert.deepEqual(effects, [
        "before",
        "messages:1",
        "after",
        "symbol",
        "messages:2",
        "iterator-get",
        "iterator-call",
        "next:0",
        "next:1",
        "next:2",
      ]);
      assert.deepEqual(projected.pendingMessages, [first, second, appended]);
      assert.notEqual(projected.pendingMessages, prior);
      assert.equal(projected.startedAt, snapshot.startedAt);
      assert.equal(Reflect.get(projected, marker), metadata);
      assert.equal(Object.getPrototypeOf(projected), Object.prototype);
      assert.equal(Reflect.get(projected, "__proto__"), metadata);
      assert.deepEqual(
        Reflect.ownKeys(projected),
        Reflect.ownKeys(snapshot).filter((key) => key !== "hidden"),
      );
      assert.deepEqual(Object.getOwnPropertyDescriptor(projected, "pendingMessages"), {
        value: projected.pendingMessages,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return {
        effects,
        originalReferences: true,
        ordinaryPrototype: true,
        ownProtoKey: true,
        keyOrder: true,
      };
    },
  },
  {
    name: "append creates an own message field despite a getter installing a prototype setter",
    observe(create) {
      const owner = create();
      const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, "pendingMessages");
      let setterCalls = 0;
      let reads = 0;
      const original = message("original");
      const appended = message("appended");
      const snapshot = Object.defineProperty(task(), "pendingMessages", {
        get() {
          reads++;
          Object.defineProperty(Object.prototype, "pendingMessages", {
            configurable: true,
            set() {
              setterCalls++;
            },
          });
          return [original];
        },
      });
      try {
        install(owner, snapshot);
        const projected = owner.queueMessage(TASK_ID, appended)!;
        assert.equal(reads, 1);
        assert.equal(setterCalls, 0);
        assert.equal(Object.hasOwn(projected, "pendingMessages"), true);
        assert.deepEqual(projected.pendingMessages, [original, appended]);
        return { reads, setterCalls, ownMessageField: true, originalReferences: true };
      } finally {
        if (descriptor) Object.defineProperty(Object.prototype, "pendingMessages", descriptor);
        else Reflect.deleteProperty(Object.prototype, "pendingMessages");
      }
    },
  },
  {
    name: "append copy failure retains getter reentry without an outer commit",
    observe(create) {
      const owner = create();
      const failure = new Error("owned copy failure");
      const effects: string[] = [];
      const snapshot = Object.defineProperties(task(), {
        before: {
          enumerable: true,
          get() {
            effects.push("copy-reentry");
            owner.register(task({ description: "retained reentry" }));
            throw failure;
          },
        },
        pendingMessages: {
          enumerable: true,
          get() {
            return assert.fail("read after failed copy");
          },
        },
      });
      install(owner, snapshot);
      assert.throws(
        () => owner.queueMessage(TASK_ID, message("never queued")),
        (error) => error === failure,
      );
      assert.equal(owner.get(TASK_ID)?.description, "retained reentry");
      assert.equal(owner.get(TASK_ID)?.pendingMessages, undefined);
      return { effects, originalError: true, reentryRetained: true, noOuterCommit: true };
    },
  },
  {
    name: "append iterator failure follows field copy and leaves the original snapshot stored",
    observe(create) {
      const owner = create();
      const effects: string[] = [];
      const failure = new Error("owned iterator failure");
      const prior = [message("original")];
      Object.defineProperty(prior, Symbol.iterator, {
        get() {
          effects.push("iterator-failure");
          throw failure;
        },
      });
      let reads = 0;
      const snapshot = Object.defineProperties(task(), {
        before: {
          enumerable: true,
          get() {
            effects.push("before");
            return "before";
          },
        },
        pendingMessages: {
          enumerable: true,
          get() {
            effects.push(`messages:${++reads}`);
            return prior;
          },
        },
        after: {
          enumerable: true,
          get() {
            effects.push("after");
            return "after";
          },
        },
      });
      install(owner, snapshot);
      assert.throws(
        () => owner.queueMessage(TASK_ID, message("never queued")),
        (error) => error === failure,
      );
      assert.deepEqual(effects, [
        "before",
        "messages:1",
        "after",
        "messages:2",
        "iterator-failure",
      ]);
      assert.equal(owner.get(TASK_ID), snapshot);
      return { effects, originalError: true, originalSnapshot: true };
    },
  },
];
