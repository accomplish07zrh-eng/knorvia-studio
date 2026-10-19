// SPDX-License-Identifier: Apache-2.0
// 契约入口切换与夹具工具。
//
// 三个目标脚本都是直接由 Node 执行的 .mjs，没有 dist 构建：
// - source：在测试进程内 import 脚本（可调用其导出、可观察导入副作用）；
// - process：通过子进程执行脚本文件，与 package.json 脚本和人工调用的方式一致。
// 两种入口跑同一组断言；CLI 行为在两种入口下都走子进程。
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const contractDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(contractDir, "../../..");
export const scriptsDir = join(repoRoot, "apps/cli/scripts");
export const entryMode = process.env.KNORVIA_CLI01_ENTRY === "process" ? "process" : "source";

export const scriptPath = (name) => join(scriptsDir, name);

let importSequence = 0;

export async function importScript(name) {
  const url = pathToFileURL(scriptPath(name));
  importSequence += 1;
  url.searchParams.set("knorviaContractCase", String(importSequence));
  return import(url.href);
}

export async function makeTempDir(prefix = "knorvia-ac01-") {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function writeTree(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }
}

export function runScript(name, args = [], options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [scriptPath(name), ...args], {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => resolveResult({ status, stdout, stderr }));
  });
}

export function runInlineModule(source, options = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", source, ...(options.args ?? [])],
      {
        cwd: options.cwd ?? repoRoot,
        env: { ...process.env, ...options.env },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => resolveResult({ status, stdout, stderr }));
  });
}

async function runJsonCall(name, exportName, args) {
  const source = [
    `const module = await import(${JSON.stringify(pathToFileURL(scriptPath(name)).href)});`,
    `const value = await module[${JSON.stringify(exportName)}](...JSON.parse(process.argv[1]));`,
    "process.stdout.write(JSON.stringify(value));",
  ].join("\n");
  const result = await runInlineModule(source, { args: [JSON.stringify(args)] });
  if (result.status !== 0) {
    throw new Error(
      `${name}:${exportName} 调用失败（exit ${String(result.status)}）：${result.stderr.trim()}`,
    );
  }
  return JSON.parse(result.stdout);
}

// 导出函数在 source 入口直接调用；process 入口经子进程导入后调用，返回同一形状。
export async function callExport(name, exportName, ...args) {
  if (entryMode === "source") {
    const module = await importScript(name);
    return module[exportName](...args);
  }
  return runJsonCall(name, exportName, args);
}

// clean-dist 在导入时即执行；source 入口必须切换 cwd 后再导入。
export async function executeCleanDistInProcess(cwd) {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    await importScript("clean-dist.mjs");
  } finally {
    process.chdir(previous);
  }
}
