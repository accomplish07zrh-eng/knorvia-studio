import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { collectNpmNotices, hashBytes } from "./third-party-npm.mjs";
import {
  assertAuditConsistent,
  auditThirdPartyInventory,
  deriveMaterialReviews,
} from "./provenance/third-party-audit.mjs";
import { BASELINE_COMMIT, currentPath, fingerprint } from "./provenance/model.mjs";
import { readLockedPatches, retainPatchUnion } from "./provenance/patch-inventory.mjs";
import { retainedNoticeBlocks, retainNpmNoticeUnion } from "./provenance/retained-npm-notices.mjs";
import {
  noticesFileName,
  readNativeSearchNotices,
  repositoryRoot,
  readVerifiedNotices,
} from "./third-party-notices.mjs";

export async function generateThirdPartyNotices(
  root = repositoryRoot,
  { outputDirectory = root } = {},
) {
  // 修复：先验证已有合集；当前图外的历史/开发声明不得在重建时被删掉或冒充当前实装。
  const previousBytes = await readVerifiedNotices(root);
  const previousInventory = JSON.parse(
    await readFile(join(root, "third-party/inventory.json"), "utf8"),
  );
  const blocks = retainedNoticeBlocks(previousBytes);
  const inputs = { ...previousInventory.inputs };
  const readInput = async (file) => {
    const bytes = await readFile(join(root, file));
    inputs[file] = fingerprint(bytes).normalizedSha256;
    return bytes;
  };
  const readJson = async (file) => JSON.parse(await readInput(file));
  const overrides = await readJson("third-party/npm-overrides.json");
  const copied = await readJson("third-party/copied-components.json");
  const embedded = await readJson("third-party/embedded-components.json");
  const runtimes = await readJson("third-party/runtime/sources.json");
  const material = await readJson("licensing/evidence/material-icon-theme.json");
  for (const runtime of runtimes.node) {
    if (hashBytes(await readInput(runtime.file)) !== runtime.sha256)
      throw new Error(`Changed Node ${runtime.version} license`);
  }
  await readJson("package.json");
  await readInput("pnpm-lock.yaml");
  await readInput("pnpm-workspace.yaml");
  await readInput("third-party/native-search/sources.json");
  const collected = await collectNpmNotices(root, overrides);
  const { notInstalled, workspaceManifests } = collected;
  const packages = retainNpmNoticeUnion(
    collected.packages,
    previousInventory.packages ?? [],
    blocks,
  );
  // 修复：递归扫描会把 bundled-agents/mock-cdn 的可删除缓存当作源码输入，重建立即失效。
  // workspace 边界由 pnpm 解析，同一份项目集合用于依赖图和 manifest 新鲜度检查。
  for (const file of workspaceManifests) await readInput(file);
  const currentPackages = new Set(
    [...packages, ...notInstalled].map((item) => `${item.name}@${item.version}`),
  );
  for (const item of overrides) {
    if (!currentPackages.has(item.package))
      throw new Error(`Npm override has no current or retained source record: ${item.package}`);
  }
  const textRecords = new Map(blocks);
  function addText(bytes, owner, origin) {
    const sha256 = hashBytes(bytes);
    const record = textRecords.get(sha256) ?? { bytes, references: [] };
    const reference = `- ${owner}: ${origin}`;
    if (!record.references.includes(reference)) record.references.push(reference);
    textRecords.set(sha256, record);
    return sha256;
  }
  for (const record of overrides)
    if (record.file) {
      if (hashBytes(await readInput(record.file)) !== record.sha256)
        throw new Error(`Changed retained upstream notice: ${record.package}`);
    }
  const packageInventory = packages.map(({ notices, ...item }) => ({
    ...item,
    notices: notices.map(({ member, bytes }) => ({
      member,
      sha256: addText(bytes, `${item.name}@${item.version}`, member),
    })),
  }));
  async function copiedFiles(file, files) {
    if ((await stat(join(root, file))).isDirectory()) {
      for (const child of (await readdir(join(root, file))).sort())
        await copiedFiles(`${file}/${child}`, files);
    } else {
      const bytes = await readInput(file);
      files.push({ file, sha256: hashBytes(bytes) });
    }
  }
  const copiedInventory = [];
  let copiedBaseline;
  for (const record of copied) {
    if (record.file) {
      const bytes = await readInput(record.file);
      if (hashBytes(bytes) !== record.sha256)
        throw new Error(`Changed copied-source license: ${record.id}`);
      addText(bytes, record.id, record.source);
    } else if (!record.reviewRequired) {
      throw new Error(`Missing copied-source license or review: ${record.id}`);
    }
    const files = [];
    for (const file of record.roots) await copiedFiles(file, files);
    for (const file of record.modifiedFiles ?? []) {
      // 修复：集中 NOTICE 不能替代 Apache 4(b) 的文件内修改声明，重新生成时也不能抹掉这一义务。
      if (!files.some((entry) => entry.file === file))
        throw new Error(`Modified source outside copied roots: ${file}`);
      const source = await readFile(join(root, file));
      if (!source.toString("utf8").includes("Modified by Knorvia Studio:")) {
        copiedBaseline ??= await readJson("licensing/upstream-baseline.json");
        const baseline = copiedBaseline.files.find((item) => currentPath(item.path) === file);
        // 修复：精确继承的 ZCode 修改说明不能改署 Knorvia；新增改动仍必须单独说明。
        if (
          copiedBaseline.schemaVersion !== 1 ||
          copiedBaseline.commit !== BASELINE_COMMIT ||
          baseline?.normalizedSha256 !== fingerprint(source).normalizedSha256 ||
          !source.toString("utf8").includes("Modified by ZCode:")
        )
          throw new Error(`Missing file-local modification notice: ${file}`);
      }
    }
    copiedInventory.push({ ...record, files });
  }
  for (const component of embedded) {
    if (!packages.some((item) => `${item.name}@${item.version}` === component.parentPackage))
      throw new Error(`Stale embedded component: ${component.parentPackage}`);
    for (const evidence of component.buildEvidence ?? []) {
      if (hashBytes(await readInput(evidence.file)) !== evidence.sha256)
        throw new Error(`Changed embedded build provenance: ${component.id}`);
    }
    for (const notice of component.notices) {
      const bytes = await readInput(notice.file);
      if (hashBytes(bytes) !== notice.sha256)
        throw new Error(`Changed embedded notice: ${component.id}`);
      addText(
        bytes,
        `${notice.component ?? component.id} (inside ${component.parentPackage})`,
        notice.source,
      );
    }
  }
  // 上游 AI Elements 的 LICENSE 是短版授权头，还需随包提供 Apache 2.0 全文。
  addText(
    await readInput("scripts/license-texts/Apache-2.0.txt"),
    "Apache-2.0 licensed components",
    "Apache License, Version 2.0",
  );
  const patches = [];
  const patchUnion = retainPatchUnion(
    await readLockedPatches(root),
    previousInventory.patches ?? [],
  );
  // 修复：锁定的当前补丁与保留的历史补丁共存，不能重建时静默删掉原修改声明。
  for (const item of patchUnion) {
    if (hashBytes(await readInput(item.file)) !== item.sha256)
      throw new Error(`Changed patched-source content: ${item.package}`);
    patches.push(item);
  }
  const native = await readNativeSearchNotices(root, { verify: true });
  for (const file of Object.keys(native.inventory.inputs)) await readInput(file);
  for (const component of native.inventory.components) {
    for (const notice of component.notices) await readInput(notice.file);
  }
  const sections = [
    "# Third-party notices",
    "Generated by `node scripts/licenses.mjs notices` from the current workspace production dependency graph, copied source/assets and native search tools. This is a conservative union across distributions; not every listed component is included on every platform. Versions, source references and hashes are recorded in `third-party/inventory.json` and `third-party/native-search/sources.json` in the source repository.",
    "Original copyright, license and NOTICE text is retained below. Identical text is shared by the components listed above it. Package metadata license identifiers are descriptive; they do not replace the original terms. Copyright holders are never inferred from npm author fields.",
    "## npm packages",
    ...packageInventory.map(
      (item) =>
        `- ${item.name}@${item.version} — ${typeof item.license === "string" ? item.license : JSON.stringify(item.license)}${item.acceptedMissingNotice ? `; ${item.acceptedMissingNotice}` : ""}`,
    ),
    "## Source evidence limitations",
    "Some publishers provide only a license identifier or a short README license section instead of a complete LICENSE file. For the following packages the supplied material explicitly identifies publisher metadata and standard terms; it is not represented as an original upstream LICENSE file. Any available README copyright notice is retained:",
    ...overrides
      .filter((item) => item.evidenceKind)
      .map((item) => `- ${item.package}: ${item.source}`),
    "The original import revisions of copied components are not recorded in the current checkout. Pinned license references below do not establish the original copy revision. They cover upstream-derived portions only; local adaptations do not change the upstream terms.",
    "## Copied source and assets",
    ...copied.map(
      (item) =>
        `- ${item.id} (${item.license ?? "not established"}): ${item.roots.join(", ")}. License reference: ${item.source ?? "not established"}. Original import revision: ${item.importRevision ?? "not recorded"}.${item.reviewRequired ? ` Review required: ${item.reviewRequired}` : ""}`,
    ),
    "Fig autocomplete source carries the repository's MIT license; the generated registry records npm @withfig/autocomplete@2.692.3 metadata as ISC. The original source MIT notice is retained below.",
    "## Embedded native and WASM components",
    ...embedded.map(
      (item) =>
        `- ${item.id} inside ${item.parentPackage}; upstream revision ${item.revision}; source: ${item.source}. ${item.reviewRequired ?? ""}`,
    ),
    "Electron/Chromium target-specific notices are shipped separately under Resources/licenses/electron. Distributions containing an independent Node runtime also include its exact-version LICENSE.node.txt; SEA includes that text in --licenses output.",
    "## Modified npm packages",
    ...patches.map(
      (item) =>
        `- ${item.package}: modified by Knorvia Studio; the changes are recorded in ${item.file} in the source repository.`,
    ),
    "## License and NOTICE texts",
  ];
  for (const [sha256, record] of textRecords) {
    sections.push(
      `### Notice ${sha256}`,
      ...record.references,
      "",
      "````text\n" + record.bytes.toString("utf8") + "\n````",
    );
  }
  sections.push("## Native search tools", "````text\n" + native.bytes.toString("utf8") + "\n````");
  const bytes = Buffer.from(`${sections.join("\n\n")}\n`);
  const inventory = {
    schemaVersion: 1,
    inputHashEncoding:
      "UTF-8 with CRLF normalized to LF; notice and source snapshot hashes remain byte-exact",
    scope:
      "Production dependency union across current workspace projects, copied source/assets and native tools; not a per-installer SBOM or a certification of all licensing obligations.",
    noticesSha256: hashBytes(bytes),
    inputs: Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b, "en"))),
    packages: packageInventory,
    currentProduction: [...collected.packages, ...notInstalled]
      .map((item) => `${item.name}@${item.version}`)
      .sort(),
    notInstalled,
    copied: copiedInventory,
    patches,
    exceptions: overrides.filter((item) => item.acceptedMissingNotice || item.evidenceKind),
    embedded,
    runtimes,
    reviewRequired: deriveMaterialReviews({
      copied,
      overrides,
      embedded,
      native: native.inventory,
      material,
    }),
  };
  // 修复：写入前对账资产覆盖和来源投影，防止生成器再次产出会漏报的派生清单。
  assertAuditConsistent(
    await auditThirdPartyInventory(root, inventory, {
      copied,
      overrides,
      embedded,
      native: native.inventory,
      material,
    }),
  );
  const destination = resolve(outputDirectory);
  await mkdir(join(destination, "third-party"), { recursive: true });
  await writeFile(join(destination, noticesFileName), bytes);
  await writeFile(
    join(destination, "third-party/inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
  );
  console.log(
    `${relative(root, join(root, noticesFileName))}: ${packages.length} package versions, ${copied.length} copied components, ${native.inventory.archives.length} native archives, ${bytes.length} bytes`,
  );
}
