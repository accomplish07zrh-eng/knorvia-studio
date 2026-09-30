// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

let serial = 0;
export async function loadSubject(root, mode) {
  if (!["source", "dist"].includes(mode)) throw new Error("Invalid explicit device/fs mode");
  const directory = await mkdtemp(join(tmpdir(), "knorvia-device-fs-contract-"));
  const key = `knorvia.device.fs.contract.${process.pid}.${serial++}`;
  let current;
  const world = () => {
    if (!current) throw new Error("Target I/O outside a controlled device/fs world");
    return current;
  };
  const bridge = new Proxy(
    {},
    {
      get:
        (_obj, name) =>
        (...args) =>
          world()[name](...args),
    },
  );
  const processPort = new Proxy({}, { get: (_obj, name) => world().process[name] });
  globalThis[Symbol.for(key)] = { call: bridge, process: processPort, get: world };
  const seam = `const b = globalThis[Symbol.for(${JSON.stringify(key)})];`;
  const ext = mode === "source" ? ".ts" : ".js";
  const entries = {
    identity: "device/cli-device-mid",
    metadata: "fs/text-metadata",
    range: "fs/text-range-reader",
    fs: "fs/index",
  };
  const contents =
    Object.entries(entries)
      .map(
        ([name, file]) =>
          `export * as ${name} from ${JSON.stringify(join(resolve(root), file + ext))};`,
      )
      .join("\n") +
    `\nexport * as reader from ${JSON.stringify(fileURLToPath(new URL(`../../../core/${mode === "source" ? "src" : "dist"}/tool/handlers/read-text${ext}`, import.meta.url)))};` +
    ["grep", "glob"]
      .map(
        (name) =>
          `\nexport * as ${name} from ${JSON.stringify(fileURLToPath(new URL(`../../../core/${mode === "source" ? "src" : "dist"}/tool/handlers/${name}${ext}`, import.meta.url)))};`,
      )
      .join("") +
    `\nexport * as provider from ${JSON.stringify(fileURLToPath(new URL(`../../${mode === "source" ? "src" : "dist"}/model/anthropic-request-metadata${ext}`, import.meta.url)))};`;
  const banner = `const __knorviaDeviceFsBridge=globalThis[Symbol.for(${JSON.stringify(key)})];\nconst process=__knorviaDeviceFsBridge.process;\nconst Date=class extends globalThis.Date { static now(){return __knorviaDeviceFsBridge.get().now;} };\nconst Math=Object.create(globalThis.Math); Math.random=()=>__knorviaDeviceFsBridge.get().random;\nconst setTimeout=(...a)=>__knorviaDeviceFsBridge.call.setTimeout(...a); const clearTimeout=(...a)=>__knorviaDeviceFsBridge.call.clearTimeout(...a);`;
  try {
    const output = await build({
      stdin: { contents, resolveDir: resolve(root), loader: "ts" },
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      banner: { js: banner },
      plugins: [
        {
          name: "sealed-device-fs-io",
          setup(plugin) {
            plugin.onResolve({ filter: /cli-device-mid\.js$/ }, (args) =>
              /anthropic-request-metadata\.(?:ts|js)$/.test(args.importer)
                ? { path: join(resolve(root), "device/cli-device-mid" + ext) }
                : undefined,
            );
            plugin.onResolve({ filter: /^(?:@knorvia\/contracts|iconv-lite)$/ }, (args) => ({
              path: import.meta.resolve(args.path),
              external: true,
            }));
            plugin.onResolve({ filter: /^@knorvia\/shared$/ }, () => ({
              path: "shared",
              namespace: "device-fs-seam",
            }));
            plugin.onResolve({ filter: /^knorvia-contract-shared$/ }, () => ({
              path: import.meta.resolve("@knorvia/shared"),
              external: true,
            }));
            plugin.onResolve({ filter: /fs-fault-injection\.js$/ }, () => ({
              path: "fault",
              namespace: "device-fs-seam",
            }));
            plugin.onResolve(
              { filter: /^node:(?:fs(?:\/promises)?|os|path|crypto|worker_threads)$/ },
              (args) =>
                args.namespace === "device-fs-seam"
                  ? undefined
                  : { path: args.path, namespace: "device-fs-seam" },
            );
            plugin.onLoad({ filter: /.*/, namespace: "device-fs-seam" }, ({ path }) => {
              const functions = (names) =>
                names
                  .map((name) => `export const ${name}=(...a)=>b.call.${name}(...a);`)
                  .join("\n");
              let code;
              if (path === "node:fs/promises")
                code = functions([
                  "mkdir",
                  "open",
                  "readFile",
                  "rename",
                  "stat",
                  "lstat",
                  "unlink",
                  "writeFile",
                  "readdir",
                ]);
              else if (path === "node:fs")
                code = `export { constants } from "node:fs";\nexport const createReadStream=(...a)=>b.call.createReadStream(...a);`;
              else if (path === "node:crypto")
                code = `export { createHash } from "node:crypto";\nexport const randomBytes=(...a)=>b.call.randomBytes(...a);`;
              else if (path === "node:os") code = `export const homedir=()=>b.get().home;`;
              else if (path === "node:path")
                code =
                  `export { sep } from "node:path";\n` +
                  [
                    "basename",
                    "dirname",
                    "join",
                    "resolve",
                    "extname",
                    "isAbsolute",
                    "normalize",
                    "relative",
                  ]
                    .map((name) => `export const ${name}=(...a)=>b.get().paths.${name}(...a);`)
                    .join("\n");
              else if (path === "node:worker_threads")
                code = `export class Worker { constructor(...a){return b.call.worker(...a);} }`;
              else if (path === "shared")
                code = `export const createUuid=()=>b.get().defaultId; export { ESTIMATED_TOKEN_CHAR_DIVISOR } from "knorvia-contract-shared";`;
              else if (path === "fault")
                code = `export const maybeThrowStorageFsFault=(...a)=>b.call.fault(...a);`;
              else throw new Error("Unknown device/fs seam");
              return { contents: `${seam}\n${code}`, loader: "js" };
            });
          },
        },
      ],
    });
    const file = join(directory, "subject.mjs");
    await writeFile(file, output.outputFiles[0].contents);
    const subject = await import(pathToFileURL(file).href);
    return {
      subject,
      use(value) {
        current = value;
        return subject;
      },
      async dispose() {
        delete globalThis[Symbol.for(key)];
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    delete globalThis[Symbol.for(key)];
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export function target() {
  const root = process.env.KNORVIA_DEVICE_FS_CONTRACT_ROOT;
  if (!root) throw new Error("Missing explicit device/fs target root");
  return loadSubject(root, process.env.KNORVIA_DEVICE_FS_CONTRACT_MODE);
}
