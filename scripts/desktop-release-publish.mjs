// Publication executes only the existing release-immutability plan; no alternate overwrite path.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { decideReleasePlan } from "./release-immutability.mjs";
import { getReleaseChannel } from "./desktop-release-channel.mjs";
import { artifactIdentity } from "./desktop-release-manifest.mjs";
import { createDesktopReleaseNotes } from "./desktop-release-notes.mjs";

const exec = promisify(execFile);
const root = resolve(process.argv[2]);
const deliveredSha = process.env.DELIVERED_SHA;
const tag = process.env.RELEASE_TAG;
const version = process.env.RELEASE_VERSION;
const repository = process.env.GITHUB_REPOSITORY;
assert.match(deliveredSha, /^[a-f0-9]{40}$/);
assert.equal(tag, `v${version}`);
const channel = getReleaseChannel(version);
const json = async (name) => JSON.parse(await readFile(join(root, name), "utf8"));
const [artifacts, validated, metadata] = await Promise.all([
  json("release-artifacts.json"),
  json("release-decision.json"),
  json("release-metadata.json"),
]);
assert.equal(validated.deliveredSha, deliveredSha);
assert.equal(metadata.deliveredSha, deliveredSha);
assert.equal(metadata.version, version);
assert.equal(metadata.prerelease, channel.prerelease);
assert.equal((await exec("git", ["rev-parse", "HEAD"])).stdout.trim(), deliveredSha);
for (const artifact of artifacts) {
  assert.match(artifact.name, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
  assert.equal((await artifactIdentity(join(root, artifact.name))).sha256, artifact.sha256);
}
// Resolve remote state again immediately before writing, so a concurrent tag or
// upload cannot turn the read-only validation result into overwrite permission.
await exec("git", ["fetch", "origin", "--tags"]);
let tagSha = null;
try {
  tagSha = (
    await exec("git", ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`])
  ).stdout.trim();
} catch (error) {
  if (error.code !== 128) throw error;
}
let releaseState = "unknown";
let existingAssets = [];
try {
  const existing = JSON.parse(
    (
      await exec("gh", ["api", `repos/${repository}/releases/tags/${tag}`], {
        maxBuffer: 8 * 1024 * 1024,
      })
    ).stdout,
  );
  assert.equal(
    existing.draft,
    false,
    "Do not silently promote or overwrite an existing draft release",
  );
  releaseState = "exists";
  existingAssets = existing.assets;
} catch (error) {
  if (/HTTP 404/.test(error.stderr ?? "")) releaseState = "missing";
  else throw error;
}
const decision = decideReleasePlan({
  tag,
  deliveredSha,
  tagExists: Boolean(tagSha),
  tagSha,
  releaseState,
  artifacts,
  existingAssets,
});
assert.notEqual(decision.action, "reject", decision.message);
// 修复：发布说明只取当前版本的已提交变更，防止把旧版本说明或空草稿发到正式 Release。
let changelog;
try {
  changelog = await readFile("CHANGELOG.md", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const notes = createDesktopReleaseNotes({ version, deliveredSha, repository, changelog });
await writeFile(join(root, "publication-notes.md"), notes);
if (decision.action === "create") {
  const args = [
    "release",
    "create",
    tag,
    "--repo",
    repository,
    "--target",
    deliveredSha,
    "--title",
    `Knorvia Studio ${tag}`,
    "--notes-file",
    join(root, "publication-notes.md"),
  ];
  if (channel.prerelease) args.push("--prerelease");
  await exec("gh", args);
}
if (decision.toUpload.length) {
  await exec(
    "gh",
    [
      "release",
      "upload",
      tag,
      "--repo",
      repository,
      ...decision.toUpload.map((name) => join(root, name)),
    ],
    { timeout: 1500000, maxBuffer: 8 * 1024 * 1024 },
  );
}
console.log(
  JSON.stringify({
    tag,
    deliveredSha,
    action: decision.action,
    uploaded: decision.toUpload.length,
    url: `https://github.com/${repository}/releases/tag/${tag}`,
  }),
);
