#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 校验「新引擎路径（dsh）对旧运行时包 @knorvia/core 的独立性」。
//
// ## 为什么需要这个门禁
//
// kernel-switch 的收尾动作是「删 core + 删 legacy 路径 + 切换默认引擎」。
// 其中「删 core」的前提是：**新引擎路径完全不依赖 @knorvia/core**。
//
// 新引擎路径的定义：
//   `run.ts` 在 `KNORVIA_KERNEL_ENGINE=dsh` 时直接
//   `await import("@knorvia/bootstrap/kernel")` → 即 `kernel/index.ts`，
//   **不加载 `app/` 层**。
//
// 所以本脚本从 `bootstrap/src/kernel/index.ts` 出发，沿 import 递归展开，
// 遇到 `@knorvia/core` 就记为违规。违规数 > 0 时退出码为 1。
//
// ## 两个曾经漏掉的盲区（本脚本已修正）
//
// ① **入口不完整**：`kernel/process.ts` 用 `await import("../kernel-bridge/entry.js")`
//    动态加载 kernel-bridge，所以 kernel-bridge/ 也在新引擎路径上。
//    → 本脚本递归展开相对路径，动态 import 同样处理。
//
// ② **多行 import 的收尾行**：
//    ```ts
//    import {
//      someSymbol,
//    } from "@knorvia/core";   // ← 这一行不以 import 开头
//    ```
//    用 `^import .*<pkg>` 匹配会漏掉它。
//    → 本脚本匹配任意位置的 `from "<spec>"` 与 `import("<spec>")`。
//
// ## 用法
//
//   node scripts/verify-dsh-core-independence.mjs           # 校验（违规则退出 1）
//   node scripts/verify-dsh-core-independence.mjs --verbose # 额外列出访问到的文件
//
// 纯 Node 实现，无外部依赖，可在 CI 直接跑。

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BOOTSTRAP_DIR = join(REPO_ROOT, "apps/cli/packages/bootstrap");
const ENTRY = join(BOOTSTRAP_DIR, "src/kernel/index.ts");
const FORBIDDEN_PACKAGE = "@knorvia/core";

const verbose = process.argv.includes("--verbose");

/**
 * 收集所有 workspace 包，供「跨包 import」解析用。
 *
 * @returns {Map<string, { dir: string, srcDir: string, manifest: object }>}
 */
function collectWorkspacePackages() {
  const packages = new Map();
  for (const root of ["packages", "apps/cli/packages"]) {
    const absoluteRoot = join(REPO_ROOT, root);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot)) {
      const manifestPath = join(absoluteRoot, entry, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (typeof manifest.name !== "string") continue;
      packages.set(manifest.name, {
        dir: join(absoluteRoot, entry),
        srcDir: join(absoluteRoot, entry, "src"),
        manifest,
      });
    }
  }
  return packages;
}

const WORKSPACE_PACKAGES = collectWorkspacePackages();

/**
 * 把 `@scope/name/subpath` 解析到源码文件（优先按 package.json 的 exports）。
 *
 * @returns {string | undefined} 源码绝对路径
 */
function resolvePackageSpecifier(specifier) {
  const segments = specifier.split("/");
  const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
  const subpath = specifier.startsWith("@")
    ? segments.slice(2).join("/")
    : segments.slice(1).join("/");
  const pkg = WORKSPACE_PACKAGES.get(name);
  if (pkg === undefined) return undefined;

  const exportsField = pkg.manifest.exports;
  const key = subpath.length === 0 ? "." : `./${subpath}`;
  const target = exportsField?.[key];
  const rawPath = typeof target === "string" ? target : (target?.import ?? target?.types);
  if (typeof rawPath === "string") {
    const resolved = resolve(pkg.dir, rawPath);
    // exports 常指向 dist/，映射回 src/ 才能继续展开源码依赖。
    const srcCandidate = resolved.replace(/\/dist\//u, "/src/").replace(/\.d\.ts$/u, ".ts");
    for (const candidate of [srcCandidate, resolved, srcCandidate.replace(/\.js$/u, ".ts")]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return normalize(candidate);
    }
  }
  for (const candidate of [
    join(pkg.srcDir, "index.ts"),
    join(pkg.srcDir, `${subpath}.ts`),
    join(pkg.srcDir, subpath, "index.ts"),
  ]) {
    if (existsSync(candidate)) return normalize(candidate);
  }
  return undefined;
}

/** 把相对 import 解析到源码文件。 */
function resolveRelativeSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [
    `${base.replace(/\.js$/u, ".ts")}`,
    `${base}.ts`,
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate)) return normalize(candidate);
  }
  return undefined;
}

/**
 * 读出一个文件引用的所有模块说明符。
 *
 * 覆盖三种写法，避免「多行 import 收尾行」的盲区：
 *   · `from "<spec>"`（含多行 import 的收尾行）
 *   · `import("<spec>")`（动态 import）
 *   · `require("<spec>")`
 */
function readModuleSpecifiers(file) {
  const text = readFileSync(file, "utf8");
  const specifiers = new Set();
  for (const match of text.matchAll(/\bfrom\s+["']([^"']+)["']/gu)) specifiers.add(match[1]);
  for (const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu))
    specifiers.add(match[1]);
  for (const match of text.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu))
    specifiers.add(match[1]);
  return [...specifiers];
}

/** 主扫描：从新引擎入口递归展开依赖。 */
function scan() {
  const visitedFiles = new Set();
  const visitedPackages = new Set();
  const violations = [];
  const queue = [normalize(ENTRY)];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || visitedFiles.has(current)) continue;
    if (!existsSync(current)) continue;
    visitedFiles.add(current);

    for (const specifier of readModuleSpecifiers(current)) {
      if (specifier === FORBIDDEN_PACKAGE || specifier.startsWith(`${FORBIDDEN_PACKAGE}/`)) {
        violations.push({ file: relative(REPO_ROOT, current), specifier });
        continue;
      }
      const relativeResolved = resolveRelativeSpecifier(current, specifier);
      if (relativeResolved !== undefined) {
        if (!visitedFiles.has(relativeResolved)) queue.push(relativeResolved);
        continue;
      }
      if (specifier.startsWith("@knorvia/")) {
        const resolved = resolvePackageSpecifier(specifier);
        if (resolved !== undefined) {
          visitedPackages.add(specifier.split("/").slice(0, 2).join("/"));
          if (!visitedFiles.has(resolved)) queue.push(resolved);
        }
      }
    }
  }

  return { visitedFiles, visitedPackages, violations };
}

/**
 * 从违规文件里取出它实际引用的禁用包符号。
 *
 * @returns {string[]}
 */
function readViolationSymbols(relativeFile) {
  const absolute = join(REPO_ROOT, relativeFile);
  if (!existsSync(absolute)) return [];
  const text = readFileSync(absolute, "utf8");
  const match = text.match(
    new RegExp(`import\\s*(?:type\\s*)?\\{([^}]+)\\}\\s*from\\s*["']${FORBIDDEN_PACKAGE}["']`, "u"),
  );
  if (match === null) return [];
  return match[1]
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0);
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------
if (!existsSync(ENTRY)) {
  console.error(`✗ 找不到新引擎入口: ${relative(REPO_ROOT, ENTRY)}`);
  process.exit(2);
}

const { visitedFiles, visitedPackages, violations } = scan();

console.log("新引擎路径（dsh）对 @knorvia/core 的独立性检查");
console.log(`入口: ${relative(REPO_ROOT, ENTRY)}`);
console.log(`访问文件数: ${visitedFiles.size}`);
console.log(`访问 workspace 包数: ${visitedPackages.size}`);
if (verbose) {
  for (const name of [...visitedPackages].sort()) console.log(`  · ${name}`);
}

if (violations.length === 0) {
  console.log("\n✓ 违规数: 0 —— 新引擎路径不依赖 @knorvia/core");
  process.exit(0);
}

console.error(`\n✗ 违规数: ${violations.length} —— 新引擎路径仍依赖 @knorvia/core`);
for (const violation of violations) {
  console.error(`\n  ${violation.file}`);
  console.error(`      模块: ${violation.specifier}`);
  const symbols = readViolationSymbols(violation.file);
  if (symbols.length > 0) {
    console.error(`      符号: ${symbols.join(", ")}`);
  }
}
console.error(
  "\n修复方式：把这些实现内联到新引擎路径上的包（如 apps/cli/packages/bootstrap），" +
    "或移到 apps/cli 层已依赖 @knorvia/contracts 的包。\n" +
    "⚠️ 不能移到 packages/shared —— 该层按设计不依赖 apps/cli/* 层，会形成跨目录反向依赖。",
);
process.exit(1);
