// SPDX-License-Identifier: Apache-2.0
// 后台任务输出的元数据投影：从快照、结果子对象与启动输出里挑出文件路径、字节数与尾部文本。
//
// 取值顺序固定为「快照 → 结果子对象 → 启动输出」，只认类型正确的值（字符串/数字），
// null 与错误类型都按「没有」处理。全部字段可选：拿不到就不写进返回对象。

type UnknownSource = object | undefined;
type TextValue = string;
type CountValue = number;

interface BackgroundTaskOutputMetadata {
  readonly childSessionId?: TextValue;
  readonly outputBytes?: CountValue;
  readonly outputFile?: TextValue;
  readonly outputTail?: TextValue;
  readonly outputTruncated?: boolean;
  readonly stderrBytes?: CountValue;
  readonly stderrFile?: TextValue;
  readonly stderrTail?: TextValue;
  readonly stdoutBytes?: CountValue;
  readonly stdoutFile?: TextValue;
  readonly stdoutTail?: TextValue;
}

type OutputMetadata = BackgroundTaskOutputMetadata;

function readField(source: UnknownSource, key: string): unknown {
  if (source === undefined || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

function readRecord(source: UnknownSource, key: string): UnknownSource {
  const value = readField(source, key);
  if (value === null || typeof value !== "object") return undefined;
  return value;
}

function readText(source: UnknownSource, key: string): TextValue | undefined {
  const value = readField(source, key);
  return typeof value === "string" ? value : undefined;
}

function readCount(source: UnknownSource, key: string): CountValue | undefined {
  const value = readField(source, key);
  return typeof value === "number" ? value : undefined;
}

// 依次尝试候选来源，返回第一个真正给出的文本。
function firstText(...candidates: (TextValue | undefined)[]): TextValue | undefined {
  for (const candidate of candidates) {
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

// 两个字节数都为「没有」时不产出合计，避免把未知写成 0。
function totalCount(left: CountValue | undefined, right: CountValue | undefined) {
  if (left === undefined && right === undefined) return undefined;
  return (left ?? 0) + (right ?? 0);
}

// 结果子对象缺失时「是否截断」也是未知；否则只要任一流标记了截断就算截断。
function truncationOf(result: UnknownSource, ...streams: UnknownSource[]): boolean | undefined {
  if (result === undefined) return undefined;
  return streams.some(
    (stream) =>
      readField(stream, "truncated") === true || readField(stream, "artifactTruncated") === true,
  );
}

export function backgroundTaskOutputMetadata(
  snapshot: UnknownSource,
  launchOutput?: Record<string, unknown>,
): OutputMetadata {
  const result = readRecord(snapshot, "result");
  const stdout = readRecord(result, "stdout");
  const stderr = readRecord(result, "stderr");
  const output = readRecord(snapshot, "output");

  const stdoutFile = firstText(
    readText(snapshot, "stdoutPersistedOutputPath"),
    readText(stdout, "artifactPath"),
    readText(launchOutput, "stdoutPersistedOutputPath"),
  );
  const stderrFile = firstText(
    readText(snapshot, "stderrPersistedOutputPath"),
    readText(stderr, "artifactPath"),
    readText(launchOutput, "stderrPersistedOutputPath"),
  );
  const outputFile = firstText(
    readText(snapshot, "outputPath"),
    readText(snapshot, "outputFile"),
    readText(snapshot, "persistedOutputPath"),
    readText(snapshot, "rawOutputPath"),
    readText(launchOutput, "persistedOutputPath"),
    readText(launchOutput, "rawOutputPath"),
    readText(launchOutput, "outputFile"),
    stdoutFile,
    stderrFile,
  );

  const stdoutBytes = firstTextCount(
    readCount(stdout, "bytes"),
    readCount(snapshot, "stdoutBytes"),
  );
  const stderrBytes = firstTextCount(
    readCount(stderr, "bytes"),
    readCount(snapshot, "stderrBytes"),
  );
  const stdoutTail = readText(stdout, "text") || readText(snapshot, "stdoutTail");
  const stderrTail = readText(stderr, "text") || readText(snapshot, "stderrTail");
  const outputTail = firstText(stdoutTail, stderrTail, readText(output, "response"));

  const metadata = {} as Record<string, unknown>;
  metadata.childSessionId = firstText(
    readText(snapshot, "childSessionId"),
    readText(launchOutput, "childSessionId"),
  );
  metadata.outputBytes = totalCount(stdoutBytes, stderrBytes);
  metadata.outputFile = outputFile;
  metadata.outputTail = outputTail;
  metadata.outputTruncated = truncationOf(result, stdout, stderr);
  metadata.stderrBytes = stderrBytes;
  metadata.stderrFile = stderrFile;
  metadata.stderrTail = stderrTail;
  metadata.stdoutBytes = stdoutBytes;
  metadata.stdoutFile = stdoutFile;
  metadata.stdoutTail = stdoutTail;
  return metadata as OutputMetadata;
}

function firstTextCount(
  left: CountValue | undefined,
  right: CountValue | undefined,
): CountValue | undefined {
  return left !== undefined ? left : right;
}
