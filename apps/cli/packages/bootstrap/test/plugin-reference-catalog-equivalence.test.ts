// 等价性验证：同一批输入分别喂给 core 原版与 inline 版，逐字节比对 JSON 输出。
// 这是内联的验收依据（catalog 原本没有测试）。
import assert from "node:assert/strict";
import test from "node:test";
import { buildPluginReferenceCatalog as coreBuild } from "../../core/src/plugin-reference/catalog.js";
import { buildPluginReferenceCatalog as inlineBuild } from "../src/protocol/plugin-reference-catalog-build.js";

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

/** 覆盖各类边界的一组输入。 */
const CASES = [
  { label: "空列表", input: [] },
  { label: "单个启用插件", input: [plugin()] },
  {
    label: "skill / agent / 其他 kind 混合",
    input: [
      plugin({
        components: [
          { kind: "skill", items: [{ name: "review" }, { name: "  trim  " }] },
          { kind: "agent", items: [{ name: "explorer" }] },
          { kind: "other", items: [{ name: "ignored" }] },
        ],
      }),
    ],
  },
  { label: "mcpServerNames 乱序", input: [plugin({ mcpServerNames: ["zeta", "alpha", "mu"] })] },
  {
    label: "同名冲突（2 启用 + 1 禁用）",
    input: [
      plugin({ id: "alpha@official" }),
      plugin({ id: "alpha@local" }),
      plugin({ id: "alpha@third", enabled: false }),
    ],
  },
  {
    label: "全部禁用",
    input: [
      plugin({ id: "a@x", enabled: false }),
      plugin({ id: "b@x", name: "b", enabled: false }),
    ],
  },
  {
    label: "多名字互不冲突",
    input: [plugin({ id: "alpha@official" }), plugin({ id: "beta@official", name: "beta" })],
  },
  {
    label: "空白 item 名",
    input: [plugin({ components: [{ kind: "skill", items: [{ name: "   " }, { name: "" }] }] })],
  },
  {
    label: "同名 3 个启用插件",
    input: [plugin({ id: "alpha@a" }), plugin({ id: "alpha@b" }), plugin({ id: "alpha@c" })],
  },
];

for (const { label, input } of CASES) {
  test(`inline 与 core 输出一致：${label}`, () => {
    const fromCore = coreBuild(input);
    const fromInline = inlineBuild(input);
    assert.deepEqual(fromInline, fromCore);
  });
}

test("inline 与 core 的 JSON 序列化逐字节一致", () => {
  for (const { label, input } of CASES) {
    assert.equal(JSON.stringify(inlineBuild(input)), JSON.stringify(coreBuild(input)), label);
  }
});
