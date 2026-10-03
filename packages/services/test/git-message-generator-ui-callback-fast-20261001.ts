// Execute actual private UI callbacks with owned closures, without mounting React.
// Read only the workspace's source/emitted code, never a user conversation/repo.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
export async function uiCallbackHarness(url: string) {
  const path = url.endsWith(".ts") ? `${url}x` : url;
  assert.match(path, /\/(?:src|dist)\/GitActionMenu\.(?:tsx|js)$/);
  const text = await readFile(new URL(path), "utf8");
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JS,
  );
  const helpers = new Map<string, string>(),
    callbacks = new Map<string, string>();
  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      ["getCommitDialogFiles", "getCommitDialogStagePaths"].includes(node.name.text)
    )
      helpers.set(node.name.text, node.getText(file));
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ["generateCommitMessage", "handleGenerateCommitMessage"].includes(node.name.text)
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
  assert.equal(helpers.size, 2);
  assert.equal(callbacks.size, 2);
  return {
    path,
    callback(name: string, closure: Record<string, unknown>) {
      assert.ok(callbacks.has(name));
      const code = [
        ...helpers.values(),
        `const invocation = ${callbacks.get(name)}; invocation;`,
      ].join("\n");
      const output = ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext },
      }).outputText;
      return runInNewContext(output, closure, { filename: path });
    },
  };
}
