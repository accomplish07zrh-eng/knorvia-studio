/**
 * 脚本「发布给用户看的产物」在模型面的投影层。三个消费者共用同一份事实：
 * 完成通知的 `<artifacts>` 节、manifest 载荷的 `artifacts[]`（都在 background-tasks.ts），
 * 以及 `GetWorkflowRun` 文本里的 `<artifacts>` 截面（handlers/get-workflow-run.ts）。
 *
 * 名词边界：这里的产物指脚本通过 `artifact.*` 发布的内容（文件、markdown，或由 `report` 标签
 * 喂养的图 / 表 / 指标 / 看板）。它与 `workflow-artifact.ts` 里的 `serializeWorkflowArtifact` 不是一回事——
 * 后者是脚本的顶层返回值（引擎内部 `RunSettlement.artifact`）。两者会在同一条完成通知里并排出现
 * （`<result>` 与 `<artifacts>`），所以刻意分成两个文件。
 *
 * 一行的格式只在这里写一遍：三个消费者是同一个模型，格式一旦分叉，它会把通知里的产物和
 * `GetWorkflowRun` 里的产物当成两套东西。
 *
 * 本层三个出口：给模型的一行文本、通知节、给 GUI 的 manifest 载荷（结构化字段）。
 * 截断必须在构造之前做完——载荷随 turnHeader row 进协议，超界会在落库时被 zod 整行拒收。
 */

/** 三个消费者各自输入形状不同，取交集后的最小事实集。 */
interface PublishedArtifactSummary {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly title?: string;
  readonly contentType?: string;
  /** 内容产物最新版的字节数；预置看板不产出字节。 */
  readonly bytes?: number;
  /** 预置看板收到的 `report` 条数，充当它的「大小」；内容产物恒为 0。 */
  readonly itemCount?: number;
  /** 本 run 的交付物：清单由它带头，行上额外标 `primary`。 */
  readonly primary?: true;
  /** 仅交付物带这一句，完成卡据此画出带文字的一行。 */
  readonly description?: string;
}

type ArtifactSummary = PublishedArtifactSummary;
type ManifestKind = WorkflowArtifactManifestEntry["kind"];
type OptionalText = string | undefined;
type OptionalCount = number | undefined;

/** 交付物 `description` 的长度上界，与 shared 侧 zod 的 `ARTIFACT_CAPS.maxDescriptionLength` 同值。 */
const WORKFLOW_ARTIFACT_DESCRIPTION_MAX_CHARS = 500;

/** 完成通知 `<artifacts>` 的行数上限；文本行数与载荷上界刻意保持同一个值。 */
export const WORKFLOW_ARTIFACTS_NOTIFICATION_MAX_LINES = 8;
/** `GetWorkflowRun` 文本截面的行数上限，取自 `ARTIFACT_CAPS` 的每 run 上界（32）。 */
export const WORKFLOW_ARTIFACTS_INTROSPECTION_MAX_LINES = 32;
/** manifest 载荷里 title 的长度上界，与 shared 侧 zod 的 `ARTIFACT_CAPS.maxTitleLength` 同值。 */
const WORKFLOW_ARTIFACT_TITLE_MAX_CHARS = 120;
/** id 的长度上界，与 shared 侧 zod 的 `ARTIFACT_CAPS.maxIdLength` 同值。 */
const WORKFLOW_ARTIFACT_ID_MAX_CHARS = 64;
/** contentType 的长度上界，与 shared 侧 zod 同值；合法 MIME 远达不到这个长度。 */
const WORKFLOW_ARTIFACT_CONTENT_TYPE_MAX_CHARS = 255;

/** 预置看板的四个种类：不产出字节，数据量取自 report 标签条数。 */
const PRESET_ARTIFACT_KINDS: ReadonlySet<string> = new Set(["chart", "table", "metrics", "board"]);

const PRIMARY_MARKER = "primary";
const LINE_PREFIX = "- ";

/**
 * 把交付物提到最前，其余保持相对顺序（稳定排序）。
 * 三个出口都先排序再截断，因此上界永远砍不到交付物。端口的 `artifactsOf` 已排过一遍；
 * 这里再排是为了快照与通知那条路径——它们拿到的是投影顺序，不保证已排。
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
 * 把一件产物压成一行：`- {id} ({kind}, v{version}, {contentType}, {bytes} bytes): {title}`。
 *
 * 缺哪个部件就整段不写，不留占位——`(file, v2, , : )` 会被读成数据坏了。预置看板的位置写
 * `{n} items`：图的「大小」是点数，字节对它无意义。title 缺失时冒号一起省掉（facade 默认
 * title 就是 id，重复没有信息量）。
 *
 * 不给 `uri`：模型读不到 tool-artifact store。要正文就调 `GetWorkflowRun`，或让子代理读工作区原路径。
 */
export function formatPublishedArtifactLine(artifact: ArtifactSummary): string {
  const head = `${LINE_PREFIX}${artifact.id} (${lineParts(artifact).join(", ")})`;
  const title = artifact.title?.trim();
  if (title === undefined || title.length === 0) return head;
  return `${head}: ${title}`;
}

/** `<artifacts count shown>` 需要的三个值，形状与 `<reports>` 一节一致。 */
interface WorkflowArtifactsNotificationSection {
  /** 真实总件数，不是列出来的行数。 */
  count: number;
  /** 实际列出的行数；小于 count 说明清单只是局部。 */
  shown: number;
  preview: string;
}

/**
 * 产物清单 → 完成通知与 `GetWorkflowRun` 共用的 `<artifacts>` 一节。
 *
 * 规则同 `<reports>`：count 永远是真实总数，count 与 shown 不等就是「这里只是局部清单、
 * 全量可按 run id 取」的信号。没有产物时返回 undefined，让调用方整节不写，而不是写一节空的。
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

/** manifest 载荷（`WorkflowNotificationMeta.artifacts`）里的一条，界与 shared 侧 zod 一致。 */
interface WorkflowArtifactManifestEntry {
  id: string;
  kind: "file" | "markdown" | "chart" | "table" | "metrics" | "board";
  title?: string;
  version: number;
  contentType?: string;
  primary?: true;
  /** 只出现在 `primary` 条目上：完成卡的交付物行要念它，其余 chip 放不下也用不到。 */
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
 * 构造 manifest 载荷的 `artifacts` 与 `artifactsTruncated`。
 *
 * 与上一节同源但形状不同：GUI 每条画一枚 chip（图标 + 截短 title），所以这里给结构化字段而不是
 * 拼好的文本。`bytes` 与 `itemCount` 不进载荷——chip 放不下，展开侧板就能看到。
 * 截断在构造前完成：载荷随 turnHeader row 进协议，超界会被 zod 拒收整行。
 *
 * kind 不在这六个字面量里的条目整条丢弃，不猜也不归一：未知种类在 GUI 上没有图标可画，
 * 而放行它会让整份载荷被 zod 拒掉，其余 chip 跟着一起消失。
 *
 * 没有产物时返回 undefined，调用方据此让两个字段同时缺席。
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
 * 把快照 / 端口详情里的产物转成本模块的输入形状。`bytes` 只挂在版本项上（端口顶层刻意不带），
 * 因此取最新版——那正是清单要描述的那一版。
 *
 * 输入跨包而来（端口实现或冷恢复的行），所以照样做形状检查：坏条目整条跳过，
 * 不让它把整节拖没。
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
