# document-quality-check

A Knorvia Studio plugin containing one portable skill. It asks the active agent to
review a document the user explicitly selected and write a severity-ranked report:
every finding carries an exact location and a reason, and the report ends with the
list of things that were not checked. It runs no scripts and declares no agents,
commands, hooks or MCP servers.

The skill reports; it does not edit. Fixing anything in the document is a separate,
explicitly confirmed action, which keeps the declared permission surface read-only
apart from one new report file.

## What this pack does not claim

- Installable does not mean supported. Structure checks and host `plugins validate`
  prove nothing about this skill on any kernel; see
  `docs/knorvia-plugin-compatibility-matrix.md` in the Knorvia Studio repository.
- No kernel execution, no model run and no cross-kernel verification were performed
  for this pack. `.knorvia-plugin/compatibility.json` therefore marks every kernel
  as `declared` (Knorvia host, form only) or `unknown`.
- Layout, pagination and rendering fidelity are not judged: a text-level review
  cannot see page breaks, fonts or macros. The report says this instead of implying
  a visual check happened.

## Install through the existing local source mechanism

This pack is a teaching example, not a built-in plugin. There is no separate plugin
marketplace page. From the repository root, with `<repo-root>` replaced by that
absolute path:

1. Preflight (read-only, no CLI needed):

   `node <repo-root>/apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/validate-plugin.mjs <repo-root>/examples/plugins/document-quality-check`

   Expected output is `{"schemaValidated":false}`. That means paths and the manifest
   passed the read-only preflight only.

2. Register a local source index next to the pack, then add that directory in
   Settings → Plugins → Sources, refresh, install, and enable:

   `node <repo-root>/apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/upsert-dev-marketplace.mjs <repo-root>/examples/plugins/document-quality-check --marketplace-path <repo-root>/examples/plugins/dev-marketplace.json --name-zh 文档质量检查 --description-zh 审阅指定文档并输出带位置与严重级别的质量报告`

   The generated `dev-marketplace.json` is a local development artefact; keep it out
   of commits if you do not want it tracked. Registration, installation and
   enablement are three separate states.

## Layout

```text
.knorvia-plugin/plugin.json          manifest (skills only, license by reference)
.knorvia-plugin/compatibility.json   per-kernel declaration, unverified by default
LICENSE.txt                          MIT licence text for this pack
README.md                            this file
skills/document-quality-check/SKILL.md          the skill the model sees
skills/document-quality-check/skill-contract.json  machine-checkable contract sidecar
fixtures/                            five reviewed request fixtures, development only
```

`fixtures/` is development material and is deliberately not declared in the
manifest: it exists so reviewers and tests can inspect the expected behaviour of
the skill, and it is not part of an installed capability.
