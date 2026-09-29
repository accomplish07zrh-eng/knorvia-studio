// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { before, describe, test } from "node:test";
import type { PluginComponentGroup, PluginDiagnostic, PluginManifest } from "@knorvia/contracts";
import { bindTarget, type BoundTarget } from "../src/harness/target-binder.js";
import {
  adapterFrom,
  baseRequest,
  createSandbox,
  diagnosticCodes,
  exportedFunction,
  setupPorts,
  writePlugin,
  writeText,
} from "./support/fixtures.js";
import { simpleManifest, VALID_HOOKS } from "./support/manifests.js";

let indexTarget: BoundTarget | undefined;
let componentTarget: BoundTarget | undefined;
let frontmatterTarget: BoundTarget | undefined;

function required(value: BoundTarget | undefined, name: string): BoundTarget {
  if (value === undefined) throw new Error(`${name} target was not bound`);
  return value;
}

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child);
    }
  };
  visit(directory);
  return files.sort();
}

before(async () => {
  [indexTarget, componentTarget, frontmatterTarget] = await Promise.all([
    bindTarget("index"),
    bindTarget("plugin-components"),
    bindTarget("markdown-frontmatter"),
  ]);
});

describe("roots, commands, components and frontmatter", { concurrency: false }, () => {
  test("ROOT-01: default and explicit command/skill roots merge and deduplicate", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = {
      commands: ["./commands", "./extra-commands", "./commands"],
      name: "merged-roots",
      skills: ["./skills", "./extra-skills", "./skills"],
    };
    const root = writePlugin(sandbox, "merged-roots", manifest, {
      "commands/default.md": "# Default\n",
      "extra-commands/extra.md": "# Extra\n",
      "extra-skills/extra/SKILL.md": "# Extra skill\n",
      "skills/default/SKILL.md": "# Default skill\n",
    });
    setupPorts();

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    assert.deepEqual(
      outcome.commandRoots.map((item) => resolve(item.path)).sort(),
      [resolve(root, "commands"), resolve(root, "extra-commands")].sort(),
    );
    assert.deepEqual(
      outcome.skillRoots.map((item) => resolve(item.path)).sort(),
      [resolve(root, "extra-skills"), resolve(root, "skills")].sort(),
    );
    assert.equal(outcome.plugins[0]?.skillCount, 2);
  });

  test("ROOT-02: unique skill counting does not follow directory junctions or file symlinks", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(sandbox, "no-follow", simpleManifest("no-follow"), {
      "skills/local/SKILL.md": "# Local\n",
    });
    const linkedDirectory = join(sandbox.outside, "linked-skill");
    writeText(join(linkedDirectory, "SKILL.md"), "# Must not count\n");
    symlinkSync(linkedDirectory, join(root, "skills", "junction"), "junction");
    let fileLinkCreated = false;
    try {
      const fileLinkDirectory = join(root, "skills", "file-link");
      mkdirSync(fileLinkDirectory, { recursive: true });
      symlinkSync(join(linkedDirectory, "SKILL.md"), join(fileLinkDirectory, "SKILL.md"), "file");
      fileLinkCreated = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "unknown";
      context.diagnostic(
        `File symlink subcase unavailable on this host (${code}); junction case remains active.`,
      );
    }
    const ports = setupPorts();

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    assert.equal(outcome.plugins[0]?.skillCount, 1);
    assert.ok(
      ports.calls.some(
        (call) =>
          call.name === "scanSkillFilesUnderRootSync" && call.args[0] === join(root, "skills"),
      ),
    );
    assert.equal(fileLinkCreated || process.platform === "win32", true);
  });

  test("ROOT-03: scanner EACCES degrades skill count without a missing-path claim", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(
      sandbox,
      "blocked-skills",
      { name: "blocked-skills", skills: ["./blocked"] },
      { "blocked/skill/SKILL.md": "# Hidden by injected EACCES\n" },
    );
    const ports = setupPorts();
    const error = new Error("Injected permission denial") as NodeJS.ErrnoException;
    error.code = "EACCES";
    ports.scanFaults.set(resolve(root, "blocked"), error);

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    assert.equal(outcome.plugins[0]?.skillCount, 0);
    assert.equal(
      outcome.diagnostics.some((item) => /not found|does not exist|不存在/iu.test(item.message)),
      false,
    );
  });

  test("ROOT-04: an explicit missing skill root and an empty directory remain distinguishable", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(sandbox, "skill-warnings", {
      name: "skill-warnings",
      skills: ["./missing", "./empty"],
    });
    mkdirSync(join(root, "empty"), { recursive: true });
    setupPorts();

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    const warnings = outcome.diagnostics.filter((item) => item.code === "plugin_skill_root_empty");
    assert.equal(warnings.length, 2);
    assert.notEqual(warnings[0]?.message, warnings[1]?.message);
  });

  test("CMD-01: object commands generate contained Markdown with normalized names and supported frontmatter", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(
      sandbox,
      "object-commands",
      {
        commands: {
          "deploy-now": {
            allowedTools: ["Read", "Write"],
            argumentHint: "<target>",
            content: "# Deploy\nRun the deployment.\n",
            description: "Deploy safely",
            model: "fast",
          },
          "from-source": {
            source: "./templates/source.md",
          },
          "Deploy NOW!!!": {
            content: "# Invalid command name\n",
          },
          invalidBoth: {
            content: "# Invalid\n",
            source: "./templates/source.md",
          },
        },
        name: "object-commands",
      },
      {
        "templates/source.md": "---\ndescription: Source command\n---\n# Source\n",
      },
    );
    setupPorts();

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    const plugin = outcome.plugins[0];
    assert.ok(plugin);
    const generatedFiles = listFiles(plugin.dataPath).filter((path) => path.endsWith(".md"));
    assert.equal(generatedFiles.length, 2);
    assert.ok(
      generatedFiles.every((path) => relative(plugin.dataPath, path).startsWith("..") === false),
    );
    assert.ok(generatedFiles.every((path) => basename(path).length <= 132));
    const combined = generatedFiles.map((path) => readFileSync(path, "utf8")).join("\n");
    assert.match(combined, /description:\s*Deploy safely/u);
    assert.match(combined, /argument-hint:\s*<target>/u);
    assert.match(combined, /model:\s*fast/u);
    assert.match(combined, /allowed-tools:/u);
    assert.match(combined, /# Source/u);
    assert.doesNotMatch(combined, /# Invalid command name/u);
    assert.ok(
      diagnosticCodes(outcome).filter((code) => code === "plugin_manifest_invalid").length >= 2,
    );
  });

  test("CMD-02: escaped command roots and object sources diagnose without outside writes", (context) => {
    const sandbox = createSandbox(context);
    const sentinel = join(sandbox.outside, "sentinel.md");
    writeFileSync(sentinel, "unchanged\n", "utf8");
    const root = writePlugin(sandbox, "contained-commands", {
      commands: {
        "../../escape": { content: "# Escape\n" },
        sourceEscape: { source: "../outside/sentinel.md" },
      },
      name: "contained-commands",
    });
    setupPorts();

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    assert.ok(diagnosticCodes(outcome).includes("plugin_component_path_invalid"));
    assert.equal(readFileSync(sentinel, "utf8"), "unchanged\n");
    assert.equal(existsSync(join(sandbox.outside, "escape.md")), false);
  });

  test("COMP-01: unsupported declarations warn while supported components still load", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(
      sandbox,
      "unsupported-mix",
      {
        channels: { alpha: {} },
        lspServers: { typescript: {} },
        name: "unsupported-mix",
        outputStyles: ["compact"],
        settings: { color: "blue" },
      },
      {
        "commands/run.md": "# Run\n",
      },
    );
    setupPorts();

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    assert.ok(
      diagnosticCodes(outcome).filter((code) => code === "plugin_unsupported_component").length >=
        4,
    );
    assert.equal(outcome.commandRoots.length, 1);
  });

  test("COMP-02: disabled metadata remains rich while runtime and data effects stay absent", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(
      sandbox,
      "disabled-rich",
      {
        commands: ["./commands"],
        hooks: "./hooks/hooks.json",
        mcpServers: {
          remote: { type: "http", url: "https://example.invalid/mcp" },
        },
        name: "disabled-rich",
        skills: ["./skills"],
      },
      {
        "commands/run.md": "---\nname: run\ndescription: Run command\n---\n# Run\n",
        "hooks/hooks.json": `${JSON.stringify(VALID_HOOKS)}\n`,
        "skills/review/SKILL.md": "---\nname: review\ndescription: Review skill\n---\n# Review\n",
      },
    );
    setupPorts();
    const request = baseRequest(sandbox, [root]);
    request.config.enabledPlugins = { "disabled-rich@inline": false };

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(request);
    const plugin = outcome.plugins[0];
    assert.ok(plugin);
    assert.equal(plugin.enabled, false);
    assert.deepEqual(plugin.declaredMcpServerNames, ["remote"]);
    assert.equal(plugin.hookDetails.length, 1);
    assert.ok(
      plugin.components.some((group) => group.kind === "command" && group.items[0]?.name === "run"),
    );
    assert.ok(
      plugin.components.some(
        (group) => group.kind === "skill" && group.items[0]?.name === "review",
      ),
    );
    assert.deepEqual(outcome.commandRoots, []);
    assert.deepEqual(outcome.skillRoots, []);
    assert.deepEqual(outcome.hooks, {});
    assert.deepEqual(outcome.mcpServers, {});
    assert.equal(existsSync(plugin.dataPath), false);
  });

  test("COMP-03: direct component enumeration groups five kinds and survives one unreadable item", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(sandbox, "enumerated", simpleManifest("enumerated"), {
      "agents/reviewer.md": "---\nname: reviewer\ndescription: Reviews\n---\n# Reviewer\n",
      "commands/run.md": "---\nname: run\ndescription: Runs\n---\n# Run\n",
      "hooks/hooks.json": `${JSON.stringify(VALID_HOOKS)}\n`,
      "skills/check/SKILL.md": "---\nname: check\ndescription: Checks\n---\n# Check\n",
    });
    mkdirSync(join(root, "commands", "broken.md"), { recursive: true });
    const manifest: PluginManifest = {
      ...simpleManifest("enumerated"),
      mcpServers: { local: { command: "runner" } },
    };
    const diagnostics: PluginDiagnostic[] = [];
    const enumerate = exportedFunction<
      (
        rootPath: string,
        inputManifest: PluginManifest | null,
        options?: { diagnostics?: PluginDiagnostic[]; loaded?: unknown },
      ) => PluginComponentGroup[]
    >(required(componentTarget, "plugin-components"), "enumeratePluginComponents");

    const groups = enumerate(root, manifest, {
      diagnostics,
      loaded: {
        id: "enumerated@inline",
        manifest,
        manifestPath: join(root, ".knorvia-plugin", "plugin.json"),
        marketplace: "inline",
        rootPath: root,
        source: "inline",
      },
    });
    assert.deepEqual(groups.map((group) => group.kind).sort(), [
      "agent",
      "command",
      "hook",
      "mcp",
      "skill",
    ]);
    assert.ok(
      groups.find((group) => group.kind === "command")?.items.some((item) => item.name === "run"),
    );
    assert.ok(
      groups
        .find((group) => group.kind === "skill")
        ?.items.some((item) => item.description === "Checks"),
    );
  });

  test("FM-01: scalar and block frontmatter extraction preserves folded/literal meaning and omissions", (context) => {
    const sandbox = createSandbox(context);
    const folded = join(sandbox.plugins, "folded.md");
    const literal = join(sandbox.plugins, "literal.md");
    const scalar = join(sandbox.plugins, "scalar.md");
    const absent = join(sandbox.plugins, "absent.md");
    writeText(
      folded,
      "---\nname: folded\ndescription: >-\n  first folded line\n  second folded line\n---\n# Body\n",
    );
    writeText(
      literal,
      "---\nname: literal\ndescription: |+\n  first literal line\n  second literal line\n---\n",
    );
    writeText(scalar, "---\nname: scalar\ndescription: Plain description\n---\n");
    writeText(absent, "# No frontmatter\n");
    const readFrontmatter = exportedFunction<
      (filePath: string) => { description?: string; name?: string }
    >(required(frontmatterTarget, "markdown-frontmatter"), "readMarkdownFrontmatter");

    assert.deepEqual(readFrontmatter(folded), {
      description: "first folded line second folded line",
      name: "folded",
    });
    assert.deepEqual(readFrontmatter(literal), {
      description: "first literal line\nsecond literal line",
      name: "literal",
    });
    assert.deepEqual(readFrontmatter(scalar), {
      description: "Plain description",
      name: "scalar",
    });
    assert.deepEqual(readFrontmatter(absent), {});
  });
});
