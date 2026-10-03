import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { completeModelConfigDataSchema, modelConfigDataSchema } from "@knorvia/shared/model-config";
import {
  clearManualModelConfig,
  extractManualModelConfig,
  manualModelConfigSchema,
} from "../src/config/manual-model-config.js";

function fullModel() {
  return completeModelConfigDataSchema.parse({
    enabled: false,
    properties: {
      requiresMfjsToolSchema: true,
      contextWindow: 12345,
      inputFormat: {
        supportsText: true,
        supportsImage: true,
        supportsVideo: false,
        supportsAudio: true,
        supportsPdf: false,
      },
      outputFormat: { supportsText: true },
      supportsToolCall: true,
      supportsJsonSchemaOutput: false,
      supportsNativeWebSearch: true,
      supportsMidConversationSystem: false,
    },
    optionSpecs: {
      reasoningLevel: {
        values: ["synthetic-low", "synthetic-high"],
        map: '{"synthetic_reasoning": reasoningLevel}',
      },
      maxOutputTokens: { max: 321, map: '{"max_tokens": maxOutputTokens}' },
    },
  });
}
function issues(action: () => unknown) {
  try {
    action();
    assert.fail("expected synthetic schema failure");
  } catch (error) {
    assert.ok(error instanceof z.ZodError);
    return error.issues;
  }
}

test("synthetic configs preserve recursive editable boundaries, clear pruning, canonical error order and native getter failures", (t) => {
  const full = fullModel();
  const before = JSON.stringify(full);
  const manual = extractManualModelConfig(full);
  assert.deepEqual(manual, {
    enabled: false,
    properties: {
      contextWindow: 12345,
      supportsJsonSchemaOutput: false,
      supportsNativeWebSearch: true,
      supportsMidConversationSystem: false,
      inputFormat: { supportsImage: true, supportsVideo: false, supportsPdf: false },
    },
    optionSpecs: {
      reasoningLevel: {
        values: ["synthetic-low", "synthetic-high"],
        map: '{"synthetic_reasoning": reasoningLevel}',
      },
      maxOutputTokens: { max: 321 },
    },
  });
  assert.deepEqual(Object.keys(manual), ["enabled", "properties", "optionSpecs"]);
  assert.deepEqual(Object.keys(manual.properties), [
    "contextWindow",
    "supportsJsonSchemaOutput",
    "supportsNativeWebSearch",
    "supportsMidConversationSystem",
    "inputFormat",
  ]);
  assert.deepEqual(Object.keys(manual.properties.inputFormat), [
    "supportsImage",
    "supportsVideo",
    "supportsPdf",
  ]);
  assert.equal(Reflect.get(manual.properties, "requiresMfjsToolSchema"), undefined);
  assert.equal(Reflect.get(manual.properties.inputFormat, "supportsAudio"), undefined);
  assert.equal(Reflect.get(manual.optionSpecs.maxOutputTokens, "map"), undefined);
  assert.notEqual(manual, full);
  assert.notEqual(manual.properties, full.properties);
  assert.notEqual(manual.optionSpecs.reasoningLevel.values, full.optionSpecs.reasoningLevel.values);
  assert.ok(Object.isFrozen(manual.optionSpecs.reasoningLevel.values));
  const cleared = clearManualModelConfig(full);
  assert.deepEqual(cleared, {
    enabled: false,
    properties: {
      requiresMfjsToolSchema: true,
      inputFormat: { supportsText: true, supportsAudio: true },
      outputFormat: { supportsText: true },
      supportsToolCall: true,
    },
    optionSpecs: { maxOutputTokens: { map: '{"max_tokens": maxOutputTokens}' } },
  });
  assert.deepEqual(clearManualModelConfig(manual), { enabled: false });
  assert.deepEqual(clearManualModelConfig({}), {});
  assert.deepEqual(
    clearManualModelConfig({ enabled: null, properties: null, optionSpecs: undefined }),
    { enabled: null },
  );
  assert.deepEqual(
    clearManualModelConfig({
      properties: { inputFormat: null },
      optionSpecs: { reasoningLevel: null },
    }),
    {},
  );
  assert.equal(JSON.stringify(full), before);

  // Pick reads schema-order selected keys including inherited values, never hidden getters.
  const events: string[] = [];
  const inherited = Object.create(full) as typeof full;
  Object.defineProperty(inherited, "hiddenUnknown", {
    enumerable: true,
    get() {
      throw new Error("hidden key must stay unread during extraction");
    },
  });
  Object.defineProperty(inherited, "enabled", {
    get() {
      events.push("enabled");
      return undefined;
    },
  });
  Object.defineProperty(inherited, "properties", {
    get() {
      events.push("properties");
      return full.properties;
    },
  });
  Object.defineProperty(inherited, "optionSpecs", {
    get() {
      events.push("optionSpecs");
      return full.optionSpecs;
    },
  });
  const picked = extractManualModelConfig(inherited);
  assert.deepEqual(events, ["enabled", "properties", "optionSpecs"]);
  assert.ok(Object.hasOwn(picked, "enabled"));
  assert.equal(picked.enabled, undefined);
  const failure = new Error("synthetic getter failure");
  const throwing = {
    get enabled() {
      throw failure;
    },
  };
  assert.throws(
    () => extractManualModelConfig(throwing),
    (error) => error === failure,
  );
  const eager = {
    get properties() {
      events.push("source:first");
      return full.properties;
    },
    get enabled() {
      events.push("source:second");
      throw failure;
    },
  };
  events.length = 0;
  assert.throws(
    () => clearManualModelConfig(eager as unknown as Parameters<typeof clearManualModelConfig>[0]),
    (error) => error === failure,
  );
  assert.deepEqual(events, ["source:first", "source:second"]);

  const missing = issues(() => extractManualModelConfig({}));
  assert.deepEqual(
    missing.map((issue) => issue.path),
    [["properties"], ["optionSpecs"]],
  );
  assert.deepEqual(
    issues(() => extractManualModelConfig([])).map((issue) => [issue.code, issue.path]),
    [["invalid_type", []]],
  );
  const invalid = issues(() =>
    extractManualModelConfig({ enabled: "bad", properties: {}, optionSpecs: {} }),
  );
  assert.deepEqual(
    invalid.map((issue) => issue.path),
    [
      ["enabled"],
      ["properties", "contextWindow"],
      ["properties", "supportsJsonSchemaOutput"],
      ["properties", "supportsNativeWebSearch"],
      ["properties", "supportsMidConversationSystem"],
      ["properties", "inputFormat"],
      ["optionSpecs", "reasoningLevel"],
      ["optionSpecs", "maxOutputTokens"],
    ],
  );
  const foreign = { ...full, systemForeign: true };
  assert.deepEqual(
    issues(() => clearManualModelConfig(foreign)).map((issue) => [issue.code, issue.path]),
    [["unrecognized_keys", []]],
  );
  const nestedUnknown = { properties: { inputFormat: { syntheticUnknown: true } } };
  assert.deepEqual(
    issues(() =>
      clearManualModelConfig(
        nestedUnknown as unknown as Parameters<typeof clearManualModelConfig>[0],
      ),
    ).map((issue) => [issue.code, issue.path]),
    [["unrecognized_keys", ["properties", "inputFormat"]]],
  );
  assert.ok(!manualModelConfigSchema.safeParse(full).success);
  assert.deepEqual(
    clearManualModelConfig({ properties: [] } as unknown as Parameters<
      typeof clearManualModelConfig
    >[0]),
    {},
  );
  assert.deepEqual(
    issues(() =>
      clearManualModelConfig({ properties: [1] } as unknown as Parameters<
        typeof clearManualModelConfig
      >[0]),
    ).map((issue) => [issue.code, issue.path]),
    [["invalid_type", ["properties"]]],
  );

  // Callee is captured before projection; fixtures replace methods, never schema shapes.
  let parserCalls = 0;
  const originalManualParse = manualModelConfigSchema.parse;
  t.mock.method(manualModelConfigSchema, "parse", (value: unknown) => {
    parserCalls++;
    return originalManualParse(value);
  });
  const mutating = {
    ...full,
    get enabled() {
      manualModelConfigSchema.parse = () => {
        throw failure;
      };
      return false;
    },
  };
  assert.deepEqual(extractManualModelConfig(mutating), manual);
  assert.equal(parserCalls, 1);
  t.mock.restoreAll();
  t.mock.method(modelConfigDataSchema, "parse", () => {
    throw failure;
  });
  assert.throws(
    () => clearManualModelConfig(full),
    (error) => error === failure,
  );
});
