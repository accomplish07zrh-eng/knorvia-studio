import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const proofUrl = new URL("./causality-reduction-declaration-baseline.json", import.meta.url);
const proofSha256 = "80bdeda7b0a4924209d77e865a2b48c8cbac300a498860f505fe58334398e41b";
const historicalDeclarationSha256 =
  "347f2cacda781da42d0b1d9b7a6857d316f63d65f001837986784676357f74e5";

function parse(text: string, javascript: boolean) {
  const file = ts.createSourceFile(
    javascript ? "owned.js" : "owned.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
    javascript ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
  // Parser errors are not part of SourceFile's public type, but are needed for fail-closed proofs.
  assert.equal(
    (file as ts.SourceFile & { parseDiagnostics: unknown[] }).parseDiagnostics.length,
    0,
  );
  return file;
}

export function syntaxDigest(text: string, javascript = false): string {
  const file = parse(text, javascript);
  const shape = (node: ts.Node): unknown => {
    const children = node.getChildren(file).filter((child) => !ts.isJSDoc(child));
    return [node.kind, children.length ? children.map(shape) : node.getText(file)];
  };
  return hash(JSON.stringify(shape(file)));
}

export function inspectComments(text: string, javascript = false): string[] {
  const file = parse(text, javascript);
  const ranges = new Map<number, ts.CommentRange>();
  const visit = (node: ts.Node) => {
    for (const range of [
      ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.end) ?? []),
    ])
      ranges.set(range.pos, range);
    for (const child of node.getChildren(file)) visit(child);
  };
  visit(file);
  return [...ranges.values()].sort((a, b) => a.pos - b.pos).map((r) => text.slice(r.pos, r.end));
}

export async function loadDeclarationProof(readProof = (url: URL) => readFile(url, "utf8")) {
  const bytes = await readProof(proofUrl);
  assert.equal(hash(bytes), proofSha256, "historical declaration proof");
  const proof = JSON.parse(bytes);
  assert.equal(hash(proof.declaration), historicalDeclarationSha256);
  assert.equal(proof.declarationSha256, historicalDeclarationSha256);
  assert.equal(syntaxDigest(proof.declaration), proof.declarationSyntaxSha256);
  return proof;
}

export async function assertDeclarationShape(current: string, archivedDigest: string) {
  const proof = await loadDeclarationProof();
  assert.equal(archivedDigest, historicalDeclarationSha256);
  assert.equal(
    syntaxDigest(current),
    proof.declarationSyntaxSha256,
    "public declaration API shape",
  );
}
