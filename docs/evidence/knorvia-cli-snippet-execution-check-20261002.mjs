import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(path.join(root, p));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(read("docs/evidence/knorvia-cli-snippet-execution-20261002.json"));
const owner = "apps/cli/packages/core/src/tool/handlers/eval-workflow-snippet.ts";
const core = path.join(root, "apps/cli/packages/core");

if (process.argv.includes("--types") || process.argv.includes("--emit")) {
  const ts = createRequire(path.join(root, "package.json"))("typescript");
  const configPath = path.join(core, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, core, {}, configPath);
  const emit = process.argv.includes("--emit");
  const roots = emit ? [owner] : [owner, ...receipt.testRoots];
  const options = emit ? parsed.options : { ...parsed.options, rootDir: undefined, noEmit: true };
  const program = ts.createProgram({ rootNames: roots.map((p) => path.join(root, p)), options });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    process.stderr.write(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (p) => p,
        getNewLine: () => "\n",
      }),
    );
    process.exit(1);
  }
  const written = [];
  if (emit) {
    const result = program.emit(
      program.getSourceFile(path.join(root, owner)),
      (name, text, bom) => {
        const relative = path.relative(path.join(core, "dist/tool/handlers"), name);
        assert.match(relative, /^eval-workflow-snippet\.(?:js|d\.ts(?:\.map)?)$/u);
        ts.sys.writeFile(name, text, bom);
        written.push(path.relative(root, name));
      },
    );
    assert.equal(result.emitSkipped, false);
    assert.equal(result.diagnostics.length, 0);
  }
  console.log(JSON.stringify({ typescript: ts.version, roots, diagnostics: 0, written }));
}
for (const item of [...receipt.files, ...receipt.emitted]) {
  const bytes = read(item.path);
  assert.equal(bytes.length, item.bytes, item.path);
  assert.equal(sha(bytes), item.sha256, item.path);
}
const archive = JSON.parse(
  read("apps/cli/packages/core/test/eval-workflow-snippet-execution-baseline.json"),
);
const old = execFileSync("git", ["show", `${receipt.baseline}:${owner}`], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(sha(old), archive.sourceSha256);
const current = read(owner).toString("utf8");
const header = current.slice(0, current.indexOf("const evalWorkflowSnippetHandler:"));
const tail = current.slice(current.indexOf("export const evalWorkflowSnippetToolEntry:"));
assert.equal(sha(header), archive.sourceHeaderSha256);
assert.equal(sha(tail), archive.sourceTailSha256);
const prefix = (s) => {
  const start = s.indexOf("const evalWorkflowSnippetHandler:");
  const end = s.indexOf("const durationMs =", start);
  return s.slice(start, s.indexOf(";", end) + 1);
};
assert.equal(prefix(current), prefix(old));
assert.equal((prefix(current).match(/\bawait\b/gu) ?? []).length, 1);
const lower = (s) =>
  s.slice(s.indexOf("/** logs 渲染"), s.indexOf("export const evalWorkflowSnippetToolEntry:"));
assert.equal(lower(current), lower(old));
assert.equal(sha(archive.owner), archive.ownerSha256);
const code = read("apps/cli/packages/core/dist/tool/handlers/eval-workflow-snippet.js").toString(
  "utf8",
);
const start = code.indexOf("const evalWorkflowSnippetHandler ="),
  end = code.indexOf("export const evalWorkflowSnippetToolEntry =");
assert.ok(start > 0 && end > start);
assert.equal(sha(code.slice(0, start)), archive.emittedHeaderSha256);
assert.equal(sha(code.slice(end)), archive.emittedTailSha256);
assert.equal(sha(code.slice(0, start) + archive.owner + code.slice(end)), archive.emittedSha256);
for (const p of receipt.immutableFreeze) {
  const historical = execFileSync("git", ["show", `${receipt.freeze}:${p}`], { cwd: root });
  assert.equal(sha(read(p)), sha(historical), p);
}
const changes = execFileSync("git", ["diff", "--name-only", receipt.baseline], {
  cwd: root,
  encoding: "utf8",
}).trim();
for (const p of changes ? changes.split("\n") : []) assert.ok(receipt.scope.includes(p), p);
console.log(
  JSON.stringify({
    digests: receipt.files.length + receipt.emitted.length,
    protected:
      "header, tail, invocation clocks/await, lower helpers, frozen assertions/oracle and outside-scope tracked files",
    ok: true,
  }),
);
