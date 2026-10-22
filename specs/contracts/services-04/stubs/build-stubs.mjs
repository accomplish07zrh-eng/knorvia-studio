// SPDX-License-Identifier: Apache-2.0
// services-04 合同桩生成器：根据 scope-files.json 与 exports-ast.mjs 为 46 个实现文件生成
// 最小桩实现（import 即抛 not implemented: services-04）。
//
// 桩的用途：验证契约测试对公开行为的防线有效性（置桩后测试必须全部失败）。
//
// 与 services-02/03 的差异：
//   · 路径分散在 `packages/services/src` 的 7 个位置（根目录 + 6 个子目录），不是单一下沉目录；
//   · 包级聚合桶 `index.ts` / `node.ts` **不在替换范围**（它们是纯转发，见 K-z）；
//     但桩替换 46 个实现文件后，聚合桶的转发目标会失效 → 那属于「B 类加载失败」。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractExports } from "../tests/exports-ast.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const STUB_ROOT = join(here, "packages/services/src");
const TARGETS_FILE = join(here, "targets.txt");
const SRC_PREFIX = "packages/services/src/";
const STUB_MESSAGE = "not implemented: services-04";

rmSync(join(here, "packages"), { recursive: true, force: true });

const scopeJson = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));

const targetsList = [];

for (const row of scopeJson) {
  // row.name 形如 `terminal/terminalService.ts` 或 `paths.ts`（相对 packages/services/src）
  const stubRel = `${SRC_PREFIX}${row.name}`;
  targetsList.push(stubRel);

  const exports = extractExports(repoRoot, row.name);
  const lines = [
    "// SPDX-License-Identifier: Apache-2.0",
    `// services-04 合同桩：${row.name}`,
    "// 运行期 import 即抛，用于验证契约测试对公开行为的防线有效性（contract-gate allFail）。",
    `throw new Error("${STUB_MESSAGE}");`,
    "",
  ];

  for (const exp of exports) {
    if (exp.kind === "star-reexport") {
      lines.push(exp.signature);
    } else if (exp.kind === "function") {
      // 保留生成器标记，避免消费方在桩上做 `for...of` 时语法错
      const isGenerator = /function\s*\*/u.test(exp.signature);
      lines.push(
        isGenerator
          ? `export function* ${exp.name}(..._args: unknown[]): Generator<unknown> { throw new Error("${STUB_MESSAGE}"); }`
          : `export function ${exp.name}(..._args: unknown[]): unknown { throw new Error("${STUB_MESSAGE}"); }`,
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

  const resolved = join(STUB_ROOT, row.name);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${lines.join("\n")}\n`, "utf8");
}

writeFileSync(TARGETS_FILE, `${targetsList.join("\n")}\n`, "utf8");
console.log(`build-stubs: 已生成 ${scopeJson.length} 个桩文件与 targets.txt`);
