#!/usr/bin/env node
// 生成 packages/ui/src/icons/knorviaLucide.generated.ts：
// 以 lucide-react 为底，把 icons/glyphs/*.ts 中每个字形连同它在 lucide 中的全部别名一起覆盖导出。
// 用法：node scripts/generate-knorvia-icons.mjs [--check]
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = resolve(ROOT, "packages/ui/src/icons");
const GLYPHS_DIR = resolve(ICONS_DIR, "glyphs");
const OUTPUT_FILE = resolve(ICONS_DIR, "knorviaLucide.generated.ts");

/** 从 lucide 类型声明的总导出里建立「导出名 → 规范名」映射。 */
export async function readLucideExportMap() {
  const require = createRequire(resolve(ROOT, "packages/ui/package.json"));
  const pkgDir = dirname(require.resolve("lucide-react/package.json"));
  const dts = await readFile(resolve(pkgDir, "dist/lucide-react.d.ts"), "utf8");
  const exportBlocks = [...dts.matchAll(/export\s*\{([^}]*)\}/g)].map((match) => match[1]);
  const map = new Map();
  for (const block of exportBlocks) {
    for (const raw of block.split(",")) {
      const entry = raw.trim().replace(/^type\s+/, "");
      if (!entry) continue;
      const [local, exported = local] = entry.split(/\s+as\s+/).map((part) => part.trim());
      map.set(exported, local);
    }
  }
  return map;
}

/** 按文件名顺序读取各主题字形文件的顶层键；同名键会在合并时互相覆盖，因此直接报错。 */
export async function readGlyphNames() {
  const files = (await readdir(GLYPHS_DIR)).filter((name) => name.endsWith(".ts")).sort();
  const names = [];
  for (const file of files) {
    const source = await readFile(resolve(GLYPHS_DIR, file), "utf8");
    for (const [, name] of source.matchAll(/^ {2}([A-Z][A-Za-z0-9]*):/gm)) {
      if (names.includes(name)) throw new Error(`knorvia glyphs: "${name}" 重复定义（${file}）`);
      names.push(name);
    }
  }
  return names;
}

const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

export async function renderGeneratedModule() {
  const exportMap = await readLucideExportMap();
  const glyphNames = await readGlyphNames();
  const canonicalByGlyph = new Map();
  for (const glyph of glyphNames) {
    const canonical = exportMap.get(glyph);
    if (!canonical) throw new Error(`knorviaGlyphs: "${glyph}" 不是 lucide-react 的导出名`);
    const previous = [...canonicalByGlyph.entries()].find(([, value]) => value === canonical);
    if (previous) throw new Error(`knorviaGlyphs: "${glyph}" 与 "${previous[0]}" 是同一图标`);
    canonicalByGlyph.set(glyph, canonical);
  }
  const lines = [
    "// 由 scripts/generate-knorvia-icons.mjs 生成，请勿手改；修改字形请编辑 icons/glyphs/ 后重新生成。",
    "// 所有 `lucide-react` 导入经 packages/ui/vite/knorviaIconsPlugin.ts 指向本模块。",
    'export * from "lucide-react";',
    'import { createKnorviaIcon } from "./createKnorviaIcon.js";',
    'import { KNORVIA_GLYPHS as G } from "./knorviaGlyphs.js";',
    "",
  ];
  for (const [glyph, canonical] of canonicalByGlyph) {
    const aliases = [...exportMap.entries()]
      .filter(([exported, local]) => local === canonical && exported !== glyph)
      .map(([exported]) => exported)
      .sort();
    // 每个字形一行：声明与全部别名导出放在一起，便于审阅，也让生成文件保持在行数上限内。
    lines.push(
      `const ${glyph} = /* @__PURE__ */ createKnorviaIcon("${kebab(canonical)}", G.${glyph}); export { ${[glyph, ...aliases.map((alias) => `${glyph} as ${alias}`)].join(", ")} };`,
    );
  }
  return `${lines.join("\n")}\n`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const next = await renderGeneratedModule();
  if (process.argv.includes("--check")) {
    const current = await readFile(OUTPUT_FILE, "utf8").catch(() => "");
    if (current !== next) {
      console.error(
        "knorviaLucide.generated.ts 已过期，请运行 node scripts/generate-knorvia-icons.mjs",
      );
      process.exit(1);
    }
    console.log("knorviaLucide.generated.ts 与字形表一致");
  } else {
    await writeFile(OUTPUT_FILE, next, "utf8");
    console.log(`已生成 ${OUTPUT_FILE}`);
  }
}
