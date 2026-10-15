// SPDX-License-Identifier: Apache-2.0
// dynamic-workflow-01 golden 语料 · world 族（从 corpus.mjs 按族拆出，oxlint max-lines）。
// 每条 add(id, expect, script)：expect "clean" = 旧实现 ok 为真且零诊断，"diagnostics" = ok 为假。

export const samples = [];
function add(id, expect, script) {
  samples.push({ id: `world/${id}`, script, expect });
}

add("files-glob", "clean", 'const names = await files.glob("*.md"); return names.length;');
add(
  "files-grep",
  "clean",
  'const hits = await files.grep("TODO", "src/**/*.ts"); return hits.length;',
);
add(
  "files-grep-glob",
  "clean",
  'const hits = await files.grep("export", "*.ts"); return hits[0]?.line ?? 0;',
);
add("files-read", "clean", 'const text = await files.read("README.md"); return text.length;');
add(
  "git-status",
  "clean",
  'const status = await git.status(); return status.branch ?? "detached";',
);
add("git-log", "clean", 'const commits = await git.log(5); return commits[0]?.subject ?? "";');
add("git-diff", "clean", 'const diff = await git.diff("HEAD~1", "src"); return diff.length;');
add("git-changed", "clean", "return await git.changedFiles();");
add("run-literal", "clean", 'const r = await world.run("node", ["--version"]); return r.stdout;');
add(
  "run-no-substitution-template",
  "clean",
  'const r = await world.run(`node`, ["--version"]); return r.stdout;',
);
add(
  "run-timeout-opt",
  "clean",
  'const r = await world.run("node", ["--version"], { timeoutMs: 5000 }); return r.exitCode;',
);
add(
  "run-non-literal-cmd",
  "diagnostics",
  'const cmd = "node"; const r = await world.run(cmd, ["--version"]); return r.stdout;',
);
add(
  "run-template-with-hole",
  "diagnostics",
  'const v = "1"; const r = await world.run(`node-${v}`); return r.stdout;',
);
add(
  "run-two-commands",
  "clean",
  'const a = await world.run("git", ["status"]); const b = await world.run("node", ["--version"]); return a.exitCode + b.exitCode;',
);
add(
  "run-duplicate-command",
  "clean",
  'const a = await world.run("git", ["status"]); const b = await world.run("git", ["diff"]); return a.exitCode + b.exitCode;',
);
add(
  "run-in-fanout",
  "clean",
  'const targets = ["a", "b"]; return await Promise.all(targets.map(async (t) => await world.run("git", ["diff", t])));',
);
add(
  "read-into-ask",
  "clean",
  'const text = await files.read("package.json"); return await agent("explainer").ask(text);',
);
add(
  "grep-into-fanout",
  "clean",
  'const hits = await files.grep("describe\\(", "test/**/*.ts"); return await Promise.all(hits.map(async (h) => await agent("r-" + h.line).ask(h.path + ":" + h.line)));',
);
add(
  "glob-non-literal-pattern",
  "clean",
  'const pattern = "src/**/*.ts"; const names = await files.glob(pattern); return names.length;',
);
add("grep-no-glob", "clean", 'const hits = await files.grep("TODO"); return hits.length;');
add(
  "grep-destructure-first",
  "clean",
  'const [first] = await files.grep("TODO", "*.md"); return first?.line ?? 0;',
);
add(
  "run-dynamic-args",
  "clean",
  'const flags = ["--version"]; const r = await world.run("node", flags); return r.stdout;',
);
add(
  "run-stderr-branch",
  "clean",
  'const r = await world.run("node", ["-e", "console.error(1)"]); return r.stderr.length > 0 ? "warn" : "quiet";',
);
add("git-diff-with-path", "clean", 'const d = await git.diff("HEAD", "src"); return d.length;');
add(
  "changed-files-with-base",
  "clean",
  'const changed = await git.changedFiles("HEAD~1"); return changed.length;',
);
add(
  "world-read-loop",
  "clean",
  'const out: string[] = []; for (const n of ["a.txt", "b.txt"]) { out.push(await files.read(n)); } return out;',
);
