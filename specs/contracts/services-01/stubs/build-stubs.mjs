// SPDX-License-Identifier: Apache-2.0
// services-01 合同桩生成器：根据 scope-files.json 与 exports-ast.mjs 为 58 个继承 .ts 生成
// 最小桩实现（import 即抛 not implemented: services-01）。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractExports } from "../tests/exports-ast.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const STUB_ROOT = join(here, "packages/services/src");
const TARGETS_FILE = join(here, "targets.txt");

rmSync(join(here, "packages"), { recursive: true, force: true });

const scopeJson = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));
const tsFiles = scopeJson.filter((f) => f.path.endsWith(".ts"));

const targetsList = [];

for (const file of tsFiles) {
  const modulePath = file.modulePath;
  const targetRel = `packages/services/src/${modulePath}`;
  targetsList.push(targetRel);

  const exports = extractExports(repoRoot, modulePath);
  const lines = [
    "// SPDX-License-Identifier: Apache-2.0",
    `// services-01 合同桩：${modulePath}`,
    `// 运行时 import 即抛，用于验证契约测试对公开行为的防御有效性（contract-gate allFail）。`,
    `throw new Error("not implemented: services-01");`,
    "",
  ];

  for (const exp of exports) {
    if (exp.kind === "star-reexport") {
      lines.push(`${exp.signature};`);
    } else if (exp.kind === "function") {
      lines.push(
        `export function ${exp.name}(..._args: unknown[]): unknown { throw new Error("not implemented: services-01"); }`,
      );
    } else if (exp.kind === "class") {
      lines.push(
        `export class ${exp.name} { constructor(..._args: unknown[]) { throw new Error("not implemented: services-01"); } }`,
      );
    } else if (exp.kind === "const" || exp.kind === "reexport") {
      lines.push(`export const ${exp.name}: unknown = undefined;`);
    } else if (exp.kind === "interface" || exp.kind === "type" || exp.kind === "type-reexport") {
      lines.push(`export type ${exp.name} = unknown;`);
    } else {
      lines.push(`export const ${exp.name}: unknown = undefined;`);
    }
  }

  const stubFilePath = join(STUB_ROOT, modulePath);
  mkdirSync(dirname(stubFilePath), { recursive: true });
  writeFileSync(stubFilePath, `${lines.join("\n")}\n`, "utf8");
}

writeFileSync(TARGETS_FILE, `${targetsList.join("\n")}\n`, "utf8");
console.log(`build-stubs: 已生成 ${tsFiles.length} 个桩文件与 targets.txt`);
