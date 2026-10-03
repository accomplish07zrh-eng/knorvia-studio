import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

let sequence = 0;

// Deferred authoring aid only: never invoked in this no-verification phase.
// React/DOM/clock/preload/service ports must be supplied; local owners stay actual.
export async function loadRendererOwner(relativePath, state, modules) {
  const key = "knorvia.renderer.deferred." + ++sequence;
  globalThis[Symbol.for(key)] = state;
  try {
    const output = await build({
      entryPoints: [fileURLToPath(new URL("../src/renderer/" + relativePath, import.meta.url))],
      bundle: true, write: false, format: "esm", platform: "browser", logLevel: "silent",
      jsx: "automatic", define: { "import.meta.env": '{"DEV":false}' },
      banner: { js:
        "const fixture = globalThis[Symbol.for(" + JSON.stringify(key) + ")];" +
        "const window=fixture.window, document=fixture.document, navigator=fixture.navigator;" +
        "const localStorage=fixture.localStorage, crypto=fixture.crypto, File=fixture.File;" +
        "const Date=fixture.Date || globalThis.Date;" +
        "const setTimeout=fixture.setTimeout, clearTimeout=fixture.clearTimeout;" +
        "const setInterval=fixture.setInterval, clearInterval=fixture.clearInterval;"
      },
      plugins: [{
        name: "deferred-renderer-boundaries",
        setup(plugin) {
          plugin.onResolve({ filter: /^(?:@knorvia\/|react$|react\/|react-dom\/)/ }, ({ path }) => {
            assert.ok(Object.hasOwn(modules, path), "unsupplied renderer boundary " + path);
            return { path, namespace: "renderer-port" };
          });
          plugin.onLoad({ filter: /.*/, namespace: "renderer-port" }, ({ path }) => ({
            contents: "const port=globalThis[Symbol.for(" + JSON.stringify(key) + ")];\n" + modules[path],
            loader: "js",
          }));
        },
      }],
    });
    return await import("data:text/javascript;base64," + Buffer.from(output.outputFiles[0].text).toString("base64"));
  } finally {
    delete globalThis[Symbol.for(key)];
  }
}
