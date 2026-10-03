import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

let fixtureNumber = 0;

// This loader is authored for final integration, and is not run during the lane.
// Every IO/Electron/service boundary must be supplied; node:path is pure.
export async function loadNativeOwner(name, state, modules, banner = "") {
  const key = `knorvia.native.owner.deferred.${++fixtureNumber}`;
  const entry = fileURLToPath(new URL(`../src/main/${name}.ts`, import.meta.url));
  globalThis[Symbol.for(key)] = state;
  try {
    const output = await build({
      entryPoints: [entry], bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
      banner: { js: `const nativeFixture = globalThis[Symbol.for(${JSON.stringify(key)})]; ${banner}` },
      plugins: [{
        name: "deferred-native-owner-ports",
        setup(plugin) {
          plugin.onResolve({ filter: /^(?:node:|electron$|yazl$|@knorvia\/|\.\/(?:about|logger|storageScanWorkerClient)\.js$)/ }, ({ path }) => {
            if (path === "node:path") return { path, external: true };
            assert.ok(Object.hasOwn(modules, path), `unsupplied native boundary ${path}`);
            return { path, namespace: "native-port" };
          });
          plugin.onLoad({ filter: /.*/, namespace: "native-port" }, ({ path }) => ({
            contents: `const port = globalThis[Symbol.for(${JSON.stringify(key)})];\n${modules[path]}`,
            loader: "js",
          }));
        },
      }],
    });
    return await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
  } finally {
    delete globalThis[Symbol.for(key)];
  }
}

export function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function flush() {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}
