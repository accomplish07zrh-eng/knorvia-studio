import assert from "node:assert/strict";
import { test } from "node:test";
import { ModelConfig, ModelConfigRules, type ModelConfigRule } from "../src/config/model-config.js";

const on = new ModelConfig({ enabled: true });
const off = new ModelConfig({ enabled: false });
const input = { providerId: "synthetic", modelId: "MODEL", templateId: "template", apiType: "API" };
const exact = (config: ModelConfig, modelId = "MODEL"): ModelConfigRule => ({
  type: "provider-model",
  providerId: "synthetic",
  modelId,
  config,
});

test("synthetic rule collection preserves ordered overlays, matching, identity, exact modes and encoding", () => {
  const source = [exact(on), { type: "model" as const, modelMatch: "model", config: off }];
  const rules = new ModelConfigRules(source);
  assert.deepEqual(Reflect.ownKeys(rules), []);
  assert.ok(Object.isFrozen(rules));
  assert.ok(Object.isFrozen(rules.rules()));
  assert.ok(Object.isFrozen(rules.rules()[0]));
  assert.notEqual(rules.rules()[0], source[0]);
  assert.equal(rules.rules()[0]?.config, on);
  assert.equal(rules.rules(), rules.rules());
  source.reverse();
  assert.equal(rules.resolve(input).enabled, false);
  assert.equal(rules.resolve({ ...input, modelId: "xMODEL" }).enabled, undefined);
  assert.equal(rules.getExact("synthetic", "MODEL"), on);
  assert.equal(rules.getExactRule("synthetic", "MODEL"), rules.rules()[0]);
  assert.equal(rules.getExact("unknown", "MODEL"), undefined);
  assert.notEqual(ModelConfigRules.empty(), ModelConfigRules.empty());

  const recommendations = new ModelConfigRules([
    { type: "model", modelMatch: "model", config: off },
    { type: "template-model", templateId: "template", modelId: "MODEL", config: on },
    { type: "model-api", modelMatch: "model", apiTypeMatch: "api", config: off },
    {
      type: "provider-site",
      modelMatch: "model",
      apiTypeMatch: "API",
      baseUrlMatch: "https://example\\.invalid/Path\\?Q=X#Hash",
      config: off,
    },
  ]);
  assert.equal(recommendations.resolve(input).enabled, true);
  assert.equal(recommendations.resolve({ ...input, apiType: "api" }).enabled, false);
  assert.equal(
    recommendations.resolve({ ...input, baseUrl: "https://EXAMPLE.invalid:443/Path///?Q=X#Hash" })
      .enabled,
    false,
  );
  assert.equal(
    recommendations.resolve({ ...input, baseUrl: "https://EXAMPLE.invalid/path/?Q=X#Hash" })
      .enabled,
    true,
  );
  assert.equal(recommendations.resolve({ ...input, baseUrl: "invalid" }).enabled, true);
  assert.throws(
    () => new ModelConfigRules([{ type: "model", modelMatch: "[", config: on }]).resolve(input),
    SyntaxError,
  );

  const manual = {
    type: "manual-provider-model" as const,
    providerId: "synthetic",
    modelId: "MODEL",
    config: off,
  };
  const duplicates = new ModelConfigRules([
    exact(on),
    { type: "model", modelMatch: "else", config: on },
    manual,
  ]);
  assert.equal(duplicates.getExactRule("synthetic", "MODEL"), duplicates.rules()[2]);
  assert.equal(duplicates.getExact("synthetic", "MODEL")?.enabled, false);
  assert.throws(() => duplicates.setExact("synthetic", "MODEL", on));
  const replaced = duplicates.setExact("synthetic", "MODEL", on, true);
  assert.deepEqual(
    replaced.rules().map((r) => r.type),
    ["provider-model", "model"],
  );
  assert.equal(replaced.rules()[0]?.config, on);
  assert.equal(replaced.getExactRule("synthetic", "MODEL")?.type, "provider-model");
  assert.equal(duplicates.renameExactModel("synthetic", "same", "same"), duplicates);
  const renamed = duplicates.renameExactModel("synthetic", "MODEL", "NEXT");
  assert.equal(renamed.getExact("synthetic", "MODEL"), undefined);
  assert.equal(renamed.getExact("synthetic", "NEXT")?.enabled, false);
  assert.equal(renamed.rules().length, 3);
  assert.notEqual(duplicates.deleteExact("missing", "missing"), duplicates);
  assert.deepEqual(
    duplicates
      .deleteExact("synthetic", "MODEL")
      .rules()
      .map((r) => r.type),
    ["model"],
  );
  assert.equal(duplicates.deleteExactForProvider("synthetic").rules().length, 1);
  const composed = ModelConfigRules.composeEffective(recommendations, duplicates);
  assert.deepEqual(
    composed.rules().map((r) => r.type),
    [
      "model",
      "template-model",
      "model-api",
      "provider-site",
      "provider-model",
      "manual-provider-model",
    ],
  );

  const base = ModelConfig.fromData({
    enabled: true,
    properties: {
      contextWindow: 100,
      supportsToolCall: true,
      supportsJsonSchemaOutput: true,
      inputFormat: { supportsText: true, supportsImage: true },
    },
    optionSpecs: { maxOutputTokens: { max: 99, map: '{"max_tokens": maxOutputTokens}' } },
  });
  const override = ModelConfig.fromData({ properties: { contextWindow: 200 } });
  const layered = new ModelConfigRules([exact(base), { ...manual, config: override }]);
  const resolved = layered.resolve(input).toJSON();
  assert.equal(resolved.enabled, true);
  assert.equal(resolved.properties?.contextWindow, 200);
  assert.equal(resolved.properties?.supportsJsonSchemaOutput, undefined);
  assert.equal(resolved.properties?.supportsToolCall, true);
  assert.equal(resolved.properties?.inputFormat?.supportsText, true);
  assert.equal(resolved.properties?.inputFormat?.supportsImage, undefined);
  assert.equal(resolved.optionSpecs?.maxOutputTokens?.max, undefined);
  assert.equal(resolved.optionSpecs?.maxOutputTokens?.map, '{"max_tokens": maxOutputTokens}');
  assert.equal(
    layered.getExact("synthetic", "MODEL")?.toJSON().properties?.supportsJsonSchemaOutput,
    true,
  );

  const encoded = new ModelConfigRules([
    { type: "model", modelMatch: "MODEL", config: on },
    { type: "template-model", templateId: "template", modelId: "MODEL", config: off },
    exact(on),
    manual,
  ]);
  assert.deepEqual(encoded.toKnorviaBuiltinJSON(), {
    modelRules: [{ modelMatch: "MODEL", config: { enabled: true } }],
    modelApiRules: [],
    providerSiteRules: [],
    templateModelRules: [{ templateId: "template", modelId: "MODEL", config: { enabled: false } }],
    builtinProviderModelRules: [
      { providerId: "synthetic", modelId: "MODEL", config: { enabled: true } },
    ],
  });
  assert.throws(() => encoded.toPersonalJSON());
  // 混合编码边界原本不校验手动配置，保留与个人编码不同的既有行为。
  assert.deepEqual(encoded.toJSON().manualProviderModelRules, [
    { providerId: "synthetic", modelId: "MODEL", config: { enabled: false } },
  ]);
  assert.deepEqual(replaced.toPersonalJSON(), {
    providerModelRules: [{ providerId: "synthetic", modelId: "MODEL", config: { enabled: true } }],
    manualProviderModelRules: [],
  });
  const sparseInput: ModelConfigRule[] = [];
  sparseInput.length = 1;
  const sparse = new ModelConfigRules(sparseInput);
  assert.equal(sparse.rules().length, 1);
  assert.equal(0 in sparse.rules(), false);
  assert.throws(() => sparse.getExactRule("missing", "missing"), TypeError);
  const getterFailure = new Error("synthetic unexpected identity read");
  const mismatchedProvider = {
    providerId: "other",
    get modelId(): string {
      throw getterFailure;
    },
  };
  assert.deepEqual(new ModelConfigRules([exact(on)]).resolve(mismatchedProvider).toJSON(), {});
  assert.deepEqual(
    new ModelConfigRules([
      { type: "template-model", templateId: "template", modelId: "MODEL", config: on },
    ])
      .resolve({
        providerId: "other",
        templateId: "other",
        get modelId(): string {
          throw getterFailure;
        },
      })
      .toJSON(),
    {},
  );
  const opaque = new ModelConfigRules([
    {
      type: "provider-site",
      modelMatch: "MODEL",
      baseUrlMatch: "data:synthetic  %20\\?Q=X#Hash",
      config: on,
    },
  ]);
  assert.equal(opaque.resolve({ ...input, baseUrl: "data:synthetic   ?Q=X#Hash" }).enabled, true);
  const failure = new Error("synthetic serialization failure");
  class ThrowingConfig extends ModelConfig {
    override toJSON(): never {
      throw failure;
    }
  }
  assert.throws(
    () => ModelConfigRules.empty().setExact("synthetic", "MODEL", new ThrowingConfig()),
    (error: unknown) => error === failure,
  );
  assert.throws(
    () => new ModelConfigRules([exact(new ThrowingConfig())]).toPersonalJSON(),
    (error: unknown) => error === failure,
  );
});
