#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executable = process.argv.slice(2).find((arg) => arg !== "--");
if (!executable)
  throw new Error('Usage: pnpm test:studio:packaged "<packaged Knorvia Studio.exe>"');
// 固定同一程序顺序验收，避免多组桌面进程争用资源；失败立即返回，不将剩余项算作通过。
const scripts = [
  "studio-plugin-install-acceptance.mjs",
  "studio-workspace-review-acceptance.mjs",
  "studio-media-acceptance.mjs",
];
for (const script of scripts) {
  console.log(`[test:studio:packaged] ${script}`);
  const child = spawn(process.execPath, [resolve(root, "scripts", script), resolve(executable)], {
    cwd: root,
    stdio: "inherit",
  });
  const code = await new Promise((done, fail) => {
    child.once("error", fail);
    child.once("exit", (code, signal) => done(signal ? 1 : (code ?? 1)));
  });
  if (code !== 0) {
    process.exitCode = code;
    break;
  }
}
