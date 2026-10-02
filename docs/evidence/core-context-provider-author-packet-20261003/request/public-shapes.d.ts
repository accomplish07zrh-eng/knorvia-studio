// Existing @knorvia/contracts public instruction types, re-exported by ../types.js.
export type UserInstructionSourceScope = "user" | "workspace";
export interface ResolvedUserInstructionSource { scope:UserInstructionSourceScope;filePath:string;fileName:string;content:string;bytesRead:number;sizeBytes:number;truncated:boolean; }
export interface ResolvedUserInstructions { filePath:string;fileName:string;content:string;bytesRead:number;sizeBytes:number;truncated:boolean;sources?:ResolvedUserInstructionSource[]; }
// ContextSection: name:string;source:existing ContextSource union;
// injectionTarget:"system"|"meta_user";cacheHint:"stable"|"dynamic";
// chars:number;tokens:number;content:string;preview:string. Import actual types.
