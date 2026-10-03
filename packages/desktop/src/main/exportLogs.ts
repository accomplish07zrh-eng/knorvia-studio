/* eslint-disable max-lines -- Native export selection, stream sanitization and archive lifetimes share one contract. */
import { constants, createReadStream, createWriteStream, type Dirent } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import {
  createFeedbackDiagnosticArchive,
  getAppConfigDir,
  getExportLogDir as getDefaultExportLogDir,
  getExportLogStageDir as getDefaultExportLogStageDir,
  getFeedbackLogArchiveDir as getDefaultFeedbackLogArchiveDir,
} from "@knorvia/services/node";
import { createAboutSnapshot, formatAboutDetail, readBuildMetadata } from "./about.js";
import { logger } from "./logger.js";

interface LogArchiveFileEntry {
  absolutePath: string;
  archivePath: string;
}

interface LogArchiveArtifacts {
  files: LogArchiveFileEntry[];
  aboutContent: string;
}

interface CreateLogArchiveArtifactsOptions {
  now?: () => Date;
  lookbackDays?: number;
}

interface LogArchiveSkippedFileEntry {
  absolutePath: string;
  archivePath: string;
  error: string;
}

interface ExportLogsDependencies {
  now?: () => Date;
  getKnorviaDataDir?: () => string;
  getExportLogStageDir?: () => string;
  getExportLogDir?: () => string;
  createLogArchiveArtifacts?: (
    sourceDir: string,
    options?: CreateLogArchiveArtifactsOptions,
  ) => Promise<LogArchiveArtifacts>;
  writeLogArchiveZip?: (
    outputPath: string,
    artifacts: LogArchiveArtifacts,
    options?: WriteLogArchiveZipOptions,
  ) => Promise<void>;
  writeLogArchiveDirectory?: (outputPath: string, artifacts: LogArchiveArtifacts) => Promise<void>;
  showItemInFolder?: (path: string) => Promise<void> | void;
}

interface WriteLogArchiveZipOptions {
  stageRootDir?: string;
}

interface CreateFeedbackLogArchiveFromExportLogsOptions {
  now?: () => Date;
  outputRootDir?: string;
  stageRootDir?: string;
  onProgress?: (event: { processedBytes: number; totalBytes: number }) => void;
}

const ZIP_EXCLUDE_PATTERNS: string[] = [];

const RETIRED_ACP_RUNTIME_ARCHIVE_PATHS = [
  "acp-auth",
  "acp-config",
  "acp-stream-diagnostics",
  "acp-traffic-proxy",
] as const;
const HIGH_VOLUME_RUNTIME_ARCHIVE_PATHS = ["dev"] as const;
const DOCSHOT_ARCHIVE_PATH_PREFIXES = ["docshot-backup-"] as const;
const DOCSHOT_ARCHIVE_PATHS = ["docshot-assets"] as const;
const NON_LOG_STATE_ARCHIVE_PATHS = [
  "agent-config",
  "certs",
  "repo",
  "sessions",
  "session-bindings",
  "checkpoints",
  "studio",
  "creation",
  "crash",
] as const;
const SENSITIVE_CREDENTIAL_ARCHIVE_FILE_NAMES = new Set(["credentials.json", ".credentials.json"]);
const EXCLUDED_ARCHIVE_DIRECTORY_NAMES = new Set(["debug"]);
const DIAGNOSTIC_TEXT_EXTENSIONS = /\.(?:log|jsonl|txt)$/i;
const DEFAULT_LOG_EXPORT_LOOKBACK_DAYS = 3;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const REDACTED_PLACEHOLDER = "***REDACTED***";
// 敏感键名“族”：只要键名里包含这些子串就视为敏感（兜底通配），
// 从而覆盖自定义命名（如 db_password、my_secret、x-conn-string 等）而不必逐个精确列举。
// 注意：`token` / `auth` 等是宽松子串，配合下方白名单排除误伤项（如 input_tokens、author）。
const SENSITIVE_KEY_SUBSTRING_PATTERN = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "credential",
  "api(?:_|-)?key",
  "access(?:_|-)?key",
  "private(?:_|-)?key",
  "auth",
  "cookie",
  "dsn",
  "conn(?:ection)?(?:_|-)?str(?:ing)?",
  "database(?:_|-)?url",
  "db(?:_|-)?url",
].join("|");
const SENSITIVE_KEY_NAME_REGEX = new RegExp(`(?:${SENSITIVE_KEY_SUBSTRING_PATTERN})`, "i");
// 白名单：命中敏感子串但实际并非密钥的常见键名，避免脱掉排障需要的上下文。
// 不能把任意 "*_tokens" 都白名单化，否则 access_tokens/session_tokens 会被原样导出；
// max_tokens/budget_tokens 是模型输出与思考预算，不是凭据，需保留用于判断 provider 请求是否撞限；
// 因此这里只放行明确的 LLM token 计数/预算字段，以及 author/authority 这类含 "auth" 的普通词。
const NON_SENSITIVE_KEY_NAME_ALLOWLIST_REGEX =
  /^(?:public(?:_|-)?key|keywords?|tokenizer|token(?:_|-)?count|(?:prompt|completion|total|input|output|cached|reasoning|max|budget|accepted(?:_|-)?prediction|rejected(?:_|-)?prediction|tool(?:_|-)?use(?:_|-)?prompt)(?:_|-)?tokens|author(?:s|ity|ed)?)$/i;

const JSON_STYLE_SENSITIVE_VALUE_REGEX =
  /(["'])([A-Za-z0-9_.-]+)\1(\s*:\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,\r\n}\]]+)/g;
const ASSIGNMENT_STYLE_SENSITIVE_VALUE_REGEX =
  /((?:^|\n)[ \t]*)([A-Za-z0-9_.-]+)([ \t]*=[ \t]*)([^\r\n#]+)/g;
const HEADER_STYLE_SENSITIVE_VALUE_REGEX =
  /((?:^|\n)[ \t]*)([A-Za-z0-9-]+)([ \t]*:[ \t]*)([^\r\n]+)/g;
const BEARER_TOKEN_REGEX = /(Bearer\s+)([^\s"']+)/g;
const QUERY_TOKEN_REGEX =
  /([?&](?:key|api(?:_|-)?key|access(?:_|-)?token|refresh(?:_|-)?token|token|password|passwd|pwd|secret|client(?:_|-)?secret|auth(?:_|-)?token|session(?:_|-)?token)=)([^&#\s]+)/gi;
// 按“值形态”脱敏：连接串 scheme://user:pass@host 里的凭据部分，
// 不依赖键名即可覆盖 postgres/mysql/mongodb/redis/amqp 等数据库连接信息。保留 scheme 与 host 便于排障。
// 用户名段允许为空以覆盖 redis://:password@host；口令段贪婪匹配到最后一个 @（host 段不含 @），
// 这样口令里含裸 @（如 P@ssw0rd）也能整段脱敏，不残留片段。
const CONNECTION_STRING_CREDENTIALS_REGEX =
  /\b([a-z][a-z0-9+.-]*:\/\/)([^:/\s]*):([^/\s]+)@(?=[^@/\s])/gi;
const TEXT_DETECTION_SAMPLE_BYTES = 64 * 1024;
const EMPTY_BOM = Buffer.alloc(0);

type SupportedTextEncoding = "utf-8" | "utf-16le" | "utf-16be";

interface TextFileEncodingInfo {
  encoding: SupportedTextEncoding;
  bomLength: number;
  bomBytes: Buffer;
}

interface TextDecodingScore {
  preferredCharRatio: number;
  invalidCharRatio: number;
}

const UTF16_CODECS = ["utf-16le", "utf-16be"] as const;
const PREFERRED_TEXT_RANGES = [
  [0x20, 0x7e],
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
  [0x3000, 0x303f],
  [0xff00, 0xffef],
  [0x3040, 0x30ff],
  [0xac00, 0xd7af],
] as const;
const PRIVATE_KEY_LINE = /[^\r\n]*(?:\r?\n|$)/g;
const PRIVATE_KEY_BEGIN = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;
const PRIVATE_KEY_END = /-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/;

function diagnosticError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dataRoot(): string {
  return getAppConfigDir();
}
function cliLogsRoot(): string {
  return join(join(dirname(getAppConfigDir()), "cli"), "log");
}
function helperLogsRoot(): string {
  return join(dirname(getAppConfigDir()), "computer-use", "run");
}
function portablePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function localTimestamp(date: Date): string {
  const calendar = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];
  const fields = calendar.map((part, index) =>
    index === 0 ? String(part) : String(part).padStart(2, "0"),
  );
  return fields.slice(0, 3).join("") + "-" + fields.slice(3).join("");
}

function starPattern(pattern: string): RegExp {
  let expression = "^";
  for (const character of portablePath(pattern)) {
    expression += character === "*" ? ".*" : character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(expression + "$");
}

const ZIP_EXCLUDE_REGEXES = ZIP_EXCLUDE_PATTERNS.map(starPattern);

class ArchivePathPolicy {
  public excludes(path: string, allowDirectoryAncestors = false): boolean {
    const normalized = portablePath(path);
    const lower = normalized.toLowerCase();
    const segments = lower.split("/");
    if (SENSITIVE_CREDENTIAL_ARCHIVE_FILE_NAMES.has(segments.at(-1) ?? "")) return true;
    if (segments.some((segment) => EXCLUDED_ARCHIVE_DIRECTORY_NAMES.has(segment))) return true;
    if (NON_LOG_STATE_ARCHIVE_PATHS.some((prefix) => normalized.startsWith(prefix))) return true;
    const descendantOf = (root: string) => normalized === root || normalized.startsWith(`${root}/`);
    if (HIGH_VOLUME_RUNTIME_ARCHIVE_PATHS.some(descendantOf)) return true;
    const first = normalized.split("/")[0] ?? "";
    if (
      DOCSHOT_ARCHIVE_PATHS.some((root) => root === first) ||
      DOCSHOT_ARCHIVE_PATH_PREFIXES.some((prefix) => first.startsWith(prefix))
    )
      return true;
    if (RETIRED_ACP_RUNTIME_ARCHIVE_PATHS.some(descendantOf) || descendantOf("Library/Caches"))
      return true;
    if (ZIP_EXCLUDE_REGEXES.some((rule) => rule.test(normalized))) return true;
    return (
      lower !== "about.txt" &&
      !["logs", ".knorvia-studio/cli/log", ".knorvia-studio/computer-use/run"].some(
        (root) =>
          lower === root ||
          lower.startsWith(`${root}/`) ||
          (allowDirectoryAncestors && root.startsWith(`${lower}/`)),
      )
    );
  }

  public diagnostic(path: string): boolean {
    return DIAGNOSTIC_TEXT_EXTENSIONS.test(path);
  }

  public aged(path: string): boolean {
    const normalized = portablePath(path);
    return normalized.startsWith("logs/") || normalized.startsWith(".knorvia-studio/cli/log/");
  }
}

const archivePolicy = new ArchivePathPolicy();

type ScanFrame = { directory: string; prefix: string; entries: IterableIterator<Dirent> };

class ArchiveSelection {
  private readonly visited = new Set<string>();
  public readonly files: LogArchiveFileEntry[] = [];

  private async enter(directory: string, prefix: string): Promise<ScanFrame | undefined> {
    const identity = await realpath(directory).catch(() => directory);
    if (this.visited.has(identity)) return undefined;
    this.visited.add(identity);
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
      logger.warn("[export-logs] 日志目录不可读，已在导出时自动跳过", {
        absolutePath: directory,
        archivePath: prefix,
        error: diagnosticError(error),
      });
      return null;
    });
    if (!entries) return undefined;
    entries.sort((left, right) => left.name.localeCompare(right.name));
    return { directory, prefix, entries: entries[Symbol.iterator]() };
  }

  public async directory(directory: string, prefix: string, stagedArchive = false): Promise<void> {
    const metadata = await stat(directory).catch(() => null);
    if (!metadata?.isDirectory()) return;
    const root = await this.enter(directory, prefix);
    if (!root) return;
    const frames: ScanFrame[] = [root];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const next = frame.entries.next();
      if (next.done) {
        frames.pop();
        continue;
      }
      const entry = next.value;
      const archivePath = frame.prefix ? posix.join(frame.prefix, entry.name) : entry.name;
      // ZIP stage 的诊断前缀有中间目录；只允许遍历真实祖先目录，叶子仍用原白名单。
      if (archivePolicy.excludes(archivePath, stagedArchive && entry.isDirectory())) continue;
      const absolutePath = join(frame.directory, entry.name);
      if (entry.isDirectory()) {
        const child = await this.enter(absolutePath, archivePath);
        if (child) frames.push(child);
      } else if (entry.isFile()) {
        if (archivePolicy.diagnostic(entry.name)) this.files.push({ absolutePath, archivePath });
      } else if (entry.isSymbolicLink()) {
        const target = await stat(absolutePath).catch(() => null);
        if (!target) continue;
        if (target.isDirectory()) {
          const child = await this.enter(absolutePath, archivePath);
          if (child) frames.push(child);
        } else if (target.isFile() && archivePolicy.diagnostic(entry.name)) {
          this.files.push({ absolutePath, archivePath });
        }
      }
    }
  }

  public async helperDirectory(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => null);
    if (!entries) return;
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".exit.log")) continue;
      const absolutePath = join(directory, entry.name);
      const archivePath = posix.join(prefix, entry.name);
      if (archivePolicy.excludes(archivePath) || !archivePolicy.diagnostic(archivePath)) continue;
      const metadata = await stat(absolutePath).catch(() => null);
      if (metadata?.isFile()) this.files.push({ absolutePath, archivePath });
    }
  }
}

function orderFiles(files: LogArchiveFileEntry[]): LogArchiveFileEntry[] {
  return files.sort((left, right) => left.archivePath.localeCompare(right.archivePath));
}

async function recentSelection(
  files: LogArchiveFileEntry[],
  options: CreateLogArchiveArtifactsOptions,
): Promise<LogArchiveFileEntry[]> {
  const days = options.lookbackDays ?? DEFAULT_LOG_EXPORT_LOOKBACK_DAYS;
  if (days <= 0) return files;
  const now = options.now ?? (() => new Date());
  const cutoff = now().getTime() - days * MILLISECONDS_PER_DAY;
  const accepted: LogArchiveFileEntry[] = [];
  for (const file of files) {
    if (!archivePolicy.aged(file.archivePath)) {
      accepted.push(file);
      continue;
    }
    const metadata = await stat(file.absolutePath).catch(() => null);
    if (metadata?.isFile() && metadata.mtimeMs >= cutoff) accepted.push(file);
  }
  return accepted;
}

async function buildLogArtifacts(
  sourceDir: string,
  options: CreateLogArchiveArtifactsOptions = {},
): Promise<LogArchiveArtifacts> {
  const selection = new ArchiveSelection();
  await selection.directory(sourceDir, "");
  const cliRoot = cliLogsRoot();
  await selection.directory(cliRoot, posix.join(".knorvia-studio", "cli", "log"));
  await selection.helperDirectory(
    helperLogsRoot(),
    posix.join(".knorvia-studio", "computer-use", "run"),
  );
  const files = orderFiles(await recentSelection(selection.files, options));
  const snapshot = createAboutSnapshot({ buildMetadata: readBuildMetadata() });
  return { files, aboutContent: formatAboutDetail(snapshot) };
}

class EncodingEvidence {
  public constructor(private readonly sample: Buffer) {}

  private nullParity(): SupportedTextEncoding | null {
    if (this.sample.length < 4) return null;
    const counts: [number, number] = [0, 0];
    const zeros: [number, number] = [0, 0];
    for (let index = 0; index < this.sample.length; index++) {
      const parity = (index % 2) as 0 | 1;
      counts[parity]++;
      if (this.sample[index] === 0) zeros[parity]++;
    }
    const even = zeros[0] / Math.max(counts[0], 1);
    const odd = zeros[1] / Math.max(counts[1], 1);
    if (odd >= 0.3 && even <= 0.1) return "utf-16le";
    if (even >= 0.3 && odd <= 0.1) return "utf-16be";
    return null;
  }

  private asciiRuns(): SupportedTextEncoding | null {
    if (this.sample.length < 4) return null;
    const runs = { "utf-16le": { length: 0, score: 0 }, "utf-16be": { length: 0, score: 0 } };
    const endRun = (codec: (typeof UTF16_CODECS)[number]) => {
      const run = runs[codec];
      if (run.length >= 3) run.score += run.length;
      run.length = 0;
    };
    const ascii = (byte: number) =>
      byte === 9 || byte === 10 || byte === 13 || (byte >= 0x20 && byte <= 0x7e);
    for (let index = 0; index + 1 < this.sample.length; index += 2) {
      const left = this.sample[index] ?? 0;
      const right = this.sample[index + 1] ?? 0;
      const direction =
        right === 0 && ascii(left) ? "utf-16le" : left === 0 && ascii(right) ? "utf-16be" : null;
      for (const codec of UTF16_CODECS) {
        if (codec === direction) runs[codec].length++;
        else endRun(codec);
      }
    }
    for (const codec of UTF16_CODECS) endRun(codec);
    if (runs["utf-16le"].score >= 6 && runs["utf-16le"].score >= runs["utf-16be"].score * 1.5)
      return "utf-16le";
    if (runs["utf-16be"].score >= 6 && runs["utf-16be"].score >= runs["utf-16le"].score * 1.5)
      return "utf-16be";
    return null;
  }

  private decodedScore(codec: (typeof UTF16_CODECS)[number], bytes: Buffer): TextDecodingScore {
    let count = 0;
    let preferred = 0;
    let invalid = 0;
    for (const character of new TextDecoder(codec).decode(bytes)) {
      count++;
      const code = character.codePointAt(0) ?? 0;
      if (
        code === 0xfffd ||
        code === 0 ||
        code === 0x7f ||
        (code >= 0xd800 && code <= 0xdfff) ||
        (code <= 0x1f && code !== 9 && code !== 10 && code !== 13)
      )
        invalid++;
      else if (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        PREFERRED_TEXT_RANGES.some(([first, last]) => code >= first && code <= last)
      )
        preferred++;
    }
    return {
      preferredCharRatio: preferred / Math.max(count, 1),
      invalidCharRatio: invalid / Math.max(count, 1),
    };
  }

  private decodedHint(): SupportedTextEncoding | null {
    const length = this.sample.length - (this.sample.length % 2);
    if (length < 4) return null;
    const bytes = this.sample.subarray(0, length);
    const le = this.decodedScore("utf-16le", bytes);
    const be = this.decodedScore("utf-16be", bytes);
    const qualified = (score: TextDecodingScore) =>
      score.preferredCharRatio >= 0.55 && score.invalidCharRatio <= 0.2;
    if (qualified(le) !== qualified(be)) return qualified(le) ? "utf-16le" : "utf-16be";
    if (!qualified(le)) return null;
    if (Math.abs(le.preferredCharRatio - be.preferredCharRatio) >= 0.08) {
      return le.preferredCharRatio > be.preferredCharRatio ? "utf-16le" : "utf-16be";
    }
    return le.invalidCharRatio <= be.invalidCharRatio ? "utf-16le" : "utf-16be";
  }

  private utf8Valid(): boolean {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(this.sample);
      return true;
    } catch {
      return false;
    }
  }

  public choose(): TextFileEncodingInfo | null {
    if (this.sample.length === 0) return { encoding: "utf-8", bomLength: 0, bomBytes: EMPTY_BOM };
    const bom = [
      { codec: "utf-8" as const, bytes: [0xef, 0xbb, 0xbf] },
      { codec: "utf-16le" as const, bytes: [0xff, 0xfe] },
      { codec: "utf-16be" as const, bytes: [0xfe, 0xff] },
    ].find(
      ({ bytes }) =>
        this.sample.length >= bytes.length &&
        bytes.every((byte, index) => this.sample[index] === byte),
    );
    if (bom)
      return { encoding: bom.codec, bomLength: bom.bytes.length, bomBytes: Buffer.from(bom.bytes) };
    // 沿用既有二进制门槛：含 NUL 却不具备明确字节序证据时不能进入评分兜底。
    if (this.sample.includes(0) && !this.nullParity()) return null;
    if (!this.sample.includes(0) && this.utf8Valid())
      return { encoding: "utf-8", bomLength: 0, bomBytes: EMPTY_BOM };
    const codec = this.asciiRuns() ?? this.nullParity() ?? this.decodedHint();
    if (codec) return { encoding: codec, bomLength: 0, bomBytes: EMPTY_BOM };
    return this.utf8Valid() ? { encoding: "utf-8", bomLength: 0, bomBytes: EMPTY_BOM } : null;
  }
}

function maskScalar(raw: string): string {
  const leading = raw.match(/^\s*/)?.[0] ?? "";
  const trailing = raw.match(/\s*$/)?.[0] ?? "";
  const trimmed = raw.trim();
  const quote =
    trimmed.startsWith('"') && trimmed.endsWith('"')
      ? '"'
      : trimmed.startsWith("'") && trimmed.endsWith("'")
        ? "'"
        : "";
  return `${leading}${quote}${REDACTED_PLACEHOLDER}${quote}${trailing}`;
}

function sensitiveKey(key: string): boolean {
  return !NON_SENSITIVE_KEY_NAME_ALLOWLIST_REGEX.test(key) && SENSITIVE_KEY_NAME_REGEX.test(key);
}

function maskDiagnosticText(content: string): string {
  const keyed = (match: string, prefix: string, key: string, separator: string, value: string) =>
    sensitiveKey(key) ? `${prefix}${key}${separator}${maskScalar(value)}` : match;
  const connections = content.replace(
    CONNECTION_STRING_CREDENTIALS_REGEX,
    (_match, scheme: string) => `${scheme}${REDACTED_PLACEHOLDER}:${REDACTED_PLACEHOLDER}@`,
  );
  const json = connections.replace(
    JSON_STYLE_SENSITIVE_VALUE_REGEX,
    (match, quote: string, key: string, separator: string, value: string) =>
      sensitiveKey(key) ? `${quote}${key}${quote}${separator}${maskScalar(value)}` : match,
  );
  const assignments = json.replace(ASSIGNMENT_STYLE_SENSITIVE_VALUE_REGEX, keyed);
  const headers = assignments.replace(
    HEADER_STYLE_SENSITIVE_VALUE_REGEX,
    (match, prefix: string, key: string, separator: string, value: string) => {
      if (!sensitiveKey(key)) return match;
      const trimmed = value.trim();
      const masked = /^bearer\s+/i.test(trimmed)
        ? trimmed.replace(/^bearer\s+.+$/i, `Bearer ${REDACTED_PLACEHOLDER}`)
        : REDACTED_PLACEHOLDER;
      return `${prefix}${key}${separator}${masked}`;
    },
  );
  return headers
    .replace(BEARER_TOKEN_REGEX, `$1${REDACTED_PLACEHOLDER}`)
    .replace(QUERY_TOKEN_REGEX, `$1${REDACTED_PLACEHOLDER}`)
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/gi, REDACTED_PLACEHOLDER)
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED_PLACEHOLDER);
}

function encodeDiagnosticText(text: string, codec: SupportedTextEncoding): Buffer {
  if (codec === "utf-8") return Buffer.from(text, "utf-8");
  const bytes = Buffer.from(text, "utf16le");
  return codec === "utf-16be" ? bytes.swap16() : bytes;
}

class SanitizerStreamState {
  private readonly decoder: TextDecoder;
  private pending = "";
  private privateKey = false;

  public constructor(private readonly codec: SupportedTextEncoding) {
    this.decoder = new TextDecoder(codec);
  }

  private output(text: string): Buffer {
    const publicLines = text.replace(PRIVATE_KEY_LINE, (line) => {
      if (!line) return "";
      if (PRIVATE_KEY_BEGIN.test(line)) {
        this.privateKey = true;
        return `${REDACTED_PLACEHOLDER}\n`;
      }
      if (!this.privateKey) return line;
      if (PRIVATE_KEY_END.test(line)) this.privateKey = false;
      return "";
    });
    return encodeDiagnosticText(maskDiagnosticText(publicLines), this.codec);
  }

  public receive(chunk: Buffer | string): Buffer | undefined {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const merged = this.pending + this.decoder.decode(bytes, { stream: true });
    const lf = merged.lastIndexOf("\n");
    let boundary = lf + 1;
    if (lf < 0) {
      const cr = merged.lastIndexOf("\r");
      boundary = cr >= 0 && cr < merged.length - 1 ? cr + 1 : 0;
    }
    this.pending = merged.slice(boundary);
    return boundary === 0 ? undefined : this.output(merged.slice(0, boundary));
  }

  public finish(): Buffer | undefined {
    const text = this.pending + this.decoder.decode();
    return text.length === 0 ? undefined : this.output(text);
  }
}

function sanitizerTransform(codec: SupportedTextEncoding): Transform {
  const owner = new SanitizerStreamState(codec);
  return new Transform({
    transform(chunk, _encoding, callback) {
      try {
        const result = owner.receive(chunk);
        if (result === undefined) callback();
        else callback(null, result);
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      try {
        const result = owner.finish();
        if (result === undefined) callback();
        else callback(null, result);
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}

async function sampleFile(path: string): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const sample = Buffer.alloc(TEXT_DETECTION_SAMPLE_BYTES);
    const result = await handle.read(sample, 0, TEXT_DETECTION_SAMPLE_BYTES, 0);
    return sample.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

async function writeSanitizedFile(
  source: string,
  destination: string,
  info: TextFileEncodingInfo,
): Promise<void> {
  const input = createReadStream(source, { start: info.bomLength });
  const output = createWriteStream(destination);
  if (info.bomLength > 0) output.write(info.bomBytes);
  await pipeline(input, sanitizerTransform(info.encoding), output);
}

class DiagnosticCopy {
  private readonly skipped: LogArchiveSkippedFileEntry[] = [];

  private record(file: LogArchiveFileEntry, error: unknown): void {
    this.skipped.push({
      absolutePath: file.absolutePath,
      archivePath: file.archivePath,
      error: diagnosticError(error),
    });
  }

  public async execute(
    output: string,
    files: LogArchiveFileEntry[],
  ): Promise<LogArchiveSkippedFileEntry[]> {
    for (const file of files) {
      const destination = join(output, ...file.archivePath.split("/"));
      await mkdir(dirname(destination), { recursive: true });
      const metadata = await stat(file.absolutePath).catch((error: unknown) => {
        this.record(file, error);
        return null;
      });
      if (!metadata?.isFile()) continue;
      const readable = await access(file.absolutePath, constants.R_OK)
        .then(() => true)
        .catch((error: unknown) => {
          this.record(file, error);
          return false;
        });
      if (!readable) continue;
      try {
        const info = new EncodingEvidence(await sampleFile(file.absolutePath)).choose();
        if (info === null) {
          this.record(file, "unsupported binary diagnostic");
          continue;
        }
        await writeSanitizedFile(file.absolutePath, destination, info);
      } catch (error) {
        const current = await stat(file.absolutePath).catch(() => null);
        const stillReadable = current?.isFile()
          ? await access(file.absolutePath, constants.R_OK)
              .then(() => true)
              .catch(() => false)
          : false;
        // 保留轮转/权限竞态边界：源头已不可读才跳过；可读源的真正处理错误仍然失败。
        if (!stillReadable) this.record(file, error);
        else throw error;
      }
    }
    return this.skipped;
  }
}

async function writeArchiveDirectory(
  output: string,
  artifacts: LogArchiveArtifacts,
): Promise<void> {
  await mkdir(output, { recursive: true });
  const skipped = await new DiagnosticCopy().execute(output, artifacts.files);
  if (skipped.length > 0)
    logger.warn("[export-logs] 检测到不可读日志文件，已在导出时自动跳过", {
      skippedCount: skipped.length,
      skippedFiles: skipped.slice(0, 10),
    });
  await writeFile(join(output, "about.txt"), artifacts.aboutContent, "utf-8");
}

class StagedDiagnosticZip {
  public constructor(
    private readonly output: string,
    private readonly artifacts: LogArchiveArtifacts,
  ) {}

  public async execute(options: WriteLogArchiveZipOptions): Promise<void> {
    const root = options.stageRootDir ?? getDefaultExportLogStageDir();
    await mkdir(root, { recursive: true });
    const stage = await mkdtemp(join(root, "stage-"));
    try {
      await writeArchiveDirectory(stage, this.artifacts);
      const zip = new ZipFile();
      const selection = new ArchiveSelection();
      await selection.directory(stage, "", true);
      const files = orderFiles(selection.files);
      const output = createWriteStream(this.output);
      zip.once("error", (error) => {
        output.destroy(error instanceof Error ? error : new Error(String(error)));
      });
      for (const file of files) zip.addFile(file.absolutePath, file.archivePath);
      const completed = pipeline(zip.outputStream, output);
      zip.end();
      await completed;
    } finally {
      await rm(stage, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function writeArchiveZip(
  output: string,
  artifacts: LogArchiveArtifacts,
  options: WriteLogArchiveZipOptions = {},
): Promise<void> {
  await new StagedDiagnosticZip(output, artifacts).execute(options);
}

class DiagnosticExport {
  private readonly ports: Required<ExportLogsDependencies>;

  public constructor(dependencies: ExportLogsDependencies) {
    const now = dependencies.now ?? (() => new Date());
    const getKnorviaDataDir = dependencies.getKnorviaDataDir ?? dataRoot;
    const createLogArchiveArtifacts = dependencies.createLogArchiveArtifacts ?? buildLogArtifacts;
    const writeLogArchiveZip = dependencies.writeLogArchiveZip ?? writeArchiveZip;
    const writeLogArchiveDirectory = dependencies.writeLogArchiveDirectory ?? writeArchiveDirectory;
    const showItemInFolder =
      dependencies.showItemInFolder ??
      (async (path: string) => {
        const { shell } = await import("electron");
        shell.showItemInFolder(path);
      });
    const getExportLogStageDir = dependencies.getExportLogStageDir ?? getDefaultExportLogStageDir;
    const getExportLogDir = dependencies.getExportLogDir ?? getDefaultExportLogDir;
    this.ports = {
      now,
      getKnorviaDataDir,
      createLogArchiveArtifacts,
      writeLogArchiveZip,
      writeLogArchiveDirectory,
      showItemInFolder,
      getExportLogStageDir,
      getExportLogDir,
    };
  }

  public async execute(): Promise<{ success: boolean; path?: string; error?: string }> {
    const {
      now,
      getKnorviaDataDir,
      createLogArchiveArtifacts,
      writeLogArchiveZip,
      writeLogArchiveDirectory,
      showItemInFolder,
      getExportLogStageDir,
      getExportLogDir,
    } = this.ports;
    const source = getKnorviaDataDir();
    const name = `knorvia-logs-${localTimestamp(now())}`;
    const root = getExportLogDir();
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, `${name}-`));
    const zip = join(directory, `${name}.zip`);
    const fallback = join(directory, name);
    logger.info("[export-logs] 开始打包日志", { source, zipDest: zip, directoryDest: fallback });
    const artifacts = await createLogArchiveArtifacts(source, { now });
    try {
      await writeLogArchiveZip(zip, artifacts, { stageRootDir: getExportLogStageDir() });
      await showItemInFolder(zip);
      logger.info("[export-logs] 日志导出完成", { path: zip, format: "zip" });
      return { success: true, path: zip };
    } catch (error) {
      const zipFailure = diagnosticError(error);
      logger.warn("[export-logs] zip 导出失败，回退到目录导出", {
        error: zipFailure,
        zipPath: zip,
        fallbackPath: fallback,
      });
      await rm(zip, { force: true }).catch(() => {});
      try {
        await writeLogArchiveDirectory(fallback, artifacts);
      } catch (directoryError) {
        throw new Error(
          `zip 导出失败：${zipFailure}；目录导出失败：${diagnosticError(directoryError)}`,
        );
      }
      await showItemInFolder(fallback);
      logger.info("[export-logs] 日志导出完成", { path: fallback, format: "directory" });
      return { success: true, path: fallback };
    }
  }
}

export async function createFeedbackLogArchiveFromExportLogs(
  sourceDir: string,
  options: CreateFeedbackLogArchiveFromExportLogsOptions = {},
): Promise<{ path: string; size: number }> {
  return createFeedbackDiagnosticArchive({
    sources: [
      { directory: join(sourceDir, "logs"), archivePrefix: "logs" },
      { directory: cliLogsRoot(), archivePrefix: ".knorvia-studio/cli/log" },
      {
        directory: helperLogsRoot(),
        archivePrefix: ".knorvia-studio/computer-use/run",
        exitLogsOnly: true,
      },
    ],
    outputRootDir: options.outputRootDir ?? getDefaultFeedbackLogArchiveDir(),
    now: options.now,
    onProgress: options.onProgress,
  });
}

export async function writeSanitizedDiagnosticLogSnapshot(
  outputDir: string,
  options: { sourceDir?: string; now?: () => Date } = {},
): Promise<void> {
  const artifacts = await buildLogArtifacts(options.sourceDir ?? dataRoot(), { now: options.now });
  await writeArchiveDirectory(outputDir, artifacts);
}

export async function exportLogs(
  dependencies: ExportLogsDependencies = {},
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    return await new DiagnosticExport(dependencies).execute();
  } catch (error) {
    const message = diagnosticError(error);
    logger.error("[export-logs] 日志导出失败", { error: message });
    return { success: false, error: message };
  }
}
