import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { normalizeStoredThemePreference } from "@knorvia/shared";
import { resolveInitialThemePreference } from "../src/useTheme.js";
import { resolveWebInitialTheme } from "../../web/src/webThemeSeed.js";

const cases = [
  ["zai-dark", "knorvia-dark"], ["zai-light", "knorvia-light"],
  ["dark", "knorvia-dark"], ["light", "knorvia-light"],
  ["knorvia-dark", "knorvia-dark"], ["knorvia-light", "knorvia-light"],
  ["system", "system"], [null, "knorvia-light"], ["invalid", "knorvia-light"],
] as const;

test("all theme preference readers migrate saved identity consistently", () => {
  for (const [stored, expected] of cases) {
    assert.equal(resolveInitialThemePreference(stored), expected);
    assert.equal(resolveWebInitialTheme({ storedTheme: stored }), expected);
    if (stored !== null && stored !== "invalid")
      assert.equal(normalizeStoredThemePreference(stored), expected);
  }
  assert.equal(normalizeStoredThemePreference({ theme: "dark" }), null);
});

test("desktop and web pre-bundle scripts preserve old dark preferences and system following", () => {
  for (const target of ["desktop/src/renderer", "web"] as const) {
    const html = readFileSync(new URL(`../../${target}/index.html`, import.meta.url), "utf8");
    const script = html.match(/<script>([\s\S]*?)<\/script>/u)?.[1];
    assert.ok(script);
    for (const systemDark of [true, false]) {
      for (const [stored, expected] of cases) {
        const attributes = new Map<string, string>();
        const properties = new Map<string, string>();
        const classes = new Set<string>();
        const matchMedia = () => ({ matches: systemDark });
        runInNewContext(script, {
          localStorage: { getItem: () => stored }, matchMedia, window: { matchMedia },
          document: {
            documentElement: {
              setAttribute: (name: string, value: string) => attributes.set(name, value),
              style: { setProperty: (name: string, value: string) => properties.set(name, value) },
              classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
            },
            querySelector: () => ({ setAttribute() {} }),
          },
        });
        const dark = expected === "knorvia-dark" || (expected === "system" && systemDark);
        if (target === "web") {
          assert.equal(attributes.get("data-knorvia-bootstrap-theme"), dark ? "dark" : "light");
          assert.equal(classes.has("dark"), dark);
        } else {
          assert.equal(properties.get("--knorvia-startup-background"), dark ? "#171717" : "#fff");
        }
      }
    }
  }
});
