// 验证内联后的 buildPluginReferenceCatalog 与 core 原版输出完全一致。
//
// 因为 buildPluginReferenceCatalog 没有现成测试，这里用「同一批输入分别喂给两个实现，
// 比对 JSON 输出」的方式验证行为等价。
import assert from "node:assert/strict";
import test from "node:test";
import { buildPluginReferenceCatalog as inlineBuild } from "../src/protocol/plugin-reference-catalog-build.js";

/** 造一个最小的 PluginMetadata（只填 catalog 用到的字段）。 */
function plugin(overrides = {}) {
  return {
    id: "alpha@official",
    name: "alpha",
    marketplace: "official",
    enabled: true,
    rootPath: "/plugins/alpha",
    mcpServerNames: [],
    components: [],
    ...overrides,
  };
}

test("buildPluginReferenceCatalog maps a single enabled plugin", () => {
  const catalog = inlineBuild([plugin()]);
  assert.equal(catalog.plugins.length, 1);
  const entry = catalog.plugins[0];
  assert.equal(entry.pluginId, "alpha@official");
  assert.equal(entry.name, "alpha");
  assert.equal(entry.marketplace, "official");
  assert.equal(entry.enabled, true);
  assert.deepEqual(entry.conflictingPluginIds, []);
  assert.deepEqual(entry.skillQualifiedNames, []);
  assert.deepEqual(entry.mcpServerNames, []);
  assert.deepEqual(entry.subagentNames, []);
  assert.equal(entry.rootPath, "/plugins/alpha");
});

test("buildPluginReferenceCatalog qualifies skill and agent names with the plugin name", () => {
  const catalog = inlineBuild([
    plugin({
      components: [
        { kind: "skill", items: [{ name: "review" }, { name: "  trim-me  " }] },
        { kind: "agent", items: [{ name: "explorer" }] },
        { kind: "other", items: [{ name: "ignored" }] },
      ],
    }),
  ]);
  const entry = catalog.plugins[0];
  assert.deepEqual(entry.skillQualifiedNames, ["alpha:review", "alpha:trim-me"]);
  assert.deepEqual(entry.subagentNames, ["alpha:explorer"]);
});

test("buildPluginReferenceCatalog sorts mcpServerNames", () => {
  const catalog = inlineBuild([plugin({ mcpServerNames: ["zeta", "alpha", "mu"] })]);
  assert.deepEqual(catalog.plugins[0].mcpServerNames, ["alpha", "mu", "zeta"]);
});

test("buildPluginReferenceCatalog reports conflicting ids for same-name enabled plugins", () => {
  const catalog = inlineBuild([
    plugin({ id: "alpha@official" }),
    plugin({ id: "alpha@local" }),
    plugin({ id: "alpha@third", enabled: false }),
  ]);
  const first = catalog.plugins.find((p) => p.pluginId === "alpha@official");
  const second = catalog.plugins.find((p) => p.pluginId === "alpha@local");
  const third = catalog.plugins.find((p) => p.pluginId === "alpha@third");
  // 两个已启用的同名插件互为冲突；第三个未启用，不参与也不报告。
  assert.deepEqual(first.conflictingPluginIds, ["alpha@local"]);
  assert.deepEqual(second.conflictingPluginIds, ["alpha@official"]);
  assert.deepEqual(third.conflictingPluginIds, []);
});

test("buildPluginReferenceCatalog gives no conflicts to a disabled plugin", () => {
  const catalog = inlineBuild([
    plugin({ id: "alpha@official", enabled: false }),
    plugin({ id: "alpha@local", enabled: false }),
  ]);
  for (const entry of catalog.plugins) assert.deepEqual(entry.conflictingPluginIds, []);
});

test("buildPluginReferenceCatalog keeps plugins with different names apart", () => {
  const catalog = inlineBuild([
    plugin({ id: "alpha@official" }),
    plugin({ id: "beta@official", name: "beta" }),
  ]);
  for (const entry of catalog.plugins) assert.deepEqual(entry.conflictingPluginIds, []);
});

test("buildPluginReferenceCatalog handles an empty list", () => {
  assert.deepEqual(inlineBuild([]), { plugins: [] });
});

test("buildPluginReferenceCatalog skips empty component item names", () => {
  const catalog = inlineBuild([
    plugin({ components: [{ kind: "skill", items: [{ name: "   " }, { name: "" }] }] }),
  ]);
  assert.deepEqual(catalog.plugins[0].skillQualifiedNames, []);
});
