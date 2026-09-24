---
name: plugin-creator
description: Create, validate and update local Knorvia Studio plugins using the existing Settings → Plugins source workflow.
author: Knorvia Studio
---

# Develop a local plugin

Use this skill for a reusable bundle of skills, commands, agents, hooks or MCP configuration. Keep the plugin inside the user's chosen development directory. Installing a plugin can enable commands and hooks, so review its declared capabilities before installation.

## Create

Run `node scripts/create-basic-plugin.mjs <name> --path <parent> --with-skills` from this skill directory. Optional flags are --with-agents, --with-commands, --with-hooks and --with-mcp. The result contains only selected components.

Names must be lowercase words separated by hyphens. By default existing directories are rejected. --force permits replacing the scaffold's own files while leaving unrelated files intact; use it only when those replacements are intended. Review a changed manifest before enabling newly introduced behavior.

Read references/plugin-json-spec.md, then replace scaffold descriptions and examples with the requested implementation. Store secrets in the application's credential mechanism or runtime configuration, never in a plugin template.

## Validate

Run `node scripts/validate-plugin.mjs <plugin-path>`. Local validation is read-only and does not run scripts, hooks or MCP servers. It checks manifest identity, component paths, symlinks and referenced files.

For full host schema validation, explicitly pass --cli with the absolute path to the current Knorvia Studio CLI executable or its .cjs/.mjs entry. No executable is looked up automatically on PATH. Host validation is additional evidence; it does not prove that every plugin function works.

Exercise representative capabilities with local fixtures and record the actual results. Test malformed input, cancellation where relevant, reruns, paths containing spaces and absent dependencies. Respect current model choices and do not perform paid inference without authorization.

## Install and iterate

Run `node scripts/upsert-dev-marketplace.mjs <plugin-path>` to create or update the local source index beside the plugin directory. --marketplace-path selects an existing index explicitly; optional display-name, name-zh and description-zh flags provide listing text.

Open Settings → Plugins, add that local source, refresh it, and install or update the plugin from the same page. Follow references/installing-and-updating.md. This uses the existing local source mechanism and creates no separate marketplace page.

Increase the plugin version when publishing changed assets. Validate and test before refreshing the source. The scripts never edit installed caches or user data. Report the source path, version, capabilities tested, installation outcome and any remaining checks.
