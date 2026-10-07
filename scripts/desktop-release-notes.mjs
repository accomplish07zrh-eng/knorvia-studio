// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { getReleaseChannel } from "./desktop-release-channel.mjs";

function versionChanges(changelog, version) {
  if (changelog === undefined) return "";
  assert.equal(typeof changelog, "string", "Changelog must be Markdown text");
  const lines = changelog.split(/\r?\n/u);
  const headings = [];
  let fence;
  for (const [index, line] of lines.entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fence) {
      if (marker?.[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim())
        fence = undefined;
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    const heading = /^(#{1,2})\s+(.+)$/u.exec(line);
    if (!heading) continue;
    const title = heading[2];
    headings.push({
      index,
      level: heading[1].length,
      version: /^\[?v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)\]?(?=$|[\s(])/u.exec(title)?.[1],
      unreleased: /^\[?Unreleased\]?(?=$|[\s(])/iu.test(title),
    });
  }
  const matching = headings.filter((heading) => heading.version === version);
  assert.equal(matching.length, 1, `Changelog must contain exactly one section for ${version}`);
  const selected = matching[0];
  const next = headings.find(
    (heading) =>
      heading.index > selected.index &&
      (heading.level <= selected.level || heading.version || heading.unreleased),
  );
  const content = lines
    .slice(selected.index + 1, next?.index)
    .join("\n")
    .trim();
  assert.ok(
    content.replace(/<!--[\s\S]*?-->/gu, "").trim(),
    `Changelog section for ${version} must not be empty`,
  );
  return `## Changes\n\n${content}\n\n`;
}

/** Pure publication text; the publisher retains file IO and immutable remote effects. */
export function createDesktopReleaseNotes({ version, deliveredSha, repository, changelog }) {
  const channel = getReleaseChannel(version);
  assert.match(deliveredSha, /^[a-f0-9]{40}$/u, "Release notes require the full delivered SHA");
  assert.match(repository, /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u, "Invalid GitHub repository");
  const changes = versionChanges(changelog, version);
  const source = `https://github.com/${repository}/commit/${deliveredSha}`;
  return `Knorvia Studio v${version}\n\n${changes}Windows x64 setup, portable ZIP and self-extracting portable EXE; Linux x64 AppImage, deb, rpm and pacman, plus separately marked portable AppImage and tar.gz.\n\nBuilt fresh from checked source commit [${deliveredSha}](${source}). Linux and Windows reusable source checks and actual package acceptance must pass before publication. Per-platform scope, hashes, maintainer and actual Authenticode status are in release-metadata.json. No signing credentials were created; unsigned packages are identified in the metadata.\n\nFollow INSTALLATION.md for directory, shortcut, upgrade, uninstall and profile rules. Normal data is retained during upgrades and ordinary uninstall. Marked portable products keep data/ beside the original launcher or extracted executable; the ordinary Linux AppImage retains the normal user configuration directory. Verify assets with SHA256SUMS or the corresponding .sha256 attachment.\n\n${channel.label}; no claim of human installer GUI, real model-task, full legacy-user migration or macOS acceptance. Apache-2.0, NOTICE and bundled per-component obligations remain. No claim of complete independent authorship or full MIT relicensing.\n`;
}
