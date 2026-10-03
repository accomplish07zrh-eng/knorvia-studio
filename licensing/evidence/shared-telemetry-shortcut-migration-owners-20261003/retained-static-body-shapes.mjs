import fs from "node:fs";
import ts from "/workspace/knorvia-studio/node_modules/typescript/lib/typescript.js";
import assert from "node:assert/strict";
const names = [
  "telemetry",
  "processResourceTelemetry",
  "remoteUsageTelemetry",
  "shortcutCommands",
  "node/subagentMarkdownMigration",
];
const printer = ts.createPrinter({ removeComments: true });
function facts(root, n) {
  const sf = ts.createSourceFile(
    n,
    fs.readFileSync(`${root}/${n}.ts`, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const norm = (x) =>
    printer
      .printNode(ts.EmitHint.Unspecified, x, sf)
      .replace(/\s/g, "")
      .replace(/60_000/g, "60000");
  return {
    data: sf.statements.filter(ts.isVariableStatement).map(norm),
    bodies: Object.fromEntries(
      sf.statements.filter(ts.isFunctionDeclaration).map((x) => [x.name.text, norm(x.body)]),
    ),
  };
}
const records = [];
for (const n of names) {
  const a = facts("/tmp/knorvia-shared-telemetry-shortcut-migration-baseline", n),
    b = facts("/workspace/knorvia-studio/packages/shared/src", n);
  assert.deepEqual(b.data, a.data, `${n}: static declarations differ`);
  records.push({
    path: `packages/shared/src/${n}.ts`,
    allTopLevelStaticDeclarationsMatch: true,
    exactPrinterNormalizedNamedFunctionBodyMatches: Object.keys(b.bodies).filter(
      (k) => b.bodies[k] === a.bodies[k],
    ),
    qualification:
      "AST printer removes comments/whitespace; not semantic equivalence or provenance proof. Static declarations retained uncounted; exact body recurrence recorded, no novelty metric or MIT conclusion.",
  });
}
process.stdout.write(JSON.stringify(records, null, 2) + "\n");
