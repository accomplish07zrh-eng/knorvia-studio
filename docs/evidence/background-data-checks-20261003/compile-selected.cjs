const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  ts = require(path.resolve(__dirname, "../../../node_modules/typescript"));
const root = path.resolve(__dirname, "../../.."),
  core = path.join(root, "apps/cli/packages/core"),
  names = [
    "tool/executor/background-task-output",
    "tool/executor/workflow-artifact",
    "tool/executor/background-tracker-projection",
    "tool/executor/background-tracker-notification",
    "tool/executor/workflow-published-artifacts",
  ],
  sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const cfg = ts.readConfigFile(path.join(core, "tsconfig.json"), ts.sys.readFile),
  options = { ...ts.parseJsonConfigFileContent(cfg.config, ts.sys, core).options, noEmit: false };
const mode = process.argv[2],
  out = process.argv[3],
  draft = process.argv[4],
  host = ts.createCompilerHost(options),
  get = host.getSourceFile.bind(host);
if (draft)
  host.getSourceFile = (f, v, e, s) => {
    const n = names.slice(0, 2).find((n) => f === path.join(core, "src", n + ".ts"));
    return n
      ? ts.createSourceFile(f, fs.readFileSync(path.join(draft, n + ".ts"), "utf8"), v, true)
      : get(f, v, e, s);
  };
const program = ts.createProgram(
    names.map((n) => path.join(core, "src", n + ".ts")),
    options,
    host,
  ),
  diagnostics = ts.getPreEmitDiagnostics(program);
fs.mkdirSync(out, { recursive: true });
if (diagnostics.length) {
  const text = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: (f) => f,
    getNewLine: () => "\n",
  });
  fs.writeFileSync(path.join(out, "diagnostics.log"), text);
  console.log(text);
  if (mode !== "diagnostic-draft") {
    process.exitCode = 1;
    return;
  }
}
const outputs = {};
program.emit(undefined, (f, t) => {
  for (const n of names)
    for (const [k, ext] of [
      ["compiled", ".js"],
      ["declaration", ".d.ts"],
    ])
      if (f === path.join(core, "dist", n + ext)) (outputs[n] ??= {})[k] = t;
});
const files = {};
for (const n of names) {
  const logicalPath = path.relative(root, path.join(core, "src", n + ".ts"));
  files[n] = { logicalPath, ...outputs[n] };
  const text = program.getSourceFile(path.join(core, "src", n + ".ts")).text;
  files[n].sourceSha256 = sha(text);
  if (names.slice(0, 2).includes(n)) files[n].source = text;
  for (const k of ["compiled", "declaration"]) files[n][k + "Sha256"] = sha(files[n][k]);
}
fs.writeFileSync(
  path.join(out, "compiled-modules.json"),
  JSON.stringify({ typescript: ts.version, files }, null, 2) + "\n",
);
const printer = ts.createPrinter({ removeComments: true }),
  api = (t) => printer.printFile(ts.createSourceFile("api.d.ts", t, ts.ScriptTarget.Latest, true));
if (mode === "baseline") {
  const packet = path.join(root, "docs/evidence/background-data-author-20261003");
  for (const n of names.slice(0, 2))
    fs.writeFileSync(path.join(packet, path.basename(n) + "-api.d.ts"), api(files[n].declaration));
  fs.copyFileSync(
    path.join(out, "compiled-modules.json"),
    path.join(core, "test/background-data-baseline-20261003.json"),
  );
}
if (mode !== "baseline") {
  const old = JSON.parse(
    fs.readFileSync(path.join(core, "test/background-data-baseline-20261003.json")),
  );
  for (const n of names.slice(0, 2)) {
    if (api(files[n].declaration) !== api(old.files[n].declaration)) {
      console.log("API documentary/shape comparison required: " + n);
    }
  }
}
fs.writeFileSync(
  path.join(out, "result.json"),
  JSON.stringify(
    {
      typescript: ts.version,
      diagnostics: diagnostics.length,
      capturedModules: 5,
      sourceSHA256: Object.fromEntries(names.slice(0, 2).map((n) => [n, files[n].sourceSha256])),
    },
    null,
    2,
  ) + "\n",
);
console.log(fs.readFileSync(path.join(out, "result.json"), "utf8"));
