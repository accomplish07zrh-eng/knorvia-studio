// Native protocol failures were observed on the immutable source and emitted baseline.
import assert from "node:assert/strict";
import test from "node:test";
import { clock, entry, streamFixture, valid } from "./websearch-fixture.js";

test("raw model stream returns preserve native failures and synchronous iterable acceptance", async () => {
  await clock(async () => {
    const failures: [unknown, string][] = [
      [undefined, "Cannot read properties of undefined (reading 'Symbol(Symbol.asyncIterator)')"],
      [null, "Cannot read properties of null (reading 'Symbol(Symbol.asyncIterator)')"],
      [0, "input.events is not async iterable"],
      [{}, "input.events is not async iterable"],
      [Promise.resolve([]), "input.events is not async iterable"],
    ];
    for (const [returned, message] of failures) {
      const fixture = streamFixture({ label: "raw protocol", events: [] });
      let calls = 0;
      fixture.model.streamText = function () {
        assert.equal(this, fixture.model);
        calls++;
        return returned as any;
      };
      await assert.rejects(entry.handler(valid, fixture.context), { name: "TypeError", message });
      assert.equal(calls, 1);
    }
    for (const returned of ["x", [], [{ type: "text_delta", text: "synchronous" }]]) {
      const fixture = streamFixture({ label: "synchronous protocol", events: [] });
      fixture.model.streamText = () => returned as any;
      const output = await entry.handler(valid, fixture.context);
      assert.equal(
        output.summary,
        Array.isArray(returned) && returned.length ? "synchronous" : undefined,
      );
      assert.deepEqual(output.results, []);
    }
  });
});

test("unknown event tags are read once without coercion or dispatching inherited properties", async () => {
  const fixture = streamFixture({ label: "unknown tags", events: [] });
  let tagReads = 0;
  const tag = {
    [Symbol.toPrimitive]() {
      throw new Error("Synthetic event tag must remain uncoerced");
    },
  };
  fixture.model.streamText = () =>
    [
      {
        get type() {
          tagReads++;
          return tag;
        },
      },
      { type: "constructor" },
      { type: "__proto__" },
      { type: "toString" },
      { type: "text_delta", text: "accepted" },
    ] as any;
  const output = await clock(() => entry.handler(valid, fixture.context));
  assert.equal(tagReads, 1);
  assert.equal(output.summary, "accepted");
});
