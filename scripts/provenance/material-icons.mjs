// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { git, readRepositoryFile } from "./git.mjs";
import { assertRelativePath, fingerprint } from "./model.mjs";

export async function compareMaterialIcons(root, sourceDirectory, component) {
  const commit = component.referenceRevision;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("A full source commit is required");
  const resolved = (await git(sourceDirectory, ["rev-parse", `${commit}^{commit}`]))
    .toString()
    .trim();
  if (resolved !== commit) throw new Error("Source commit mismatch");
  const license = await git(sourceDirectory, ["show", `${commit}:LICENSE`]);
  const retainedLicense = assertRelativePath(component.file);
  const saved = await readRepositoryFile(root, retainedLicense);
  if (saved.kind !== "file" || saved.sha256 !== fingerprint(license).sha256) {
    throw new Error("Retained license differs from the pinned source");
  }
  if (saved.sha256 !== component.sha256) throw new Error("License inventory digest mismatch");
  const tree = (await git(sourceDirectory, ["ls-tree", "-rz", commit, "--", "icons"]))
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const tab = row.indexOf("\t");
      const [mode, type, blob] = row.slice(0, tab).split(" ");
      if (type !== "blob" || mode === "120000") throw new Error("Unexpected icon object kind");
      return { path: assertRelativePath(row.slice(tab + 1)), blob };
    });
  const ids = [...new Set(tree.map((entry) => entry.blob))];
  const contents = await git(sourceDirectory, ["cat-file", "--batch"], `${ids.join("\n")}\n`);
  const hashes = new Map();
  let cursor = 0;
  for (const id of ids) {
    const end = contents.indexOf(10, cursor);
    const [actual, type, length] = contents.toString("utf8", cursor, end).split(" ");
    const size = Number(length);
    if (
      end < 0 ||
      actual !== id ||
      type !== "blob" ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      end + size + 1 >= contents.length
    ) {
      throw new Error("Invalid icon source object stream");
    }
    hashes.set(id, fingerprint(contents.subarray(end + 1, end + 1 + size)));
    cursor = end + size + 2;
  }
  if (cursor !== contents.length) throw new Error("Unexpected trailing icon source data");
  const byPath = new Map(
    tree.map((entry) => [entry.path, { ...entry, ...hashes.get(entry.blob) }]),
  );
  const matched = [];
  const unresolved = [];
  for (const recorded of component.files) {
    const current = await readRepositoryFile(root, recorded.file);
    const source = byPath.get(`icons/${basename(current.path)}`);
    if (current.kind === "file" && source && current.sha256 === source.sha256) {
      matched.push({
        path: current.path,
        sourcePath: source.path,
        sourceBlob: source.blob,
        sha256: current.sha256,
        normalizedSha256: current.normalizedSha256,
      });
    } else {
      unresolved.push({
        path: current.path,
        reason: source ? "content-different" : "source-path-not-found",
      });
    }
  }
  return {
    schemaVersion: 1,
    component: component.id,
    source: "https://github.com/material-extensions/vscode-material-icon-theme",
    commit,
    license: "MIT",
    copyright: "Copyright (c) 2025 Material Extensions",
    retainedLicense,
    licenseSha256: saved.sha256,
    scope:
      "Exact SVG content comparison against a pinned publisher reference. The original import revision remains unknown. Unresolved entries are not granted a per-file license decision.",
    matched,
    unresolved,
  };
}

async function main() {
  const [flag, sourceDirectory, output, ...extra] = process.argv.slice(2);
  if (flag !== "--source-repo" || !sourceDirectory || !output || extra.length) {
    throw new Error(
      "Usage: node scripts/provenance/material-icons.mjs --source-repo <external-git-directory> <evidence.json>",
    );
  }
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const inventory = JSON.parse(await readFile(resolve(root, "third-party/inventory.json"), "utf8"));
  const component = inventory.copied.find((entry) => entry.id === "Material Icon Theme");
  if (component?.referenceRevision !== "cb1dfb6d9cb73b15681a93939983d75dbba7bf5b") {
    throw new Error("Unexpected Material Icon Theme reference; review the source pin first");
  }
  const report = await compareMaterialIcons(root, sourceDirectory, component);
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({ matched: report.matched.length, unresolved: report.unresolved.length }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
