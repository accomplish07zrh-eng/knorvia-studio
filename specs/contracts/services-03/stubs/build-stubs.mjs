// SPDX-License-Identifier: Apache-2.0
// services-03 合同桩生成器：根据 scope-files.json 与 exports-ast.mjs 为 31 个文件生成
// 最小桩实现（import 即抛 not implemented: services-03）。
//
// 桩的用途：验证契约测试对公开行为的防线有效性（置桩后测试必须全部失败）。
//
// 与 services-02 的差异：`domain/` 层没有「下沉端口」，31 个文件全部原地生成，
// 不需要 app/ 子目录，也不需要旧路径 re-export 壳。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractExports } from "../tests/exports-ast.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const STUB_ROOT = join(here, "packages/services/src");
const TARGETS_FILE = join(here, "targets.txt");
const SR_DIR = "studio-runtime/";
const STUB_MESSAGE = "not implemented: services-03";

rmSync(join(here, "packages"), { recursive: true, force: true });

const scopeJson = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));

const targetsList = [];

for (const row of scopeJson) {
  // domain/ 层全部原地：无下沉端口、无 app/ 子目录
  const modulePath = row.modulePath;
  targetsList.push(`packages/services/src/${SR_DIR}${modulePath}.ts`);

  const exports = extractExports(repoRoot, `${SR_DIR}${modulePath}.ts`);
  const lines = [
    "// SPDX-License-Identifier: Apache-2.0",
    `// services-03 合同桩：${SR_DIR}${modulePath}`,
    "// 运行期 import 即抛，用于验证契约测试对公开行为的防线有效性（contract-gate allFail）。",
    `throw new Error("${STUB_MESSAGE}");`,
    "",
  ];

  for (const exp of exports) {
    if (exp.kind === "star-reexport") {
      lines.push(exp.signature);
    } else if (exp.kind === "function") {
      lines.push(
        `export function ${exp.name}(..._args: unknown[]): unknown { throw new Error("${STUB_MESSAGE}"); }`,
      );
    } else if (exp.kind === "class") {
      lines.push(
        `export class ${exp.name} { constructor(..._args: unknown[]) { throw new Error("${STUB_MESSAGE}"); } }`,
      );
    } else if (exp.kind === "interface" || exp.kind === "type" || exp.kind === "type-reexport") {
      lines.push(`export type ${exp.name} = unknown;`);
    } else {
      lines.push(`export const ${exp.name}: unknown = undefined;`);
    }
  }

  const resolved = join(STUB_ROOT, `${SR_DIR}${modulePath}.ts`);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${lines.join("\n")}\n`, "utf8");
}

writeFileSync(TARGETS_FILE, `${targetsList.join("\n")}\n`, "utf8");
console.log(`build-stubs: 已生成 ${scopeJson.length} 个桩文件与 targets.txt`);
