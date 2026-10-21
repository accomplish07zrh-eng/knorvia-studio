// SPDX-License-Identifier: Apache-2.0
// B4–B7 + B14–B15：纯逻辑层不变量（无 I/O、无环境变量、无子进程、无模块级可变状态）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { isDist, repoRoot } from "./entry.mjs";
import { scope } from "./scope.mjs";
import { loadDeclaredExports } from "./runtime-guard.mjs";
import { ensureLoadable } from "./load-guard.mjs";

function readSource(row) {
  const rel = row.path.replace(/^packages\/services\/src\//u, "");
  return readFileSync(join(repoRoot, "packages/services/src", rel), "utf8");
}

const sources = new Map(scope.map((row) => [row.modulePath, readSource(row)]));

/** 只匹配「裸 import / require」的模块说明符，避免把注释里的字面量算进来。 */
function importedSpecifiers(source) {
  const specifiers = [];
  for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gu)) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(
    /(?:^|\n)\s*(?:const|let|var)\s+[^=]*=\s*require\s*\(\s*"([^"]+)"/gu,
  )) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

/** 去掉注释与字符串字面量，避免「注释里提到 process.env」造成误报。 */
function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|\n)\s*\/\/.*(?=\n|$)/gu, "$1")
    .replace(/"(?:[^"\\]|\\.)*"/gu, '""')
    .replace(/'(?:[^'\\]|\\.)*'/gu, "''")
    .replace(/`(?:[^`\\]|\\.)*`/gu, "``");
}

describe(`purity（${isDist ? "dist" : "source"} 入口）`, () => {
  test("B4 无 I/O 依赖：不 import 任何 node I/O 内置模块", async () => {
    await ensureLoadable();
    const forbidden = [
      "node:fs",
      "node:fs/promises",
      "fs",
      "fs/promises",
      "node:child_process",
      "child_process",
      "node:net",
      "net",
      "node:http",
      "http",
      "node:https",
      "https",
      "node:dgram",
      "dgram",
      "node:tls",
      "tls",
      "node:worker_threads",
      "worker_threads",
    ];
    const violations = [];
    for (const [modulePath, source] of sources) {
      for (const specifier of importedSpecifiers(source)) {
        if (forbidden.includes(specifier)) violations.push(`${modulePath}: ${specifier}`);
      }
    }
    assert.deepEqual(violations, [], `domain 层不得有 I/O 依赖：${violations.join(", ")}`);
  });

  test("B5 无环境变量读取：不出现 process.env", async () => {
    await ensureLoadable();
    const violations = [];
    for (const [modulePath, source] of sources) {
      if (/process\s*\.\s*env/u.test(stripCommentsAndStrings(source))) {
        violations.push(modulePath);
      }
    }
    assert.deepEqual(violations, [], `domain 层不得读 process.env：${violations.join(", ")}`);
  });

  test("B6 无子进程：不调用 child_process 的 spawn/exec/fork", async () => {
    await ensureLoadable();
    const violations = [];
    for (const [modulePath, source] of sources) {
      for (const specifier of importedSpecifiers(source)) {
        if (specifier === "node:child_process" || specifier === "child_process") {
          violations.push(`${modulePath}: imports child_process`);
        }
      }
      // 只在去掉注释/字符串后匹配调用形态，避免 `regex.exec()` 之类的误报
      const code = stripCommentsAndStrings(source);
      if (/(?:^|[^.\w])(?:spawn|spawnSync|execFile|execFileSync|execSync|fork)\s*\(/u.test(code)) {
        violations.push(`${modulePath}: child_process 调用`);
      }
    }
    assert.deepEqual(violations, [], `domain 层不得启动子进程：${violations.join(", ")}`);
  });

  test("B7 无模块级可变状态：不出现顶层 let/var", async () => {
    await ensureLoadable();
    const violations = [];
    for (const [modulePath, source] of sources) {
      const code = stripCommentsAndStrings(source);
      if (/^(?:export\s+)?(?:let|var)\s+[A-Za-z0-9_$]/mu.test(code)) violations.push(modulePath);
    }
    assert.deepEqual(violations, [], `domain 层不得有顶层 let/var：${violations.join(", ")}`);
  });

  test("B14 两个「零外部引用」模块必须保留且可加载", async () => {
    await ensureLoadable();
    for (const name of ["staticPng", "referencePath"]) {
      const row = scope.find((item) => item.modulePath === `domain/${name}`);
      assert(row !== undefined, `${name} 应在 scope 内`);
      const { loaded, exports } = await loadDeclaredExports(row);
      assert.equal(typeof loaded, "object", `${name} 应可加载`);
      assert(exports.length > 0, `${name} 应有导出`);
      assert.equal(exports.length, row.exportCount, `${name} 的导出数应与 scope 记录一致`);
    }
  });

  test("B14 staticPng 被 imageInput 使用（不是死代码）", async () => {
    await ensureLoadable();
    const source = sources.get("domain/imageInput");
    assert.match(source, /from\s+"\.\/staticPng\.js"/u, "imageInput 应 import staticPng");
    assert.match(source, /\bvalidateStaticPng\s*\(/u, "imageInput 应调用 validateStaticPng");
  });

  test("B15 referencePath 被 reference 使用，且职责分离", async () => {
    await ensureLoadable();
    const reference = sources.get("domain/reference");
    const referencePath = sources.get("domain/referencePath");
    assert.match(reference, /from\s+"\.\/referencePath\.js"/u, "reference 应 import referencePath");
    assert.match(
      reference,
      /\bstudioReferencePathReason\s*\(/u,
      "reference 应调用 studioReferencePathReason",
    );

    // referencePath 是纯规则：不得 import reference（不能反向依赖形成环）
    assert.doesNotMatch(
      referencePath,
      /from\s+"\.\/reference\.js"/u,
      "referencePath 不得反向 import reference",
    );
    // referencePath 更应保持无层内依赖（纯规则叶子）
    assert.doesNotMatch(
      referencePath,
      /from\s+"\.\/[A-Za-z0-9_$]+\.js"/u,
      "referencePath 应是叶子",
    );
  });
});
