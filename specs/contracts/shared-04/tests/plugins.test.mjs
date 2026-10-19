// SPDX-License-Identifier: Apache-2.0
// shared-04 合同测试：插件展示、市场、排序、技能扫描与 MCP 转换（B12–B18）。
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadModule, entryLabel } from "./entry.mjs";
import { assertJsonEqual, readFixture } from "./fixtures.mjs";

const fixture = readFixture("plugins.json");
const display = await loadModule("plugin-display-name.ts");
const marketplaces = await loadModule("plugin-marketplaces.ts");
const order = await loadModule("pluginStoreOrder.ts");
const ordering = await loadModule("pluginStoreOrdering.ts");
const skill = await loadModule("skill-scan-policy.ts");
const mcp = await loadModule("mcp.ts");

test(`B12 plugin-display-name：本地化精确匹配、语言前缀与 canonical 缩写（${entryLabel}）`, () => {
  for (const entry of fixture.displayName.canonical) {
    assert.equal(
      display.formatCanonicalPluginName(entry.name, entry.locale),
      entry.output,
      entry.name,
    );
  }
  for (const entry of fixture.displayName.localized) {
    assert.equal(
      display.resolveLocalizedText(entry.locale, entry.base, entry.map ?? undefined),
      entry.output,
    );
  }
  for (const entry of fixture.displayName.display) {
    assert.equal(display.resolvePluginDisplayName(entry.plugin, entry.locale), entry.output);
  }
  assert.equal(
    display.formatCanonicalPluginName("mcp-aws_knorvia", "en-US"),
    "MCP AWS Knorvia Studio",
  );
});

test("B13 plugin-marketplaces：官方 id、默认启用集合序与公开市场段", () => {
  assert.equal(
    marketplaces.KNORVIA_OFFICIAL_PLUGIN_MARKETPLACE_ID,
    fixture.marketplaces.officialId,
  );
  assertJsonEqual(
    [...marketplaces.DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS].sort(),
    fixture.marketplaces.defaultEnabled,
  );
  assertJsonEqual(marketplaces.DEFAULT_PLUGIN_MARKETPLACES, fixture.marketplaces.defaults);
  assertJsonEqual([...marketplaces.PUBLIC_STORE_MARKETPLACE_IDS], fixture.marketplaces.publicIds);
  assert.equal(fixture.marketplaces.defaultEnabled.length, 10);
  for (const entry of fixture.marketplaces.isPublic) {
    assert.equal(marketplaces.isPublicStoreMarketplaceId(entry.input), entry.output, entry.input);
  }
});

test("B14 pluginStoreOrder：模式级容错、trim 去重与非法根返回 null", () => {
  for (const entry of fixture.order.parse) {
    assertJsonEqual(
      order.parsePluginStoreOrder(entry.input),
      entry.output,
      JSON.stringify(entry.input),
    );
  }
  assertJsonEqual(order.parsePluginStoreOrder({ code: { categoryOrder: ["b", "a", "b"] } }), {
    code: { categoryOrder: ["b", "a"] },
  });
  assert.equal(order.parsePluginStoreOrder(null), null);
});

test("B15 pluginStoreOrdering：分类映射、默认/自定义排序与文档插件优先级", () => {
  assertJsonEqual([...ordering.PLUGIN_STORE_CATEGORY_ORDER], fixture.ordering.categoryOrder);
  assert.equal(ordering.FALLBACK_PLUGIN_STORE_CATEGORY, fixture.ordering.fallback);
  for (const entry of fixture.ordering.resolveCategory) {
    assert.equal(
      ordering.resolvePluginStoreCategory(entry.input ?? undefined),
      entry.output,
      String(entry.input),
    );
  }
  const items = [
    { id: "z", category: "guides", displayName: "Zeta" },
    { id: "a", category: undefined, displayName: "Alpha" },
    { id: "m", category: "finance", displayName: "Mike" },
    { id: "b", category: "productivity", displayName: "Beta" },
    { id: "d", category: "developer-tools", displayName: "Doc" },
    { id: "pdf@knorvia-plugins-bundled", category: "template", displayName: "PDF" },
    { id: "presentations@knorvia-plugins-bundled", category: "template", displayName: "Pres" },
    { id: "zz", category: "template", displayName: "Zed" },
    { id: "aa", category: "template", displayName: "Aaa" },
  ];
  const ids = (input, options) =>
    ordering.sortPluginStoreEntries(input, (item) => item, "en-US", options).map((item) => item.id);
  assertJsonEqual(ids(items), fixture.ordering.sortDefault);
  assertJsonEqual(
    ids(items, { categoryOrder: ["template"], pluginOrder: { template: ["zz"] } }),
    fixture.ordering.sortCustom,
  );
  assertJsonEqual(
    ids([
      { id: "b", category: "productivity", displayName: "Same" },
      { id: "a", category: "productivity", displayName: "Same" },
    ]),
    fixture.ordering.sortStable,
  );
  assertJsonEqual(
    ids([
      { id: "x", category: "mystery", displayName: "X" },
      { id: "y", category: "productivity", displayName: "Y" },
      { id: "z", category: undefined, displayName: "Z" },
    ]),
    fixture.ordering.sortFallbackLast,
  );
  for (const entry of fixture.ordering.documentPriority) {
    assert.equal(
      ordering.compareDocumentPluginPriority(entry.left, entry.right),
      entry.output,
      `${entry.left} vs ${entry.right}`,
    );
  }
});

test("B16 skill-scan-policy：SKILL.md、深度 8 与 12 个排除目录", () => {
  assert.equal(skill.SKILL_FILE_NAME, fixture.skill.fileName);
  assert.equal(skill.MAX_SKILL_SCAN_DEPTH, fixture.skill.maxDepth);
  assertJsonEqual([...skill.SKILL_SCAN_EXCLUDED_DIRECTORY_NAMES].sort(), fixture.skill.excluded);
  for (const entry of fixture.skill.walk) {
    assert.equal(skill.shouldWalkSkillDirectoryEntry(entry.input), entry.output, entry.input);
  }
});

test("B17 mcp headers：headers 优先于 http_headers", () => {
  assertJsonEqual(
    {
      cuaPluginId: mcp.KNORVIA_CUA_OFFICIAL_PLUGIN_ID,
      cuaNamespace: mcp.KNORVIA_CUA_OFFICIAL_MCP_NAMESPACE_NAME,
      pluginIdEnvKey: mcp.KNORVIA_PLUGIN_ID_ENV_KEY,
    },
    fixture.mcp.constants,
  );
  for (const entry of fixture.mcp.headers) {
    assertJsonEqual(mcp.getMcpServerRequestHeaders(entry.input) ?? null, entry.output);
  }
});

test("B18 mcp CUA 识别与服务器转换：stdio/http 判别、cmd /c 解包、OAuth 接受规则", () => {
  for (const entry of fixture.mcp.cuaCommand) {
    assert.equal(mcp.isKnorviaCuaMcpCommand(entry.input), entry.output, entry.input);
  }
  for (const entry of fixture.mcp.cuaPackage) {
    assert.equal(mcp.isKnorviaCuaMcpPackageArg(entry.input), entry.output, entry.input);
  }
  for (const entry of fixture.mcp.convert) {
    const [name, config] = entry.input;
    assertJsonEqual(mcp.convertToKnorviaAgentMcpServer(name, config), entry.output, name);
  }
});
