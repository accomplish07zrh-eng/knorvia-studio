import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// 本测试是纯 Node 的静态校验，不加载 DOM、不启动服务、不调用模型。
// 它把 specs/knorvia-skill-contract.md 与 specs/knorvia-plugin-compatibility.md
// 的声明变成可机械复核的断言，供 examples/plugins/ 下的技能包复用。
const examplesRoot = fileURLToPath(new URL("../../../examples/plugins/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const packNames = ["project-handoff", "material-organizer", "document-quality-check"] as const;

const manifestAllowedKeys = [
  "name",
  "version",
  "description",
  "author",
  "license",
  "skills",
] as const;
// 只有需要文档明确论证时才允许声明这些组件；当前三个包都是 skill-only，
// 依据见 docs/knorvia-plugin-skill-packs.md 的「为什么只有技能」一节。
const manifestComponentKeys = ["agents", "commands", "hooks", "mcpServers"] as const;

const requiredSections = [
  "## Trigger",
  "## Near misses",
  "## Inputs",
  "## Permission expectations",
  "## Procedure",
  "## Outputs",
  "## Success evidence",
  "## Failure behaviour",
] as const;

const allowedFrontmatterKeys = new Set(["name", "description", "author"]);
const semverPattern = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u;
const normalizedNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const requiredFixtureClasses: Readonly<Record<string, string>> = {
  "normal-use": "triggers",
  "missing-input": "asks_for_input",
  "near-miss": "does_not_trigger",
  "tool-failure": "reports_failure",
};
// skill-creator 要求五类回归场景；重复调用作为附加夹具固化。
const extraFixtureClasses: Readonly<Record<string, string>> = {
  "repeat-invocation": "stays_idempotent",
};
const expectedOutcomes = new Set([
  ...Object.values(requiredFixtureClasses),
  ...Object.values(extraFixtureClasses),
]);

const requiredFailureCodes = [
  "missing_input",
  "invalid_input",
  "missing_tool",
  "interrupted_run",
  "repeat_invocation",
] as const;
const allowedKernelStatuses = new Set(["verified", "declared", "unsupported", "unknown"]);
const allowedWhenMissing = new Set(["report", "degrade", "refuse"]);
const allowedComponentStates = new Set(["required", "optional", "absent"]);
const allowedOutputLocations = new Set(["new-file", "chat-only"]);

const secretPatterns: ReadonlyArray<readonly [string, RegExp]> = [
  [
    "credential assignment",
    /(?:api[_-]?key|apikey|secret|password|passwd|access[_-]?token|client[_-]?secret)\s*[:=]\s*\S/iu,
  ],
  ["OpenAI-style key", /\bsk-[A-Za-z0-9_-]{16,}/u],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/u],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/u],
];
const absolutePathPatterns: ReadonlyArray<readonly [string, RegExp]> = [
  ["Windows drive path", /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/mu],
  ["POSIX home or system path", /(?:^|[\s"'`(=])\/(?:Users|home|root|opt|etc|var|tmp|mnt|srv)\//mu],
  ["UNC path", /\\\\[A-Za-z0-9._-]+\\[A-Za-z0-9._$-]+/u],
];

function packPath(pack: string, ...parts: string[]): string {
  return join(examplesRoot, pack, ...parts);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${label} must be a JSON object`,
  );
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown, label: string): string[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(value.length > 0, `${label} must not be empty`);
  for (const item of value) {
    assert.equal(typeof item, "string", `${label} entries must be strings`);
    assert.ok((item as string).trim().length > 0, `${label} entries must not be blank`);
  }
  return value as string[];
}

function asObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(value.length > 0, `${label} must not be empty`);
  return (value as unknown[]).map((item) => asRecord(item, `${label} entry`));
}

function textFilesUnder(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...textFilesUnder(absolute));
      continue;
    }
    if (/\.(?:md|json|txt)$/u.test(entry.name)) files.push(absolute);
  }
  return files;
}

function parseSkillFrontmatter(text: string, label: string): Record<string, string> {
  assert.ok(text.startsWith("---\n"), `${label} must start with frontmatter`);
  const end = text.indexOf("\n---\n", 3);
  assert.ok(end > 0, `${label} frontmatter must be terminated`);
  const values: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    if (line.trim().length === 0) continue;
    const separator = line.indexOf(":");
    assert.ok(separator > 0, `${label} has an invalid frontmatter line: ${line}`);
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

function bodyOf(text: string): string {
  const end = text.indexOf("\n---\n", 3);
  return text.slice(end + 5);
}

function sectionBody(body: string, heading: string): string {
  const start = body.indexOf(`${heading}\n`);
  assert.ok(start >= 0, `missing section ${heading}`);
  const rest = body.slice(start + heading.length + 1);
  const next = rest.search(/^## /mu);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function bullets(section: string): string[] {
  return section
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.trim());
}

function manifestOf(pack: string): Record<string, unknown> {
  return asRecord(readJson(packPath(pack, ".knorvia-plugin", "plugin.json")), `${pack} manifest`);
}

function packSkillNames(pack: string): string[] {
  return readdirSync(packPath(pack, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

for (const pack of packNames) {
  test(`skill pack ${pack} ships a committed, installable manifest`, () => {
    const manifest = manifestOf(pack);
    for (const key of Object.keys(manifest)) {
      assert.ok(
        (manifestAllowedKeys as readonly string[]).includes(key),
        `${pack} declares an unregistered manifest key: ${key}`,
      );
    }
    for (const key of manifestComponentKeys) {
      assert.equal(
        manifest[key],
        undefined,
        `${pack} declares ${key}; a skill-only pack must not, unless the pack docs justify it`,
      );
    }
    assert.equal(manifest.name, pack, `${pack} manifest name must match its directory`);
    assert.match(String(manifest.name), normalizedNamePattern);
    assert.match(String(manifest.version), semverPattern);
    assert.ok(String(manifest.description ?? "").trim().length > 0);
    const author = asRecord(manifest.author, `${pack} author`);
    assert.equal(author.name, "Knorvia Studio");

    const license = String(manifest.license ?? "");
    assert.ok(license.startsWith("SEE LICENSE IN "), `${pack} must reference its licence text`);
    const licensePath = packPath(pack, ...license.slice("SEE LICENSE IN ".length).split("/"));
    assert.ok(existsSync(licensePath), `${pack} licence text is missing: ${licensePath}`);
    const licenseText = readFileSync(licensePath, "utf8");
    assert.ok(licenseText.length > 500, `${pack} licence text looks truncated`);
    assert.match(licenseText, /Copyright \(c\) 2026 Knorvia Studio/u);
    assert.match(licenseText, /MIT License/u);

    assert.ok(existsSync(packPath(pack, "README.md")), `${pack} needs a README.md`);
    const skillsRoot = packPath(pack, String(manifest.skills).replace(/^\.\//u, ""));
    assert.ok(statSync(skillsRoot).isDirectory(), `${pack} skills path must exist`);
    for (const skill of packSkillNames(pack)) {
      assert.ok(
        existsSync(join(skillsRoot, skill, "SKILL.md")),
        `${pack} skill ${skill} needs a SKILL.md`,
      );
    }
  });

  test(`skill pack ${pack} declares per-kernel compatibility without overclaiming`, () => {
    const manifest = manifestOf(pack);
    const compatibility = asRecord(
      readJson(packPath(pack, ".knorvia-plugin", "compatibility.json")),
      `${pack} compatibility`,
    );
    assert.equal(compatibility.compatibilityVersion, 1);
    assert.equal(compatibility.plugin, manifest.name);

    const components = asRecord(compatibility.components, `${pack} components`);
    for (const [name, state] of Object.entries(components)) {
      assert.ok(
        allowedComponentStates.has(String(state)),
        `${pack} component ${name} has an unknown state: ${String(state)}`,
      );
    }
    assert.equal(components.skills, "required");
    for (const key of manifestComponentKeys) {
      assert.equal(components[key], "absent", `${pack} must declare ${key} as absent`);
    }

    assert.ok(Array.isArray(compatibility.kernels), `${pack} kernels must be an array`);
    const kernels = compatibility.kernels as Array<Record<string, unknown>>;
    assert.ok(kernels.length > 0);
    let wildcard: Record<string, unknown> | undefined;
    for (const entry of kernels) {
      const status = String(entry.status);
      assert.ok(
        allowedKernelStatuses.has(status),
        `${pack} kernel ${String(entry.kernel)} has an unknown status: ${status}`,
      );
      assert.ok(String(entry.kernel ?? "").length > 0);
      if (entry.kernel === "*") wildcard = entry;
      if (status === "verified") {
        assert.ok(
          Array.isArray(entry.evidence) && (entry.evidence as unknown[]).length > 0,
          `${pack} claims a verified kernel without evidence`,
        );
      } else {
        assert.ok(
          entry.evidence === undefined,
          `${pack} carries evidence for a non-verified kernel: ${String(entry.kernel)}`,
        );
      }
      assert.ok(String(entry.reason ?? "").trim().length > 0, `${pack} needs a kernel reason`);
    }
    assert.ok(wildcard, `${pack} must declare a catch-all "*" kernel entry`);
    assert.equal(
      wildcard.status,
      "unknown",
      `${pack} must not claim the catch-all kernel as verified or declared`,
    );

    assert.ok(Array.isArray(compatibility.requires), `${pack} requires must be an array`);
    for (const entry of compatibility.requires as Array<Record<string, unknown>>) {
      assert.ok(String(entry.capability ?? "").trim().length > 0);
      assert.ok(
        allowedWhenMissing.has(String(entry.whenMissing)),
        `${pack} requires entry has an unknown whenMissing: ${String(entry.whenMissing)}`,
      );
    }
  });

  test(`skill pack ${pack} keeps the declarative skill contract`, () => {
    const skillsRoot = packPath(pack, "skills");
    for (const skill of packSkillNames(pack)) {
      const skillDirectory = join(skillsRoot, skill);
      const label = `${pack}/${skill}`;
      const skillText = readFileSync(join(skillDirectory, "SKILL.md"), "utf8");
      const frontmatter = parseSkillFrontmatter(skillText, label);
      for (const key of Object.keys(frontmatter)) {
        assert.ok(
          allowedFrontmatterKeys.has(key),
          `${label} adds frontmatter key ${key}; the contract forbids new keys`,
        );
      }
      assert.equal(frontmatter.name, skill, `${label} frontmatter name must match its directory`);
      const description = frontmatter.description ?? "";
      assert.ok(description.length > 0, `${label} needs a description`);
      assert.ok(description.length <= 1024, `${label} description is too long`);
      assert.match(
        description,
        /not for|rather than/u,
        `${label} description needs a near-miss clause`,
      );

      const body = bodyOf(skillText);
      let cursor = -1;
      for (const heading of requiredSections) {
        const at = body.indexOf(`${heading}\n`);
        assert.ok(at >= 0, `${label} is missing ${heading}`);
        assert.ok(at > cursor, `${label} section ${heading} is out of order`);
        cursor = at;
        assert.ok(sectionBody(body, heading).length > 0, `${label} section ${heading} is empty`);
      }
      assert.ok(
        sectionBody(body, "## Trigger").length > 60,
        `${label} needs a substantive positive trigger paragraph`,
      );
      assert.ok(
        bullets(sectionBody(body, "## Near misses")).length >= 3,
        `${label} needs explicit near-miss non-triggers`,
      );

      const contract = asRecord(
        readJson(join(skillDirectory, "skill-contract.json")),
        `${label} skill-contract.json`,
      );
      assert.equal(contract.contractVersion, 1);
      assert.equal(contract.skill, skill);
      const trigger = asRecord(contract.trigger, `${label} trigger`);
      asStringArray(trigger.useWhen, `${label} trigger.useWhen`);
      const nearMiss = asStringArray(trigger.nearMiss, `${label} trigger.nearMiss`);
      assert.ok(nearMiss.length >= 3, `${label} needs at least three near-miss conditions`);
      assert.equal(
        bullets(sectionBody(body, "## Near misses")).length,
        nearMiss.length,
        `${label} near-miss prose and sidecar must agree in count`,
      );

      for (const entry of asObjectArray(contract.inputs, `${label} inputs`)) {
        assert.ok(String(entry.name ?? "").trim().length > 0);
        assert.equal(typeof entry.required, "boolean");
        assert.ok(String(entry.description ?? "").trim().length > 0);
      }

      const permissions = asRecord(contract.permissions, `${label} permissions`);
      assert.equal(permissions.overwritesExistingFiles, false, `${label} must not overwrite files`);
      assert.equal(permissions.schedulesBackgroundWork, false, `${label} must not own a scheduler`);
      assert.equal(permissions.promptGrantsPermission, false, `${label} prompt is not a boundary`);
      assert.equal(typeof permissions.networkAccess, "boolean");
      assert.equal(typeof permissions.runsCommands, "boolean");
      if (permissions.runsCommands === true) {
        assert.match(
          String(permissions.commandPolicy ?? ""),
          /^read-only /u,
          `${label} must restrict command use to read-only inspection`,
        );
      } else {
        assert.equal(permissions.commandPolicy, undefined);
      }
      asStringArray(permissions.read, `${label} permissions.read`);
      asStringArray(permissions.write, `${label} permissions.write`);

      for (const output of asObjectArray(contract.outputs, `${label} outputs`)) {
        assert.ok(String(output.name ?? "").trim().length > 0);
        assert.ok(
          allowedOutputLocations.has(String(output.location)),
          `${label} output location must be new-file or chat-only`,
        );
        assert.ok(String(output.description ?? "").trim().length > 0);
      }
      asStringArray(contract.successEvidence, `${label} successEvidence`);

      const failures = contract.failureBehaviour;
      assert.ok(Array.isArray(failures) && failures.length > 0);
      const codes = (failures as Array<Record<string, unknown>>).map((entry) => String(entry.code));
      for (const code of requiredFailureCodes) {
        assert.ok(codes.includes(code), `${label} does not describe ${code}`);
      }
      for (const entry of failures as Array<Record<string, unknown>>) {
        assert.ok(String(entry.behaviour ?? "").trim().length > 0);
      }
      assert.equal(
        bullets(sectionBody(body, "## Failure behaviour")).length,
        codes.length,
        `${label} failure prose and sidecar must agree in count`,
      );

      assert.ok(Array.isArray(contract.capabilityRequirements));
      for (const entry of contract.capabilityRequirements as Array<Record<string, unknown>>) {
        assert.ok(String(entry.capability ?? "").trim().length > 0);
        assert.ok(allowedWhenMissing.has(String(entry.whenMissing)));
      }
    }
  });

  test(`skill pack ${pack} ships the required fixture classes`, () => {
    const fixtureRoot = packPath(pack, "fixtures");
    assert.ok(statSync(fixtureRoot).isDirectory(), `${pack} needs a fixtures directory`);
    const files = readdirSync(fixtureRoot)
      .filter((name) => name.endsWith(".json"))
      .sort();
    assert.deepEqual(
      files,
      [...Object.keys(requiredFixtureClasses), ...Object.keys(extraFixtureClasses)]
        .sort()
        .map((name) => `${name}.json`),
      `${pack} fixture files must be exactly the declared classes`,
    );
    const skills = packSkillNames(pack);
    for (const file of files) {
      const fixture = asRecord(readJson(join(fixtureRoot, file)), `${pack}/${file}`);
      const fixtureName = file.replace(/\.json$/u, "");
      assert.equal(fixture.fixture, fixtureName);
      assert.equal(fixture.class, fixtureName);
      const expected = String(fixture.expected);
      assert.ok(expectedOutcomes.has(expected), `${pack}/${file} has an unknown outcome`);
      const declared = requiredFixtureClasses[fixtureName] ?? extraFixtureClasses[fixtureName];
      assert.equal(expected, declared, `${pack}/${file} outcome does not match its class`);
      assert.ok(skills.includes(String(fixture.skill)), `${pack}/${file} names an unknown skill`);
      assert.ok(String(fixture.request ?? "").trim().length > 8, `${pack}/${file} needs a request`);
      assert.ok(
        String(fixture.observation ?? "").trim().length > 20,
        `${pack}/${file} needs a reviewable observation`,
      );
      if (fixtureName === "tool-failure") {
        assert.ok(
          String(fixture.simulatedCondition ?? "").trim().length > 20,
          `${pack}/${file} must describe the simulated tool failure`,
        );
      }
    }
  });

  test(`skill pack ${pack} carries no credential or machine-specific path`, () => {
    for (const file of textFilesUnder(packPath(pack))) {
      const text = readFileSync(file, "utf8");
      const shown = relative(repositoryRoot, file).split(sep).join("/");
      for (const [name, pattern] of secretPatterns) {
        assert.doesNotMatch(text, pattern, `${shown} looks like it contains a ${name}`);
      }
      for (const [name, pattern] of absolutePathPatterns) {
        assert.doesNotMatch(text, pattern, `${shown} contains a ${name}`);
      }
    }
  });
}

test("skill pack docs justify the skill-only shape and the deferred settings panel", () => {
  const packsDoc = readFileSync(
    join(repositoryRoot, "docs", "knorvia-plugin-skill-packs.md"),
    "utf8",
  );
  const matrixDoc = readFileSync(
    join(repositoryRoot, "docs", "knorvia-plugin-compatibility-matrix.md"),
    "utf8",
  );
  for (const pack of packNames) {
    assert.match(packsDoc, new RegExp(pack, "u"), `packs doc must list ${pack}`);
    assert.match(matrixDoc, new RegExp(pack, "u"), `compatibility matrix must list ${pack}`);
  }
  // 技能包不声明 hooks/commands/mcpServers 的唯一理由是文档给出了论证；
  // 文档缺失或论证被删除时，上面的断言就会失效。
  for (const component of manifestComponentKeys) {
    assert.match(
      packsDoc,
      new RegExp(component, "u"),
      `packs doc must justify not shipping ${component}`,
    );
  }
  assert.match(packsDoc, /未验证|验证/u, "packs doc must separate verified from unverified");
  assert.match(matrixDoc, /未验证/u, "compatibility matrix must mark unverified capabilities");
  // Settings 兼容性面板按波次推迟，文档必须如实说明，而不是暗示界面已经存在。
  assert.match(packsDoc, /设置|Settings/u, "packs doc must state the settings-panel boundary");
  assert.match(packsDoc, /推迟|deferred|未提供|不在本波/u);
});

test("skill pack manifests stay out of the bundled default-enabled set", () => {
  const definitions = readFileSync(
    join(
      repositoryRoot,
      "apps",
      "cli",
      "packages",
      "bootstrap",
      "src",
      "app",
      "official-plugin-definitions.ts",
    ),
    "utf8",
  );
  const staging = readFileSync(
    join(repositoryRoot, "packages", "desktop", "scripts", "official-plugin-staging.mjs"),
    "utf8",
  );
  for (const pack of packNames) {
    assert.doesNotMatch(
      definitions,
      new RegExp(pack, "u"),
      `${pack} must not be a built-in plugin`,
    );
    assert.doesNotMatch(
      staging,
      new RegExp(pack, "u"),
      `${pack} must not be staged into the bundle`,
    );
  }
  assert.match(definitions, /DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS/u);
  assert.ok(existsSync(join(repositoryRoot, "examples", "plugins", "project-brief")));
});
