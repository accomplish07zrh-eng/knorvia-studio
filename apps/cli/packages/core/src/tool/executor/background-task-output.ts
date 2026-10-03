interface BackgroundTaskOutputMetadata {
  childSessionId?: string;
  outputBytes?: number;
  outputFile?: string;
  outputTail?: string;
  outputTruncated?: boolean;
  stderrBytes?: number;
  stderrFile?: string;
  stderrTail?: string;
  stdoutBytes?: number;
  stdoutFile?: string;
  stdoutTail?: string;
}

function field(source: object | undefined, key: string): unknown {
  if (!source || !(key in source)) return undefined;
  return (source as Record<string, unknown>)[key];
}

function recordField(source: object | undefined, key: string): object | undefined {
  const value = field(source, key);
  return value !== null && typeof value === "object" ? value : undefined;
}

function stringField(source: object | undefined, key: string): string | undefined {
  const value = field(source, key);
  return typeof value === "string" ? value : undefined;
}

function numberField(source: object | undefined, key: string): number | undefined {
  const value = field(source, key);
  return typeof value === "number" ? value : undefined;
}

export function backgroundTaskOutputMetadata(
  snapshot: object | undefined,
  launchOutput?: Record<string, unknown>,
): BackgroundTaskOutputMetadata {
  const result = recordField(snapshot, "result");
  const childSessionId =
    stringField(snapshot, "childSessionId") ?? stringField(launchOutput, "childSessionId");
  const stdout = recordField(result, "stdout");
  const stderr = recordField(result, "stderr");

  const stdoutFile =
    stringField(snapshot, "stdoutPersistedOutputPath") ??
    stringField(stdout, "artifactPath") ??
    stringField(launchOutput, "stdoutPersistedOutputPath");
  const stderrFile =
    stringField(snapshot, "stderrPersistedOutputPath") ??
    stringField(stderr, "artifactPath") ??
    stringField(launchOutput, "stderrPersistedOutputPath");
  const outputFile =
    stringField(snapshot, "outputPath") ??
    stringField(snapshot, "outputFile") ??
    stringField(snapshot, "persistedOutputPath") ??
    stringField(snapshot, "rawOutputPath") ??
    stringField(launchOutput, "persistedOutputPath") ??
    stringField(launchOutput, "rawOutputPath") ??
    stringField(launchOutput, "outputFile") ??
    stdoutFile ??
    stderrFile;

  const stdoutBytes = numberField(stdout, "bytes") ?? numberField(snapshot, "stdoutBytes");
  const stderrBytes = numberField(stderr, "bytes") ?? numberField(snapshot, "stderrBytes");
  const stdoutTail = stringField(stdout, "text") || stringField(snapshot, "stdoutTail");
  const stderrTail = stringField(stderr, "text") || stringField(snapshot, "stderrTail");

  const output = recordField(snapshot, "output");
  const workflowResponse = stringField(output, "response");
  const outputBytes =
    stdoutBytes === undefined && stderrBytes === undefined
      ? undefined
      : (stdoutBytes ?? 0) + (stderrBytes ?? 0);
  const outputTruncated =
    result === undefined
      ? undefined
      : field(stdout, "truncated") === true ||
        field(stderr, "truncated") === true ||
        field(stdout, "artifactTruncated") === true ||
        field(stderr, "artifactTruncated") === true;

  return {
    childSessionId,
    outputBytes,
    outputFile,
    outputTail: stdoutTail ?? stderrTail ?? workflowResponse,
    outputTruncated,
    stderrBytes,
    stderrFile,
    stderrTail,
    stdoutBytes,
    stdoutFile,
    stdoutTail,
  };
}
