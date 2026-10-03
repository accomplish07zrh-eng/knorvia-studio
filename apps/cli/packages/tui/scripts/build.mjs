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
    // YAML needs native require; TypeScript also reads CommonJS file metadata.
    // Keep that context local to this ESM module and its emitted artifact.
    banner: {
      js: [
        'import { createRequire as __knorviaCreateRequire } from "node:module";',
        "const require = __knorviaCreateRequire(import.meta.url);",
        "const __filename = import.meta.filename;",
        "const __dirname = import.meta.dirname;",
      ].join("\n"),
    },
    sourcemap: true,
    logLevel: "info",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildTui();
}
