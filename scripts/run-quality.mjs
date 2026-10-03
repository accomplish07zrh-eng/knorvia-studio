// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEvidenceIntegrity } from "./check-evidence-integrity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const commands = {
  lint: { tool: "oxlint", args: [] },
  "lint:fix": { tool: "oxlint", args: ["--fix", "--fix-suggestions"] },
  fmt: { tool: "oxfmt", args: [] },
  "fmt:check": { tool: "oxfmt", args: ["--check"] },
};
const [command, ...args] = process.argv.slice(2);
const selected = Object.hasOwn(commands, command) ? commands[command] : undefined;
if (!selected) throw new Error(`Unknown root quality command: ${command}`);

// 修复：冻结来源证据仍是强制检查对象；先对账，再只对当前源码执行语言工具。
const evidence = await checkEvidenceIntegrity(root);
console.log(`Frozen evidence integrity passed: ${evidence.files} files / ${evidence.bytes} bytes`);
const packageRoot = resolve(root, "node_modules", selected.tool);
const installed = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const bin = typeof installed.bin === "string" ? installed.bin : installed.bin?.[selected.tool];
if (typeof bin !== "string" || !bin) throw new Error(`Missing tool entrypoint: ${selected.tool}`);
// 使用已锁定包的公开 Node bin，避免 Windows cmd wrapper 或 shell 改写参数。
const child = spawn(process.execPath, [resolve(packageRoot, bin), ...selected.args, ...args], {
  cwd: root,
  stdio: "inherit",
});
const result = await new Promise((resolveResult, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolveResult({ code, signal }));
});
if (result.signal) {
  console.error(`Root quality command ${command} terminated by ${result.signal}`);
  process.exitCode = 1;
} else process.exitCode = result.code ?? 1;
