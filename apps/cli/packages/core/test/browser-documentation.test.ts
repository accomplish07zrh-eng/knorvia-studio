// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { BrowserBackendDescriptor } from "@knorvia/contracts/browser-control";
import { loadBrowserDocumentation } from "../src/browser-client/documentation.js";

const descriptor: BrowserBackendDescriptor = {
  id: "fixture-browser",
  type: "iab",
  generation: 7,
  name: "Fixture Browser",
  capabilities: {},
};
const member = (name: string, extra: object = {}) => ({
  name,
  kind: "method",
  signature: `${name}(): void`,
  ...extra,
});
const api = {
  version: 1,
  entrypoints: ["agent.fixture()"],
  semantics: { fixture: "SEMANTIC_BODY" },
  types: { Fixture: "TYPE_BODY" },
  objects: {
    Example: {
      members: [
        member("plain"),
        member("blocked", { unsupportedByDefaultIn: ["iab"] }),
        member("hidden", { documented: false }),
        member("overloaded", {
          declarations: [
            { signature: "overloadUnavailable(): void", unsupportedByDefaultIn: ["iab"] },
            { signature: "overloadAvailable(): void" },
          ],
        }),
      ],
    },
  },
};
type Entry = { name?: string; path?: string; mode?: string; title?: string; when?: object };
function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "knorvia-browser-docs-test-"));
  const root = join(parent, "docs");
  mkdirSync(root);
  const entries: Entry[] = [
    { name: "overview", path: "overview.md" },
    { name: "lookup", path: "lookup.md", mode: "lookup" },
    { name: "local", path: "local.md", when: { browserTypes: ["iab"] } },
    { name: "missing", path: "missing.md" },
  ];
  for (const name of ["overview", "lookup", "local"])
    writeFileSync(join(root, `${name}.md`), `${name.toUpperCase()}_BODY`);
  writeFileSync(join(root, "api.json"), JSON.stringify(api));
  const save = () =>
    writeFileSync(
      join(root, "documents.json"),
      JSON.stringify({ title: "Fixture Guide", documents: entries }),
    );
  save();
  return {
    root,
    parent,
    entries,
    save,
    dispose: () => rmSync(parent, { recursive: true, force: true }),
  };
}

test("missing documentation uses a complete fallback while missing named documents fail", () => {
  const guide = loadBrowserDocumentation();
  for (const contract of [
    "agent.browsers.list()",
    "getDefault()",
    "getForUrl",
    "browser.tabs.list()",
    "domcontentloaded",
    "BrowserCommandError",
    "3000",
  ])
    assert.ok(guide.includes(contract), contract);
  assert.throws(
    () => loadBrowserDocumentation(undefined, "absent"),
    /Browser documentation not found: absent/,
  );
  const f = fixture();
  try {
    assert.throws(
      () => loadBrowserDocumentation(f.root, "missing"),
      /Browser documentation not found: missing/,
    );
    assert.throws(
      () => loadBrowserDocumentation(f.root, "absent"),
      /Browser documentation not found: absent/,
    );
  } finally {
    f.dispose();
  }
});

test("global aggregation includes the common API and included documents only", () => {
  const f = fixture();
  try {
    const guide = loadBrowserDocumentation(f.root);
    for (const text of [
      "Fixture Guide",
      "agent.fixture()",
      "SEMANTIC_BODY",
      "TYPE_BODY",
      "plain()",
      "overloadAvailable()",
      "OVERVIEW_BODY",
    ])
      assert.ok(guide.includes(text), text);
    for (const text of [
      "blocked()",
      "hidden()",
      "overloadUnavailable()",
      "LOOKUP_BODY",
      "LOCAL_BODY",
    ])
      assert.equal(guide.includes(text), false, text);
    assert.equal(loadBrowserDocumentation(f.root, ""), guide);
  } finally {
    f.dispose();
  }
});

test("named queries can read lookup guides and relative names without inventing file aliases", () => {
  const f = fixture();
  try {
    assert.equal(loadBrowserDocumentation(f.root, "overview"), "OVERVIEW_BODY");
    assert.equal(loadBrowserDocumentation(f.root, "lookup"), "LOOKUP_BODY");
    assert.throws(() => loadBrowserDocumentation(f.root, "overview.md"), /not found/);
    f.entries.push({ name: "alias", path: "overview.md" });
    f.save();
    assert.equal(loadBrowserDocumentation(f.root, "alias"), "OVERVIEW_BODY");
  } finally {
    f.dispose();
  }
});

test("conditional documentation requires the matching descriptor and all capability scopes", () => {
  const f = fixture();
  try {
    assert.throws(() => loadBrowserDocumentation(f.root, "local"), /not found/);
    assert.equal(loadBrowserDocumentation(f.root, "local", descriptor), "LOCAL_BODY");
    assert.throws(
      () => loadBrowserDocumentation(f.root, "local", { ...descriptor, type: "cdp" }),
      /not found/,
    );
    f.entries.push({
      name: "scoped",
      path: "lookup.md",
      when: {
        requiredBrowserCapabilities: ["browser-feature"],
        requiredTabCapabilities: ["tab-feature"],
        requiredApiMembers: ["Example.plain"],
      },
    });
    f.save();
    const complete = {
      ...descriptor,
      capabilities: {
        browser: [{ id: "browser-feature", description: "" }],
        tab: [{ id: "tab-feature", description: "" }],
      },
    };
    assert.equal(loadBrowserDocumentation(f.root, "scoped", complete), "LOOKUP_BODY");
    assert.throws(
      () =>
        loadBrowserDocumentation(f.root, "scoped", {
          ...complete,
          capabilities: { browser: complete.capabilities.browser },
        }),
      /not found/,
    );
  } finally {
    f.dispose();
  }
});

test("selected browser aggregation includes its identity and applicable guides", () => {
  const f = fixture();
  try {
    const guide = loadBrowserDocumentation(f.root, undefined, descriptor);
    for (const text of [
      descriptor.name,
      descriptor.id,
      descriptor.type,
      "LOCAL_BODY",
      "OVERVIEW_BODY",
    ])
      assert.ok(guide.includes(text), text);
    assert.equal(guide.includes("blocked()"), false);
    assert.equal(guide.includes("hidden()"), false);
    const extended = loadBrowserDocumentation(f.root, undefined, {
      ...descriptor,
      type: "extension",
    });
    assert.ok(extended.includes("blocked()"));
    assert.equal(extended.includes("LOCAL_BODY"), false);
  } finally {
    f.dispose();
  }
});

test("corrupt optional document indices leave valid API data usable", () => {
  const f = fixture();
  try {
    for (const invalid of ["broken json", JSON.stringify({ documents: "invalid" })]) {
      writeFileSync(join(f.root, "documents.json"), invalid);
      assert.ok(loadBrowserDocumentation(f.root).includes("plain()"));
      assert.throws(() => loadBrowserDocumentation(f.root, "overview"), /not found/);
    }
  } finally {
    f.dispose();
  }
});

test("host overrides affect the documented method surface", () => {
  const f = fixture();
  try {
    const guide = loadBrowserDocumentation(f.root, undefined, {
      ...descriptor,
      apiSupportOverrides: { "Example.blocked": true, "Example.plain": false },
    });
    assert.ok(guide.includes("blocked()"));
    assert.equal(guide.includes("plain()"), false);
  } finally {
    f.dispose();
  }
});

test("unavailable overloads stay out of selected-browser documentation", () => {
  const f = fixture();
  try {
    const guide = loadBrowserDocumentation(f.root, undefined, descriptor);
    assert.ok(guide.includes("overloadAvailable()"));
    assert.equal(guide.includes("overloadUnavailable()"), false);
  } finally {
    f.dispose();
  }
});

test("a conditional document cannot treat an unknown API member as supported", () => {
  const f = fixture();
  try {
    f.entries.push({
      name: "unknown",
      path: "lookup.md",
      when: { requiredApiMembers: ["Absent.member"] },
    });
    f.save();
    assert.throws(() => loadBrowserDocumentation(f.root, "unknown", descriptor), /not found/);
    assert.equal(
      loadBrowserDocumentation(f.root, undefined, descriptor).includes("LOOKUP_BODY"),
      false,
    );
  } finally {
    f.dispose();
  }
});

test("document reads reject parent and absolute paths outside the declared directory", () => {
  const f = fixture();
  try {
    const outside = join(f.parent, "outside.md");
    writeFileSync(outside, "OUTSIDE_BODY");
    f.entries.push({ name: "parent", path: "../outside.md" }, { name: "absolute", path: outside });
    f.save();
    for (const name of ["parent", "absolute"])
      assert.throws(() => loadBrowserDocumentation(f.root, name), /not found/);
    assert.equal(loadBrowserDocumentation(f.root).includes("OUTSIDE_BODY"), false);
  } finally {
    f.dispose();
  }
});

test("junctions cannot escape documentation but links inside its directory remain readable", () => {
  const f = fixture();
  try {
    const outside = join(f.parent, "outside");
    const inside = join(f.root, "inside");
    mkdirSync(outside);
    mkdirSync(inside);
    writeFileSync(join(outside, "guide.md"), "OUTSIDE_LINK_BODY");
    writeFileSync(join(inside, "guide.md"), "INSIDE_LINK_BODY");
    symlinkSync(outside, join(f.root, "escape"), "junction");
    symlinkSync(inside, join(f.root, "local"), "junction");
    f.entries.push(
      { name: "escape", path: "escape/guide.md" },
      { name: "safe", path: "local/guide.md" },
    );
    f.save();
    assert.throws(() => loadBrowserDocumentation(f.root, "escape"), /not found/);
    assert.equal(loadBrowserDocumentation(f.root, "safe"), "INSIDE_LINK_BODY");
    const guide = loadBrowserDocumentation(f.root);
    assert.equal(guide.includes("OUTSIDE_LINK_BODY"), false);
    assert.ok(guide.includes("INSIDE_LINK_BODY"));
  } finally {
    f.dispose();
  }
});

test("bad entries and conditions do not prevent reading other valid documents", () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.root, "documents.json"),
      JSON.stringify({
        documents: [
          null,
          false,
          { path: 1 },
          { path: "lookup.md", when: { requiredApiMembers: "invalid" } },
          ...f.entries,
        ],
      }),
    );
    assert.equal(loadBrowserDocumentation(f.root, "overview"), "OVERVIEW_BODY");
    assert.ok(loadBrowserDocumentation(f.root, undefined, descriptor).includes("OVERVIEW_BODY"));
  } finally {
    f.dispose();
  }
});

test("document fallback diagnostics do not reveal file content or local paths", (t) => {
  const warning = t.mock.method(console, "warn", () => {});
  const f = fixture();
  try {
    writeFileSync(join(f.root, "documents.json"), "PRIVATE_DOCUMENT_FIXTURE");
    assert.ok(loadBrowserDocumentation(f.root).includes("plain()"));
    assert.equal(warning.mock.calls.length, 1);
    const text = warning.mock.calls.map((call) => call.arguments.join(" ")).join("\n");
    assert.equal(text.includes(f.parent), false);
    assert.equal(text.includes("PRIVATE_DOCUMENT_FIXTURE"), false);
  } finally {
    f.dispose();
  }
});
