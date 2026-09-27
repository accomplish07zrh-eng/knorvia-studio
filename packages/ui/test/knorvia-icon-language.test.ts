import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  readLucideExportMap,
  renderGeneratedModule,
} from "../../../scripts/generate-knorvia-icons.mjs";
import { KNORVIA_GLYPHS } from "../src/icons/knorviaGlyphs.js";
import { knorviaIconsPlugin, KNORVIA_LUCIDE_MODULE } from "../vite/knorviaIconsPlugin.js";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const GENERATED = resolve(REPO_ROOT, "packages/ui/src/icons/knorviaLucide.generated.ts");
const SOURCE_ROOTS = ["packages/ui/src", "packages/desktop/src/renderer", "packages/web/src"];
const NON_ICON_EXPORTS = new Set([
  "createLucideIcon",
  "Icon",
  "LucideIcon",
  "LucideProps",
  "LucideProvider",
  "IconNode",
]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : listSourceFiles(path);
    return /\.(tsx?|mts)$/u.test(name) ? [path] : [];
  });
}

function importedLucideNames(): Set<string> {
  const names = new Set<string>();
  for (const root of SOURCE_ROOTS) {
    for (const file of listSourceFiles(resolve(REPO_ROOT, root))) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']lucide-react["']/gu,
      )) {
        for (const raw of match[1].split(",")) {
          const name = raw
            .trim()
            .replace(/^type\s+/u, "")
            .split(/\s+as\s+/u)[0]
            ?.trim();
          if (name && !NON_ICON_EXPORTS.has(name)) names.add(name);
        }
      }
    }
  }
  return names;
}

test("生成的图标模块与字形表一致", async () => {
  assert.equal(readFileSync(GENERATED, "utf8"), await renderGeneratedModule());
});

test("界面里导入的每个 lucide 图标都由 Knorvia 字形接管，不会漏回原图", async () => {
  const generated = readFileSync(GENERATED, "utf8");
  const overridden = new Set(
    [...generated.matchAll(/export \{([^}]*)\}/gu)].flatMap((match) =>
      match[1].split(",").map(
        (part) =>
          part
            .trim()
            .split(/\s+as\s+/u)
            .pop() ?? "",
      ),
    ),
  );
  const exportMap = await readLucideExportMap();
  const missing = [...importedLucideNames()].filter(
    (name) => exportMap.has(name) && !overridden.has(name),
  );
  assert.deepEqual(missing, [], `缺少 Knorvia 字形：${missing.join(", ")}`);
});

test("图标目录外不再自建 lucide 图标，自定义图形统一走 Knorvia 基座", () => {
  const offenders = SOURCE_ROOTS.flatMap((root) =>
    listSourceFiles(resolve(REPO_ROOT, root)).filter(
      (file) =>
        !file.replaceAll("\\", "/").includes("/src/icons/") &&
        /\bcreateLucideIcon\b/u.test(readFileSync(file, "utf8")),
    ),
  );
  assert.deepEqual(offenders, []);
});

test("字形只用细线与同色纸片底，不写死颜色或线宽", () => {
  for (const [name, glyph] of Object.entries(KNORVIA_GLYPHS)) {
    assert.ok(glyph.length > 0, name);
    for (const [tag, attrs] of glyph) {
      assert.match(tag, /^(path|circle|rect|ellipse|line)$/u, name);
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "fill" || key === "stroke")
          assert.match(String(value), /^(currentColor|none)$/u, `${name}.${key}`);
        assert.notEqual(key, "strokeWidth", `${name} 不应覆盖统一线宽`);
        if (typeof value === "number") assert.ok(Number.isFinite(value), `${name}.${key}`);
      }
      if (tag === "path")
        assert.match(String(attrs.d), /^[Mm][-\d.\s,MmLlHhVvCcSsQqTtAaZz]+$/u, name);
    }
  }
});

test("Vite 插件把业务导入指向 Knorvia 模块，图标目录自身仍解析真实 lucide", async () => {
  const plugin = knorviaIconsPlugin();
  const resolveId = plugin.resolveId as (
    this: { resolve: (...args: unknown[]) => Promise<unknown> },
    source: string,
    importer: string | undefined,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
  const context = { resolve: async () => ({ id: "real-lucide" }) };
  assert.equal(
    await resolveId.call(
      context,
      "lucide-react",
      resolve(REPO_ROOT, "packages/ui/src/App.tsx"),
      {},
    ),
    KNORVIA_LUCIDE_MODULE,
  );
  assert.deepEqual(
    await resolveId.call(
      context,
      "lucide-react",
      resolve(REPO_ROOT, "packages/ui/src/icons/createKnorviaIcon.ts"),
      {},
    ),
    { id: "real-lucide" },
  );
  assert.equal(await resolveId.call(context, "react", undefined, {}), null);
});

test("内置插件与引导卡片使用 Knorvia 单色图标，不再引用彩色 PNG", () => {
  const pluginSource = readFileSync(
    resolve(REPO_ROOT, "packages/ui/src/lib/pluginIconSource.ts"),
    "utf8",
  );
  for (const id of [
    "browser-use",
    "documents",
    "image-search",
    "pdf",
    "plugin-creator",
    "presentations",
    "skill-creator",
    "spreadsheets",
  ]) {
    assert.match(pluginSource, new RegExp(`"${id}@knorvia-plugins-bundled": \\w+IconUrl`, "u"));
    const svg = readFileSync(
      resolve(REPO_ROOT, `packages/ui/src/assets/plugin-icons/${id}.svg`),
      "utf8",
    );
    assert.doesNotMatch(
      svg,
      /#(?!fff\b|18181a\b|3b3b3f\b|0f0f11\b)[0-9a-f]{3,6}\b/iu,
      `${id}.svg 只用黑白灰`,
    );
  }
  for (const file of [
    "packages/ui/src/lib/pluginIconSource.ts",
    "packages/ui/src/v4/featureSuggestedPrompts.ts",
    "packages/ui/src/settings/PluginStoreDetailView.tsx",
  ]) {
    const source = readFileSync(resolve(REPO_ROOT, file), "utf8");
    assert.doesNotMatch(
      source,
      /(plugin-icons|document-skill-icons)\/[\w@-]+\.png|onboarding\/assets\/(finder|terminal)\.png/u,
      file,
    );
  }
});

test("桌面启动壳：入场与退场动画都尊重减少动态效果，并保留双条件退场", () => {
  const html = readFileSync(resolve(REPO_ROOT, "packages/desktop/src/renderer/index.html"), "utf8");
  const reduced = html.slice(html.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const selector of [
    ".startup-logo-shell",
    ".knorvia-intro__strokes i",
    ".knorvia-intro__word",
  ]) {
    assert.ok(reduced.includes(selector), selector);
  }
  assert.match(reduced, /\[data-knorvia-enter-item\][\s\S]*animation: none/u);
  assert.match(html, /if \(finished \|\| !animationDone \|\| !reactReady\) return;/u);
  assert.match(html, /knorvia-react-startup-ready/u);
  assert.match(html, /window\.setTimeout\(markAnimationDone, 1400\)/u);
  assert.match(html, /classList\.remove\("knorvia-studio-entering"\)/u);
});
