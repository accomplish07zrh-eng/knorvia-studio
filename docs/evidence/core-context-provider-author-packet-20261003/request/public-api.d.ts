import type { ContextSection, ResolvedUserInstructions } from "../types.js";
export declare function buildRequestUserContextSection(input: {
    userInstructions?: ResolvedUserInstructions;
    memoryIndexContent?: string;
    memoryRoot?: string;
}): ContextSection | null;
