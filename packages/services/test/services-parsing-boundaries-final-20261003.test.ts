import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandFileParser } from "../src/commands/commandFileParser.js";
import { parseNumstat, parseStatusPorcelain } from "../src/git/repo/gitCliParsing.js";
import { buildLegacyProviderEndpoints } from "../src/model-provider/legacyProviderEndpoints.js";
import { resolveHostProxyForUrl } from "../src/providers/api/nodeApiNetwork.js";
import { parseSkillMetadata } from "../src/skill-sync/skillSyncDiscovery.js";

test("command metadata keeps continuation boundaries and original prompt bytes", () => {
  const content =
    "prelude\n---\ndescription: first\n  second\nunknown: retained\n  other\nargument-hint: path\n---\n\n  prompt\n";
  const command = CommandFileParser.parseCommandFile(content, "C:\\owned\\sample.MD");
  assert.ok(command);
  assert.equal(command.name, "/sample");
  assert.equal(command.description, "first second");
  assert.equal(command.argumentHint, "path");
  assert.equal(command.content, "\n  prompt\n");
  assert.equal(command.prompt, "prompt");
  assert.equal(
    CommandFileParser.parseCommandFile("---\nunfinished", "plain.md")?.prompt,
    "---\nunfinished",
  );
});

test("porcelain consumes rename continuation once and retains XY/conflict and incomplete-tail rules", () => {
  const result = parseStatusPorcelain(
    [
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +4 -2",
      "1 .M N... 100644 100644 100644 a b ordinary\tname.txt",
      "2 R. N... 100644 100644 100644 a b R100 new name.txt",
      "old name.txt",
      "u UU N... 100644 100644 100644 100644 a b c conflict.txt",
      "? untracked.txt",
      "1 malformed",
      "2 R. N... 100644 100644 100644 a b R100 incomplete.txt",
    ].join("\0"),
  );
  assert.equal(result.branchName, "main");
  assert.equal(result.trackingBranchName, "origin/main");
  assert.equal(result.ahead, 4);
  assert.equal(result.behind, 2);
  assert.deepEqual(
    result.entries.map(({ path, originalPath, kind, x, y, isConflicted }) => ({
      path,
      originalPath,
      kind,
      x,
      y,
      isConflicted,
    })),
    [
      {
        path: "ordinary\tname.txt",
        originalPath: null,
        kind: "modified",
        x: ".",
        y: "M",
        isConflicted: false,
      },
      {
        path: "new name.txt",
        originalPath: "old name.txt",
        kind: "renamed",
        x: "R",
        y: ".",
        isConflicted: false,
      },
      {
        path: "conflict.txt",
        originalPath: null,
        kind: "modified",
        x: "U",
        y: "U",
        isConflicted: true,
      },
      {
        path: "untracked.txt",
        originalPath: null,
        kind: "added",
        x: null,
        y: "?",
        isConflicted: false,
      },
      {
        path: "incomplete.txt",
        originalPath: null,
        kind: "renamed",
        x: "R",
        y: ".",
        isConflicted: false,
      },
    ],
  );
  assert.equal(parseStatusPorcelain("# branch.head (detached)\0").headRefType, "detached");
});

test("numstat keeps binary counts, negative zero, tab paths and truncated rename tails", () => {
  const stats = parseNumstat(
    "-\t-\tbinary\0-0\t0\tzero\0" +
      "3\t2\t\0old\tname\0new\tname\0" +
      "1\t2\ttab\tname\0malformed\0" +
      "1\t0\t\0missing destination\0",
  );
  assert.deepEqual([...stats.keys()], ["binary", "zero", "new\tname", "tab\tname"]);
  assert.deepEqual(stats.get("binary"), { added: 0, removed: 0 });
  assert.ok(Object.is(stats.get("zero")?.added, -0));
  assert.deepEqual(stats.get("new\tname"), {
    added: 3,
    removed: 2,
    kind: "renamed",
    originalPath: "old\tname",
  });
  assert.deepEqual(stats.get("tab\tname"), { added: 1, removed: 2 });
});

test("legacy endpoints keep empty, shared-origin and non-URL migration data", () => {
  assert.deepEqual(buildLegacyProviderEndpoints([]), {});
  assert.deepEqual(buildLegacyProviderEndpoints([["openai", "   "]]), {});
  assert.deepEqual(
    buildLegacyProviderEndpoints([
      ["openai", "https://api.example.invalid/v1/responses"],
      ["openai-compatible", "https://api.example.invalid/v2/chat/completions"],
      ["anthropic", "https://api.example.invalid/tenant?query=1"],
    ]),
    {
      baseURL: "https://api.example.invalid",
      paths: { openai: "/v1", "openai-compatible": "/v2", anthropic: "/tenant?query=1" },
    },
  );
  assert.deepEqual(
    buildLegacyProviderEndpoints([
      ["openai", "owned-base"],
      ["anthropic", "https://other.example.invalid/v1/messages"],
    ]),
    {
      paths: { openai: "owned-base", anthropic: "https://other.example.invalid" },
    },
  );
});

test("proxy bypass and YAML fallback retain absent and empty-field boundaries", () => {
  const options = { httpProxy: "proxy.example.invalid:8080" };
  assert.deepEqual(
    resolveHostProxyForUrl("https://child.example.invalid/path", {
      ...options,
      noProxy: " , *.example.invalid:443",
    }),
    { kind: "direct", noProxyMatched: true },
  );
  assert.deepEqual(
    resolveHostProxyForUrl("https://example.invalid", {
      ...options,
      noProxy: ":443,.example.invalid:80",
    }),
    { kind: "proxy", proxyUrl: "http://proxy.example.invalid:8080/" },
  );
  const fallback = { name: "owned-folder", description: "" };
  for (const text of ["plain", "---\n\n---\nbody", "---\nname: [\n---\nbody"])
    assert.deepEqual(parseSkillMetadata(text, "owned-folder"), fallback);
  assert.deepEqual(
    parseSkillMetadata(
      "---\r\nname: owned-name\r\ndescription: details\r\n---\r\nbody",
      "owned-folder",
    ),
    { name: "owned-name", description: "details" },
  );
});
