import { createRequire } from "node:module";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative, dirname, sep } from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const ts = createRequire(resolve(root, "package.json"))("typescript");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const packages = new Map();
for (const parent of ["apps/cli/packages", "packages"]) {
  for (const entry of readdirSync(resolve(root, parent), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = resolve(root, parent, entry.name);
    try {
      const manifest = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"));
      packages.set(manifest.name, { directory, manifest });
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}
const needed = new Map();
function visit(name) {
  if (needed.has(name)) return;
  const item = packages.get(name);
  if (!item) throw new Error(`Missing runtime workspace ${name}`);
  needed.set(name, item);
  for (const [dependency, range] of Object.entries(item.manifest.dependencies ?? {})) {
    if (range.startsWith("workspace:")) visit(dependency);
  }
}
visit("@knorvia/tui");
visit("@knorvia/cli");
const records = [];
for (const [name, { directory }] of needed) {
  if (["@knorvia/tui", "@knorvia/cli", "@knorvia/provider", "@knorvia/provider-node", "@knorvia/cua"].includes(name)) continue;
  const configFile = resolve(directory, "tsconfig.json");
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory, undefined, configFile);
  if (parsed.errors.length) throw new Error(parsed.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n"));
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options, noEmit: false, noEmitOnError: false,
    declaration: false, declarationMap: false, emitDeclarationOnly: false,
    composite: false, incremental: false,
  });
  const outputRoot = resolve(directory, "dist") + sep;
  const outputs = [];
  const result = program.emit(undefined, (file, text) => {
    if (!resolve(file).startsWith(outputRoot)) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    outputs.push({ path: relative(root, file).split(sep).join("/"), sha256: sha256(text) });
  });
  if (result.emitSkipped) throw new Error(`Runtime JS emit skipped: ${name}`);
  records.push({ name, config: relative(root, configFile), configSha256: sha256(readFileSync(configFile)), roots: parsed.fileNames.map((file) => ({ path: relative(root, file).split(sep).join("/"), sha256: sha256(readFileSync(file)) })), outputs });
  console.log(JSON.stringify({ name, roots: parsed.fileNames.length, outputs: outputs.length }));
}
writeFileSync("/tmp/knorvia-cli-tui-esm-20261003/runtime-js-prerequisites.json", JSON.stringify({
  node: process.version, typescript: ts.version,
  qualification: "Only JS/source-map prerequisites for the actual CLI/TUI producer and collector. Original project roots/settings; no semantic diagnostics, lint, typecheck, full build, declarations, or tracked source writes. Provider/provider-node source exports consumed by the real producer. No source contract edits.",
  lockfileSha256: sha256(readFileSync(resolve(root, "pnpm-lock.yaml"))), records,
}, null, 2) + "\n");
