// Actual private source/emitted callbacks; read only owned workspace artifacts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
export function graphUiHarness(url: string) {
  const path = url.endsWith(".ts") ? `${url}x` : url;
  assert.match(path, /\/(?:src|dist)\/git-graph\/GitGraphDialog\.(?:tsx|js)$/);
  const text = readFileSync(new URL(path), "utf8");
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JS,
  );
  const callbacks = new Map<string, string>();
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ["loadInitialCommits", "refreshCommits", "loadMoreCommits"].includes(node.name.text)
    ) {
      assert.ok(node.initializer && ts.isCallExpression(node.initializer));
      assert.equal(node.initializer.expression.getText(file), "useCallback");
      const callback = node.initializer.arguments[0]!;
      assert.ok(ts.isArrowFunction(callback));
      callbacks.set(node.name.text, callback.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(callbacks.size, 3);
  return {
    path,
    callback(name: string, closure: Record<string, unknown>) {
      assert.ok(callbacks.has(name));
      const output = ts.transpileModule(`const callback=${callbacks.get(name)};callback;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext },
      }).outputText;
      return runInNewContext(output, closure, { filename: path }) as () => Promise<void>;
    },
  };
}
