export interface TokenUsageInfo {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
        read: number;
        write: number;
    };
}
