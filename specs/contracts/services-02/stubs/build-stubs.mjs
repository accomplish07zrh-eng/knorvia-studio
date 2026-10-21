// SPDX-License-Identifier: Apache-2.0
// services-02 合同桩生成器：根据 scope-files.json 与 exports-ast.mjs 为 17 个文件生成
// 最小桩实现（import 即抛 not implemented: services-02）。
//
// 桩的用途：验证契约测试对公开行为的防御有效性（置桩后测试必须全部失败）。
// 端口文件按「下沉后」的目标路径生成，同时在旧路径保留 re-export 壳以模拟迁移形态。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractExports } from "../tests/exports-ast.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const STUB_ROOT = join(here, "packages/services/src");
const TARGETS_FILE = join(here, "targets.txt");
const SR_DIR = "studio-runtime/";

rmSync(join(here, "packages"), { recursive: true, force: true });

const scopeJson = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));

const targetsList = [];

for (const row of scopeJson) {
  const modulePath = row.modulePath;
  // 端口此时仍在 app/ 下，桩按基线位置生成（gate-old 打桩时源码也是基线形态）
  const subdir = row.role === "port" ? "app/" : "";
  const targetRel = `packages/services/src/${SR_DIR}${subdir}${modulePath}.ts`;
  targetsList.push(targetRel);

  const exports = extractExports(repoRoot, `${SR_DIR}${subdir}${modulePath}.ts`);
  const lines = [
    "// SPDX-License-Identifier: Apache-2.0",
    `// services-02 合同桩：${SR_DIR}${subdir}${modulePath}`,
    "// 运行时 import 即抛，用于验证契约测试对公开行为的防御有效性（contract-gate allFail）。",
    `throw new Error("not implemented: services-02");`,
    "",
  ];

  for (const exp of exports) {
    if (exp.kind === "star-reexport") {
      lines.push(exp.signature);
    } else if (exp.kind === "function") {
      lines.push(
        `export function ${exp.name}(..._args: unknown[]): unknown { throw new Error("not implemented: services-02"); }`,
      );
    } else if (exp.kind === "class") {
      lines.push(
        `export class ${exp.name} { constructor(..._args: unknown[]) { throw new Error("not implemented: services-02"); } }`,
      );
    } else if (exp.kind === "interface" || exp.kind === "type" || exp.kind === "type-reexport") {
      lines.push(`export type ${exp.name} = unknown;`);
    } else {
      lines.push(`export const ${exp.name}: unknown = undefined;`);
    }
  }

  const stubFilePath = join(STUB_ROOT, SR_DIR, subdir, `${modulePath}.ts`);
  mkdirSync(dirname(stubFilePath), { recursive: true });
  writeFileSync(stubFilePath, `${lines.join("\n")}\n`, "utf8");
}

writeFileSync(TARGETS_FILE, `${targetsList.join("\n")}\n`, "utf8");
console.log(`build-stubs: 已生成 ${scopeJson.length} 个桩文件与 targets.txt`);
void relative;
