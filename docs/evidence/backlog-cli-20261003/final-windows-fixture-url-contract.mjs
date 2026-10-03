// 读取实际夹具表达式，以合成平台路径核验 URL；不冒充 Windows 导入或文件读取。
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = new URL("../../../", import.meta.url);
const require = createRequire(new URL("apps/cli/package.json", repository));
const ts = require("typescript");
const baseline = "7bfb867162cc11adbc237e1c39bf2d61b5c0f81e";
const fanoutPath = "apps/cli/packages/core/test/fanout-cardinality-fixture.ts";
const parserPath = "apps/cli/packages/core/test/workflow-expert-parser-safety.test.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function read(relative) {
  const text = fs.readFileSync(new URL(relative, repository), "utf8");
  return { relative, text, tree: ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true) };
}
function original(relative) {
  const text = execFileSync("git", ["show", `${baseline}:${relative}`], {
    cwd: repository, encoding: "utf8",
  });
  return { relative, text, tree: ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true) };
}
function find(owner, predicate) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(owner.tree);
  assert.equal(matches.length, 1, owner.relative);
  return matches[0];
}
function initializer(owner, name) {
  return find(owner, (node) => ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) && node.name.text === name).initializer;
}
function importArgument(owner, name) {
  const tree = initializer(owner, name);
  return find({ ...owner, tree }, (node) => ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword).arguments[0].getText(owner.tree);
}
function rootExpression(owner) {
  return initializer(owner, "root").getText(owner.tree).replaceAll("import.meta.url", "fixtureUrl");
}
function checker(owner, root, capture) {
  const body = find(owner, (node) => ts.isFunctionDeclaration(node) &&
    node.name?.text === "check").getText(owner.tree);
  return Function("assert", "sha", "fs", "URL", "root", `${body}; return check;`)(
    assert, sha, { readFileSync: capture }, URL, root,
  );
}
function rewriter(owner, root, windows) {
  return Function("URL", "root", "pathToFileURL", `return (${initializer(owner, "rewrite").getText(owner.tree)});`)(
    URL, root, (input) => pathToFileURL(input, { windows }),
  );
}
const fanout = read(fanoutPath), parser = read(parserPath);
const oldFanout = original(fanoutPath), oldParser = original(parserPath);
const specifierExpression = importArgument(fanout, "ts");
const oldSpecifierExpression = importArgument(oldFanout, "ts");
const urlExpression = initializer(fanout, "typescriptUrl").getText(fanout.tree);
const relativeImports = [
  "apps/cli/packages/contracts/dist/index.js",
  "apps/cli/packages/core/dist/workflow/expert/ids.js",
  "apps/cli/packages/core/dist/workflow/expert/parsers/json.js",
];
const artifact = "apps/cli/packages/core/src/workflow/expert/parsers/json.ts";
const compiled = "apps/cli/packages/core/dist/workflow/expert/parsers/graph-seed.js";
const sourceImports = 'import a from "@knorvia/contracts"; import b from "../ids.js"; import c from "./json.js";';
const cases = [
  { name: "Windows CI drive", windows: true, root: String.raw`D:\a\knorvia-studio\knorvia-studio` },
  { name: "Windows encoded workspace", windows: true, root: String.raw`D:\CI Workspace\含#号\knorvia-studio` },
  { name: "Windows UNC workspace", windows: true, root: String.raw`\\fixture-server\owned share\含#号\knorvia-studio` },
  { name: "POSIX encoded workspace", windows: false, root: "/tmp/CI Workspace/含#号/knorvia-studio" },
];
const observations = [];
for (const scenario of cases) {
  const platform = scenario.windows ? path.win32 : path.posix;
  const fixtureUrl = pathToFileURL(platform.join(scenario.root, parserPath), { windows: scenario.windows }).href;
  const root = Function("URL", "fixtureUrl", `return ${rootExpression(parser)};`)(URL, fixtureUrl);
  const oldRoot = Function("URL", "fixtureUrl", `return ${rootExpression(oldParser)};`)(URL, fixtureUrl);
  assert.equal(root.protocol, "file:");
  assert.equal(fileURLToPath(root, { windows: scenario.windows }), scenario.root + platform.sep);
  const payload = Buffer.from("Owned path probe payload");
  let readArgument, oldReadArgument;
  const capture = (input) => { readArgument = input; return payload; };
  checker(parser, root, capture)({ path: artifact, sha256: sha(payload) });
  assert.ok(readArgument instanceof URL);
  const expectedArtifact = platform.join(scenario.root, artifact);
  assert.equal(fileURLToPath(readArgument, { windows: scenario.windows }), expectedArtifact);
  assert.throws(() => checker(parser, root, capture)({ path: artifact, sha256: "0".repeat(64) }), assert.AssertionError);
  const missing = new Error("Owned missing path");
  assert.throws(() => checker(parser, root, () => { throw missing; })({ path: artifact }), (error) => error === missing);
  checker(oldParser, oldRoot, (input) => { oldReadArgument = input; return payload; })({ path: artifact, sha256: sha(payload) });
  assert.notEqual(oldReadArgument, expectedArtifact);
  const rewritten = rewriter(parser, root, scenario.windows)(sourceImports);
  const rewrittenTree = ts.createSourceFile("rewritten.mjs", rewritten, ts.ScriptTarget.Latest, true);
  const targets = rewrittenTree.statements.map((statement) => statement.moduleSpecifier.text);
  assert.equal(targets.length, relativeImports.length);
  for (const [index, target] of targets.entries()) {
    assert.equal(new URL(target).protocol, "file:");
    assert.equal(fileURLToPath(target, { windows: scenario.windows }), platform.join(scenario.root, relativeImports[index]));
  }
  const current = { files: { "parsers/graph-seed": { compiled: { path: compiled } } } };
  const entry = Function("URL", "root", "current", `return ${importArgument(parser, "now")};`)(URL, root, current);
  assert.equal(new URL(entry).protocol, "file:");
  assert.equal(fileURLToPath(entry, { windows: scenario.windows }), platform.join(scenario.root, compiled));
  const typescript = platform.join(scenario.root, "node_modules/typescript/lib/typescript.js");
  const typescriptUrl = Function("pathToFileURL", "typescript", `return ${urlExpression};`)(
    (input) => pathToFileURL(input, { windows: scenario.windows }), typescript,
  );
  const selected = Function("typescript", "typescriptUrl", `return ${specifierExpression};`)(typescript, typescriptUrl);
  const oldSelected = Function("typescript", "typescriptUrl", `return ${oldSpecifierExpression};`)(typescript, typescriptUrl);
  assert.equal(new URL(selected).protocol, "file:");
  assert.equal(fileURLToPath(selected, { windows: scenario.windows }), typescript);
  if (scenario.windows) assert.notEqual(oldSelected, selected);
  observations.push({
    name: scenario.name, root: root.href, reader: readArgument.href,
    rewrittenImports: targets, currentEntry: entry, typescriptSpecifier: selected,
    oldReaderMismatch: true, oldFanoutSpecifier: oldSelected, actualWindowsExecution: false,
  });
}
const records = [
  "fanout-cardinality-baseline.json", "fanout-cardinality-current.json", "fanout-cardinality-contract.json",
  "causality-reduction-baseline.json", "causality-reduction-current.json", "causality-reduction-contract.json",
  "workflow-expert-parser-normalization-baseline.json", "workflow-expert-parser-normalization-current.json",
  "create-workflow-graph-loader-contract.json",
];
const preserved = [];
for (const record of [...records, "fanout-cardinality.test.ts", "causality-reduction.test.ts"]) {
  const relative = `apps/cli/packages/core/test/${record}`;
  const current = read(relative), old = original(relative);
  assert.equal(current.text, old.text, relative);
  preserved.push({ path: relative, sha256: sha(current.text) });
}
const behaviorSuffix = (owner) => owner.text.slice(owner.text.indexOf("const input = [{"));
assert.equal(behaviorSuffix(parser), behaviorSuffix(oldParser));
console.log(JSON.stringify({
  receivedCheckpoint: baseline, hostPlatform: process.platform, nodeVersion: process.version,
  sourceBindings: [fanout, parser].map(({ relative, text }) => ({ path: relative, sha256: sha(text) })),
  result: "pass", scope: "Actual fixture expressions and Node file URL APIs with synthetic paths; no Windows I/O or import execution",
  syntheticPlatformCases: observations, historicalRecordsAndWholeBehaviorTestsUnchanged: preserved,
  parserBehaviorAssertionSuffixUnchanged: true, actualWindowsPassed: false,
}, null, 2));
