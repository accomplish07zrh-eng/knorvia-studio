// Extract the actual source or emitted callback from owned workspace artifacts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
export function ignoredUiCallback(url: string, closure: Record<string, unknown>) {
  assert.match(url, /\/(?:src|dist)\/workspace-file-tree\/useWorkspaceFileTreeData\.(?:ts|js)$/);
  const text = readFileSync(new URL(url), "utf8"),
    sf = ts.createSourceFile(url, text, ts.ScriptTarget.Latest, true);
  let callback: string | undefined;
  function visit(n: ts.Node) {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "loadDirectory") {
      assert.ok(n.initializer && ts.isCallExpression(n.initializer));
      assert.equal(n.initializer.expression.getText(sf), "useCallback");
      assert.ok(ts.isArrowFunction(n.initializer.arguments[0]!));
      callback = n.initializer.arguments[0]!.getText(sf);
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  assert.ok(callback);
  const compiled = ts.transpileModule(`const callback=${callback};callback;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(compiled, { Map, Set, Error, ...closure }, { filename: url }) as (
    path: string,
    depth: number,
    options?: unknown,
  ) => Promise<unknown>;
}
