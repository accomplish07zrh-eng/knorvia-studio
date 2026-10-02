// Authoritative platform types; no dependency implementation supplied.
export type FileSystemPromises = Pick<typeof import("node:fs/promises"), "lstat" | "opendir">;
export type FileSystemSync = Pick<typeof import("node:fs"), "realpathSync" | "statSync">;
export type AsyncRealpath = typeof import("node:fs/promises").realpath;
export type PathOperations = Pick<typeof import("node:path"), "join" | "isAbsolute">;
export type WorkerConstructor = typeof import("node:worker_threads").Worker;
export type WorkerParentPort = typeof import("node:worker_threads").parentPort;
export type WorkerData = typeof import("node:worker_threads").workerData;
export type WorkerMainThreadFlag = typeof import("node:worker_threads").isMainThread;
// Shared dependency API, retained in its owner:
export declare const LOCAL_MEDIA_PREVIEW_SCHEME = "knorvia-media";
export declare function buildLocalMediaPreviewUrl(path: string): string;
// Standard globals: AbortSignal, DOMException, URL, Date.now, Map and WeakSet.
// Worker constructor receives URL('./dataSizeWorker.js', import.meta.url), {workerData: request}.
