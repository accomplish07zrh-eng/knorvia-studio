import { type DatabaseMigrationFacts, type DatabaseStartupState } from "@knorvia/shared";
type Phase = NonNullable<DatabaseStartupState["databasePhase"]>;
export declare function prepareHostStorage(path: string, report: (phase: Phase, migration?: DatabaseMigrationFacts) => void, signal: AbortSignal): Promise<void>;
export declare function prepareSessionStorage(options: {
    cwd: string;
    env?: Record<string, string>;
    signal: AbortSignal;
    report: (phase: Phase, details?: {
        databaseId: string;
        migration?: DatabaseMigrationFacts;
    }) => void;
    preparedPaths?: Set<string>;
    observePath: (path: string) => Promise<void>;
}): Promise<void>;
export {};
