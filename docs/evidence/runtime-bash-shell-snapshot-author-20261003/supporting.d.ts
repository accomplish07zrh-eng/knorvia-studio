// Body-free supporting port/type facts; actual existing imports remain authoritative.
export type ExecutionShellDialect = "cmd" | "posix" | "git-bash";
export type ExecutionShellSource = "auto-detected" | "user-config" | "legacy-fallback";
export interface ExecutionShellDisplay {
    name: string;
}
export interface ExecutionShellSelection {
    id?: string;
    label?: string;
    path?: string;
    dialect: ExecutionShellDialect | "legacy-shell";
    source: ExecutionShellSource;
    display: ExecutionShellDisplay;
}
