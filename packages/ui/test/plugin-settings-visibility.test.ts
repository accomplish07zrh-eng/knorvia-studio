import assert from "node:assert/strict";
import test from "node:test";
import type { KnorviaPluginInfo } from "@knorvia/shared";
import { partitionPluginsForSettings } from "../src/settings/pluginCapabilityProjection.js";

test("plugin settings hide the internal host without hiding a personal namesake", () => {
  const runtime = "node-repl-host@knorvia-plugins-bundled";
  const document = "documents@knorvia-plugins-bundled";
  const personal = "node-repl-host@personal";
  const plugins = [runtime, document, personal].map(
    (id) => ({ id, packageStatus: "installed" }) as KnorviaPluginInfo,
  );
  const groups = partitionPluginsForSettings(plugins, new Set([runtime, document]));
  assert.deepEqual(
    groups.builtIn.map((plugin) => plugin.id),
    [document],
  );
  assert.deepEqual(
    groups.installed.map((plugin) => plugin.id),
    [personal],
  );
  assert.equal(plugins.length, 3, "the runtime inventory stays unchanged");
});
