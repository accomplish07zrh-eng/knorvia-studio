import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

test("synthetic skill writes preserve config and deletion boundaries", async () => {
  // Windows 临时路径可能使用短别名；夹具从种子阶段共用发现服务使用的规范身份。
  const root = await realpath(await mkdtemp(join(tmpdir(), "knorvia-skill-safety-")));
  const keys = [
    "HOME",
    "USERPROFILE",
    "KNORVIA_DATA_BASE_DIR",
    "KNORVIA_HOME",
    "KNORVIA_PORTABLE_DIR",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys)
    process.env[key] = key === "KNORVIA_HOME" || key === "KNORVIA_PORTABLE_DIR" ? "" : root;
  const put = async (path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  };
  try {
    const { createSkillsService } = await import("../src/skills/skillsService.js");
    const workspace = join(root, "workspace");
    await mkdir(join(workspace, ".git"), { recursive: true });
    const source = join(workspace, ".agents", "skills", "synthetic", "SKILL.md");
    await put(source, "---\nname: synthetic\ndescription: fabricated\n---\nSynthetic body");
    const config = join(root, ".knorvia-studio", "cli", "config.json");
    await put(
      config,
      JSON.stringify({ untouched: { fabricated: true }, skills: { unused: { retained: 1 } } }),
    );
    const service = createSkillsService({ isDesktopRuntime: false });
    const listed = await service.list({ workspacePath: workspace });
    assert.equal(listed.skills.length, 1);
    const id = listed.skills[0]!.id;
    await Promise.all([
      service.setEnabled({ workspacePath: workspace, skillId: id, enabled: false }),
      service.setEnabled({ workspacePath: workspace, skillId: id, enabled: true }),
    ]);
    let saved = JSON.parse(await readFile(config, "utf8"));
    assert.deepEqual(saved, {
      untouched: { fabricated: true },
      skills: { unused: { retained: 1 } },
    });
    await service.setEnabled({ workspacePath: workspace, skillId: id, enabled: false });
    const raw = await readFile(config, "utf8");
    saved = JSON.parse(raw);
    assert.deepEqual(saved.skills[source.replaceAll("\\", "/")], { enable: false });
    assert.deepEqual(saved.untouched, { fabricated: true });
    assert.equal(raw, `${JSON.stringify(saved, null, 2)}\n`);
    const copied = await service.copyToCommon({ workspacePath: workspace, skillId: id });
    assert.equal(await readFile(copied.newPath, "utf8"), await readFile(source, "utf8"));
    await assert.rejects(
      service.copyToCommon({ workspacePath: workspace, skillId: id }),
      /通用目录已存在同名技能/,
    );
    const external = join(root, "external", "synthetic");
    await put(join(external, "SKILL.md"), "Synthetic target must remain");
    const link = join(workspace, ".knorvia-studio", "skills", "linked");
    await symlink(external, link, process.platform === "win32" ? "junction" : "dir");
    const summary = {
      ...listed.skills[0]!,
      id: "injected",
      path: join(external, "SKILL.md"),
      sourcePath: join(link, "SKILL.md"),
    };
    service.list = async () => ({
      skills: [summary],
      diagnostics: [],
      capability: { userScopeAvailable: false },
    });
    await service.deleteSkill({ workspacePath: workspace, skillId: "injected" });
    await assert.rejects(stat(link), { code: "ENOENT" });
    assert.equal(
      await readFile(join(external, "SKILL.md"), "utf8"),
      "Synthetic target must remain",
    );
    summary.sourcePath = join(external, "SKILL.md");
    await assert.rejects(
      service.deleteSkill({ workspacePath: workspace, skillId: "injected" }),
      /该技能不可删除/,
    );
    summary.scope = "plugin";
    await assert.rejects(
      service.deleteSkill({ workspacePath: workspace, skillId: "injected" }),
      /插件提供的技能不可单独删除/,
    );
    assert.equal(
      await readFile(join(external, "SKILL.md"), "utf8"),
      "Synthetic target must remain",
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await rm(root, { recursive: true, force: true });
  }
});
