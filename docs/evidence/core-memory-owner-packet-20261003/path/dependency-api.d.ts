// Public dependencies stay opaque at original owners; not standalone compilation.
// Original type owner: apps/cli/packages/core/src/tool/path-policy.ts
interface ToolWorkspacePathOptions {
    inputPath: string;
    workingDirectory: string;
    workspaceRoot: string;
    operation: "read" | "write" | "execute";
}
export declare function resolveWorkspacePath(options: ToolWorkspacePathOptions): string;
