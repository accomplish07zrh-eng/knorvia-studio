import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  addPendingSettingsSectionListener,
  consumeInitialSettingsSection,
  consumePendingSettingsPluginTab,
  isSettingsSectionEnabled,
  resolveSettingsSection,
  setPendingSettingsPluginIntent,
  setPendingSettingsSection,
  writeLastSettingsSectionPreference,
} from "../src/lib/settingsNavigation.js";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function installWindow(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = Object.assign(new EventTarget(), {
    localStorage: createStorage(),
    sessionStorage: createStorage(),
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  return target;
}

for (const legacy of ["pluginStore", "plugins"] as const) {
  test(`saved ${legacy} preference reopens plugin management and migrates only the preference`, (t) => {
    const target = installWindow(t);
    target.localStorage.setItem("knorvia-settings-last-section", legacy);
    target.localStorage.setItem("plugin-user-data", "keep");
    assert.equal(consumeInitialSettingsSection(), "plugin");
    assert.equal(target.localStorage.getItem("knorvia-settings-last-section"), "plugin");
    assert.equal(consumePendingSettingsPluginTab(), "plugins");
    assert.equal(target.localStorage.getItem("plugin-user-data"), "keep");
    assert.equal(isSettingsSectionEnabled(legacy), false);
    assert.equal(resolveSettingsSection(legacy), "plugin");
  });

  test(`queued ${legacy} navigation overrides another page and stale capability tab`, (t) => {
    const target = installWindow(t);
    writeLastSettingsSectionPreference("appearance");
    target.sessionStorage.setItem("knorvia-settings-section-intent", legacy);
    target.sessionStorage.setItem("knorvia-settings-plugin-tab-intent", "mcps");
    assert.equal(consumeInitialSettingsSection(), "plugin");
    assert.equal(consumePendingSettingsPluginTab(), "plugins");
    assert.equal(target.sessionStorage.getItem("knorvia-settings-section-intent"), null);
  });

  test(`live ${legacy} navigation publishes the canonical management destination`, (t) => {
    const target = installWindow(t);
    const events: Array<{ section: string; tab?: string }> = [];
    const dispose = addPendingSettingsSectionListener((section, detail) => {
      events.push({ section, tab: detail?.pluginTab });
    });
    try {
      setPendingSettingsSection(legacy);
      assert.deepEqual(events, [{ section: "plugin", tab: "plugins" }]);
      target.dispatchEvent(
        new CustomEvent("knorvia:settings-section-intent", {
          detail: { section: legacy, pluginTab: "skills" },
        }),
      );
      assert.deepEqual(events[1], { section: "plugin", tab: "plugins" });
    } finally {
      dispose();
    }
  });
}

test("explicit MCP and skill destinations remain independent settings sections", (t) => {
  installWindow(t);
  for (const [tab, section] of [
    ["mcps", "mcp"],
    ["skills", "skill"],
    ["commands", "commands"],
  ] as const) {
    setPendingSettingsPluginIntent(tab);
    assert.equal(consumeInitialSettingsSection(), section);
  }
});
