import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "/workspace/knorvia-studio/node_modules/typescript/lib/typescript.js";

const names = ["atomicFileLock", "privateFilePersistence"];
const printer = ts.createPrinter({ removeComments: true });

function facts(root, name) {
  const source = ts.createSourceFile(
    name,
    fs.readFileSync(`${root}/${name}.ts`, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const normalize = (node) =>
    printer
      .printNode(ts.EmitHint.Unspecified, node, source)
      .replace(/\s/g, "")
      .replace(/(?<=\d)_(?=\d)/g, "");
  return {
    data: source.statements.filter(ts.isVariableStatement).map(normalize),
    bodies: Object.fromEntries(
      source.statements
        .filter(ts.isFunctionDeclaration)
        .map((node) => [node.name.text, normalize(node.body)]),
    ),
  };
}

const records = names.map((name) => {
  const baseline = facts("/tmp/knorvia-shared-file-lock-baseline", name);
  const candidate = facts("/workspace/knorvia-studio/packages/shared/src/node", name);
  assert.deepEqual(candidate.data, baseline.data, `${name}: static declarations differ`);
  return {
    path: `packages/shared/src/node/${name}.ts`,
    allTopLevelStaticDeclarationsMatch: true,
    exactPrinterNormalizedNamedFunctionBodyMatches: Object.keys(candidate.bodies).filter(
      (key) => candidate.bodies[key] === baseline.bodies[key],
    ),
    independentReplacementCredit: 0,
    qualification:
      "Lexical AST printing removes comments/whitespace (including string whitespace) and numeric separators between digits. This is not semantic equivalence or provenance proof. Static declarations retained uncounted; recurrence recorded without novelty or MIT conclusions.",
  };
});
process.stdout.write(JSON.stringify(records, null, 2) + "\n");
