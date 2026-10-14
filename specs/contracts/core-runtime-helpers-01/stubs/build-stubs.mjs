// SPDX-License-Identifier: Apache-2.0
// core-runtime-helpers-01 合同桩生成器：按本包 60 个继承模块的源码导出面生成「import 即抛」的最小桩。
//
// 桩只保留导出签名（函数体一律只抛错），模块在 import 时抛
// Error("not implemented: core-runtime-helpers-01")，这样任何加载该模块的契约测试都会失败——
// 「桩替换后契约测试必须全部失败」是计划书「每包流程」四.1 的验证要求。
// 类型声明（interface / type）不参与运行时，省略；纯类型模块生成只剩抛错语句的桩。
//
// 用法（仓库根目录）：node specs/contracts/core-runtime-helpers-01/stubs/build-stubs.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(here, "../../../..");

const scope = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));
const targets = scope.files.map((file) => file.path).sort();
if (targets.length !== 60) {
  throw new Error(`core-runtime-helpers-01 继承文件应为 60 个，实际 ${targets.length}`);
}

const NOTICE = "not implemented: core-runtime-helpers-01";

const HEADER = [
  "// SPDX-License-Identifier: Apache-2.0",
  "// core-runtime-helpers-01 合同桩：<path>。",
  "// 只含 interface 面的导出签名（类型声明不参与运行时，省略）；import 即抛",
  `// ${NOTICE}。桩只用于「桩替换后契约测试全部失败」的验证与替换阶段的`,
  "// 起始状态，进入替换阶段后随合同桩目录一起退役。",
];

const DECLARATION_PATTERNS = [
  { kind: "function", pattern: /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gmu },
  { kind: "class", pattern: /^\s*export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/gmu },
  { kind: "value", pattern: /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gmu },
  { kind: "value", pattern: /^\s*export\s+(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/gmu },
];

const REEXPORT_PATTERN = /^\s*export\s*(type\s*)?\{([^}]+)\}\s*(?:from\s*['"][^'"]+['"])?\s*;?/gmu;

/** 从源码提取运行时导出名（类型导出不进运行时，跳过）。 */
function runtimeExportsOf(source) {
  const found = [];
  for (const { kind, pattern } of DECLARATION_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.push({ name: match[1], kind });
  }
  for (const match of source.matchAll(REEXPORT_PATTERN)) {
    if (match[1]) continue; // export type { ... } 全是类型
    for (const raw of match[2].split(",")) {
      const name = raw.trim().replace(/^type\s+/u, "");
      if (/^[A-Za-z_$][\w$]*$/u.test(name) && name !== "type") found.push({ name, kind: "value" });
    }
  }
  const unique = new Map();
  for (const entry of found) if (!unique.has(entry.name)) unique.set(entry.name, entry);
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name, "en"));
}

const report = [];
let exportTotal = 0;
for (const relative of targets) {
  const source = readFileSync(join(repoRoot, relative), "utf8");
  const exports = runtimeExportsOf(source);
  exportTotal += exports.length;
  const lines = HEADER.map((line) => line.replace("<path>", relative));
  // 先抛错再声明：链接期需要导出名在场（否则 ESM 在求值前就以缺导出报错），
  // 求值时第一条语句抛 not implemented，任何加载该模块的测试都会失败。
  lines.push("", `throw new Error("${NOTICE}");`, "");
  for (const { name, kind } of exports) {
    if (kind === "function") {
      lines.push(
        `export function ${name}(..._args: unknown[]): unknown {`,
        `  throw new Error("${NOTICE}");`,
        "}",
        "",
      );
    } else if (kind === "class") {
      lines.push(
        `export class ${name} {`,
        "  constructor(..._args: unknown[]) {",
        `    throw new Error("${NOTICE}");`,
        "  }",
        "}",
        "",
      );
    } else {
      lines.push(`export const ${name}: unknown = undefined;`);
    }
  }
  lines.push("");
  const stubPath = join(here, relative);
  mkdirSync(dirname(stubPath), { recursive: true });
  writeFileSync(stubPath, lines.join("\n"), "utf8");
  report.push(`${relative}: ${exports.length} 个运行时导出`);
}

writeFileSync(join(here, "targets.txt"), `${targets.join("\n")}\n`, "utf8");
console.log(
  `core-runtime-helpers-01 桩生成完成：${targets.length} 个模块 / ${exportTotal} 个运行时导出`,
);
console.log(report.join("\n"));
