import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

export async function buildBrowserUsePluginBundles({
  packageRoot = resolve(import.meta.dirname, ".."),
  browserClientOutfile = resolve(packageRoot, "scripts/browser-client.mjs"),
} = {}) {
  await mkdir(dirname(browserClientOutfile), { recursive: true });
  await build({ entryPoints: [resolve(packageRoot, "src/browser-client.ts")], outfile: browserClientOutfile,
    bundle: true, platform: "node", target: "node24", format: "esm", legalComments: "eof",
    banner: { js: 'import { createRequire as createRuntimeRequire } from "node:module"; const require = createRuntimeRequire(import.meta.url);' },
  });
  return { browserClientOutfile };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await buildBrowserUsePluginBundles();
