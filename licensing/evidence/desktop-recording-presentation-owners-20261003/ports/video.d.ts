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
export type BrowserWebmRecorderFactory = (input: BrowserWebmRecorderFactoryInput) => Promise<BrowserWebmRecorderSession>;
export function recordBrowserVideo(input: {
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
}): Promise<BrowserRecordingArtifact>;
