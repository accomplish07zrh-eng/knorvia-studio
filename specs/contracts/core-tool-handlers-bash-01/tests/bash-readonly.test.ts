// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-bash-01 contract tests: bash read-only policy rule tables (选择9).
// Black box: asserts only the public judgment oracle isRuntimeReadOnlyBashCommand /
// isSedInPlaceBashCommand. The samples below are the recorded old-implementation
// judgments (the baseline the rewrite must reproduce); the rewrite organizes the rules
// from each command's public documentation, not by copying the old table.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isRuntimeReadOnlyBashCommand,
  isSedInPlaceBashCommand,
} from "../../../../apps/cli/packages/core/src/tool/handlers/bash-semantics.js";

// [command, expectedReadOnly, category]
const SAMPLES: ReadonlyArray<readonly [string, boolean, string]> = [
  // B-ro-1 simple read-only commands
  ["ls -la", true, "simple"],
  ["cat file.txt", true, "simple"],
  ["pwd", true, "simple"],
  ["wc -l file.txt", true, "simple"],
  ["head -n 5 file.txt", true, "simple"],
  ["grep -r foo .", true, "simple"],
  ["rg foo", true, "simple"],
  // B-ro-2 shell builtins that are read-only
  ["echo hello", true, "builtin"],
  ["true", true, "builtin"],
  ["printf '%s' x", true, "builtin"],
  // B-ro-3 glob / find
  ["find . -name '*.ts'", true, "glob"],
  // B-ro-4 pipelines: read-only iff every segment is read-only
  ["cat a.txt | grep foo", true, "pipe"],
  ["ls | wc -l", true, "pipe"],
  ["git log | head", true, "pipe"],
  ["sort a.txt | uniq", true, "pipe"],
  ["cat a.txt | tee b.txt", false, "pipe-mutating"],
  // B-ro-5 && / || chains
  ["git status && git diff", true, "chain"],
  ["ls && cat a.txt", true, "chain"],
  ["false || cat a.txt", true, "chain"],
  ["git commit -m x || true", false, "chain-mutating"],
  // B-ro-6 redirection
  ["cat < a.txt", true, "redirect-in"],
  ["cat a.txt > b.txt", false, "redirect-out"],
  ["echo x >> log.txt", false, "redirect-out"],
  ["sort a.txt > b.txt", false, "redirect-out"],
  // B-ro-7 subshell / command substitution / assignment are not read-only
  ["(cd dir && ls)", false, "subshell"],
  ["echo $(date)", false, "cmdsubst"],
  ["echo `date`", false, "cmdsubst"],
  ["x=$(cat a.txt)", false, "cmdsubst-assign"],
  // B-ro-8 sudo is never read-only
  ["sudo ls", false, "sudo"],
  ["sudo cat /etc/hosts", false, "sudo"],
  ["sudo rm -rf /tmp/x", false, "sudo-mutating"],
  ["sudo apt-get install foo", false, "sudo-mutating"],
  // B-ro-9 xargs is not read-only
  ["cat list.txt | xargs echo", false, "xargs"],
  ["ls | xargs wc -l", false, "xargs"],
  ["find . -name '*.log' | xargs rm", false, "xargs-mutating"],
  // B-ro-10 git read-only subcommands
  ["git status", true, "git-ro"],
  ["git log --oneline -5", true, "git-ro"],
  ["git diff", true, "git-ro"],
  ["git show HEAD", true, "git-ro"],
  ["git branch", true, "git-ro"],
  ["git remote -v", true, "git-ro"],
  ["git config --get user.name", true, "git-ro"],
  // B-ro-11 git mutating subcommands
  ["git commit -m 'x'", false, "git-mut"],
  ["git push origin main", false, "git-mut"],
  ["git checkout main", false, "git-mut"],
  ["git merge feature", false, "git-mut"],
  ["git reset --hard", false, "git-mut"],
  ["git clean -f", false, "git-mut"],
  ["git add .", false, "git-mut"],
  ["git rebase -i HEAD~3", false, "git-mut"],
  ["git clean -n", false, "git-dryrun"],
  // B-ro-12 in-place mutations (sed -i, tee, dd)
  ["sed -i 's/a/b/' f.txt", false, "sed-inplace"],
  ["sed 's/a/b/' f.txt", true, "sed-pipe"],
  ["tee out.txt", false, "tee"],
  ["dd if=a of=b", false, "dd"],
  // B-ro-13 gh multiword read-only vs mutating
  ["gh pr view 1", true, "gh-ro"],
  ["gh pr list", true, "gh-ro"],
  ["gh repo view", true, "gh-ro"],
  ["gh pr create --title x", false, "gh-mut"],
  ["gh auth login", false, "gh-mut"],
  ["gh issue comment 1 --body x", false, "gh-mut"],
  // B-ro-14 docker multiword read-only vs mutating
  ["docker ps", true, "docker-ro"],
  ["docker inspect xyz", true, "docker-ro"],
  ["docker logs xyz", true, "docker-ro"],
  ["docker run xyz", false, "docker-mut"],
  ["docker rm xyz", false, "docker-mut"],
  // B-ro-15 process / runtime / package / network / fs / db are not read-only (except ps)
  ["ps aux", true, "process-ro"],
  ["top -b -n 1", false, "process"],
  ["kill 123", false, "process-mut"],
  ["node -e 'console.log(1)'", false, "runtime"],
  ["python script.py", false, "runtime"],
  ["npm ls", false, "pkg"],
  ["npm install", false, "pkg"],
  ["./some-script.sh", false, "unknown"],
  ["$EDITOR file", false, "dynamic"],
  ["foo bar", false, "unknown"],
  ["curl https://example.com", false, "network"],
  ["curl -o out.txt https://example.com", false, "network"],
  ["mkdir newdir", false, "fs"],
  ["rm file.txt", false, "fs"],
  ["cp a b", false, "fs"],
  ["touch new.txt", false, "fs"],
  ["chmod +x f", false, "fs"],
  ["tar -xf a.tar", false, "fs"],
  ["unzip a.zip", false, "fs"],
  ["psql -c 'select 1'", false, "db"],
  ["psql -c 'delete from t'", false, "db"],
];

test("B-ro-1..15 isRuntimeReadOnlyBashCommand reproduces the recorded judgment baseline", () => {
  for (const [command, expected] of SAMPLES) {
    assert.equal(
      isRuntimeReadOnlyBashCommand(command),
      expected,
      `readonly judgment for ${JSON.stringify(command)}`,
    );
  }
});

test("B-ro-16 judgment oracle is total and boolean across every sample", () => {
  for (const [command] of SAMPLES) {
    assert.equal(typeof isRuntimeReadOnlyBashCommand(command), "boolean");
  }
});

test("B-ro-17 isSedInPlaceBashCommand flags only sed -i", () => {
  assert.equal(isSedInPlaceBashCommand("sed -i 's/a/b/' f.txt"), true);
  assert.equal(isSedInPlaceBashCommand("sed -i.bak s/a/b/ f.txt"), true);
  assert.equal(isSedInPlaceBashCommand("sed 's/a/b/' f.txt"), false);
  assert.equal(isSedInPlaceBashCommand("cat f.txt"), false);
});
