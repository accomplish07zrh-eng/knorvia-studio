export type KnorviaDataSizePartialReason = "file_limit" | "io_error" | "time_limit";
export type KnorviaDataSizeScanResult = {
    bytes: number;
    directoriesScanned: number;
    durationMs: number;
    filesScanned: number;
    scanErrorCount: number;
} & ({
    status: "complete";
    partialReason?: never;
} | {
    status: "partial";
    partialReason: KnorviaDataSizePartialReason;
});
export interface KnorviaDataSizeScanRequest {
    rootPath: string;
    maxDurationMs: number;
    maxFiles: number;
}
interface KnorviaDataSizeScanOptions extends KnorviaDataSizeScanRequest {
    signal?: AbortSignal;
    now?: () => number;
}
export declare function scanKnorviaDataDirectory(options: KnorviaDataSizeScanOptions): Promise<KnorviaDataSizeScanResult>;
export declare function isKnorviaDataSizeScanResult(value: unknown): value is KnorviaDataSizeScanResult;
export {};
