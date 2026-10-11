/**
 * workflow run 的**用户面产物**在模型面的一行投影，被三处共用：
 * 完成通知的 `<artifacts>` 节（background-tasks.ts）、manifest 载荷的 `artifacts[]`（同上）、
 * 以及 `GetWorkflowRun` 模型文本的 `<artifacts>` 截面（handlers/get-workflow-run.ts）。
 *
 * ⚠ 术语：本文件里的 artifact 是**脚本经 `artifact.*` 发布
 * 给用户看的产出**——一个文件、一段 markdown、或一张由标签 `report` 喂养的图 / 表 / 指标 /
 * 看板。它与隔壁 `workflow-artifact.ts` 的 `serializeWorkflowArtifact` 是**两件不同的东西**：
 * 那个 artifact 是脚本的顶层返回值（引擎内部的 `RunSettlement.artifact`），给模型看的。
 * 两者在完成通知里同时出现（`<result>` 与 `<artifacts>`），所以文件也刻意分开。
 *
 * 为什么一行的格式只写一遍：三处的读者是同一个模型，格式分叉会让它以为通知里的产物和
 * `GetWorkflowRun` 里的产物是两套东西。
 *
 * 三个入口的分工：格式化一行（模型面）、构造通知节（`<artifacts>`）、构造 manifest 载荷
 * （GUI chip，结构化字段）。**截断一律在构造前完成**：载荷随 turnHeader row 走协议，超界会让整行落库时被 zod 拒收。
 */

/** 一件产物在模型面需要的全部事实。三处的输入形状不同，取交集后收成这一个结构。 */
interface PublishedArtifactSummary {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly title?: string;
  readonly contentType?: string;
  /** 内容产物（file / markdown）最新版的字节数。预置看板没有字节。 */
  readonly bytes?: number;
  /** 预置看板收到的标签 `report` 条数（数据量）。内容产物恒 0。 */
  readonly itemCount?: number;
  /** run 的交付物：清单以它带头，行上标 `primary`。 */
  readonly primary?: true;
  /** 只有交付物的这一句进 manifest：完成卡把它画成带文字的一行。 */
  readonly description?: string;
}

type ArtifactSummary = PublishedArtifactSummary;
type ManifestKind = WorkflowArtifactManifestEntry["kind"];
type OptionalText = string | undefined;
type OptionalCount = number | undefined;

/** manifest 里交付物 `description` 的界（`ARTIFACT_CAPS.maxDescriptionLength`，与 shared 的 zod 同值）。 */
const WORKFLOW_ARTIFACT_DESCRIPTION_MAX_CHARS = 500;

/** 完成通知里 `<artifacts>` 最多列几行。载荷上界（≤ 8）与文本行数刻意同值。 */
export const WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES = 8;
/** `GetWorkflowRun` 的 `<artifacts>` 截面上界（有界 32 = `ARTIFACT_CAPS` 的每 run 上限）。 */
export const WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES = 32;
/** manifest 载荷里 title 的界（`ARTIFACT_CAPS.maxTitleLength`，与 shared 的 zod 同值）。 */
const WORKFLOW_ARTIFACT_TITLE_MAX_CHARS = 120;
/** id 的界（`ARTIFACT_CAPS.maxIdLength`，与 shared 的 zod 同值）。 */
const WORKFLOW_ARTIFACT_ID_MAX_CHARS = 64;
/** contentType 的界（与 shared 的 zod 同值；MIME 本身没有这么长的合法形态）。 */
const WORKFLOW_ARTIFACT_CONTENT_TYPE_MAX_CHARS = 255;

/** 预置看板的四个成员：它们没有字节，数据量是标签 report 的条数。 */
const PRESET_ARTIFACT_KINDS: ReadonlySet<string> = new Set(["chart", "table", "metrics", "board"]);

const PRIMARY_MARKER = "primary";
const LINE_PREFIX = "- ";

/**
 * 交付物带头，其余保持原顺序（稳定排序）。三处清单都先过这一步再截，所以上界砍不到交付物。
 * 端口的 `artifactsOf` 已经排过；这里再排一次是为了快照与通知那条路（它们读的是投影的顺序）。
 */
function primaryFirst<T extends { primary?: true }>(artifacts: readonly T[]): T[] {
  return [...artifacts].sort(
    (left, right) => Number(right.primary === true) - Number(left.primary === true),
  );
}

// 预置看板的「大小」是点数不是字节：字节数对一张图没有意义（它根本没有字节）。
function itemLabel(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

function sizeLabel(artifact: ArtifactSummary): OptionalText {
  if (PRESET_ARTIFACT_KINDS.has(artifact.kind)) {
    return artifact.itemCount === undefined ? undefined : itemLabel(artifact.itemCount);
  }
  return artifact.bytes === undefined ? undefined : `${artifact.bytes} bytes`;
}

// 括号里按固定顺序拼：种类（交付物紧跟 primary）→ 版本 → 内容类型 → 大小。
function lineParts(artifact: ArtifactSummary): string[] {
  const parts = artifact.primary === true ? [artifact.kind, PRIMARY_MARKER] : [artifact.kind];
  parts.push(`v${artifact.version}`);
  if (artifact.contentType !== undefined && artifact.contentType.length > 0) {
    parts.push(artifact.contentType);
  }
  const size = sizeLabel(artifact);
  if (size !== undefined) parts.push(size);
  return parts;
}

/**
 * 一件产物 → 一行：`- {id} ({kind}, v{version}, {contentType}, {bytes} bytes): {title}`。
 *
 * 缺席的部件整段省略而不是留一个空位——`(file, v2, , : )` 读起来像数据坏了。预置看板把字节
 * 换成 `{n} items`：一张图的「大小」是它有多少个点，字节数对它没有意义（它根本没有字节）。
 * `title` 缺席时连冒号一起省略（facade 的默认 title 就是 id，重复一遍没有信息）。
 *
 * 刻意**不给 `uri`**：模型读不了 tool-artifact store。要内容就走 `GetWorkflowRun`，或者让
 * 子代理去读工作区里的原路径。
 */
export function formatPublishedArtifactLine(artifact: ArtifactSummary): string {
  const head = `${LINE_PREFIX}${artifact.id} (${lineParts(artifact).join(", ")})`;
  const title = artifact.title?.trim();
  if (title === undefined || title.length === 0) return head;
  return `${head}: ${title}`;
}

/** `<artifacts count shown>` 一节所需的三件事，与 `<reports>` 那一节同形。 */
interface WorkflowArtifactsNotificationSection {
  /** **真实总件数**（不是列出来的行数）。 */
  count: number;
  /** 实际列出的行数；小于 count 即清单是局部的。 */
  shown: number;
  preview: string;
}

/**
 * 产物清单 → 完成通知 / `GetWorkflowRun` 的 `<artifacts>` 一节。
 *
 * 与 `<reports>` 同规：`count` 恒是真实总数，`count ≠ shown` 就是「清单是局部的、全量经 run id
 * 可取」的那个信号。零件时返回 `undefined`，调用方据此让整节缺席——不发一节空的 `<artifacts>`。
 */
export function buildWorkflowArtifactsNotificationSection(
  artifacts: readonly ArtifactSummary[] | undefined,
  maxLines: number,
): WorkflowArtifactsNotificationSection | undefined {
  if (artifacts === undefined || artifacts.length === 0) return undefined;
  const ordered = primaryFirst(artifacts);
  const lines = ordered.slice(0, maxLines).map(formatPublishedArtifactLine);
  return { count: artifacts.length, shown: lines.length, preview: lines.join("\n") };
}

/** manifest 载荷（`WorkflowNotificationMeta.artifacts`）的一条。shared 的 zod 是同一组界。 */
interface WorkflowArtifactManifestEntry {
  id: string;
  kind: "file" | "markdown" | "chart" | "table" | "metrics" | "board";
  title?: string;
  version: number;
  contentType?: string;
  primary?: true;
  /** 只在 `primary` 的条目上（完成卡的交付物行念它；其余 chip 放不下也不需要）。 */
  description?: string;
}

const MANIFEST_ARTIFACT_KINDS: readonly ManifestKind[] = [
  "file",
  "markdown",
  "chart",
  "table",
  "metrics",
  "board",
];

const MANIFEST_ARTIFACT_KIND_SET: ReadonlySet<string> = new Set(MANIFEST_ARTIFACT_KINDS);

function manifestArtifactKind(kind: string): ManifestKind | undefined {
  return MANIFEST_ARTIFACT_KIND_SET.has(kind) ? (kind as ManifestKind) : undefined;
}

function trimmed(value: OptionalText): OptionalText {
  const result = value?.trim();
  return result === undefined || result.length === 0 ? undefined : result;
}

// 超界与空值一律整条丢弃的字段：id（chip 的身份键）、version（zod 要求正整数）。
function hasUsableIdentity(artifact: ArtifactSummary): boolean {
  if (artifact.id.length === 0 || artifact.id.length > WORKFLOW_ARTIFACT_ID_MAX_CHARS) return false;
  return Number.isInteger(artifact.version) && artifact.version >= 1;
}

// contentType 只是 chip 上的装饰：超界丢这一个键，而不是整条。
function usableContentType(artifact: ArtifactSummary): OptionalText {
  const value = artifact.contentType;
  if (value === undefined || value.length > WORKFLOW_ARTIFACT_CONTENT_TYPE_MAX_CHARS) {
    return undefined;
  }
  return value;
}

// 一条产物 → manifest 条目；种类未知或身份不可用返回 undefined（调用方整条跳过）。
function manifestEntryFor(artifact: ArtifactSummary): WorkflowArtifactManifestEntry | undefined {
  const kind = manifestArtifactKind(artifact.kind);
  if (kind === undefined || !hasUsableIdentity(artifact)) return undefined;

  const entry = {} as WorkflowArtifactManifestEntry;
  entry.id = artifact.id;
  entry.kind = kind;
  entry.version = artifact.version;

  const title = trimmed(artifact.title);
  if (title !== undefined) entry.title = title.slice(0, WORKFLOW_ARTIFACT_TITLE_MAX_CHARS);

  const contentType = usableContentType(artifact);
  if (contentType !== undefined) entry.contentType = contentType;

  if (artifact.primary === true) {
    entry.primary = true;
    const description = trimmed(artifact.description);
    if (description !== undefined) {
      entry.description = description.slice(0, WORKFLOW_ARTIFACT_DESCRIPTION_MAX_CHARS);
    }
  }
  return entry;
}

/**
 * manifest 载荷的 `artifacts` 与 `artifactsTruncated`。
 *
 * 与上面那一节**同源不同形**：GUI 把每条渲染成一枚 chip（图标 + 截短的 title），所以载荷带的是
 * 结构化字段而不是拼好的一行；`bytes` / `itemCount` 刻意不进载荷——chip 上放不下，点开侧板即可
 * 看到全部。截断在**构造前**完成：载荷随 turnHeader row 走协议，超界会让整行落库时 zod 拒收。
 *
 * `kind` 不在六个字面量里的条目整条丢弃（不猜、不归一）：一个未知种类的 chip 在 GUI 上没有
 * 图标可画，而放行它会让整个载荷被 zod 拒掉，连带其余 chip 一起消失。
 *
 * 零件时返回 `undefined`，调用方据此让两个字段一起缺席。
 */
export function buildWorkflowArtifactsManifestSection(
  artifacts: readonly ArtifactSummary[] | undefined,
): { artifacts: WorkflowArtifactManifestEntry[]; artifactsTruncated?: true } | undefined {
  if (artifacts === undefined || artifacts.length === 0) return undefined;

  const entries: WorkflowArtifactManifestEntry[] = [];
  // 交付物先进清单：8 的上界永远砍不到它。
  for (const artifact of primaryFirst(artifacts)) {
    if (entries.length >= WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES) break;
    // 一条坏行不该把其余 chip 一起带走：放行会让 zod 拒收整份载荷，所以坏条目整条丢。
    const entry = manifestEntryFor(artifact);
    if (entry === undefined) continue;
    entries.push(entry);
  }
  if (entries.length === 0) return undefined;

  // 截断诚实：被上界砍掉的、以及被种类过滤掉的，都算「还有更多没画出来」——判据因此是
  // 「画出来的比总数少」，而不是「命中了上界」。
  if (entries.length < artifacts.length) return { artifacts: entries, artifactsTruncated: true };
  return { artifacts: entries };
}

// 最新版的字节数：端口的顶层刻意不带 bytes，只有版本项上有，而清单要描述的正是最新版。
function latestVersionBytes(record: Record<string, unknown>): OptionalCount {
  const versions = Array.isArray(record.versions) ? record.versions : undefined;
  const latest = versions?.[versions.length - 1];
  if (latest === null || typeof latest !== "object") return undefined;
  const bytes = (latest as Record<string, unknown>).bytes;
  return typeof bytes === "number" ? bytes : undefined;
}

function summaryOf(record: Record<string, unknown>): ArtifactSummary | undefined {
  const id = typeof record.id === "string" ? record.id : undefined;
  const kind = typeof record.kind === "string" ? record.kind : undefined;
  const version = typeof record.version === "number" ? record.version : undefined;
  if (id === undefined || kind === undefined || version === undefined) return undefined;

  const summary = {} as {
    id: string;
    kind: string;
    version: number;
    title?: string;
    contentType?: string;
    bytes?: number;
    itemCount?: number;
    primary?: true;
    description?: string;
  };
  summary.id = id;
  summary.kind = kind;
  summary.version = version;
  if (typeof record.title === "string") summary.title = record.title;
  if (typeof record.contentType === "string") summary.contentType = record.contentType;
  const bytes = latestVersionBytes(record);
  if (bytes !== undefined) summary.bytes = bytes;
  if (typeof record.itemCount === "number") summary.itemCount = record.itemCount;
  if (record.primary === true) summary.primary = true;
  if (typeof record.description === "string") summary.description = record.description;
  return summary;
}

/**
 * 快照 / 端口详情上的产物 → 本模块的输入形状。`bytes` 只在版本项上（端口的顶层刻意不带它），
 * 所以从**最新版**取——那正是清单要描述的那一版。
 *
 * 形状照样防御性检查：输入跨包而来（端口实现、或一条冷恢复回来的行），一个坏条目不该让整节
 * 消失。不合形的整条跳过。
 */
export function toPublishedArtifactSummaries(value: unknown): ArtifactSummary[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const summaries: ArtifactSummary[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue;
    const summary = summaryOf(entry as Record<string, unknown>);
    if (summary !== undefined) summaries.push(summary);
  }
  return summaries.length === 0 ? undefined : summaries;
}
