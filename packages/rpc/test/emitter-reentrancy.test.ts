import assert from "node:assert/strict";
import test from "node:test";
import { Emitter } from "../src/foundation.js";

test("subscriber mutations affect only the next broadcast", () => {
  const emitter = new Emitter<number>();
  const received: string[] = [];
  let mutate = true;
  emitter.event((value) => {
    received.push(`first:${value}`);
    if (mutate) {
      mutate = false;
      second.dispose();
      emitter.event((next) => received.push(`new:${next}`));
    }
  });
  const second = emitter.event((value) => received.push(`second:${value}`));
  emitter.fire(1);
  emitter.fire(2);
  assert.deepEqual(received, ["first:1", "second:1", "first:2", "new:2"]);
  emitter.dispose();
});
