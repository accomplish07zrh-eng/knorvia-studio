export declare const MAX_PLUGIN_REFERENCES_PER_TURN = 8;
export declare function isValidPluginStableId(candidate: string): boolean;
export interface ExtractPluginReferencesResult {
    references: string[];
    truncatedCount: number;
    invalidCount: number;
}
export declare function extractPluginReferences(input: string): ExtractPluginReferencesResult;
