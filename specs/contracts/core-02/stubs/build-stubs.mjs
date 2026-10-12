// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// core-02 合同桩生成器：按 interface.md 的模块清单，为 6 个区域各生成一个「import 即抛」的桩。
// 桩只保留 interface.md 列出的导出名（类型不参与运行时，省略）；每个桩模块在 import 时抛错，
// 这样任何加载该模块的测试都会失败——桩替换验证要求契约测试全部失败。
//
// 用法（仓库根目录）：node specs/contracts/core-02/stubs/build-stubs.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const contractDir = resolve(here, "..");
const interfaceText = await readFile(join(contractDir, "interface.md"), "utf8");

// 每个区域各取一个「被至少一个测试触碰」的模块作为桩目标。
const targets = [
  "memory/project-root.ts",
  "model/auxiliary-model-options.ts",
  "permission/workflow-draft-path.ts",
  "plugin-reference/references.ts",
  "runtime-task/registry.ts",
  "session-context/utils.ts",
];

function exportsOf(modulePath) {
  const start = interfaceText.indexOf(`### \`${modulePath}\``);
  if (start < 0) throw new Error(`interface.md 缺少 ${modulePath}`);
  const next = interfaceText.indexOf("\n### `", start + 1);
  const block = interfaceText.slice(start, next < 0 ? undefined : next);
  const names = [];
  for (const line of block.split("\n")) {
    const match = /^- `([^`]+)` \(([^)]+)\)/u.exec(line);
    if (!match) continue;
    const [, name, kind] = match;
    if (kind === "InterfaceDeclaration" || kind === "TypeAliasDeclaration") continue;
    names.push({ name, kind });
  }
  return names;
}

const runtimeOnly = /\b(?:declare\s+)?(?:function|class|const|let|var|enum)\b/u;

for (const relative of targets) {
  const names = exportsOf(relative);
  const lines = [
    "// SPDX-License-Identifier: MIT",
    "// Copyright (c) 2026 Knorvia Studio contributors",
    `// core-02 合同桩：${relative.replace(/\.ts$/u, "")}。import 即抛，函数体一律抛 not implemented: core-02。`,
    "// 桩只用于「桩替换后契约测试必须全失败」的验证，进入替换阶段后随合同桩目录一起退役。",
    'throw new Error("not implemented: core-02");',
    "",
  ];
  for (const { name, kind } of names) {
    if (!runtimeOnly.test(kind)) continue;
    if (kind === "ClassDeclaration") {
      lines.push(
        `export class ${name} {`,
        "  constructor() {",
        '    throw new Error("not implemented: core-02");',
        "  }",
        "}",
        "",
      );
      continue;
    }
    if (kind === "VariableDeclaration") {
      lines.push(
        `export const ${name} = new Proxy(function () {`,
        '  throw new Error("not implemented: core-02");',
        "}, {",
        "  get() {",
        '    throw new Error("not implemented: core-02");',
        "  },",
        "  apply() {",
        '    throw new Error("not implemented: core-02");',
        "  },",
        "});",
        "",
      );
      continue;
    }
    lines.push(
      `export function ${name}() {`,
      '  throw new Error("not implemented: core-02");',
      "}",
      "",
    );
  }
  const absolute = join(here, "apps", "cli", "packages", "core", "src", relative);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${lines.join("\n")}\n`, "utf8");
  const target = join(repoRoot, "apps", "cli", "packages", "core", "src", relative)
    .split("\\")
    .join("/")
    .slice(repoRoot.split("\\").join("/").length + 1);
  console.log(`stub ${relative} (${names.length} 个导出名) -> ${target}`);
}
