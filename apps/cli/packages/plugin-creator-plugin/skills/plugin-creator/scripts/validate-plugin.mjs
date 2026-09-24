import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { containedPath, rejectSymlink } from "./marketplace-files.mjs";
import { normalizePluginName } from "./scaffold-files.mjs";

export async function preflightPlugin(input) {
  const problems = [];
  const root = resolve(input);
  try {
    await rejectSymlink(root);
    const manifestPath = containedPath(root, ".knorvia-plugin/plugin.json");
    await rejectSymlink(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.name !== normalizePluginName(manifest.name)) throw new Error("Manifest name is not normalized");
    if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(manifest.version))
      throw new Error("Manifest needs a semantic version");
    async function inspect(value) {
      if (Array.isArray(value)) { for (const item of value) await inspect(item); return; }
      if (typeof value !== "string") throw new Error("Scaffold components must reference relative paths");
      const path = containedPath(root, value);
      await rejectSymlink(path);
      const stat = await lstat(path);
      if (stat.isDirectory()) {
        for (const entry of await readdir(path, { withFileTypes: true })) {
          const child = resolve(path, entry.name);
          await rejectSymlink(child);
          if (entry.isDirectory()) await inspect(value + "/" + entry.name);
        }
      } else if (!stat.isFile()) throw new Error("Unsupported component file type");
    }
    for (const key of ["skills", "agents", "commands", "hooks", "mcpServers"]) {
      if (manifest[key] !== undefined) await inspect(manifest[key]);
    }
    if (typeof manifest.license === "string" && manifest.license.startsWith("SEE LICENSE IN "))
      await inspect(manifest.license.slice("SEE LICENSE IN ".length));
  } catch (error) { problems.push(error.message); }
  return problems;
}

export async function validatePlugin(path, cli) {
  const problems = await preflightPlugin(path);
  if (problems.length) throw new Error(problems.join("\n"));
  if (!cli) return { schemaValidated: false };
  if (!isAbsolute(cli)) throw new Error("Use an absolute Knorvia Studio CLI path");
  await rejectSymlink(cli);
  if (!(await lstat(cli)).isFile()) throw new Error("CLI must be a file");
  const javascript = [".js", ".cjs", ".mjs"].includes(extname(cli));
  const args = [...(javascript ? [cli] : []), "plugins", "validate", resolve(path), "--json"];
  await new Promise((done, fail) => {
    const child = spawn(javascript ? process.execPath : cli, args, { stdio: "inherit", windowsHide: true, timeout: 30_000 });
    child.once("error", fail);
    child.once("exit", (code, signal) => code === 0 ? done() : fail(new Error(`Host validation failed (${signal ?? code})`)));
  });
  return { schemaValidated: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { cli: { type: "string" } } });
  Promise.resolve().then(() => {
    if (positionals.length !== 1) throw new Error("Usage: validate-plugin.mjs <plugin-path> [--cli absolute-path]");
    return validatePlugin(positionals[0], values.cli);
  }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
