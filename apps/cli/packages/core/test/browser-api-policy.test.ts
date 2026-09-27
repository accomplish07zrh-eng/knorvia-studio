// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BrowserBackendDescriptor } from "@knorvia/contracts/browser-control";
import {
  BrowserApiPolicy,
  createBrowserApiProxy,
  loadBrowserApiManifest,
  type BrowserApiManifest,
  type BrowserApiManifestMember,
} from "../src/browser-client/manifest.js";

const member = (
  name: string,
  requirements: Partial<BrowserApiManifestMember> = {},
): BrowserApiManifestMember => ({ name, kind: "method", signature: `${name}()`, ...requirements });
const descriptor = (extra: Partial<BrowserBackendDescriptor> = {}): BrowserBackendDescriptor => ({
  id: "test",
  generation: 1,
  type: "iab",
  name: "test",
  capabilities: {},
  ...extra,
});
const manifest: BrowserApiManifest = {
  version: 1,
  objects: {
    Example: {
      members: [
        member("plain"),
        member("blocked", { unsupportedByDefaultIn: ["iab"] }),
        member("browserOnly", { requiresCapabilities: ["browser:feature"] }),
        member("tabOnly", { requiresCapabilities: ["tab:feature"] }),
        member("either", { requiresCapabilities: ["feature"] }),
        member("colonId", { requiresCapabilities: ["other:feature"] }),
        member("both", { requiresCapabilities: ["browser:feature", "tab:feature"] }),
        member("overloaded", {
          requiresCapabilities: ["feature"],
          declarations: [
            { signature: "overloaded(1)", unsupportedByDefaultIn: ["iab"] },
            { signature: "overloaded(2)", requiresCapabilities: ["tab:other"] },
          ],
        }),
        member("emptyOverloads", { declarations: [] }),
        member("hiddenDocs", { documented: false }),
      ],
    },
  },
};
const features = (...ids: string[]) => ids.map((id) => ({ id, description: id }));

test("known members obey backend and capability rules while unknown members remain compatible", () => {
  const policy = new BrowserApiPolicy(manifest, descriptor());
  assert.equal(policy.isKnown("Example", "plain"), true);
  assert.equal(policy.isKnown("Example", "unknown"), false);
  assert.equal(policy.supports("Example", "unknown"), true);
  assert.equal(policy.supports("Absent", "anything"), true);
  assert.deepEqual(policy.supportedMembers("Absent"), []);
  assert.deepEqual(
    policy.supportedMembers("Example").map((item) => item.name),
    ["plain", "emptyOverloads", "hiddenDocs"],
  );
});

test("scoped, legacy and multiple capability requirements update without rebuilding policies", () => {
  const policy = new BrowserApiPolicy(
    manifest,
    descriptor({ capabilities: { browser: features("feature", "other:feature") } }),
  );
  assert.equal(policy.supports("Example", "browserOnly"), true);
  assert.equal(policy.supports("Example", "tabOnly"), false);
  assert.equal(policy.supports("Example", "either"), true);
  assert.equal(policy.supports("Example", "colonId"), true);
  assert.equal(policy.supports("Example", "both"), false);
  policy.updateDescriptor(descriptor({ capabilities: { tab: features("feature") } }));
  assert.equal(policy.supports("Example", "browserOnly"), false);
  assert.equal(policy.supports("Example", "tabOnly"), true);
  assert.equal(policy.supports("Example", "either"), true);
  policy.updateDescriptor(
    descriptor({ capabilities: { browser: features("feature"), tab: features("feature") } }),
  );
  assert.equal(policy.supports("Example", "both"), true);
});

test("overloads require both member constraints and one available declaration", () => {
  const policy = new BrowserApiPolicy(
    manifest,
    descriptor({ capabilities: { browser: features("feature") } }),
  );
  assert.equal(policy.supports("Example", "overloaded"), false);
  policy.updateDescriptor(
    descriptor({ capabilities: { browser: features("feature"), tab: features("other") } }),
  );
  assert.equal(policy.supports("Example", "overloaded"), true);
  policy.updateDescriptor(
    descriptor({ type: "extension", capabilities: { tab: features("feature") } }),
  );
  assert.equal(policy.supports("Example", "overloaded"), true);
  policy.updateDescriptor(descriptor({ type: "extension" }));
  assert.equal(policy.supports("Example", "overloaded"), false);
});

test("host overrides can enable or disable known members without declaring unknown members", () => {
  const policy = new BrowserApiPolicy(
    manifest,
    descriptor({
      apiSupportOverrides: {
        "Example.blocked": true,
        "Example.plain": false,
        "Example.unknown": false,
      },
    }),
  );
  assert.equal(policy.supports("Example", "blocked"), true);
  assert.equal(policy.supports("Example", "plain"), false);
  assert.equal(policy.supports("Example", "unknown"), true);
});

test("proxy reads and reflection share one policy and see descriptor updates", () => {
  const symbol = Symbol("fixture");
  const target = { plain: 1, blocked: 2, unknown: 3, [symbol]: 4 };
  const policy = new BrowserApiPolicy(manifest, descriptor());
  const proxy = createBrowserApiProxy(target, "Example", policy);
  assert.equal(proxy.plain, 1);
  assert.equal(proxy.blocked, undefined);
  assert.equal("blocked" in proxy, false);
  assert.equal(Object.getOwnPropertyDescriptor(proxy, "blocked"), undefined);
  assert.deepEqual(Reflect.ownKeys(proxy), ["plain", "unknown", symbol]);
  assert.equal(proxy.unknown, 3);
  assert.equal(proxy[symbol], 4);
  const closed = createBrowserApiProxy(target, "Example", policy, { hideUnknown: true });
  assert.equal(closed.unknown, undefined);
  assert.equal("unknown" in closed, false);
  assert.deepEqual(Reflect.ownKeys(closed), ["plain", symbol]);
  policy.updateDescriptor(descriptor({ type: "extension" }));
  assert.equal(proxy.blocked, 2);
  assert.equal("blocked" in closed, true);
});

test("hideUnknown methods execute with the original receiver including private fields", () => {
  class Target {
    #value = "value";
    plain() {
      return this.internal();
    }
    internal() {
      return this.#value;
    }
  }
  const proxy = createBrowserApiProxy(
    new Target(),
    "Example",
    new BrowserApiPolicy(manifest, descriptor()),
    { hideUnknown: true },
  );
  const detached = proxy.plain;
  assert.equal(detached(), "value");
  assert.equal(proxy.internal, undefined);
});

test("fallback public surface preserves all declared object and member names", () => {
  const expected: Record<string, string> = {
    Agent: "browsers documentation",
    Documentation: "get",
    Browsers: "list get getDefault getForUrl open",
    Browser: "browserId capabilities documentation tabs user",
    BrowserUser: "claimTab history openTabs",
    Tabs: "get new selected list finalize",
    Tab: "id capabilities back close forward getJsDialog goto reload screenshot title url finalize markDeliverable markHandoff cua dom_cua playwright recording setViewportSize viewportSize",
    BrowserRecordingAPI: "start status cancel",
    BrowserCapabilityCollection: "get list",
    TabCapabilityCollection: "get list",
    PlaywrightAPI:
      "domSnapshot elementInfo elementScreenshot evaluate expectNavigation frameLocator getByLabel getByPlaceholder getByRole getByTestId getByText locator waitForEvent waitForLoadState waitForTimeout waitForURL",
    PlaywrightFrameLocator:
      "frameLocator getByLabel getByPlaceholder getByRole getByTestId getByText locator",
    PlaywrightLocator:
      "all allTextContents and check click count dblclick downloadMedia evaluate fill filter first getAttribute getByLabel getByPlaceholder getByRole getByTestId getByText innerText isEnabled isVisible last locator nth or press selectOption setChecked textContent type uncheck waitFor",
    PlaywrightDownload: "path",
    PlaywrightFileChooser: "isMultiple setFiles",
    CUAAPI: "click double_click drag keypress move scroll type downloadMedia",
    DomCUAAPI: "click double_click get_visible_dom keypress scroll type downloadMedia",
  };
  const api = loadBrowserApiManifest();
  assert.deepEqual(Object.keys(api.objects).sort(), Object.keys(expected).sort());
  for (const [name, members] of Object.entries(expected))
    assert.deepEqual(
      api.objects[name]!.members.map((item) => item.name).sort(),
      members.split(" ").sort(),
      name,
    );
  const internal = new BrowserApiPolicy(api, descriptor());
  const extension = new BrowserApiPolicy(api, descriptor({ type: "extension" }));
  assert.equal(internal.supports("Tab", "finalize"), false);
  assert.equal(extension.supports("Tab", "finalize"), true);
  assert.equal(internal.supports("BrowserRecordingAPI", "start"), true);
  assert.equal(extension.supports("BrowserRecordingAPI", "start"), false);
  assert.equal(internal.supports("PlaywrightAPI", "waitForEvent"), true);
  assert.equal(internal.supports("PlaywrightFileChooser", "setFiles"), false);
});

test("manifest loader accepts explicit interface data and falls back on missing or invalid files", () => {
  const directory = mkdtempSync(join(tmpdir(), "knorvia-api-manifest-test-"));
  const path = join(directory, "api.json");
  try {
    assert.equal(loadBrowserApiManifest(directory).version, 10);
    writeFileSync(path, JSON.stringify(manifest));
    assert.deepEqual(loadBrowserApiManifest(directory), manifest);
    for (const invalid of ["not json", JSON.stringify({ version: "wrong", objects: {} }), "[]"]) {
      writeFileSync(path, invalid);
      assert.equal(loadBrowserApiManifest(directory).version, 10);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("one caller cannot change the fallback API catalog used by another session", () => {
  const first = loadBrowserApiManifest();
  const members = first.objects.Agent!.members;
  members.push(member("injectedFixture"));
  try {
    assert.equal(
      loadBrowserApiManifest().objects.Agent!.members.some(
        (item) => item.name === "injectedFixture",
      ),
      false,
    );
  } finally {
    members.pop();
  }
});

test("structurally invalid manifest data falls back before a policy can crash", () => {
  const directory = mkdtempSync(join(tmpdir(), "knorvia-invalid-manifest-test-"));
  try {
    for (const objects of [
      null,
      [],
      { Example: null },
      { Example: { members: "wrong" } },
      { Example: { members: [null] } },
      {
        Example: { members: [member("bad", { requiresCapabilities: [1] as unknown as string[] })] },
      },
    ]) {
      writeFileSync(join(directory, "api.json"), JSON.stringify({ version: 1, objects }));
      assert.ok(loadBrowserApiManifest(directory).objects?.Agent, JSON.stringify(objects));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
