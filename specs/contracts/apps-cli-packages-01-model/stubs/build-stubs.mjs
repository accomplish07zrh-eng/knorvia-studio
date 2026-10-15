// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01-model 桩生成器：从 interface.md 的导出签名生成最小桩。
//
// 桩只含 interface.md 列出的导出与签名：函数/方法体一律抛
// Error("not implemented: apps-cli-packages-01-model")；类型/接口原样保留；
// 常量给同类型占位值。产出写入 stubs/model/（提交入库），由 apply.mjs 覆盖/还原真实文件。
//
// 用法：node specs/contracts/apps-cli-packages-01-model/stubs/build-stubs.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = resolve(here, "..");
const interfaceText = readFileSync(join(contractDir, "interface.md"), "utf8");
const THROW = '  throw new Error("not implemented: apps-cli-packages-01-model");';

const sections = interfaceText.split(/^### /mu).slice(1);
rmSync(join(here, "model"), { recursive: true, force: true });

function braceDepth(line) {
  return (line.match(/\{/gu)?.length ?? 0) - (line.match(/\}/gu)?.length ?? 0);
}

function statementStub(text) {
  if (/^export (async )?function \b/u.test(text)) {
    return text.replace(/;\s*$/u, ` {\n${THROW}\n}`);
  }
  if (/^export const \b/u.test(text)) {
    return text.replace(/;\s*$/u, " = undefined as never;");
  }
  return text;
}

function memberStub(text) {
  const trimmed = text.trim();
  const looksMethod =
    /^(constructor\s*\(|(?:get|set)\s+\w+\s*\(|(?:async\s+)?[\w$#]+\s*\()/u.test(trimmed) ||
    /\)\s*:\s*[^;{]+;\s*$/u.test(trimmed);
  if (looksMethod) return text.replace(/;\s*$/u, ` {\n${THROW}\n  }`);
  return text;
}

let count = 0;
for (const section of sections) {
  const header = section.slice(0, section.indexOf("\n"));
  const modulePath = /`([^`]+)`/u.exec(header)?.[1];
  if (!modulePath?.startsWith("apps/cli/packages/adapters/src/model/")) continue;
  const code = /```ts\n([\s\S]*?)```/u.exec(section)?.[1];
  if (code === undefined) throw new Error(`缺少签名块: ${modulePath}`);
  const out = [];
  let buffer = [];
  let depth = 0;
  let inClass = false;
  for (const line of code.split("\n")) {
    if (inClass) {
      if (/^\s*\}\s*$/u.test(line)) {
        if (buffer.length) out.push(memberStub(buffer.join("\n")));
        out.push("}");
        buffer = [];
        inClass = false;
        continue;
      }
      buffer.push(line);
      depth += braceDepth(line);
      if (/;\s*$/u.test(line) && depth <= 0) {
        out.push(memberStub(buffer.join("\n")));
        buffer = [];
      }
      continue;
    }
    if (buffer.length === 0 && /^export class .* \{\s*$/u.test(line)) {
      out.push(line.trimEnd());
      inClass = true;
      depth = 0;
      continue;
    }
    buffer.push(line);
    depth += braceDepth(line);
    const endsStatement = /;\s*$/u.test(line) && depth <= 0;
    const endsBlock = depth <= 0 && /^\s*\}\s*;?\s*$/u.test(line);
    if (endsStatement || endsBlock) {
      out.push(statementStub(buffer.join("\n").trim()));
      buffer = [];
    }
  }
  if (buffer.length) out.push(statementStub(buffer.join("\n")));
  const name = modulePath.replace(/^apps\/cli\/packages\/adapters\/src\/model\//u, "");
  const target = join(here, "model", name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    `// SPDX-License-Identifier: Apache-2.0\n// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）\n${out.join("\n")}\n`,
    "utf8",
  );
  count += 1;
}
process.stdout.write(`build-stubs: ${count} 个桩已写入 stubs/model/\n`);
