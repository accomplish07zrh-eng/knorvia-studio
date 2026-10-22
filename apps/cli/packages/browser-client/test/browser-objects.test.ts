// browser-objects 的行为测试：两个导出函数的契约。
import assert from "node:assert/strict";
import test from "node:test";
import { policyObject, unavailable } from "../src/browser-objects.js";
import { BrowserApiPolicy } from "../src/manifest.js";
import { BrowserCommandError } from "../src/result.js";
import type { BrowserBackendDescriptor } from "@knorvia/contracts/browser-control";

/** 造一个允许一切的最小策略。 */
function permissivePolicy(): BrowserApiPolicy {
  const descriptor: BrowserBackendDescriptor = {
    id: "test",
    generation: 1,
    type: "iab",
    name: "Test",
    capabilities: {},
  };
  return new BrowserApiPolicy(
    { objects: {}, entrypoints: [], semantics: {}, types: {} } as never,
    descriptor,
  );
}

test("policyObject binds methods so they keep their receiver", () => {
  class Counter {
    #count = 0;
    bump(): number {
      this.#count += 1;
      return this.#count;
    }
  }
  const wrapped = policyObject(new Counter(), "Counter", permissivePolicy());
  // 取出方法后单独调用 —— 绑定后仍应作用于原实例。
  const bump = wrapped.bump;
  assert.equal(bump(), 1);
  assert.equal(bump(), 2);
});

test("policyObject passes through plain properties", () => {
  const source = { label: "hello", nested: { depth: 1 } };
  const wrapped = policyObject(source, "Thing", permissivePolicy());
  assert.equal(wrapped.label, "hello");
  assert.deepEqual(wrapped.nested, { depth: 1 });
});

test("policyObject returns a distinct object, not the source", () => {
  const source = { value: 1 };
  const wrapped = policyObject(source, "Thing", permissivePolicy());
  assert.notEqual(wrapped, source);
  // 但读取的值一致。
  assert.equal(wrapped.value, source.value);
});

test("unavailable builds a BrowserCommandError with the backend_unavailable code", () => {
  const error = unavailable("Browser backend 'x' is unavailable");
  assert.ok(error instanceof BrowserCommandError);
  assert.equal(error.code, "backend_unavailable");
  assert.match(error.message, /Browser backend/u);
  assert.match(error.message, /is unavailable/u);
});

test("unavailable keeps the message verbatim", () => {
  const message = "Browser backend 'alpha' is unavailable; available: iab:alpha";
  const error = unavailable(message);
  assert.equal(error.message, message);
});
