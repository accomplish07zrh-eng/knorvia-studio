// Actual reads are fenced to a newly owned config root; macOS commands are replaced.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { after, afterEach, beforeEach, mock, test } from "node:test";

let root: string;
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const emitted = process.env.KNORVIA_TERMINAL_PROFILE_TARGET === "dist";
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "knorvia-terminal-profile-c-"));
  Object.defineProperty(process, "platform", { ...platform, value: "linux" });
});
afterEach(() => rm(root, { recursive: true, force: true }));
after(() => Object.defineProperty(process, "platform", platform));
function owned(path: string) {
  assert.ok(
    resolve(path).startsWith(`${root}${sep}`),
    `profile port outside owned fixture: ${path}`,
  );
}
mock.module("node:fs", {
  namedExports: {
    existsSync: (path: string) => {
      owned(path);
      return fs.existsSync(path);
    },
    readFileSync: (path: string, encoding: "utf8") => {
      owned(path);
      return fs.readFileSync(path, encoding);
    },
  },
});
mock.module("node:os", { namedExports: { homedir: () => root } });
mock.module(
  new URL(
    `../${emitted ? "dist" : "src"}/terminal/terminalProfileMacOs.${emitted ? "js" : "ts"}`,
    import.meta.url,
  ).href,
  { namedExports: { createMacOsTerminalProfileDetectors: () => [] } },
);
const { resolveTerminalFontProfile }: typeof import("../src/terminal/terminalProfile.js") =
  await import(
    new URL(
      `../${emitted ? "dist" : "src"}/terminal/terminalProfile.${emitted ? "js" : "ts"}`,
      import.meta.url,
    ).href
  );
async function file(relative: string, text: string) {
  const path = join(root, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return path;
}

test("owned JSONC fixture preserves exact font stack and leaves private settings unchanged", async () => {
  const text =
    '// owned fixture\n{"terminal.integrated.fontFamily":"Owned Native, Menlo", "syntheticPrivateField":"synthetic-private-content",}';
  const path = await file("app/Code/User/settings.json", text);
  const result = resolveTerminalFontProfile({
    settings: {},
    env: { HOME: root, APPDATA: join(root, "app"), XDG_CONFIG_HOME: join(root, "xdg") },
  });
  assert.equal(result.source, "system");
  assert.match(
    result.fontFamily,
    /^Owned Native, Menlo, ui-monospace, SFMono-Regular, SF Mono, Monaco,/,
  );
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private-content|syntheticPrivateField/);
  assert.equal(await readFile(path, "utf8"), text);
});
test("owned malformed TOML falls through to YAML without rewriting either fixture", async () => {
  const toml = '[font.normal]\nfamily = "unterminated';
  const yaml = 'font:\n  normal:\n    family: "Owned YAML"\nprivate: synthetic-private-content';
  const a = await file(".config/alacritty/alacritty.toml", toml);
  const b = await file(".config/alacritty/alacritty.yml", yaml);
  const result = resolveTerminalFontProfile({ settings: {}, env: { HOME: root } });
  assert.equal(result.source, "system");
  assert.match(result.fontFamily, /^Owned YAML, ui-monospace,/);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private-content/);
  assert.equal(await readFile(a, "utf8"), toml);
  assert.equal(await readFile(b, "utf8"), yaml);
});
