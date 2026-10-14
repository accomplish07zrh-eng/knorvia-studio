// SPDX-License-Identifier: Apache-2.0
// 从 interface.md 生成 apps-cli-packages-01 的最小桩（每个将被删除的模块路径一个文件）。
//
// 桩只保留 interface.md 列出的导出名与函数签名；函数体与类构造体一律抛
// Error("not implemented: apps-cli-packages-01")。类型声明不参与运行时，直接省略；
// 纯类型模块生成 `export {};`。
//
// 用法（仓库根目录）：node specs/contracts/apps-cli-packages-01/stubs/build-stubs.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const repoRoot = resolve(contractDir, "../../..");
const interfacePath = join(contractDir, "interface.md");

const NOT_IMPLEMENTED = 'throw new Error("not implemented: apps-cli-packages-01")';
const HEADER = [
  "// SPDX-License-Identifier: Apache-2.0",
  "// 桩：只含 interface.md 列出的导出与签名，函数体抛 not implemented。",
  "// 仅用于「桩替换后契约测试全部失败」的验证与替换阶段的起始状态。",
].join("\n");

/** 从 interface.md 取出每个模块路径对应的 ts 代码块。 */
export function parseInterface(markdown) {
  const sections = new Map();
  const heading = /^### `([^`]+)`$/gmu;
  const matches = [...markdown.matchAll(heading)];
  for (let index = 0; index < matches.length; index += 1) {
    const path = matches[index][1];
    const body = markdown.slice(matches[index].index, matches[index + 1]?.index ?? markdown.length);
    const blocks = [...body.matchAll(/```ts\n([\s\S]*?)```/gu)].map((match) => match[1]);
    sections.set(path, blocks);
  }
  return sections;
}

function declarationNames(block) {
  const names = new Set();
  for (const match of block.matchAll(
    /^export (?:async )?(?:function|class|const) ([A-Za-z_$][\w$]*)/gmu,
  )) {
    names.add(match[1]);
  }
  for (const match of block.matchAll(/^([A-Za-z_$][\w$]*) = .*;$/gmu)) names.add(match[1]);
  return names;
}

/** 把一个 interface.md 声明块转成桩代码。 */
export function stubBlock(block) {
  const lines = block.split("\n");
  const output = [];
  const reexportNames = new Set();
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      index += 1;
      continue;
    }
    // 纯类型声明：跳过
    if (/^export (?:interface|type) /u.test(trimmed)) {
      index = skipDeclaration(lines, index);
      continue;
    }
    if (/^export \{/u.test(trimmed)) {
      const end = lines.findIndex(
        (candidate, position) => position >= index && candidate.includes("} from "),
      );
      const chunk = lines.slice(index, end < 0 ? lines.length : end + 1).join(" ");
      const inner = chunk.slice(chunk.indexOf("{") + 1, chunk.lastIndexOf("}"));
      for (const raw of inner.split(",")) {
        const name = raw
          .trim()
          .replace(/^type\s+/u, "")
          .trim();
        if (/^[A-Za-z_$][\w$]*$/u.test(name) && !/^type$/u.test(name)) reexportNames.add(name);
      }
      index = end < 0 ? lines.length : end + 1;
      continue;
    }
    if (/^export \* from /u.test(trimmed)) {
      index += 1;
      continue;
    }
    // 常量（带值）：保留字面值，补上 export
    const constant = /^([A-Za-z_$][\w$]*) = (.+);$/u.exec(trimmed);
    if (constant) {
      output.push(`export const ${constant[1]} = ${constant[2]};`);
      index += 1;
      continue;
    }
    // export const NAME: T = ... / export const NAME = ...
    const exportedConstant = /^export const ([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(.+);$/u.exec(
      trimmed,
    );
    if (exportedConstant) {
      output.push(`export const ${exportedConstant[1]} = ${exportedConstant[2]};`);
      index += 1;
      continue;
    }
    const bareConstant = /^export const ([A-Za-z_$][\w$]*)\s*:[^=]+$/u.exec(trimmed);
    if (bareConstant) {
      output.push(`export const ${bareConstant[1]}: never = undefined as never;`);
      index += 1;
      continue;
    }
    // 类
    if (/^export (?:abstract )?class /u.test(trimmed)) {
      const name = /^export (?:abstract )?class ([A-Za-z_$][\w$]*)/u.exec(trimmed)[1];
      const extendsError = /extends Error/u.test(trimmed);
      const end = findBlockEnd(lines, index);
      index = end + 1;
      if (extendsError) {
        output.push(
          `export class ${name} extends Error {\n  constructor(..._args: never[]) {\n    super("not implemented: apps-cli-packages-01");\n    ${NOT_IMPLEMENTED};\n  }\n}`,
        );
      } else {
        output.push(
          `export class ${name} {\n  constructor(..._args: never[]) {\n    ${NOT_IMPLEMENTED};\n  }\n}`,
        );
      }
      continue;
    }
    // 函数（可能跨多行，以 `;` 结束）
    if (/^export (?:async )?function /u.test(trimmed)) {
      const end = findSignatureEnd(lines, index);
      const signature = lines
        .slice(index, end + 1)
        .join("\n")
        .replace(/;\s*$/u, "");
      output.push(`${signature} {\n  ${NOT_IMPLEMENTED};\n}`);
      index = end + 1;
      continue;
    }
    index += 1;
  }
  for (const name of reexportNames) {
    const declared = new RegExp(`export (?:const|function|class) ${name}\\b`, "u").test(
      output.join("\n"),
    );
    if (!declared) output.push(`export const ${name}: never = undefined as never;`);
  }
  return output.join("\n\n");
}

function skipDeclaration(lines, start) {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    for (const character of lines[index]) {
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
    }
    if (
      depth <= 0 &&
      /[;}]$/u.test(lines[index].trim()) &&
      (index > start || lines[index].includes(";"))
    )
      return index + 1;
  }
  return lines.length;
}

function findBlockEnd(lines, start) {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    for (const character of lines[index]) {
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
    }
    if (depth === 0) return index;
  }
  return lines.length - 1;
}

function findSignatureEnd(lines, start) {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    for (const character of line) {
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
    }
    if (depth <= 0 && /;\s*$/u.test(line)) return index;
  }
  return start;
}

export function stubSource(blocks) {
  const parts = blocks.map((block) => stubBlock(block)).filter((text) => text.trim().length > 0);
  const body = parts.length > 0 ? parts.join("\n\n") : "export {};";
  return `${HEADER}\n\n${body}\n`;
}

const markdown = await readFile(interfacePath, "utf8");
const sections = parseInterface(markdown);
let written = 0;
for (const [modulePath, blocks] of sections) {
  const target = join(here, modulePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, stubSource(blocks), "utf8");
  written += 1;
}
console.log(`wrote ${written} stubs under ${here}`);
