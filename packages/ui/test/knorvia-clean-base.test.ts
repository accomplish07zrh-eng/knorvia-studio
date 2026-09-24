import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { ModelSelectionView } from "@knorvia/services";
import { buildRegistryModelSelectGroups } from "../src/lib/modelSelectionGroups.js";
import { createQuickPickCommands } from "../src/quickpick/quickPickCommands.js";
import { resolveInitialThemePreference } from "../src/useTheme.js";
import { resolveWebInitialTheme } from "../../web/src/webThemeSeed.js";

const uiSource = (file: string) => fileURLToPath(new URL(`../src/${file}`, import.meta.url));

test("first launch is light and later theme choices are retained", () => {
  for (const saved of [null, "invalid"]) {
    assert.equal(resolveInitialThemePreference(saved), "knorvia-light");
    assert.equal(resolveWebInitialTheme({ storedTheme: saved }), "knorvia-light");
  }
  for (const saved of ["knorvia-dark", "system", "knorvia-light"] as const) {
    assert.equal(resolveInitialThemePreference(saved), saved);
    assert.equal(resolveWebInitialTheme({ storedTheme: saved }), saved);
  }
});

test("manual API providers and models remain selectable while stale account providers are excluded", () => {
  const view = {
    providers: [
      {
        providerId: "personal-openai",
        providerName: "My endpoint",
        config: { api: { type: "openai-responses" }, access: { type: "api-key" } },
        models: [
          { modelId: "my-model", config: { properties: { inputFormat: { supportsImage: true } } } },
        ],
      },
      {
        providerId: "old-account",
        providerName: "Old account",
        config: { api: { type: "openai-chat-completions" }, access: { type: "zhipu-account" } },
        models: [{ modelId: "account-model", config: {} }],
      },
    ],
  } as ModelSelectionView;
  const groups = buildRegistryModelSelectGroups("knorvia", view);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.label, "My endpoint");
  assert.equal(groups[0]?.items[0]?.name, "my-model");
  assert.equal(groups[0]?.items[0]?.supportsVisionInput, true);
  assert.equal(groups[0]?.labelBadge, undefined);
});

test("the original command menu retains workspace/model configuration without account or upstream service actions", () => {
  let openedSettings = 0;
  const noop = () => {};
  const commands = createQuickPickCommands({
    allowOpenWorkspace: true,
    isSidebarVisible: true,
    themeTarget: "dark",
    shortcuts: { newTask: "", openWorkspace: "", toggleSidebar: "", toggleTerminal: "" },
    handlers: {
      createTask: noop,
      openWorkspace: noop,
      openSettings: () => {
        openedSettings += 1;
      },
      openSkillsSettings: noop,
      openMcpSettings: noop,
      switchTheme: noop,
      toggleSidebar: noop,
      toggleTerminal: noop,
      togglePreview: noop,
      openTerminalTab: noop,
      openBrowserTab: noop,
      openReviewTab: noop,
    },
  });
  assert.ok(commands.some((command) => command.id === "new-task"));
  assert.ok(commands.some((command) => command.id === "open-workspace"));
  const settings = commands.find((command) => command.id === "settings");
  assert.ok(settings);
  settings.run();
  assert.equal(openedSettings, 1);
  assert.equal(
    commands.some((command) => /login|logout|feedback|community|product-docs/.test(command.id)),
    false,
  );
});

test("product login modules are removed from disk and the original workspace shell is still the root entry", () => {
  for (const removed of [
    "WelcomeScreen.tsx",
    "hooks/useOAuth.ts",
    "hooks/useCredentials.ts",
    "hooks/useTokenRefresh.ts",
    "root/useRootOAuthEffects.ts",
    "settings/CodingPlanUpgradeDialog.tsx",
    "feedback/FeedbackHost.tsx",
    "store/conversationShareSelectionStore.ts",
    "ConversationShareMenu.tsx",
  ])
    assert.equal(existsSync(uiSource(removed)), false, removed);
  const root = readFileSync(uiSource("Root.tsx"), "utf8");
  assert.match(root, /<RootWorkspaceContent/);
  assert.doesNotMatch(
    root,
    /useOAuth|WelcomeScreen|initialIsRestoringOAuthSession|CodingPlanUpgradeDialogProvider/,
  );
  const state = readFileSync(uiSource("store/index.ts"), "utf8");
  assert.doesNotMatch(state, /OAuth|oauth|loginEntry|authSession|CodingPlanQuota/);
  assert.match(
    readFileSync(uiSource("settings/ModelProviderSection.tsx"), "utf8"),
    /InlineEditableProviderCard/,
  );
  assert.match(
    readFileSync(uiSource("settings/McpSettingsSection.tsx"), "utf8"),
    /startAuthorization|authorize|authorizationUrl/,
  );
});
