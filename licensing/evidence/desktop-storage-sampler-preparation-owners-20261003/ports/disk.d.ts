import type { StartupDiskSummary } from "@knorvia/shared";
type Probe = (path: string) => Promise<{
    scope: string;
    availableBytes: number;
}>;
export declare class StartupDiskSampler {
    constructor(options?: {
        probe?: Probe;
        onSample?: (summary: StartupDiskSummary[]) => void;
    });
    addPath(path: string): Promise<void>;
    sealBaseline(path: string): void;
    start(): void;
    sample(): Promise<void>;
    snapshot(): StartupDiskSummary[];
    stop(): void;
}
export {};
