import assert from "node:assert/strict";
import test from "node:test";
import {
  quotePosixShellArg,
  buildPosixShellExecCommand,
  buildWriteLiteralFileCommand,
} from "../src/remote/posixShell.ts";

test("shell builders keep hostile-looking synthetic content in literal operands", () => {
  assert.equal(
    quotePosixShellArg("a'$(synthetic)\n`literal`\\z"),
    "'a'\"'\"'$(synthetic)\n`literal`\\z'",
  );
  assert.equal(
    buildWriteLiteralFileCommand("~/docs/a'b.txt", "%s\n$(synthetic)"),
    "printf %s '%s\n$(synthetic)' > \"$HOME\"'/docs/a'\"'\"'b.txt'",
  );
  assert.equal(
    buildPosixShellExecCommand("printf '%s' '$literal'"),
    "/bin/sh -c 'printf '\"'\"'%s'\"'\"' '\"'\"'$literal'\"'\"''",
  );
});
