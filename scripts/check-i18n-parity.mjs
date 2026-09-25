#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "tsx/esm/api";
import { compareLocaleCatalogs } from "./i18n-parity.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const unregister = register({ tsconfig: resolve(repoRoot, "packages/ui/tsconfig.json") });

try {
  const [enUS, zhCN] = await Promise.all(
    ["en-US", "zh-CN"].map(async (locale) => {
      const path = resolve(repoRoot, `packages/ui/src/i18n/locales/${locale}.ts`);
      const module = await import(pathToFileURL(path).href);
      return module.default;
    }),
  );
  const { keyCount, errors } = compareLocaleCatalogs(enUS, zhCN);
  if (errors.length) {
    console.error(`[i18n] ${errors.length} parity issue(s) across ${keyCount} keys:`);
    for (const error of errors) console.error(`  ${error}`);
    process.exitCode = 1;
  } else {
    console.log(
      `[i18n] en-US and zh-CN: ${keyCount} matching keys, validated values and placeholders`,
    );
  }
} catch (error) {
  console.error("[i18n] Could not load the runtime catalogs:", error);
  process.exitCode = 1;
} finally {
  await unregister();
}
