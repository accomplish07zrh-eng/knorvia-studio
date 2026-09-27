// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { CoreErrorType, createCoreError, isCoreError, type Logger } from "@knorvia/contracts";
import {
  normalizeToolExecutionInput as normalize,
  prepareInitialToolExecutionInput as prepare,
} from "../src/tool/input-normalization.js";
import {
  validateInput,
  validateInitialModelToolInput as initial,
  validateOutput,
  getInitialInputValidationModelContent as modelContent,
} from "../src/tool/executor/validation.js";
import type { ToolEntry } from "../src/tool/types.js";

const entry = (fields: Partial<ToolEntry> = {}) =>
  ({ metadata: { name: "fixture" }, inputSchema: {}, outputSchema: {}, ...fields }) as ToolEntry;

test("top-level JSON decoding happens once for objects, arrays and scalar values", () => {
  for (const [input, expected] of [
    ['{"x":1}', { x: 1 }],
    ["[1]", [1]],
    ["null", null],
    ["true", true],
    ["3", 3],
    ['"3"', "3"],
  ])
    assert.deepEqual(prepare({ entry: entry(), input }), { input: expected });
  const object = { original: true };
  assert.equal(prepare({ entry: entry(), input: object }).input, object);
});

test("malformed JSON logs only metadata and preserves the original string in every phase", () => {
  for (const source of ["initial", "hook", "permission"] as const) {
    const calls: unknown[][] = [];
    const logger = { warn: (...args: unknown[]) => calls.push(args) } as unknown as Logger;
    assert.equal(
      normalize({ entry: entry(), input: "{secret-looking-text", source, logger }),
      "{secret-looking-text",
    );
    assert.deepEqual(calls, [
      [
        "Tool execution input JSON normalization failed",
        {
          event: "tool.input.normalize_failed",
          inputLength: 20,
          module: "core.tool.input-normalization",
          source,
          status: "failed",
          toolName: "fixture",
        },
      ],
    ]);
    assert.equal(JSON.stringify(calls).includes("secret-looking-text"), false);
  }
});

test("runtime success owns transformed input, including undefined", () => {
  const transformed = { defaulted: true };
  const seen: unknown[] = [];
  const tool = entry({
    runtimeInputSchema: {
      safeParse(value: unknown) {
        seen.push(value);
        return { success: true, data: transformed };
      },
    },
  });
  assert.equal(prepare({ entry: tool, input: '{"x":1}' }).input, transformed);
  assert.deepEqual(seen, [{ x: 1 }]);
  tool.runtimeInputSchema = { safeParse: () => ({ success: true, data: undefined }) };
  assert.deepEqual(prepare({ entry: tool, input: {} }), { input: undefined });
});

test("input runtime methods retain their schema receiver across all preparation phases", () => {
  class Parser {
    calls: unknown[] = [];
    safeParse(value: unknown) {
      this.calls.push(value);
      return { success: true, data: { call: this.calls.length } };
    }
  }
  const parser = new Parser();
  const tool = entry({ runtimeInputSchema: parser });
  assert.deepEqual(prepare({ entry: tool, input: "1" }), { input: { call: 1 } });
  assert.deepEqual(normalize({ entry: tool, input: "2", source: "hook" }), { call: 2 });
  assert.deepEqual(normalize({ entry: tool, input: "3", source: "permission" }), { call: 3 });
  assert.deepEqual(parser.calls, [1, 2, 3]);
});

test("runtime failure retains decoded input and filters only the outer issue list", () => {
  const issue = { code: "custom", nested: { same: true } };
  const raw = { retained: true };
  const issues = [null, false, [], issue, 7, () => 1];
  const tool = entry({
    runtimeInputSchema: { safeParse: () => ({ success: false, error: { issues } }) },
  });
  const result = prepare({ entry: tool, input: raw });
  assert.equal(result.input, raw);
  assert.deepEqual(result.runtimeValidationIssues, [issue]);
  assert.notEqual(result.runtimeValidationIssues, issues);
  assert.equal(result.runtimeValidationIssues![0], issue);
  for (const error of [
    undefined,
    null,
    [],
    { issues: [] },
    { issues: [false] },
    { issues: "bad" },
  ]) {
    tool.runtimeInputSchema = { safeParse: () => ({ success: false, error }) };
    assert.deepEqual(prepare({ entry: tool, input: raw }), { input: raw });
  }
});

test("schema capability accepts object methods and ignores callable schema values", () => {
  const fake = Object.assign(() => 1, {
    safeParse() {
      throw new Error("must not call");
    },
  });
  for (const runtimeInputSchema of [null, 1, "schema", fake, { safeParse: false }])
    assert.deepEqual(prepare({ entry: entry({ runtimeInputSchema }), input: "1" }), { input: 1 });
  const array = Object.assign([], { safeParse: () => ({ success: true, data: 2 }) });
  assert.deepEqual(prepare({ entry: entry({ runtimeInputSchema: array }), input: "1" }), {
    input: 2,
  });
});

test("decoding warning precedes parser capture, and logger/parser failures propagate", () => {
  const tool = entry();
  const logger = {
    warn() {
      tool.runtimeInputSchema = { safeParse: () => ({ success: true, data: "after warn" }) };
    },
  } as unknown as Logger;
  assert.equal(prepare({ entry: tool, input: "{", logger }).input, "after warn");
  const failure = new Error("fixture");
  assert.throws(
    () =>
      prepare({
        entry: tool,
        input: "{",
        logger: {
          warn() {
            throw failure;
          },
        } as unknown as Logger,
      }),
    (error) => error === failure,
  );
  tool.runtimeInputSchema = {
    safeParse() {
      throw failure;
    },
  };
  assert.throws(
    () => prepare({ entry: tool, input: {} }),
    (error) => error === failure,
  );
});

test("only first input validation carries complete model content beyond the context cap", () => {
  const required = Array.from({ length: 25 }, (_, index) => `field${index}`);
  const tool = entry({ inputSchema: { type: "object", required } });
  const ordinary = validateInput({}, tool);
  const first = initial({}, tool);
  assert.ok(isCoreError(ordinary) && isCoreError(first));
  assert.equal(first.type, CoreErrorType.ToolExecutionFailed);
  assert.equal(first.message, "Tool input failed inputSchema validation");
  assert.equal(first.recoverable, true);
  assert.deepEqual(Object.keys(first.context!), [
    "errors",
    "toolName",
    "initialInputValidationModelContent",
  ]);
  assert.equal((first.context!.errors as string[]).length, 20);
  assert.equal(first.context!.toolName, "fixture");
  assert.equal(modelContent(ordinary), undefined);
  assert.match(modelContent(first)!, /field24/);
  assert.equal(validateInput(1, entry({ inputSchema: { type: "number" } })), undefined);
  assert.equal(initial(1, entry({ inputSchema: { type: "number" } })), undefined);
});

test("model content extraction checks the error kind and string field without consuming it", () => {
  const field = "initialInputValidationModelContent";
  for (const value of [undefined, 7, {}])
    assert.equal(
      modelContent(
        createCoreError(CoreErrorType.ToolExecutionFailed, "x", { context: { [field]: value } }),
      ),
      undefined,
    );
  const empty = createCoreError(CoreErrorType.ToolExecutionFailed, "x", {
    context: { [field]: "" },
  });
  assert.equal(modelContent(empty), "");
  assert.equal(modelContent(empty), "");
  assert.equal(modelContent(new Error("x")), undefined);
  assert.equal(
    modelContent(
      createCoreError(CoreErrorType.ToolCancelled, "x", { context: { [field]: "wrong stage" } }),
    ),
    undefined,
  );
});

test("runtime output schema is authoritative and its transformed data is not substituted", () => {
  const output = { original: true };
  const schema = {
    seen: [] as unknown[],
    safeParse(value: unknown) {
      this.seen.push(value);
      return { success: true, data: "different" };
    },
  };
  assert.equal(
    validateOutput(
      output,
      entry({ runtimeOutputSchema: schema, outputSchema: { type: "string" } }),
    ),
    undefined,
  );
  assert.deepEqual(schema.seen, [output]);
  assert.deepEqual(output, { original: true });
});

test("runtime and JSON output rejections preserve their own error context and recoverability", () => {
  const messages = Array.from({ length: 25 }, (_, index) => ({ message: `failure${index}` }));
  const tool = entry({
    runtimeOutputSchema: { safeParse: () => ({ success: false, error: { issues: messages } }) },
  });
  assert.throws(
    () => validateOutput(1, tool),
    (error) => {
      assert.ok(isCoreError(error));
      assert.equal(error.message, "Tool output failed runtimeOutputSchema validation");
      assert.equal(error.recoverable, false);
      assert.deepEqual(error.context, {
        errors: messages.slice(0, 20).map((issue) => issue.message),
        toolName: "fixture",
      });
      assert.equal(modelContent(error), undefined);
      return true;
    },
  );
  assert.throws(
    () => validateOutput(1, entry({ outputSchema: { type: "string" } })),
    (error) => {
      assert.ok(isCoreError(error));
      assert.equal(error.message, "Tool output failed outputSchema validation");
      assert.equal(error.recoverable, false);
      return true;
    },
  );
});

test("output parser exceptions and malformed failure payloads never become success", () => {
  const failure = new Error("parser failed");
  assert.throws(
    () =>
      validateOutput(
        1,
        entry({
          runtimeOutputSchema: {
            safeParse() {
              throw failure;
            },
          },
        }),
      ),
    (error) => error === failure,
  );
  assert.throws(
    () =>
      validateOutput(1, entry({ runtimeOutputSchema: { safeParse: () => ({ success: false }) } })),
    TypeError,
  );
});

test("runtime-only input issues do not reject an otherwise valid model schema", () => {
  const tool = entry({
    runtimeInputSchema: {
      safeParse: () => ({
        success: false,
        error: { issues: [{ code: "custom", path: [], message: "runtime only" }] },
      }),
    },
  });
  const prepared = prepare({ entry: tool, input: "1" });
  assert.equal(prepared.input, 1);
  assert.equal(prepared.runtimeValidationIssues?.length, 1);
  assert.equal(initial(prepared.input, tool, prepared.runtimeValidationIssues), undefined);
});

test("empty runtime output issue lists still reject without falling back to JSON", () => {
  assert.throws(
    () =>
      validateOutput(
        1,
        entry({
          runtimeOutputSchema: { safeParse: () => ({ success: false, error: { issues: [] } }) },
        }),
      ),
    (error) => {
      assert.ok(isCoreError(error));
      assert.equal(error.message, "Tool output failed runtimeOutputSchema validation");
      assert.equal(error.recoverable, false);
      assert.deepEqual(error.context, { errors: [], toolName: "fixture" });
      return true;
    },
  );
});

test("parser property reads preserve the input capture and output check-then-call stages", () => {
  const schema = () => ({
    reads: 0,
    calls: 0,
    get safeParse() {
      this.reads++;
      return this.reads === 1
        ? () => {
            this.calls++;
            return { success: true, data: "first" };
          }
        : () => {
            this.calls++;
            return { success: false, error: { issues: [{ message: "second" }] } };
          };
    },
  });
  const input = schema();
  assert.equal(prepare({ entry: entry({ runtimeInputSchema: input }), input: "1" }).input, "first");
  assert.equal(input.reads, 1);
  assert.equal(input.calls, 1);
  const output = schema();
  assert.throws(
    () => validateOutput(1, entry({ runtimeOutputSchema: output })),
    (error) => {
      assert.ok(isCoreError(error));
      assert.deepEqual(error.context, { errors: ["second"], toolName: "fixture" });
      return true;
    },
  );
  assert.equal(output.reads, 2);
  assert.equal(output.calls, 1);
  let reads = 0;
  const disappearing = {
    get safeParse() {
      return ++reads === 1 ? () => ({ success: true, data: 1 }) : undefined;
    },
  };
  assert.throws(() => validateOutput(1, entry({ runtimeOutputSchema: disappearing })), TypeError);
  assert.equal(reads, 2);
});
