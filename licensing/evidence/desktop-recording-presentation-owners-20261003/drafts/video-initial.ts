import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserRecordingArtifact, BrowserViewportSize } from "@knorvia/shared";

export interface BrowserWebmRecorderFactoryInput {
  outputPath: string;
  targetFrame: unknown;
  viewport: BrowserViewportSize;
  fps: number;
  signal: AbortSignal;
}

export interface BrowserWebmRecorderSession {
  stop(): Promise<void>;
  cancel(): Promise<void>;
}

export type BrowserWebmRecorderFactory = (
  input: BrowserWebmRecorderFactoryInput,
) => Promise<BrowserWebmRecorderSession>;

export async function recordBrowserVideo(input: {
  targetFrame: unknown;
  tempRoot: string;
  recordingId: string;
  viewport: BrowserViewportSize;
  fps: number;
  signal: AbortSignal;
  executeScenario(): Promise<void>;
  onPhase?(phase: "capturing" | "finalizing"): void;
  onCaptureComplete?(): void;
  createRecorder: BrowserWebmRecorderFactory;
  now?: () => number;
}): Promise<BrowserRecordingArtifact> {
  const outputPath = join(input.tempRoot, `${input.recordingId}.webm`);
  const now = input.now ?? Date.now;
  let session: BrowserWebmRecorderSession | undefined;
  let completed = false;

  const checkAbort = () => {
    if (input.signal.aborted) {
      throw new DOMException("Browser recording cancelled", "AbortError");
    }
  };

  try {
    checkAbort();
    session = await input.createRecorder({
      outputPath,
      targetFrame: input.targetFrame,
      viewport: input.viewport,
      fps: input.fps,
      signal: input.signal,
    });
    checkAbort();
    const startedAt = now();
    input.onPhase?.("capturing");
    await input.executeScenario();
    checkAbort();
    const durationMs = Math.max(0, Math.round(now() - startedAt));
    input.onCaptureComplete?.();
    input.onPhase?.("finalizing");
    await session.stop();
    checkAbort();

    const artifactStat = await stat(outputPath);
    if (!artifactStat.isFile() || artifactStat.size === 0) {
      throw new Error("Browser recording produced an empty WebM artifact");
    }

    completed = true;
    return {
      path: outputPath,
      mimeType: "video/webm",
      width: input.viewport.width,
      height: input.viewport.height,
      fps: input.fps,
      durationMs,
      frameCount: Math.max(1, Math.round((durationMs / 1000) * input.fps)),
    };
  } finally {
    if (!completed) {
      await session?.cancel().catch(() => undefined);
      await rm(outputPath, { force: true }).catch(() => undefined);
    }
  }
}
