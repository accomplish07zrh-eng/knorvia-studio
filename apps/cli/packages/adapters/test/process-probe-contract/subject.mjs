// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const modules = ["shared", "linux", "darwin", "windows", "factory"];
const names = modules.map((name) => `process-probe${name === "factory" ? "" : `-${name}`}`);
let serial = 0;

/** 封住目标的默认 I/O，不能只靠 options 注入隔离未知平台的回退路径。 */
export async function loadSubject(root, mode, { callerRoot } = {}) {
  if (!["source", "dist"].includes(mode)) throw new Error("Invalid explicit probe target mode");
  const directory = await mkdtemp(join(tmpdir(), "knorvia-probe-contract-"));
  const key = `knorvia.process-probe.contract.${process.pid}.${serial++}`;
  let current;
  const world = () => {
    if (!current) throw new Error("Target I/O outside a controlled contract world");
    return current;
  };
  globalThis[Symbol.for(key)] = {
    async readdir(path) {
      return world().readdir(path);
    },
    async readFile(path, encoding) {
      return world().readFile(path, encoding);
    },
    execFile(file, args, options, callback) {
      world().nativeExec(file, args, options, callback);
      return {};
    },
    setTimeout(callback, delay) {
      return world().clock.schedule(callback, delay);
    },
    clearTimeout(handle) {
      return world().clock.cancel(handle);
    },
    subscribe(interval, callback) {
      return world().subscribe(interval, callback);
    },
    now() {
      return world().now;
    },
  };
  const seam = `const world = globalThis[Symbol.for(${JSON.stringify(key)})];`;
  const result = await build({
    stdin: {
      contents:
        modules
          .map(
            (name, index) =>
              `export * as ${name} from ${JSON.stringify(join(resolve(root), names[index] + (mode === "dist" ? ".js" : ".ts")))};`,
          )
          .join("\n") +
        (callerRoot
          ? `\nexport * as mcp from ${JSON.stringify(join(callerRoot, "mcp/resource-telemetry.ts"))};\nexport * as bash from ${JSON.stringify(join(callerRoot, "exec/bash-resource-telemetry.ts"))};`
          : ""),
      resolveDir: resolve(root),
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    banner: {
      js: `const __knorviaProbeClock = globalThis[Symbol.for(${JSON.stringify(key)})];\nconst setTimeout = __knorviaProbeClock.setTimeout; const clearTimeout = __knorviaProbeClock.clearTimeout;`,
    },
    plugins: [
      {
        name: "sealed-process-probe-io",
        setup(plugin) {
          plugin.onResolve({ filter: /^@knorvia\/shared$/ }, () => ({
            // Windows 盘符路径不能作为 ESM specifier；保留共享模块真实 schema，使用标准 file URL。
            path: pathToFileURL(require.resolve("@knorvia/shared")).href,
            external: true,
          }));
          plugin.onResolve({ filter: /bash-progress-poller\.js$/ }, () => ({
            path: "poller",
            namespace: "probe-caller-seam",
          }));
          plugin.onResolve({ filter: /^node:perf_hooks$/ }, () => ({
            path: "performance",
            namespace: "probe-caller-seam",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "probe-caller-seam" }, (args) => ({
            contents:
              args.path === "poller"
                ? `${seam}\nexport const subscribeBashOutputProgress=world.subscribe;`
                : `${seam}\nexport const performance={now:world.now};`,
            loader: "js",
          }));
          plugin.onResolve({ filter: /^(?:node:)?(?:fs\/promises|child_process)$/ }, (args) => ({
            path: args.path.replace(/^node:/, ""),
            namespace: "probe-seam",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "probe-seam" }, (args) => ({
            contents:
              args.path === "fs/promises"
                ? `${seam}\nexport const readdir = world.readdir; export const readFile = world.readFile;`
                : `${seam}\nexport const execFile = world.execFile;`,
            loader: "js",
          }));
        },
      },
    ],
  });
  const file = join(directory, "subject.mjs");
  await writeFile(file, result.outputFiles[0].contents);
  const subject = await import(pathToFileURL(file).href);
  return {
    subject,
    use(world) {
      current = world;
      return subject;
    },
    async dispose() {
      delete globalThis[Symbol.for(key)];
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export function target(options) {
  const root = process.env.KNORVIA_PROCESS_PROBE_CONTRACT_ROOT;
  if (!root) throw new Error("Missing explicit process-probe target root");
  return loadSubject(root, process.env.KNORVIA_PROCESS_PROBE_CONTRACT_MODE, options);
}
