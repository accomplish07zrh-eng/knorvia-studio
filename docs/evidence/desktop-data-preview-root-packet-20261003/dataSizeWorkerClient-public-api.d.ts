import { type KnorviaDataSizeScanRequest, type KnorviaDataSizeScanResult } from "./dataSizeScanner.js";
export declare function scanKnorviaDataDirectoryInWorker(request: KnorviaDataSizeScanRequest, signal: AbortSignal): Promise<KnorviaDataSizeScanResult>;
