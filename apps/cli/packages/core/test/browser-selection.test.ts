// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserBackendDescriptor } from "@knorvia/contracts/browser-control";
import {
  selectDefaultBrowser,
  selectBrowserForUrl,
  selectTabForUrl,
} from "../src/browser-client/selection.js";

const browser = (
  id: string,
  type: BrowserBackendDescriptor["type"],
  metadata?: Record<string, string>,
): BrowserBackendDescriptor => ({
  id,
  type,
  generation: 1,
  name: id,
  capabilities: {},
  metadata,
});
const iab = browser("internal", "iab");
const ext = browser("external", "extension");
const cdp = browser("debug", "cdp");
const target = "https://example.test/page";
const choose = (url: string, matches: string[], infos = [iab, ext, cdp]) =>
  selectBrowserForUrl(infos, url, new Map([[cdp.id, matches]]));

test("default backend priorities preserve discovery order and input identity", () => {
  assert.equal(selectDefaultBrowser([]), undefined);
  const order = Object.freeze([cdp, ext, iab]);
  assert.equal(selectDefaultBrowser(order), iab);
  assert.equal(selectDefaultBrowser([cdp, ext]), ext);
  const second = browser("second", "extension");
  assert.equal(selectDefaultBrowser([ext, second]), ext);
  assert.deepEqual(
    order.map(({ id }) => id),
    [cdp.id, ext.id, iab.id],
  );
});

test("only documented preference metadata promotes an extension", () => {
  for (const [key, value] of [
    ["preferred", "true"],
    ["preferredInstance", "true"],
    ["profileIsLastUsed", "true"],
    ["profileOrdering", "0"],
  ]) {
    const preferred = browser("preferred", "extension", { [key]: value });
    assert.equal(selectDefaultBrowser([ext, preferred]), preferred);
    assert.equal(selectDefaultBrowser([preferred, iab]), iab);
  }
  for (const value of ["false", "1", "TRUE"]) {
    assert.equal(
      selectDefaultBrowser([ext, browser("other", "extension", { preferred: value })]),
      ext,
    );
  }
  assert.equal(
    selectDefaultBrowser([ext, browser("cdp-preferred", "cdp", { preferred: "true" })]),
    ext,
  );
});

test("empty, single and invalid-target selection retain their distinct contracts", () => {
  assert.throws(() => choose("invalid", [], []), /^Error: No browser backend is available$/);
  assert.equal(choose("invalid", [], [cdp]), cdp);
  assert.throws(() => choose("invalid", []), /^Error: Invalid browser target URL: invalid$/);
  assert.throws(
    () => selectTabForUrl("invalid", []),
    /^Error: Invalid browser target URL: invalid$/,
  );
  assert.equal(choose(target, []), iab);
});

test("local URLs prefer an available internal browser without inventing a backend", () => {
  for (const url of [
    "file:///a.html",
    "http://localhost:3000/",
    "http://sub.localhost/",
    "http://127.0.0.1/",
    "http://[::1]/",
  ]) {
    assert.equal(choose(url, [url]), iab, url);
    assert.equal(choose(url, [url], [ext, cdp]), cdp, url);
  }
  assert.equal(choose("http://127.0.0.2/", ["http://127.0.0.2/"]), cdp);
});

test("URL ranking considers exact, pathname, hostname and parent-child domain matches", () => {
  const matches = new Map([
    [iab.id, ["https://sub.example.test/page"]],
    [ext.id, ["https://example.test/page?other=1"]],
    [cdp.id, [target + "#fragment"]],
  ]);
  assert.equal(selectBrowserForUrl([iab, ext, cdp], target, matches), cdp);
  matches.set(cdp.id, ["http://example.test:8080/other"]);
  assert.equal(selectBrowserForUrl([iab, ext, cdp], target, matches), ext);
  matches.set(ext.id, ["https://sub.example.test/else"]);
  assert.equal(selectBrowserForUrl([iab, ext, cdp], target, matches), cdp);
  assert.equal(choose(target, ["https://sub.example.test/else"]), cdp);
  assert.equal(choose("https://sub.example.test/page", ["https://example.test/else"]), cdp);
  for (const url of [
    "https://notexample.test/",
    "https://example.test.evil/",
    "https://test/",
    "invalid",
  ])
    assert.equal(choose(target, [url]), iab, url);
});

test("backend ties use fallback priority and match discovery does not modify inputs", () => {
  const urls = Object.freeze([target, "malformed"]);
  const tabs = new Map([
    [cdp.id, urls],
    [ext.id, urls],
  ]);
  assert.equal(selectBrowserForUrl([cdp, ext, iab], target, tabs), ext);
  assert.deepEqual(urls, [target, "malformed"]);
  assert.equal(choose("http://127.0.0.2/", ["http://sub.127.0.0.2/"]), iab);
});

test("tab reuse stops at hostname and prioritizes match before active status", () => {
  const exact = { id: "exact", url: target + "#part" };
  const path = { id: "path", url: target + "?query=1" };
  const host = { id: "host", url: "http://example.test:8080/else", active: true };
  assert.equal(selectTabForUrl(target, [host, path, exact]), exact);
  assert.equal(selectTabForUrl(target, [host, path]), path);
  assert.equal(selectTabForUrl(target, [host]), host);
  assert.equal(selectTabForUrl(target, [{ url: "https://sub.example.test/page" }]), undefined);
  assert.equal(selectTabForUrl(target, [{ url: "invalid" }, {}, { url: "" }]), undefined);
});

test("tab ties choose active then the latest array entry without normalizing pathname", () => {
  const first = { url: "https://example.test/a", active: true };
  const last = { url: "https://example.test/b" };
  const same = { url: "https://example.test/c", active: true };
  assert.equal(selectTabForUrl(target, [first, last]), first);
  assert.equal(selectTabForUrl(target, [first, same]), same);
  assert.equal(selectTabForUrl(target, [last, { url: target + "/" }])?.url, target + "/");
  assert.equal(selectTabForUrl(target, [{ url: target + "/" }, first]), first);
  const opaque = { url: "file:///different" };
  assert.equal(selectTabForUrl("about:blank", [opaque]), opaque);
});
