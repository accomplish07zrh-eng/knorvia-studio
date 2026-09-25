import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

export async function buildNodeReplHostBundle({
  outfile = resolve(import.meta.dirname, "../dist/mcp/server.js"),
  cuaHelperBuildId = process.env.KNORVIA_CUA_HELPER_BUILD_ID?.trim() ?? "",
} = {}) {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [resolve(import.meta.dirname, "../src/server.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    legalComments: "eof",
    define: { __KNORVIA_CUA_HELPER_BUILD_ID__: JSON.stringify(cuaHelperBuildId) },
    banner: {
      js: 'import { createRequire as createRuntimeRequire } from "node:module"; const require = createRuntimeRequire(import.meta.url);',
    },
  });
  return { outfile, cuaHelperBuildId };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await buildNodeReplHostBundle();
