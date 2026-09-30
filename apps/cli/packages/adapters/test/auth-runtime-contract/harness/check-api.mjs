// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUITE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REFERENCE_ROOT = path.join(SUITE_ROOT, "retained-contract", "auth");

const EXPECTED = Object.freeze({
  "browser.d.ts": ["BrowserOpenOptions", "BrowserOpenResult", "openUrlInBrowser"],
  "credential-cipher.d.ts": [
    "KnorviaCredentialCipher",
    "KnorviaCredentialCipherOptions",
    "createKnorviaCredentialCipher",
    "isEncryptedKnorviaCredentialValue",
  ],
  "localhost-callback.d.ts": [
    "LocalhostOAuthCallback",
    "LocalhostOAuthCallbackServer",
    "MCP_OAUTH_CALLBACK_DENIED_ERROR_CODE",
    "McpOAuthCallbackDeniedError",
    "createLocalhostOAuthCallbackServer",
  ],
  "shared-credentials.d.ts": [
    "SharedKnorviaCredentialStore",
    "SharedKnorviaCredentialStoreOptions",
    "createSharedKnorviaCredentialStore",
    "loadSharedKnorviaCredentialSync",
    "resolveSharedKnorviaCredentialsPath",
  ],
});

export function checkApi({ repoRoot, toolingRoot }) {
  const requireFromTooling = createRequire(path.join(toolingRoot, "package.json"));
  const ts = requireFromTooling("typescript");
  const adaptersRoot = path.join(repoRoot, "apps", "cli", "packages", "adapters");
  const targetRoot = path.join(adaptersRoot, "dist", "auth");
  const targetFiles = Object.keys(EXPECTED).map((name) => path.join(targetRoot, name));
  const rootDeclaration = path.join(adaptersRoot, "dist", "index.d.ts");
  const probe = path.join(SUITE_ROOT, "tests", "api-probe.ts");
  const portable = (value) => value.replaceAll("\\", "/");
  const options = {
    lib: ["lib.es2023.d.ts"],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    paths: {
      "reference/*": [`${portable(REFERENCE_ROOT)}/*.d.ts`],
      "target-root": [portable(rootDeclaration)],
      "target/*": [`${portable(targetRoot)}/*.d.ts`],
    },
    skipLibCheck: false,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    types: [],
  };
  const roots = [
    probe,
    path.join(SUITE_ROOT, "retained-contract", "dependencies.d.ts"),
    ...targetFiles,
    path.join(targetRoot, "index.d.ts"),
    rootDeclaration,
  ];
  const originalRoot = readFileSync(rootDeclaration, "utf8");
  const rootSyntax = ts.createSourceFile(
    rootDeclaration,
    originalRoot,
    ts.ScriptTarget.Latest,
    true,
  );
  const projected = [];
  const unrelated = [];
  for (const statement of rootSyntax.statements) {
    assert.ok(
      ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier),
      "Unexpected adapters root declaration shape",
    );
    if (statement.moduleSpecifier.text === "./auth/index.js")
      projected.push(statement.getText(rootSyntax));
    else unrelated.push(statement.moduleSpecifier.text);
  }
  assert.equal(projected.length, 1, "Adapters root must retain its actual auth re-export");
  const projectedRoot = `${projected.join("\n")}\n`;
  const compilerHost = ts.createCompilerHost(options);
  const originalGetSourceFile = compilerHost.getSourceFile.bind(compilerHost);
  compilerHost.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) =>
    path.resolve(file) === path.resolve(rootDeclaration)
      ? ts.createSourceFile(file, projectedRoot, languageVersion, true)
      : originalGetSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram({ options, rootNames: roots, host: compilerHost });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    const host = {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => SUITE_ROOT,
      getNewLine: () => "\n",
    };
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
  }
  const checker = program.getTypeChecker();
  for (const filePath of targetFiles) {
    const source = program.getSourceFile(filePath);
    assert.ok(source?.symbol, `missing declaration module symbol: ${filePath}`);
    const names = checker
      .getExportsOfModule(source.symbol)
      .map((symbol) => symbol.name)
      .sort();
    assert.deepEqual(
      names,
      [...EXPECTED[path.basename(filePath)]].sort(),
      `unexpected exports: ${filePath}`,
    );
    let privateSyntax = false;
    const visit = (node) => {
      if (node.kind === ts.SyntaxKind.PrivateIdentifier) privateSyntax = true;
      if (node.modifiers?.some((item) => item.kind === ts.SyntaxKind.PrivateKeyword))
        privateSyntax = true;
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.equal(privateSyntax, false, `private declaration leaked from ${filePath}`);
  }
  const authIndex = program.getSourceFile(path.join(targetRoot, "index.d.ts"));
  assert.ok(authIndex?.symbol, "missing auth index declaration");
  const authNames = checker
    .getExportsOfModule(authIndex.symbol)
    .map((symbol) => symbol.name)
    .sort();
  const expectedAuth = Object.values(EXPECTED).flat().sort();
  assert.deepEqual(authNames, expectedAuth, "auth declaration barrel is not exact");
  const rootSource = program.getSourceFile(rootDeclaration);
  assert.ok(rootSource?.symbol, "missing adapters root declaration");
  const rootNames = new Set(
    checker.getExportsOfModule(rootSource.symbol).map((symbol) => symbol.name),
  );
  for (const name of expectedAuth)
    assert.ok(rootNames.has(name), `adapters root does not export ${name}`);
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const inputGraph = program.getSourceFiles().map((source) => ({
    path: source.fileName,
    originalSha256: digest(readFileSync(source.fileName)),
    compiledSha256: digest(source.text),
    declaration: source.isDeclarationFile,
  }));
  assert.ok(process.env.KNORVIA_TEST_TEMP_ROOT, "Owned API evidence directory is required");
  writeFileSync(
    path.join(process.env.KNORVIA_TEST_TEMP_ROOT, "auth-api-graph.json"),
    `${JSON.stringify(
      {
        strict: true,
        skipLibCheck: false,
        authNames,
        rootAuthNames: expectedAuth,
        rootProjection: {
          originalSha256: digest(originalRoot),
          compiledSha256: digest(projectedRoot),
          retained: projected,
          excludedUnrelatedExports: unrelated,
        },
        inputs: inputGraph,
      },
      null,
      2,
    )}\n`,
  );
  return { authNames, leafExports: EXPECTED, rootAuthNames: expectedAuth };
}
