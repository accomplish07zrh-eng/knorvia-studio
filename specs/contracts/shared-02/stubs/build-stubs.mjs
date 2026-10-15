// SPDX-License-Identifier: Apache-2.0
// shared-02 合同桩生成器：按本包 58 个继承模块的导出面生成「import 即抛」的最小桩。
//
// 桩只保留导出签名（函数体一律只抛错），模块在 import 时抛
// Error("not implemented: shared-02")，这样任何加载该模块的契约测试都会失败——
// 「桩替换后契约测试必须全部失败」是计划书「每包流程」四.1 的验证要求。
// 类型声明（interface / type）不参与运行时，省略；纯类型模块生成只剩抛错语句的桩。
//
// 用法（仓库根目录）：node specs/contracts/shared-02/stubs/build-stubs.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(here, "../../../..");

const scope = JSON.parse(readFileSync(join(contractDir, "scope-files.json"), "utf8"));
const targets = scope.files.map((file) => file.path).sort();
if (targets.length !== 58) {
  throw new Error(`shared-02 继承文件应为 58 个，实际 ${targets.length}`);
}

const HEADER = [
  "// SPDX-License-Identifier: Apache-2.0",
  "// shared-02 合同桩：<path>。",
  "// 只含 interface 面的导出签名（类型声明不参与运行时，省略）；import 即抛",
  "// not implemented: shared-02。桩只用于「桩替换后契约测试全部失败」的验证与替换阶段的",
  "// 起始状态，进入替换阶段后随合同桩目录一起退役。",
  "",
  'throw new Error("not implemented: shared-02");',
  "",
];

const runtimeSignature = (declaration) => {
  const kind = declaration.getKindName();
  if (kind === "FunctionDeclaration" || kind === "FunctionExpression") {
    const name = declaration.getName();
    return `export function ${name}(..._args: unknown[]): unknown {\n  throw new Error("not implemented: shared-02");\n}`;
  }
  if (kind === "ClassDeclaration") {
    const name = declaration.getName();
    return `export class ${name} {\n  constructor(..._args: unknown[]) {\n    throw new Error("not implemented: shared-02");\n  }\n}`;
  }
  if (kind === "VariableStatement") {
    const names = declaration
      .getDeclarations()
      .map((declarationItem) => declarationItem.getName())
      .join(", ");
    return `export const ${names}: unknown = (() => {\n  throw new Error("not implemented: shared-02");\n})();`;
  }
  if (kind === "EnumDeclaration") {
    return `export enum ${declaration.getName()} {\n  Placeholder = "not implemented: shared-02",\n}`;
  }
  return null;
};

const lines = [];
for (const path of targets) {
  const absolute = join(repoRoot, path);
  const { Project } = await import("ts-morph");
  const project = new Project({
    tsConfigFilePath: join(repoRoot, "tsconfig.base.json"),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  const sourceFile = project.addSourceFileAtPath(absolute);
  const chunks = [...HEADER];
  const exported = sourceFile.getExportedDeclarations();
  for (const declarations of exported.values()) {
    for (const declaration of declarations) {
      const signature = runtimeSignature(declaration);
      if (signature) {
        chunks.push(signature);
        chunks.push("");
      }
    }
  }
  const stubPath = join(contractDir, "stubs", path);
  mkdirSync(dirname(stubPath), { recursive: true });
  writeFileSync(stubPath, `${chunks.join("\n").trimEnd()}\n`);
  lines.push(path);
}
writeFileSync(join(contractDir, "stubs", "targets.txt"), `${lines.join("\n")}\n`);
console.log(`stubs: ${lines.length} 个目标`);
