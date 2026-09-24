export const COMPONENTS = ["skills", "agents", "commands", "hooks", "mcp"];

export function normalizePluginName(value) {
  const name = String(value ?? "").trim().toLowerCase().replace(/[ _]+/gu, "-");
  if (name.length > 64 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(name))
    throw new Error("Plugin name must contain lowercase words separated by hyphens");
  return name;
}

export function scaffoldFiles(input, components = []) {
  const name = normalizePluginName(input);
  if (components.some((item) => !COMPONENTS.includes(item))) throw new Error("Unsupported component");
  const manifest = { name, version: "0.1.0", description: `Local ${name} workflow`, author: { name: "Knorvia Studio" } };
  const files = new Map([
    ["README.md", `# ${name}\n\nDescribe inputs, outputs, permissions and verification here. Install through Settings → Plugins using a local source.\n`],
  ]);
  for (const item of new Set(components)) {
    switch (item) {
      case "skills":
        manifest.skills = "./skills";
        files.set(`skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: Carry out the user-requested ${name} workflow.\n---\n\nDescribe the task boundary, execution steps, failure handling and output verification.\n`);
        break;
      case "agents":
        manifest.agents = "./agents";
        files.set("agents/reviewer.md", "---\nname: reviewer\ndescription: Review the assigned local inputs and report evidence.\ntools: [Read]\n---\n\nRead only assigned inputs. Report findings and uncertainty without editing files.\n");
        break;
      case "commands":
        manifest.commands = "./commands";
        files.set("commands/help.md", `---\ndescription: Explain ${name} usage.\n---\n\nRead the plugin README and describe the supported workflow.\n`);
        break;
      case "hooks":
        manifest.hooks = "./hooks/hooks.json";
        files.set("hooks/hooks.json", JSON.stringify({ hooks: {} }, null, 2) + "\n");
        break;
      case "mcp":
        manifest.mcpServers = "./.mcp.json";
        files.set(".mcp.json", JSON.stringify({ mcpServers: {} }, null, 2) + "\n");
        break;
    }
  }
  files.set(".knorvia-plugin/plugin.json", JSON.stringify(manifest, null, 2) + "\n");
  return files;
}
