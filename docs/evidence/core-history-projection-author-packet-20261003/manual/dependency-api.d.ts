// Existing package @knorvia/contracts runtime/public surfaces:
import type { ModelMessageContent, ModelMessageContentBlock } from '@knorvia/contracts';
export declare function modelMessageContentToText(content: ModelMessageContent): string;
export declare function modelMessageContentBlockToText(block: ModelMessageContentBlock): string;
// Existing @knorvia/shared runtime constant, value3, import actual symbol:
export declare const ESTIMATED_TOKEN_CHAR_DIVISOR = 3;
// Existing ./rounds.js collaborator:
export declare function groupByAssistantStartedRounds<T>(items: readonly T[], roleOf: (item: T) => string | undefined, assistantIdOf?: (item: T) => string | undefined): T[][];
// CompactTrigger.Manual is the existing runtime descriptor member, not a new literal/type.
