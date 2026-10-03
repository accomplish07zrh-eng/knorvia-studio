import type { z } from 'zod';
export interface StartupDiskSummary { scopeId:string; observedAvailableDropPeakBytes:number|null; minAvailableBytes:number|null; quality:'complete'|'partial'|'unknown'; sampledAt:number|null; }
export interface DatabaseMigrationFacts { kind:'none'|'initialize'|'upgrade'; executedCount:number; committedCount:number; lastAppliedMigrationId?:string|null; }
export interface DatabaseStartupState { databasePhase?:'checking'|'waiting_for_lock'|'migrating'|'committing'|'maintaining'|'ready'; }
export type DatabaseStartupErrorCode = 'storage_full'|'permission_denied'|'io_error'|'out_of_memory'|'corrupt'|'open_failed'|'lock_timeout'|'checksum_mismatch'|'newer_database'|'backup_failed'|'sql_failed'|'startup_status_timeout'|'transport_closed'|'unsupported_runtime';
export declare const databaseStartupErrorCodeSchema:z.ZodType<DatabaseStartupErrorCode>;
export declare const databaseMigrationFactsSchema:z.ZodType<DatabaseMigrationFacts>;
export declare const databaseStartupErrorDetailsSchema:z.ZodObject<{sqliteCode:z.ZodOptional<z.ZodNumber>;systemCode:z.ZodOptional<z.ZodString>;migrationId:z.ZodOptional<z.ZodString>}>;
type StorageState = {databaseId:string; phase:'checking'|'waiting_for_lock'|'migrating'|'committing'|'maintaining'|'ready'|'failed';errorCode?:DatabaseStartupErrorCode;sqliteCode?:number;systemCode?:string;migrationId?:string;migration?:DatabaseMigrationFacts};
export declare const knorviaStoragePreparationFrameSchema:z.ZodType<{method:'startup/storagePath';params:{path:string}}|{method:'startup/storagePrepared';params:Record<string,never>}|{method:'startup/storageState';params:StorageState}>;
