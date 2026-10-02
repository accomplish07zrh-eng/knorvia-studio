// Existing ../deps.js public runtime/type surfaces (import actual types):
import type { LogContext, ModelMessageContentBlock, TraceContext } from '@knorvia/contracts';
export declare function traceContextToLogContext(context: TraceContext): LogContext;
export interface Logger {
 debug(message:string,context?:LogContext):void;
 info(message:string,context?:LogContext):void;
 warn(message:string,context?:LogContext):void;
 error(message:string,error?:Error,context?:LogContext):void;
 child(context:LogContext):Logger;
}
// LogContext: [key:string]:unknown with optional trace/session/turn/span/parentSpan,
// toolCallId/event/module/durationMs/status. Spread actual collaborator result.
// Existing ./official-cua-media.js public collaborators; never inline/reimplement:
export declare function officialCuaImageRefIndexesForUnavailableMedia(content: readonly ModelMessageContentBlock[], unavailableMediaIndexes: ReadonlySet<number>): Set<number>;
export declare function officialCuaRasterUnavailableBlock(): ModelMessageContentBlock;
