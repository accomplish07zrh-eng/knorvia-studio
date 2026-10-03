import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const archiveUrl = new URL("./causality-reduction-target-baseline.json", import.meta.url);
const archiveSha256 = "2dfc375c32fd063e78a810f585422a9e4c0f09be3dab6b94c9923dec73aee813";

export async function loadTargetBaseline(readArchive = (url: URL) => readFile(url, "utf8")) {
  const bytes = await readArchive(archiveUrl);
  assert.equal(sha(bytes), archiveSha256, "exact documentary/pre-target checkpoint");
  const archive = JSON.parse(bytes);
  assert.equal(archive.commit, "886523c223ac23a6ccb2bdd22dbdd4c90e5bdc5f");
  assert.equal(sha(archive.source), archive.sourceSha256);
  assert.equal(sha(archive.compiled), archive.emittedSha256);
  return archive;
}

export function targetCorners() {
  const forward = (from: string, to: string) => ({ from, to, kind: "seq" });
  const carry = (from: string, to: string) => ({ from, to, kind: "carry", carryOf: "seq" });
  return [
    {
      name: "forward-empty-target",
      edges: [forward("a", ""), forward("a", "b"), forward("b", "")],
      expected: [1, 2],
    },
    { name: "carry-seed-is-empty-target", edges: [carry("a", ""), carry("a", "")], expected: [1] },
    { name: "carry-empty-seeds", edges: [carry("a", "")], expected: [0] },
    {
      name: "carry-self-target-needs-full-prefix",
      edges: [forward("a", "b"), forward("b", "c"), carry("c", "a"), carry("a", "a")],
      expected: [0, 1, 2],
    },
  ];
}
