// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesktopReleaseNotes } from "./desktop-release-notes.mjs";

const input = {
  version: "0.9.0",
  deliveredSha: "a".repeat(40),
  repository: "accomplish07zrh-eng/knorvia-studio",
};
const render = (changelog) => createDesktopReleaseNotes({ ...input, changelog });

test("release notes link the delivered source and retain package, data and acceptance guidance", () => {
  const notes = render(undefined);
  assert.ok(notes.includes(`https://github.com/${input.repository}/commit/${input.deliveredSha}`));
  for (const required of [
    "Windows x64 setup",
    "Linux x64 AppImage, deb, rpm and pacman",
    "SHA256SUMS",
    "Normal data is retained during upgrades and ordinary uninstall",
    "unsigned packages",
    "Stable release",
    "no claim of human installer GUI",
    "Apache-2.0, NOTICE",
  ])
    assert.ok(notes.includes(required), required);
  assert.ok(!notes.includes("## Changes"));
});

test("only the exact version's authored changes enter the public notes", () => {
  const notes = render(
    "# Changelog\n\n## Unreleased\n\n- Future change.\n\n" +
      "## [0.9.0](https://example.com/compare) (2026-10-07)\n\n" +
      "### Added\n\n- Workspace service lifecycle.\n- Editable structured handoff.\n\n" +
      "## 0.8.9\n\n- Previous change.\n",
  );
  assert.ok(notes.includes("## Changes\n\n### Added\n\n- Workspace service lifecycle."));
  assert.ok(notes.includes("- Editable structured handoff."));
  assert.ok(!notes.includes("Future change"));
  assert.ok(!notes.includes("Previous change"));
  assert.ok(!notes.includes("example.com/compare"));
});

test("conventional first-level version headings preserve their nested change categories", () => {
  const notes = render(
    "# [v0.9.0](https://example.com/compare) (2026-10-07)\n\n" +
      "## Features\n\n- Current feature.\n\n" +
      "## 0.8.9\n\n- Previous patch.\n",
  );
  assert.ok(notes.includes("## Features\n\n- Current feature."));
  assert.ok(!notes.includes("Previous patch"));
  assert.ok(render("## v0.9.0\r\n\r\n- Current feature.\r\n").includes("Current feature."));
});

test("fenced code headings neither duplicate the selected version nor end its section", () => {
  const changelog =
    "```markdown\n## 0.9.0\n- Example before the real section.\n```\n\n" +
    "## 0.9.0\n\n- Real change.\n\n" +
    "~~~markdown\n## 0.8.9\n~~~\n\n- Still the current section.\n\n" +
    "## 0.8.9\n- Older changes.\n";
  const notes = render(changelog);
  assert.ok(!notes.includes("Example before the real section"));
  assert.ok(notes.includes("~~~markdown\n## 0.8.9\n~~~"));
  assert.ok(notes.includes("Still the current section"));
  assert.ok(!notes.includes("Older changes"));
});

test("an existing changelog rejects missing, prefix-matched, duplicated or empty version notes", () => {
  for (const changelog of [
    "",
    "## 0.8.8\n- Old change.",
    "## 0.9.01\n- Another version.",
    "## 0.9.0-beta.1\n- Preview change.",
    "## 0.9.0\n- First.\n## [v0.9.0]\n- Duplicate.",
  ])
    assert.throws(() => render(changelog), /exactly one section for 0\.9\.0/);
  for (const changelog of ["## 0.9.0\n", "## 0.9.0\n<!-- pending -->\n## 0.8.9\n- Old."])
    assert.throws(() => render(changelog), /must not be empty/);
  assert.throws(() => render(null), /Changelog must be Markdown text/);
});

test("prerelease notes retain the channel owner and exact suffixed changelog selection", () => {
  const notes = createDesktopReleaseNotes({
    ...input,
    version: "0.9.0-rc.1",
    changelog: "## 0.9.0-rc.1\n- Preview change.\n## 0.9.0\n- Stable change.",
  });
  assert.ok(notes.includes("Prerelease channel"));
  assert.ok(notes.includes("Preview change"));
  assert.ok(!notes.includes("Stable change"));
});

test("invalid source binding fails before rendering public release links", () => {
  assert.throws(
    () => createDesktopReleaseNotes({ ...input, version: "v0.9.0" }),
    /Invalid release/,
  );
  assert.throws(
    () => createDesktopReleaseNotes({ ...input, deliveredSha: "a".repeat(7) }),
    /full delivered SHA/,
  );
  assert.throws(
    () => createDesktopReleaseNotes({ ...input, repository: "https://example.com/x" }),
    /Invalid GitHub repository/,
  );
});
