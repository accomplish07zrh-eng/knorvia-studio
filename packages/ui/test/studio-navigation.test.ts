import assert from "node:assert/strict";
import test from "node:test";
import { studioNavigationReducer, type StudioRoute } from "../src/studio/useStudioNavigation.js";
import { createSettingsPageConfig } from "../src/settings/settingsPageConfig.js";

const initial = () => ({
  entries: [
    {
      view: "chat",
      kernelId: "knorvia",
      externalSessionId: "",
      groupId: null,
      chatMode: "single",
    } as StudioRoute,
  ],
  index: 0,
  createGroupRequest: 0,
  createGroupVersion: 0,
});

test("frontend back and forward restore the selected group without touching native task state", () => {
  let state = studioNavigationReducer(initial(), {
    type: "navigate",
    patch: { view: "groups", chatMode: "groups", groupId: "group-1" },
  });
  state = studioNavigationReducer(state, { type: "navigate", patch: { view: "workflows" } });
  state = studioNavigationReducer(state, { type: "back" });
  assert.equal(state.entries[state.index]?.groupId, "group-1");
  assert.equal(state.entries[state.index]?.view, "groups");
  state = studioNavigationReducer(state, { type: "forward" });
  assert.equal(state.entries[state.index]?.view, "workflows");
  state = studioNavigationReducer(state, {
    type: "navigate",
    patch: { view: "chat", kernelId: "knorvia", chatMode: "single" },
    reset: true,
  });
  assert.equal(state.entries.length, 1);
  assert.equal(state.index, 0);
});

test("a consumed create-group request never reopens on remount and the next request is distinct", () => {
  let state = studioNavigationReducer(initial(), { type: "create-group" });
  const first = state.createGroupRequest;
  assert.equal(state.entries[state.index]?.view, "groups");
  state = studioNavigationReducer(state, { type: "consume-create-group" });
  state = studioNavigationReducer(state, { type: "navigate", patch: { view: "workflows" } });
  state = studioNavigationReducer(state, { type: "back" });
  assert.equal(state.createGroupRequest, 0);
  state = studioNavigationReducer(state, { type: "create-group" });
  assert.ok(state.createGroupRequest > first);
});

test("a new route from history truncates stale forward locations and preserves external draft identity", () => {
  let state = studioNavigationReducer(initial(), {
    type: "navigate",
    patch: { view: "external-chat", kernelId: "codex", externalSessionId: "codex-draft" },
  });
  state = studioNavigationReducer(state, {
    type: "navigate",
    patch: { kernelId: "claude-code", externalSessionId: "claude-draft" },
  });
  state = studioNavigationReducer(state, { type: "back" });
  assert.equal(state.entries[state.index]?.externalSessionId, "codex-draft");
  state = studioNavigationReducer(state, { type: "navigate", patch: { view: "workflows" } });
  assert.equal(state.entries.length, state.index + 1);
  assert.equal(
    state.entries.some((entry) => entry.externalSessionId === "claude-draft"),
    false,
  );
});

test("agent and plugin management are reachable settings sections while automation stays outside settings", () => {
  const { settingsSections } = createSettingsPageConfig({
    isDesktop: true,
    isWindowsDesktop: true,
  });
  const ids = settingsSections.map((section) => section.id);
  assert.ok(ids.includes("agents"));
  assert.equal(ids.includes("pluginStore"), false);
  assert.equal(ids.includes("plugins"), false);
  assert.ok(ids.includes("plugin"));
  assert.equal(ids.filter((id) => id === "plugin").length, 1);
  assert.equal(ids.includes("automations"), false);
});
