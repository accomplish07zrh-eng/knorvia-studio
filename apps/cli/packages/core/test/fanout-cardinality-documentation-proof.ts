import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { syntaxDigest } from "./causality-reduction-documentation-proof.js";

const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const proofUrl = new URL("./fanout-cardinality-declaration-baseline.json", import.meta.url);
const proofSha256 = "ec1e868b55e1b99c10757961e81d1a6e58127d0caf3a31b6843cb3a5a813920a";
const historicalSha256 = "6df2e52e3d50890410d40737bb1eac728909b66b2c8c55dad05a5e9b0c1ead47";

export async function loadCardinalityDeclarationProof(
  readProof = (url: URL) => readFile(url, "utf8"),
) {
  const bytes = await readProof(proofUrl);
  assert.equal(hash(bytes), proofSha256, "exact historical cardinality declaration proof");
  const proof = JSON.parse(bytes);
  assert.equal(hash(proof.declaration), historicalSha256);
  assert.equal(proof.declarationSha256, historicalSha256);
  assert.equal(syntaxDigest(proof.declaration), proof.declarationSyntaxSha256);
  return proof;
}

export async function assertCardinalityDeclarationShape(current: string, historical: string) {
  const proof = await loadCardinalityDeclarationProof();
  assert.equal(historical, historicalSha256);
  assert.equal(syntaxDigest(current), proof.declarationSyntaxSha256, "cardinality API shape");
}
