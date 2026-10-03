// Scope: source expressions only. No program, checker, emit, application or test execution.
// Usage: node <this-file> <pinned-upstream-registry.ts>
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const repository = path.resolve(__dirname, "../../..");
const ts = require(path.join(repository, "node_modules/typescript"));
const reviewedHead = "59517d9699519b0a7a44980da27df29d45f0e91e";
const registryPath = "apps/cli/packages/core/src/runtime-task/registry.ts";
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fromGit = (ref, file) => execFileSync("git", ["show", `${ref}:${file}`], { cwd: repository });
const parse = (name, bytes) => ts.createSourceFile(name, bytes.toString("utf8"), ts.ScriptTarget.Latest, true);
const upstreamBytes = fs.readFileSync(process.argv[2]);
if (digest(upstreamBytes) !== "8f138a00926d188a0a336f12d87bf8af2f5402f7817179fae249b6c56b0681b9") {
  throw new Error("The supplied upstream bytes are not the pinned Registry source");
}
const currentBytes = fromGit(reviewedHead, registryPath);
const importedBytes = fromGit("7619e41b950bd52073ebf36754146cf25659d9fa", registryPath);
const formattedBytes = fromGit("88001f027b04324f816176ff5f08b5d1a236f27f", registryPath);
const firstCandidateBytes = fromGit("8ab8d719bea0dc7e3e2f7de522db57dac374e048", registryPath);
const archiveBytes = fromGit(reviewedHead, "apps/cli/packages/core/test/candidates/task-registry-20261003/registry.ts");
const upstream = parse("upstream.ts", upstreamBytes);
const current = parse("current.ts", currentBytes);
const packet = parse("api.d.ts", fs.readFileSync(path.join(repository, "docs/knorvia-task-registry-author-inputs-20261002/api.d.ts")));

// Preserve syntax-node kind, leaf text and ordered children. Drop locations/trivia only.
// Renaming maps apply only to identifiers in the explicitly selected source regions.
function syntax(node, renames = {}) {
  const children = [];
  ts.forEachChild(node, (child) => { children.push(syntax(child, renames)); });
  const result = [ts.SyntaxKind[node.kind]];
  if (ts.isIdentifier(node)) result.push(renames[node.text] ?? node.text);
  else if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) result.push(node.text);
  result.push(children);
  return result;
}
const encoded = (nodes, renames) => JSON.stringify(nodes.map((node) => syntax(node, renames)));
const declaration = (source, name) => source.statements.find((node) => node.name?.text === name);
const registryClass = (source) => declaration(source, "InMemoryRuntimeTaskRegistry");
const method = (source, name) => registryClass(source).members.find((node) => node.name?.text === name);
const body = (source, name) => [...method(source, name).body.statements];
function lines(node, source) {
  return [source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    source.getLineAndCharacterOfPosition(node.end).line + 1];
}
function compare(label, oldNodes, newNodes, renames = {}) {
  const oldSyntax = encoded(oldNodes, renames);
  const newSyntax = encoded(newNodes);
  return { label, upstreamLines: oldNodes.map((node) => lines(node, upstream)),
    currentLines: newNodes.map((node) => lines(node, current)), identifierRenames: renames,
    sameSelectedSyntax: oldSyntax === newSyntax,
    upstreamSelectedSyntaxSha256: digest(oldSyntax), currentSelectedSyntaxSha256: digest(newSyntax) };
}
const typeNames = ["RuntimeTaskType", "RuntimeTaskUsageSnapshot", "RuntimeTaskPendingMessage",
  "RuntimeTaskMessageSink", "RuntimeTaskSnapshot", "RuntimeTaskRegistry"];
const comparisons = typeNames.map((name) => compare(name,
  [declaration(upstream, name)], [declaration(current, name)]));
for (const name of ["setActiveBranchGeneration", "queueMessage"]) {
  comparisons.push(compare(`${name}: complete body`, body(upstream, name), body(current, name)));
}
for (const name of ["get", "all", "drainMessages"]) {
  comparisons.push(compare(`${name}: complete body`, body(upstream, name), body(current, name), { tasks: "snapshots" }));
}
comparisons.push(compare("register: copy/stamp and Map commit", body(upstream, "register").slice(0, 2),
  body(current, "register").slice(0, 2), { stamped: "stored", tasks: "snapshots" }));
comparisons.push(compare("update: lookup/guard/patch/commit and returned identity",
  [...body(upstream, "update").slice(0, 4), body(upstream, "update").at(-1)],
  [...body(current, "update").slice(0, 4), body(current, "update").at(-1)], { current: "previous", tasks: "snapshots" }));
comparisons.push(compare("requestBackground: lookup, guard and Map commit",
  [body(upstream, "requestBackground")[0], body(upstream, "requestBackground")[1], body(upstream, "requestBackground")[3]],
  [body(current, "requestBackground")[0], body(current, "requestBackground")[1], body(current, "requestBackground")[3]],
  { task: "previous", tasks: "snapshots" }));
comparisons.push(compare("remove: Map deletion", [body(upstream, "remove")[0]], [body(current, "remove")[0]], { tasks: "snapshots" }));
comparisons.push(compare("waitForTerminal: lookup and immediate return", body(upstream, "waitForTerminal").slice(0, 2),
  body(current, "waitForTerminal").slice(0, 2), { tasks: "snapshots", current: "task" }));
comparisons.push(compare("isTerminalRuntimeTask: complete function", [declaration(upstream, "isTerminalRuntimeTask")],
  [declaration(current, "isTerminalRuntimeTask")]));
const oldPredicate = declaration(upstream, "hasRunningBackgroundRuntimeTask").body.statements[0].expression.arguments[0].body;
const newPredicate = declaration(current, "hasRunningBackgroundRuntimeTask").body.statements[1].statement.statements[0].expression;
comparisons.push(compare("hasRunningBackgroundRuntimeTask: predicate", [oldPredicate], [newPredicate]));

function comments(source) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source.text);
  const result = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      result.push({ sha256: digest(scanner.getTokenText()),
        line: source.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1 });
    }
  }
  return result;
}
const upstreamComments = comments(upstream);
const currentComments = comments(current);
const metadata = (bytes) => ({ bytes: bytes.length, sha256: digest(bytes) });
console.log(JSON.stringify({ reviewedHead, parserVersion: ts.version,
  operation: "parse source syntax and compare selected expressions; no checker or emit",
  sources: { upstream: metadata(upstreamBytes), imported: metadata(importedBytes), formatted: metadata(formattedBytes),
    firstCandidate: metadata(firstCandidateBytes), archive: metadata(archiveBytes), current: metadata(currentBytes) },
  importEqualsUpstreamAfterOnlyContractNamespaceReplacement:
    importedBytes.toString("utf8") === upstreamBytes.toString("utf8").replaceAll("@zcode/contracts", "@knorvia/contracts"),
  formattingCommitPreservesParsedSyntax: encoded([parse("imported.ts", importedBytes)]) === encoded([parse("formatted.ts", formattedBytes)]),
  firstCandidateAndArchiveRawEqual: firstCandidateBytes.equals(archiveBytes),
  currentAndArchiveRawEqual: currentBytes.equals(archiveBytes),
  currentAndArchiveParsedSyntaxEqual: encoded([current]) === encoded([parse("archive.ts", archiveBytes)]),
  packetPublicDeclarations: typeNames.map((name) => ({ name,
    sameSelectedSyntax: encoded([declaration(packet, name)]) === encoded([declaration(current, name)]) })),
  comparisons, comments: { upstream: upstreamComments, current: currentComments,
    exactSharedComments: currentComments.filter((comment) => upstreamComments.some((old) => old.sha256 === comment.sha256)) },
  limits: ["Selected syntax identity is neither semantic equivalence nor a copyrightability decision.",
    "Identifier substitutions are disclosed textual comparisons, not binding or authorship proofs.",
    "Git chronology and source comparisons do not establish contributor ownership or a MIT grant."]
}, null, 2));
