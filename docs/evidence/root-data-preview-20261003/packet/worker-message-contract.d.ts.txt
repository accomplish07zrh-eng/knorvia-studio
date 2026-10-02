import type { KnorviaDataSizeScanRequest, KnorviaDataSizeScanResult } from "./dataSizeScanner-public-api";
// Contract description, not a new exported implementation type.
export type WorkerInputContract = KnorviaDataSizeScanRequest;
export type WorkerOutputContract = {ok: true; result: KnorviaDataSizeScanResult} | {ok: false; error: string};
// Tiny retained worker entry has no public exports. It uses isMainThread/parentPort/workerData,
// delegates scanning to dataSizeScanner and posts the result/error envelope above.
// Error message fallback: "unknown worker error". No host signal or callback is transferred.
