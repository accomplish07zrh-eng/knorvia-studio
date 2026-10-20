import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_FIG_VERSION = "2.692.3";
const BYTE_LIMIT = 3 * 1024 * 1024;
const ARTIFACT_RELATIVE = "packages/core/src/tool/handlers/generated/bash-command-registry.ts";
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_PATH = join(APP_ROOT, ARTIFACT_RELATIVE);

/** args 标志位：性质存在即可，不需要参数名。 */
const BIT = {
  command: 1 << 0,
  dangerous: 1 << 4,
  file: 1 << 5,
  folder: 1 << 6,
  module: 1 << 1,
  optional: 1 << 3,
  variadic: 1 << 2,
};
const FILE_TEMPLATES = ["file", "filepaths"];
const FOLDER_TEMPLATES = ["folders", "folder"];

/**
 * 跳过计数的字段顺序就是产物里 `Skipped:` 行的顺序，B18 对此逐字有要求，
 * 所以单独固定一张表，不靠对象键序（字母序会把 dynamicSubcommands 排到最前）。
 */
const SKIP_FIELDS = ["imports", "dynamicSubcommands", "invalidNodes", "loadSpecNodes"];

const newCounters = () => ({
  dynamicSubcommands: 0,
  imports: 0,
  invalidNodes: 0,
  loadSpecNodes: 0,
});

// 判据统一收在这里：输入是 Fig 的 spec 对象，输出是布尔。
const isPlainObject = (value) => typeof value === "object" && value !== null;
const isDynamicSubcommands = (value) => typeof value.subcommands === "function";
const isLoadSpecLeaf = (value, children) => value.loadSpec !== undefined && children.length === 0;

/** 归一成列表：数组原样，其它整体当一个元素，null/undefined 为空。 */
const asList = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

/** 只留字符串、去重、按字典序。 */
const asNames = (value) =>
  [...new Set(asList(value).filter((item) => typeof item === "string"))].sort();

/** 元组首名比较，供选项与子命令排序共用。 */
const byLeadingName = (left, right) => (left?.[0]?.[0] ?? "").localeCompare(right?.[0]?.[0] ?? "");

/** 把 args 数组折叠成一个位掩码。 */
function foldArgumentBits(args) {
  return asList(args).reduce((bits, argument) => {
    if (!isPlainObject(argument)) return bits;
    let next = bits;
    for (const [flag, bit] of Object.entries(BIT)) {
      const property = flag.charAt(0).toUpperCase() + flag.slice(1);
      if (argument[`is${property}`] === true) next |= bit;
    }
    const templates = asList(argument.template).filter((item) => typeof item === "string");
    if (templates.some((item) => FILE_TEMPLATES.includes(item))) next |= BIT.file;
    if (templates.some((item) => FOLDER_TEMPLATES.includes(item))) next |= BIT.folder;
    return next;
  }, 0);
}

/**
 * Fig 的 spec 是一棵树，压成定长元组后体积可控。
 * 三个规约器分别处理「选项」「子命令」「节点」，共同点是：无效输入返回 undefined。
 */
const reducers = {
  option(value) {
    if (!isPlainObject(value)) return undefined;
    const names = asNames(value.name);
    if (names.length === 0) return undefined;
    return [names, foldArgumentBits(value.args) === 0 ? 0 : 1];
  },
  children(value, counters) {
    if (isDynamicSubcommands(value)) {
      counters.dynamicSubcommands += 1;
      return [];
    }
    return asList(value.subcommands)
      .map((child) => reducers.node(child, undefined, counters))
      .filter((child) => child !== undefined)
      .sort(byLeadingName);
  },
  node(value, fallbackName, counters) {
    if (!isPlainObject(value)) return undefined;
    const names = asNames(value.name ?? fallbackName);
    if (names.length === 0) return undefined;
    const options = asList(value.options)
      .map((option) => reducers.option(option))
      .filter((option) => option !== undefined)
      .sort(byLeadingName);
    const children = reducers.children(value, counters);
    if (isLoadSpecLeaf(value, children)) counters.loadSpecNodes += 1;
    return [names, options, foldArgumentBits(value.args), children];
  },
};

/** 参与注册表的 spec 文件：构建目录下的 `.js`，排除聚合入口。 */
const isSpecFile = (entry) =>
  entry.isFile() && entry.name.endsWith(".js") && entry.name !== "index.js";

// ── 加载 ────────────────────────────────────────────────────────────────────

async function loadFigPackage() {
  const entryPath = fileURLToPath(import.meta.resolve("@withfig/autocomplete"));
  const buildDirectory = dirname(entryPath);
  const manifestPath = join(dirname(buildDirectory), "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== REQUIRED_FIG_VERSION) {
    throw new Error(
      `Expected @withfig/autocomplete@${REQUIRED_FIG_VERSION}, received ${String(manifest.version)}`,
    );
  }
  return buildDirectory;
}

async function collectRegistry(buildDirectory, counters) {
  const specNames = (await readdir(buildDirectory, { withFileTypes: true }))
    .filter(isSpecFile)
    .map((entry) => entry.name)
    .sort();

  const pairs = [];
  for (const specName of specNames) {
    const specUrl = pathToFileURL(join(buildDirectory, specName)).href;
    let node;
    try {
      node = reducers.node((await import(specUrl)).default, basename(specName, ".js"), counters);
    } catch {
      counters.imports += 1;
      continue;
    }
    if (node === undefined) {
      counters.invalidNodes += 1;
      continue;
    }
    for (const name of node[0]) pairs.push([name, node]);
  }
  pairs.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(pairs);
}

// ── 哈希 ────────────────────────────────────────────────────────────────────

/** 递归列出文件；同层按名称排序，保证遍历确定。 */
async function listTree(directory) {
  const names = (await readdir(directory)).sort();
  const found = [];
  for (const name of names) {
    const candidate = join(directory, name);
    if ((await stat(candidate)).isDirectory()) found.push(...(await listTree(candidate)));
    else found.push(candidate);
  }
  return found;
}

/**
 * 构建内容哈希：#211 —— 相对路径统一 `/` 分隔。
 * 旧实现用原生分隔符，Windows 上算出的哈希与仓库里按 POSIX 保存的产物不同，
 * `--check` 因此在 Windows 必然报 stale。这里把分隔符归一后两平台得到同一值。
 */
async function hashBuildTree(buildDirectory) {
  const digest = createHash("sha256");
  const feed = (chunk) => digest.update(chunk);
  for (const absolutePath of await listTree(buildDirectory)) {
    const segments = absolutePath.slice(buildDirectory.length + 1).split(sep);
    feed(segments.join("/"));
    feed("\0");
    feed(await readFile(absolutePath));
    feed("\0");
  }
  return digest.digest("hex");
}

// ── 产物 ────────────────────────────────────────────────────────────────────

const TYPE_DECLARATIONS = [
  "export type BashCommandRegistryOption = readonly [readonly string[], 0 | 1];",
  "export type BashCommandRegistryNode = readonly [readonly string[], readonly BashCommandRegistryOption[], number, readonly BashCommandRegistryNode[]];",
];

function renderArtifact(registry, contentHash, counters) {
  const skipNote = SKIP_FIELDS.map((field) => `${field}=${counters[field]}`).join(", ");
  return (
    [
      "/* eslint-disable */",
      "// 此文件由 scripts/generate-bash-command-registry.mjs 确定性生成，请勿手改。",
      `// Source: @withfig/autocomplete@${REQUIRED_FIG_VERSION} (ISC); hash: ${contentHash}.`,
      `// Skipped: ${skipNote}.`,
      ...TYPE_DECLARATIONS,
      `export const BASH_COMMAND_REGISTRY_VERSION = "fig-${REQUIRED_FIG_VERSION}";`,
      `export const BASH_COMMAND_REGISTRY_HASH = "${contentHash}";`,
      `export const BASH_COMMAND_REGISTRY: Readonly<Record<string, BashCommandRegistryNode>> = ${JSON.stringify(registry)};`,
    ].join("\n") + "\n"
  );
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

/** `--check` 可在任意位置；`--output` 取紧随其后的参数，相对 cwd 解析。 */
function readFlags(argv) {
  const outputAt = argv.indexOf("--output");
  const target = outputAt >= 0 ? argv[outputAt + 1] : undefined;
  return { check: argv.includes("--check"), output: target ? resolve(target) : undefined };
}

/** 只读检查：写临时副本再逐字节比对，临时目录在 finally 清掉。 */
async function verifyAgainstCommitted(generated) {
  const scratch = await mkdtemp(join(tmpdir(), "knorvia-bash-registry-"));
  try {
    const scratchFile = join(scratch, "bash-command-registry.ts");
    await writeFile(scratchFile, generated);
    const produced = await readFile(scratchFile);
    const committed = await readFile(ARTIFACT_PATH);
    if (!produced.equals(committed)) {
      throw new Error(
        "Generated Bash command registry is stale. Run `pnpm --dir apps/cli registry:generate`.",
      );
    }
  } finally {
    await rm(scratch, { force: true, recursive: true });
  }
}

async function main() {
  const flags = readFlags(process.argv.slice(2));
  const counters = newCounters();
  const buildDirectory = await loadFigPackage();
  const registry = await collectRegistry(buildDirectory, counters);
  const contentHash = await hashBuildTree(buildDirectory);
  const generated = renderArtifact(registry, contentHash, counters);

  const bytes = Buffer.byteLength(generated);
  if (bytes > BYTE_LIMIT) {
    throw new Error(`Generated Bash command registry is ${bytes} bytes; limit is ${BYTE_LIMIT}`);
  }

  if (flags.check) {
    await verifyAgainstCommitted(generated);
  } else {
    const target = flags.output ?? ARTIFACT_PATH;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, generated);
  }

  const summary = {
    bytes,
    figVersion: REQUIRED_FIG_VERSION,
    hash: contentHash,
    roots: Object.keys(registry).length,
    skipped: counters,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

const invokedDirectly = () =>
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly()) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
