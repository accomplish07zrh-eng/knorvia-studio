// Bounded signatures from distinct original modules; opaque aliases remain original module types.
import type { TraceContext as ContractTraceContext, LogContext as ContractLogContext } from "../deps.js";
import type { ModelMessageContentBlock, ModelInputFormat, TraceContext, LogContext } from "../deps.js";
export type UnsupportedModelInputMediaKind = "image input" | "PDF input" | "video input";
export declare function isProviderVisibleModelInputMediaBlock(block: ModelMessageContentBlock): boolean;
export declare function isProviderVisiblePdfModelInputBlock(block: ModelMessageContentBlock): boolean;
export declare function isProviderVisibleVideoModelInputBlock(block: ModelMessageContentBlock): boolean;
export declare function getUnsupportedModelInputMediaKind(block: ModelMessageContentBlock, inputFormat: ModelInputFormat): UnsupportedModelInputMediaKind | undefined;
export declare function createUnsupportedModelInputMediaText(block: ModelMessageContentBlock, unsupportedKind: UnsupportedModelInputMediaKind): string;
export declare function traceContextToLogContext(context: ContractTraceContext): ContractLogContext;
export declare function officialCuaImageRefIndexesForUnavailableMedia(content: readonly ModelMessageContentBlock[], unavailableMediaIndexes: ReadonlySet<number>): Set<number>;
export declare function officialCuaRasterUnavailableBlock(): ModelMessageContentBlock;
