// Raw isolated TS9007 inference retained; both error functions return original CoreError factory result.
export declare function createTurnFailureError(error:unknown,abortSignal:AbortSignal|undefined,fallbackMessage:string):ReturnType<typeof import("../deps.js").createCoreError>;
export declare function createTurnCancelledError(error:unknown):ReturnType<typeof import("../deps.js").createCoreError>;
// Inherited TS9011 defaultmessage=code emits optionalstring; annotate source message:string=code, no public behavior change.
