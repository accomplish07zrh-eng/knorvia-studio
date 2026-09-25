# material-organizer

A Knorvia Studio plugin containing one portable skill. It asks the active agent to
inventory a folder of loose materials that the user explicitly selected, classify
each item by its content, and produce an index plus a proposed naming and sorting
plan. It runs no scripts and declares no agents, commands, hooks or MCP servers.

The proposed plan is a document, not an action: the skill never moves, renames,
copies or deletes a material. Applying a plan stays a separate, explicit user
decision, which keeps the skill's declared permission surface read-only apart from
one new index file.

## What this pack does not claim

- Installable does not mean supported. Structure checks and host `plugins validate`
  prove nothing about this skill on any kernel; see
  `docs/knorvia-plugin-compatibility-matrix.md` in the Knorvia Studio repository.
- No kernel execution, no model run and no cross-kernel verification were performed
  for this pack. `.knorvia-plugin/compatibility.json` therefore marks every kernel
  as `declared` (Knorvia host, form only) or `unknown`.
- Classification quality depends on the active model and on whether the material
  formats can be read at all; the index records what could not be read instead of
  guessing.

## Install through the existing local source mechanism

This pack is a teaching example, not a built-in plugin. There is no separate plugin
marketplace page. From the repository root, with `<repo-root>` replaced by that
absolute path:

1. Preflight (read-only, no CLI needed):

   `node <repo-root>/apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/validate-plugin.mjs <repo-root>/examples/plugins/material-organizer`

   Expected output is `{"schemaValidated":false}`. That means paths and the manifest
   passed the read-only preflight only.

2. Register a local source index next to the pack, then add that directory in
   Settings → Plugins → Sources, refresh, install, and enable:

   `node <repo-root>/apps/cli/packages/plugin-creator-plugin/skills/plugin-creator/scripts/upsert-dev-marketplace.mjs <repo-root>/examples/plugins/material-organizer --marketplace-path <repo-root>/examples/plugins/dev-marketplace.json --name-zh 资料整理 --description-zh 盘点指定目录的零散资料并生成索引与整理建议`

   The generated `dev-marketplace.json` is a local development artefact; keep it out
   of commits if you do not want it tracked. Registration, installation and
   enablement are three separate states.

## Layout

```text
.knorvia-plugin/plugin.json          manifest (skills only, license by reference)
.knorvia-plugin/compatibility.json   per-kernel declaration, unverified by default
LICENSE.txt                          MIT licence text for this pack
README.md                            this file
skills/material-organizer/SKILL.md   the skill the model sees
skills/material-organizer/skill-contract.json  machine-checkable contract sidecar
fixtures/                            five reviewed request fixtures, development only
```

`fixtures/` is development material and is deliberately not declared in the
manifest: it exists so reviewers and tests can inspect the expected behaviour of
the skill, and it is not part of an installed capability.
