import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractDisallowedToolsArgs,
  isProtocolServerInvocation,
  isStoragePreparationInvocation,
  parseGlobalArgs,
} from "../src/arguments.js";

test("native global parsing preserves all aliases and multi-value options", () => {
  const parsed = parseGlobalArgs(["-h", "-c", "-f", "-v", "-a", "-s", "project", "-p", "owned", "--attach", "first", "--attach", "second", "--sparse", "one", "--sparse", "two", "--output-format", "stream-json", "app-server"]);
  assert.equal(parsed.values.help, true);
  assert.equal(parsed.values.continue, true);
  assert.equal(parsed.values.force, true);
  assert.equal(parsed.values.version, true);
  assert.equal(parsed.values.all, true);
  assert.equal(parsed.values.scope, "project");
  assert.equal(parsed.values.prompt, "owned");
  assert.deepEqual(parsed.values.attach, ["first", "second"]);
  assert.deepEqual(parsed.values.sparse, ["one", "two"]);
  assert.equal(parsed.values["output-format"], "stream-json");
  assert.deepEqual(parsed.positionals, ["app-server"]);
  assert.throws(() => parseGlobalArgs(["--unknown-owned-option"]));
});

test("protocol invocation ignores command-shaped option values and preserves invalid-argv fallback", () => {
  for (const command of ["app-server", "agent-server"]) {
    assert.equal(isProtocolServerInvocation([command]), true);
    assert.equal(isProtocolServerInvocation(["--cwd", command]), false);
    assert.equal(isProtocolServerInvocation(["--prompt", "", command]), false);
    assert.equal(isProtocolServerInvocation(["--target", "", command]), false);
    assert.equal(isProtocolServerInvocation([command, "--help"]), false);
    assert.equal(isProtocolServerInvocation([command, "--version"]), false);
    assert.equal(isProtocolServerInvocation([command, "--unknown-owned-option"]), true);
    assert.equal(isProtocolServerInvocation(["--unknown-owned-option", command]), false);
  }
});

test("storage preparation accepts only the existing explicit narrow flag set", () => {
  assert.equal(isStoragePreparationInvocation(["app-server", "--prepare-storage", "--stdio", "--cwd", "owned-workspace"]), true);
  assert.equal(isStoragePreparationInvocation(["agent-server", "--prepare-storage", "--stdio"]), true);
  for (const argv of [
    ["app-server", "--stdio"],
    ["app-server", "--prepare-storage"],
    ["app-server", "extra", "--prepare-storage", "--stdio"],
    ["app-server", "--prepare-storage", "--stdio", "--json"],
    ["app-server", "--prepare-storage=true", "--stdio"],
    ["app-server", "--prepare-storage", "--stdio", "--unknown-owned-option"],
  ]) assert.equal(isStoragePreparationInvocation(argv), false);
});

test("tool aliases consume token ranges and preserve forwarded argv/input identity", () => {
  const argv = ["--json", "--disallowed-tools", "Read", "web_search", "--cwd", "owned", "--disallowedTools=Write,WebSearch", "prompt"];
  const before = argv.slice();
  const parsed = extractDisallowedToolsArgs(argv);
  assert.deepEqual(parsed.args, ["--json", "--cwd", "owned", "prompt"]);
  assert.deepEqual(parsed.toolDisallowlist, ["Read", "WebSearch", "Write"]);
  assert.deepEqual(argv, before);
  assert.deepEqual(Object.keys(parsed), ["args", "toolDisallowlist"]);
});

test("rule lexer preserves boolean parentheses, ASCII separators and Unicode trimming", () => {
  assert.deepEqual(extractDisallowedToolsArgs(["--disallowedTools=Bash(ls, *.ts) web_search(foo bar),Read"]).toolDisallowlist, ["Bash(ls, *.ts)", "WebSearch(foo bar)", "Read"]);
  assert.deepEqual(extractDisallowedToolsArgs(["--disallowed-tools=Bash((x), y)"]).toolDisallowlist, ["Bash((x)", "y)"]);
  assert.deepEqual(extractDisallowedToolsArgs(["--disallowed-tools=Read\tWrite,\u3000Edit\u3000"]).toolDisallowlist, ["Read\tWrite", "Edit"]);
  assert.deepEqual(extractDisallowedToolsArgs(["--disallowed-tools=web_search web_search(x) WebSearch(x) WEB_SEARCH"]).toolDisallowlist, ["WebSearch", "WebSearch(x)", "WEB_SEARCH"]);
});

test("bare aliases reject option-like next tokens; empty admitted values retain undefined", () => {
  for (const flag of ["--disallowedTools", "--disallowed-tools"]) {
    for (const tail of [[], ["-"], ["--"], ["-3"], ["--json"]]) {
      assert.throws(() => extractDisallowedToolsArgs([flag, ...tail]), { message: `${flag} requires at least one tool.` });
    }
    assert.equal(extractDisallowedToolsArgs([`${flag}=`]).toolDisallowlist, undefined);
    assert.equal(extractDisallowedToolsArgs([flag, "", " "]).toolDisallowlist, undefined);
  }
  assert.equal(Object.hasOwn(extractDisallowedToolsArgs([]), "toolDisallowlist"), true);
});

test("double-dash does not add a new extraction stop rule", () => {
  assert.deepEqual(extractDisallowedToolsArgs(["--", "--disallowed-tools", "Read", "owned"]), {
    args: ["--"], toolDisallowlist: ["Read", "owned"],
  });
});
