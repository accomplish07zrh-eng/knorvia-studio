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
export declare function backgroundTaskOutputMetadata(
  snapshot: object | undefined,
  launchOutput?: Record<string, unknown>,
): BackgroundTaskOutputMetadata;
export {};
