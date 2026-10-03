import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const tuiDirectory = resolve(import.meta.dirname, "..");

export async function buildTui({ directory = tuiDirectory } = {}) {
  const manifest = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
  await build({
    entryPoints: [resolve(directory, "src/index.ts")],
    outfile: resolve(directory, "dist/index.js"),
    bundle: true,
    // Workspace exports can point at TypeScript sources. Compile that closure here;
    // OpenTUI and its native/worker assets must retain their package-relative paths.
    external: Object.keys(manifest.dependencies).filter((name) => !name.startsWith("@knorvia/")),
    format: "esm",
    platform: "node",
    target: "node22",
    // Bundled CommonJS dependencies still need Node's native module loader in ESM.
    // Keep it local to this module and resolve relative to the emitted artifact.
    banner: {
      js: 'import { createRequire as __knorviaCreateRequire } from "node:module";\nconst require = __knorviaCreateRequire(import.meta.url);',
    },
    sourcemap: true,
    logLevel: "info",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildTui();
}
