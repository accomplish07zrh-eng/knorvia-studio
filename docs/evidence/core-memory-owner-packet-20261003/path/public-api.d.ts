export declare function resolveContainedMemoryFilePath(input: {
    filePath: string;
    rootDir: string;
    workingDirectory: string;
    workspaceRoot: string;
}): string | undefined;
export declare function resolveSafeMemoryFilePath(input: {
    filePath: string;
    rootDir: string;
    workingDirectory: string;
    workspaceRoot: string;
}): string | undefined;
export declare function memoryFileRelativePath(rootDir: string, filePath: string): string | undefined;
