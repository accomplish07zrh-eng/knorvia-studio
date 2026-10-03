import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProviderConfig,
  ProviderConfigMap,
  type ProviderConfigObject,
  type ProviderConfigRule,
} from "../src/config/provider-config.js";
import type { ConfigValidationIssue } from "../src/config-overlay.js";

const issues: readonly ConfigValidationIssue[] = [
  Object.freeze({ code: "invalid-config", path: [], message: "synthetic" }),
];
const operations: unknown[] = [];
const paths: Array<readonly string[]> = [];
const names = new WeakMap<ProviderConfig, string>();
function fake(name: string, data: ProviderConfigObject = {}): ProviderConfig {
  class SyntheticConfig extends ProviderConfig {
    override overlay(next: ProviderConfig): ProviderConfig {
      operations.push(["overlay", this, next]);
      return fake(`${name}+${names.get(next)}`, data);
    }
    override validateComplete(path: readonly string[] = []): readonly ConfigValidationIssue[] {
      paths.push(path);
      return issues;
    }
    override toJSON(): ProviderConfigObject {
      operations.push(["json", this]);
      return data;
    }
  }
  const config = new SyntheticConfig();
  names.set(config, name);
  return config;
}

test("synthetic config ports preserve complete rule identity, overlay/order, metadata/null semantics and validation/encoding failures", () => {
  const firstData: ProviderConfigObject = Object.freeze({ group: null, logo: null });
  const first = fake("first", firstData),
    second = fake("second"),
    third = fake("third");
  const custom = Object.freeze({ synthetic: true });
  const symbol = Symbol("synthetic metadata");
  const firstRule = {
    providerId: " p ",
    providerName: "First",
    templateId: "template",
    enabled: true,
    custom,
    optional: undefined,
    config: first,
    [symbol]: "kept",
  };
  const source = new ProviderConfigMap([firstRule, ["other", second]]);
  assert.deepEqual(Reflect.ownKeys(source), []);
  assert.ok(Object.isFrozen(source));
  assert.ok(Object.isFrozen(source.getRule(" p ")));
  assert.notEqual(source.getRule(" p "), firstRule);
  assert.equal(source.get(" p "), first);
  assert.equal(source.getRule(" p "), source.rules()[0]);
  assert.equal(Reflect.get(source.getRule(" p ")!, "custom"), custom);
  assert.equal(Reflect.get(source.getRule(" p ")!, symbol), "kept");
  assert.equal("optional" in source.getRule(" p ")!, true);
  assert.equal(source.has("p"), false);
  assert.equal(source.has(" p "), true);
  const keys = source.keys();
  keys.reverse();
  assert.deepEqual(source.keys(), [" p ", "other"]);
  const entries = source.entries();
  assert.equal(Object.isFrozen(entries[0]), false);
  entries.pop();
  assert.equal(source.entries().length, 2);
  assert.notEqual(source.rules(), source.rules());
  assert.notEqual(ProviderConfigMap.empty(), ProviderConfigMap.empty());
  assert.throws(() => new ProviderConfigMap([["x", first], { providerId: "x", config: second }]), {
    message: "重复 Provider key: x",
  });
  const failure = new Error("synthetic iterator/getter/config failure");
  function* broken() {
    yield { providerId: "x", config: first };
    throw failure;
  }
  assert.throws(
    () => new ProviderConfigMap(broken()),
    (error: unknown) => error === failure,
  );
  assert.throws(
    () =>
      new ProviderConfigMap([
        {
          providerId: "bad",
          config: first,
          get providerName(): string {
            throw failure;
          },
        },
      ]),
    (error: unknown) => error === failure,
  );
  let idReads = 0;
  const getterMap = new ProviderConfigMap([
    {
      get providerId() {
        idReads++;
        return "getter";
      },
      config: first,
    },
  ]);
  assert.equal(idReads, 3);
  assert.equal(getterMap.get("getter"), first);

  operations.length = 0;
  const extraNext = { providerId: "new", providerName: "New", custom, config: second };
  const next = new ProviderConfigMap([
    { providerId: " p ", providerName: null, enabled: false, config: third },
    extraNext,
  ]);
  const overlaid = source.overlay(next);
  assert.deepEqual(overlaid.keys(), [" p ", "other", "new"]);
  assert.deepEqual(operations, [["overlay", first, third]]);
  assert.equal(names.get(overlaid.get(" p ")!), "first+third");
  assert.equal(overlaid.getRule(" p ")?.templateId, "template");
  assert.equal(overlaid.getRule(" p ")?.providerName, null);
  assert.equal(overlaid.getRule(" p ")?.enabled, false);
  assert.equal("custom" in overlaid.getRule(" p ")!, false);
  assert.equal(Reflect.get(overlaid.getRule("new")!, "custom"), custom);
  assert.equal(overlaid.get("other"), second);
  assert.notEqual(overlaid.getRule("other"), source.getRule("other"));
  assert.equal(source.getRule(" p ")?.providerName, "First");

  const reordered = overlaid.reorder(["unknown", "new", "new", " p "]);
  assert.deepEqual(reordered.keys(), ["new", " p ", "other"]);
  assert.notEqual(source.reorder(source.keys()), source);
  const callbacks: unknown[] = [];
  const mapped = source.mapConfigs((config, id, rule) => {
    callbacks.push([config, id, rule]);
    return third;
  });
  assert.deepEqual(callbacks, [
    [first, " p ", source.getRule(" p ")],
    [second, "other", source.getRule("other")],
  ]);
  assert.equal(mapped.get(" p "), third);
  assert.equal(mapped.getRule(" p ")?.providerName, "First");
  assert.equal(Reflect.get(mapped.getRule(" p ")!, "custom"), custom);
  assert.throws(
    () =>
      source.mapConfigs(() => {
        throw failure;
      }),
    (error: unknown) => error === failure,
  );
  const set = source.set(" p ", third);
  assert.equal(set.get(" p "), third);
  assert.equal(set.getRule(" p ")?.providerName, "First");
  assert.equal(Reflect.get(set.getRule(" p ")!, "custom"), custom);
  const replaced = source.setRule({ providerId: " p ", config: third });
  assert.equal(replaced.getRule(" p ")?.providerName, undefined);
  assert.equal("custom" in replaced.getRule(" p ")!, false);
  assert.deepEqual(replaced.keys(), source.keys());
  assert.deepEqual(source.set("new", third).keys(), [" p ", "other", "new"]);
  assert.deepEqual(source.delete(" p ").keys(), ["other"]);
  assert.notEqual(source.delete("missing"), source);

  const basePath = ["synthetic"];
  const validated = source.validateComplete(basePath);
  assert.deepEqual(paths, [
    ["synthetic", " p "],
    ["synthetic", "other"],
  ]);
  assert.equal(validated[0], issues[0]);
  assert.equal(validated[1], issues[0]);
  assert.notEqual(paths[0], paths[1]);
  assert.deepEqual(basePath, ["synthetic"]);
  const encoded = source.toJSON();
  assert.equal(encoded[0]?.config, firstData);
  assert.equal(Reflect.get(encoded[0]!, "custom"), custom);
  assert.equal("optional" in encoded[0]!, false);
  assert.equal(Reflect.ownKeys(encoded[0]!).includes(symbol), false);
  assert.equal(encoded[0]?.enabled, true);
  assert.equal(Object.isFrozen(encoded[0]), false);
  assert.equal(overlaid.toJSON()[0]?.providerName, null);
  assert.deepEqual(ProviderConfigMap.empty().validateComplete(), []);
  class ThrowingConfig extends ProviderConfig {
    override validateComplete(): never {
      throw failure;
    }
    override toJSON(): never {
      throw failure;
    }
    override overlay(): never {
      throw failure;
    }
  }
  const throwing = new ProviderConfigMap([["bad", new ThrowingConfig()]]);
  assert.throws(
    () => throwing.validateComplete(),
    (error: unknown) => error === failure,
  );
  assert.throws(
    () => throwing.toJSON(),
    (error: unknown) => error === failure,
  );
  assert.throws(
    () => throwing.overlay(new ProviderConfigMap([["bad", first]])),
    (error: unknown) => error === failure,
  );

  const dispatch: string[] = [];
  class ProjectedMap extends ProviderConfigMap {
    override rules(): ProviderConfigRule[] {
      dispatch.push("rules");
      return [{ providerId: "virtual", config: first }];
    }
    override setRule(rule: ProviderConfigRule): ProviderConfigMap {
      dispatch.push("setRule");
      return super.setRule(rule);
    }
  }
  const projected = new ProjectedMap();
  assert.equal(projected.entries()[0]?.[0], "virtual");
  assert.equal(projected.toJSON()[0]?.providerId, "virtual");
  assert.equal(projected.delete("virtual").has("virtual"), false);
  assert.equal(projected.mapConfigs(() => third).get("virtual"), third);
  projected.set("new", third);
  assert.deepEqual(dispatch, ["rules", "rules", "rules", "rules", "setRule"]);
});
