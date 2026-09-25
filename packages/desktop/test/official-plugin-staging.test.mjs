import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  officialPluginPackages,
  stageOfficialPluginAssets,
} from "../scripts/official-plugin-staging.mjs";

function fixture(t) {
  const repoRoot = mkdtempSync(join(tmpdir(), "knorvia-plugin-staging-"));
  t.after(() => rmSync(repoRoot, { force: true, recursive: true }));
  for (const plugin of officialPluginPackages) {
    const root = resolve(repoRoot, plugin.relativePath);
    const assets = new Set([
      ".knorvia-plugin/plugin.json",
      ...(plugin.requiredSeedPaths ?? []),
      ...(plugin.requiredRuntimePaths ?? []),
    ]);
    for (const asset of assets) {
      const path = resolve(root, asset);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        asset === ".knorvia-plugin/plugin.json"
          ? JSON.stringify({ name: plugin.name, version: plugin.version })
          : `${plugin.name}/${asset}`,
      );
    }
  }
  return {
    repoRoot,
    agentDir: resolve(repoRoot, "staged", "knorvia"),
  };
}

test("staging rejects a bad plugin before touching any existing staged plugin", (t) => {
  const input = fixture(t);
  stageOfficialPluginAssets({ ...input, log: () => {} });
  const first = officialPluginPackages[0];
  const last = officialPluginPackages.at(-1);
  const sentinel = resolve(input.agentDir, first.stagedPath, "stale.txt");
  writeFileSync(sentinel, "keep until sources pass");
  const lastManifest = resolve(input.repoRoot, last.relativePath, ".knorvia-plugin/plugin.json");
  writeFileSync(lastManifest, JSON.stringify({ name: last.name, version: "999.0.0" }));
  assert.throws(() => stageOfficialPluginAssets({ ...input, log: () => {} }), /identity mismatch/);
  assert.equal(readFileSync(sentinel, "utf8"), "keep until sources pass");

  writeFileSync(lastManifest, JSON.stringify({ name: last.name, version: last.version }));
  const required = resolve(input.repoRoot, last.relativePath, last.requiredSeedPaths[0]);
  rmSync(required);
  assert.throws(
    () => stageOfficialPluginAssets({ ...input, log: () => {} }),
    /missing official plugin seed asset/,
  );
  assert.equal(readFileSync(sentinel, "utf8"), "keep until sources pass");

  writeFileSync(required, "restored");
  stageOfficialPluginAssets({ ...input, log: () => {} });
  assert.throws(() => readFileSync(sentinel), /ENOENT/);
  assert.equal(
    readFileSync(resolve(input.agentDir, last.stagedPath, last.requiredSeedPaths[0]), "utf8"),
    "restored",
  );
});

test("bundled content skills emit Knorvia citations and product bylines", () => {
  const packagesRoot = resolve(import.meta.dirname, "../../../apps/cli/packages");
  for (const [plugin, skill] of [
    ["documents", "docx"],
    ["pdf", "pdf"],
    ["presentations", "pptx"],
    ["spreadsheets", "xlsx"],
  ]) {
    const source = readFileSync(
      resolve(packagesRoot, `${plugin}-plugin`, "skills", skill, "SKILL.md"),
      "utf8",
    );
    assert.match(source, /author: Knorvia Studio/u);
    assert.match(source, /::knorvia-file-citation\{/u);
    assert.doesNotMatch(source, /::zcode-file-citation\{/u);
  }
});

test("new office plugin assets stage byte-for-byte and exclude superseded files", (t) => {
  const input = fixture(t);
  const repoRoot = resolve(import.meta.dirname, "../../..");
  const contentNames = new Set(["documents", "pdf", "presentations", "spreadsheets"]);
  const selected = officialPluginPackages.filter((plugin) => contentNames.has(plugin.name));
  function fingerprints(root) {
    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.endsWith(".pyc"))
      .map((entry) => {
        const file = resolve(entry.parentPath, entry.name);
        return [
          file.slice(root.length + 1).replaceAll("\\", "/"),
          createHash("sha256").update(readFileSync(file)).digest("hex"),
        ];
      })
      .sort(([left], [right]) => left.localeCompare(right));
  }
  for (const plugin of selected) {
    cpSync(resolve(repoRoot, plugin.relativePath), resolve(input.repoRoot, plugin.relativePath), {
      recursive: true,
    });
    const destination = resolve(input.agentDir, plugin.stagedPath);
    mkdirSync(destination, { recursive: true });
    writeFileSync(resolve(destination, "superseded-template.txt"), "must not ship");
  }
  stageOfficialPluginAssets({ ...input, log: () => {} });
  for (const plugin of selected) {
    const source = resolve(repoRoot, plugin.relativePath);
    const staged = resolve(input.agentDir, plugin.stagedPath);
    assert.deepEqual(fingerprints(staged), fingerprints(source));
    const manifest = JSON.parse(
      readFileSync(resolve(staged, ".knorvia-plugin/plugin.json"), "utf8"),
    );
    assert.equal(manifest.version, "0.2.0");
    assert.equal(manifest.author.name, "Knorvia Studio");
    assert.equal(fingerprints(staged).length, 6);
  }
});
