// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserApiCatalog } from "../src/browser-client/api-catalog.js";
import {
  PlaywrightAPI,
  PlaywrightLocator,
  PlaywrightFrameLocator,
  PlaywrightDownload,
  PlaywrightFileChooser,
} from "../src/browser-client/playwright.js";

test("the published Playwright method catalog and implemented interfaces cannot silently diverge", () => {
  const catalog = createBrowserApiCatalog();
  for (const [name, implementation] of Object.entries({
    PlaywrightAPI,
    PlaywrightLocator,
    PlaywrightFrameLocator,
    PlaywrightDownload,
    PlaywrightFileChooser,
  })) {
    const declared = catalog.objects[name]!.members.map((member) => member.name).sort();
    const implemented = Object.getOwnPropertyNames(implementation.prototype)
      .filter((name) => name !== "constructor")
      .sort();
    assert.deepEqual(implemented, declared, name);
  }
});
