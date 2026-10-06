import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SHORTCUT_COMMANDS } from "@knorvia/shared";
import { createSettingsPageConfig } from "../src/settings/settingsPageConfig.js";
import { groupShortcutCommands, SHORTCUT_GROUP_ORDER } from "../src/settings/shortcutGroups.js";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";

// specs/knorvia-unified-mode-onboarding-settings.md
const UI_SRC = resolve(fileURLToPath(new URL(".", import.meta.url)), "../src");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.(tsx?)$/u.test(name) && !path.includes(`${join("i18n", "locales")}`) ? [path] : [];
  });
}

test("unified mode removes the office/coding interface mode from UI state and consumers", () => {
  assert.equal(existsSync(join(UI_SRC, "lib/interfaceMode.ts")), false);
  assert.equal(existsSync(join(UI_SRC, "hooks/useInterfaceMode.ts")), false);
  const offenders = listSourceFiles(UI_SRC).filter((file) =>
    /useIsOfficeMode|isOfficeMode|setInterfaceMode|state\.interfaceMode/u.test(
      readFileSync(file, "utf8"),
    ),
  );
  assert.deepEqual(offenders, []);
  assert.equal(
    SHORTCUT_COMMANDS.some((entry) => (entry.id as string) === "toggleInterfaceMode"),
    false,
  );
});

test("unified composer shows the branch switcher for projects and plugin preview elsewhere", () => {
  const source = readFileSync(join(UI_SRC, "app-shell/WorkspaceShellLayout.tsx"), "utf8");
  const branch = source.indexOf('activeWorkspacePurpose === "project" ? (');
  assert.ok(branch > 0);
  assert.ok(source.indexOf("<GitBranchSwitcher", branch) > branch);
  assert.ok(
    source.indexOf("<WorkspacePluginPreview", branch) > source.indexOf("<GitBranchSwitcher"),
  );
});

test("onboarding records no longer ask for an interface mode", () => {
  const source = readFileSync(join(UI_SRC, "onboarding/OccupationOnboarding.tsx"), "utf8");
  assert.match(source, /interfaceMode: null/u);
  assert.doesNotMatch(source, /OnboardingModeSelector|toggleInterfaceMode/u);
});

test("shortcut groups list every visible command exactly once in a stable order", () => {
  const groups = groupShortcutCommands(SHORTCUT_COMMANDS);
  const listed = groups.flatMap((group) => group.commands.map((entry) => entry.id));
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual([...listed].sort(), SHORTCUT_COMMANDS.map((entry) => entry.id).sort());
  assert.deepEqual(
    groups.map((group) => group.id),
    SHORTCUT_GROUP_ORDER.filter((id) => groups.some((group) => group.id === id)),
  );
  // 未登记的新命令落入「通用」而不是消失。
  const extra = { id: "futureCommand", channel: "window", defaultBindings: [] } as never;
  const withExtra = groupShortcutCommands([...SHORTCUT_COMMANDS, extra]);
  assert.ok(withExtra[0]!.commands.includes(extra));
  for (const id of SHORTCUT_GROUP_ORDER) {
    assert.ok(enUS[`settings.shortcuts.group.${id}` as keyof typeof enUS]);
    assert.ok(zhCN[`settings.shortcuts.group.${id}` as keyof typeof zhCN]);
  }
});

test("settings navigation is one ungrouped list and every section has a bilingual description", () => {
  const config = createSettingsPageConfig({ isDesktop: true, isWindowsDesktop: true });
  assert.equal("settingsSectionGroups" in config, false);
  const ids = config.settingsSections.map(({ id }) => id);
  assert.deepEqual(ids.slice(0, 6), [
    "general",
    "appearance",
    "shortcuts",
    "agents",
    "modelProvider",
    "usage",
  ]);
  assert.equal(new Set(ids).size, ids.length);
  for (const section of config.settingsSections) {
    for (const messages of [enUS, zhCN] as Array<Record<string, string>>) {
      assert.ok(messages[section.descriptionId], `${section.id} description`);
    }
  }
  const page = readFileSync(join(UI_SRC, "SettingsPage.tsx"), "utf8");
  assert.doesNotMatch(page, /settings-sidebar-group-|sidebar\.group\./u);
});

test("resource settings pages share the toolbar, group header, paper list and empty state", () => {
  for (const file of [
    "settings/PluginsSection.tsx",
    "settings/SubagentsSection.tsx",
    "settings/HooksSection.tsx",
  ]) {
    assert.match(readFileSync(join(UI_SRC, file), "utf8"), /<SettingsResourceToolbar/u, file);
  }
  for (const file of [
    "settings/SubagentsSection.tsx",
    "settings/HooksList.tsx",
    "settings/PluginsSection.tsx",
    "settings/SettingsResourceGroup.tsx",
  ]) {
    assert.doesNotMatch(
      readFileSync(join(UI_SRC, file), "utf8"),
      /overflow-hidden rounded-xl bg-surface/u,
      file,
    );
  }
  assert.equal(existsSync(join(UI_SRC, "settings/SettingsResourceGroupHeader.tsx")), false);
  const empty = readFileSync(join(UI_SRC, "settings/PluginInstallEmptyState.tsx"), "utf8");
  assert.doesNotMatch(empty, /border-dashed/u);
  assert.match(empty, /data-knorvia-strokes/u);
  // 搜索图标不能压住占位文字：主题 padding-inline 规则需要 important 内边距覆盖。
  assert.match(readFileSync(join(UI_SRC, "settings/SettingsSearchInput.tsx"), "utf8"), /!pl-9/u);
});

test("studio pages render a single title when the rail layout owns the window chrome", () => {
  const frame = readFileSync(join(UI_SRC, "studio/StudioPageFrame.tsx"), "utf8");
  assert.match(frame, /sharedChrome \? null : \(/u);
});

test("the companion floats over the conversation instead of pushing every composer up", () => {
  const companion = readFileSync(join(UI_SRC, "components/knorvia/KnorviaCompanion.tsx"), "utf8");
  assert.match(companion, /absolute right-0 bottom-0/u);
  assert.doesNotMatch(companion, /flex h-20 shrink-0/u);
});
