import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  parseSlashCommand,
  AVAILABLE_COMMANDS,
} from "../apps/cli/packages/cli/src/command-center/slash-commands.js";
import { buildCliPrefixSection } from "../apps/cli/packages/core/src/context/sections/cli-prefix.js";
import { buildIdentitySection } from "../apps/cli/packages/core/src/context/sections/identity.js";
import { buildDesktopContextSection } from "../apps/cli/packages/core/src/context/sections/desktop.js";
import {
  createSharedKnorviaCredentialStore,
  resolveSharedKnorviaCredentialsPath,
} from "../apps/cli/packages/adapters/src/auth/shared-credentials.js";
import { discoverWorkspaceHookConfigPaths } from "../packages/shared/src/workspace-hook-config.js";
import { resolveKnorviaDataRoot } from "../packages/shared/src/node/knorviaPaths.js";
import { formatCliHelp } from "../apps/cli/packages/cli/src/help.js";

test("both agent help locales advertise Knorvia without obsolete product OAuth options", () => {
  for (const locale of ["zh-CN", "en-US"] as const) {
    const help = formatCliHelp("test", locale);
    assert.match(help, /Knorvia Studio Agent test/);
    assert.match(help, /knorvia \[command\]/);
    assert.doesNotMatch(help, /\bzcode\b|--no-browser|\/login|\/logout/);
  }
});

test("portable base wins and the full root is never suffixed twice", () => {
  const base = join(tmpdir(), "knorvia-portable-base");
  const root = join(tmpdir(), "knorvia-explicit-root");
  assert.equal(
    resolveKnorviaDataRoot({ KNORVIA_DATA_BASE_DIR: base, KNORVIA_HOME: root }),
    join(base, ".knorvia-studio"),
  );
  assert.equal(resolveKnorviaDataRoot({ KNORVIA_HOME: root }), root);
  assert.notEqual(resolveKnorviaDataRoot({ ZCODE_DATA_BASE_DIR: base, ZCODE_HOME: root }), root);
});

test("product login/logout are not executable or suggested agent commands", () => {
  for (const command of ["/login", "/login zai-coding-plan", "/logout"]) {
    assert.equal(parseSlashCommand(command)?.type, "unknown");
  }
  assert.ok(!AVAILABLE_COMMANDS.includes("/login"));
  assert.ok(!AVAILABLE_COMMANDS.includes("/logout"));
  assert.equal(parseSlashCommand("/model")?.type, "known");
});

test("agent prompts identify Knorvia while preserving tool permission boundaries", () => {
  const sections = [buildCliPrefixSection(), buildIdentitySection(), buildDesktopContextSection()];
  for (const section of sections) {
    assert.match(section.content, /Knorvia/);
    assert.doesNotMatch(section.content, /ZCode/);
  }
  assert.match(buildIdentitySection().content, /user-selected permission mode/);
  assert.match(buildIdentitySection().content, /a denied call means the user declined/);
});

test("third-party credentials remain local and expose no product login operations", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "knorvia-credential-test-"));
  try {
    const store = createSharedKnorviaCredentialStore({
      baseDir,
      cipher: { encrypt: (value) => `fixture:${value}`, decrypt: (value) => value.slice(8) },
    });
    assert.equal(store.filePath, join(baseDir, ".knorvia-studio", "v2", "credentials.json"));
    assert.ok(!("saveZaiLoginCredentials" in store));
    assert.ok(!("clearZaiLoginCredentials" in store));
    await store.save("mcp:test:token", "fixture-token");
    assert.equal(await store.load("mcp:test:token"), "fixture-token");
    assert.match(await readFile(store.filePath, "utf8"), /fixture:fixture-token/);
    assert.equal(await store.deleteIfValue("mcp:test:token", "stale-token"), false);
    assert.equal(await store.deleteIfValue("mcp:test:token", "fixture-token"), true);
    assert.equal(await store.load("mcp:test:token"), null);
  } finally {
    assert.ok(baseDir.startsWith(join(tmpdir(), "knorvia-credential-test-")));
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("the runtime does not discover the original product's project configuration", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "knorvia-discovery-test-"));
  try {
    for (const directory of [".zcode", ".knorvia-studio"]) {
      await mkdir(join(workspace, directory));
      await writeFile(join(workspace, directory, "config.json"), "{}");
    }
    const files = discoverWorkspaceHookConfigPaths({ workingDirectory: workspace });
    assert.ok(
      files.some((file) => file.path === join(workspace, ".knorvia-studio", "config.json")),
    );
    assert.ok(!files.some((file) => file.path.includes(`${join(workspace, ".zcode")}`)));
    assert.equal(
      resolveSharedKnorviaCredentialsPath({ baseDir: workspace }),
      join(workspace, ".knorvia-studio", "v2", "credentials.json"),
    );
  } finally {
    assert.ok(workspace.startsWith(join(tmpdir(), "knorvia-discovery-test-")));
    await rm(workspace, { recursive: true, force: true });
  }
});
