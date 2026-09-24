# Local plugin manifest

Place the manifest at `.knorvia-plugin/plugin.json`. Its `name` is a stable lowercase identifier, `version` is a semantic version, and `description` explains the capability. `author` identifies the actual author. Declare the license that applies to the included material; a scaffold cannot determine third-party rights.

Components are optional. The generated form uses paths relative to the plugin root:

```json
{
  "name": "example-tool",
  "version": "0.1.0",
  "description": "Describe the supported task",
  "author": { "name": "Knorvia Studio" },
  "skills": "./skills",
  "agents": "./agents",
  "commands": "./commands",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

Skills have one directory per skill and a SKILL.md entry point. Agent and command definitions use Markdown frontmatter. Hook configuration contains a `hooks` object; the scaffold starts empty. MCP configuration contains an `mcpServers` object; add only explicitly required servers. Empty configuration does not claim an operational tool exists.

Use the installed host's `plugins validate` command for its complete schema. Local preflight checks path references and basic identity, not every supported host field or runtime behavior. Do not embed credentials, machine-specific paths or fixed model accounts in reusable templates.
