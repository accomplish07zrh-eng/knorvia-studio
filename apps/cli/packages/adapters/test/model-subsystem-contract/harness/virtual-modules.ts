// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export function virtualModuleSource(specifier: string, seamSymbolKey: string): string | undefined {
  const prefix = `const s=globalThis[Symbol.for(${JSON.stringify(seamSymbolKey)})];if(!s)throw new Error("Missing owned seams");`;
  const runtime = `${prefix}const r=s.runtime;`;
  switch (specifier) {
    case "@knorvia/contracts":
      return `${runtime}
export const DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS=r.DEFAULT_MODEL_STREAM_IDLE_TIMEOUT_MS;
export const ModelApiActorKind=r.ModelApiActorKind;
export const ModelApiOperation=r.ModelApiOperation;
export const ModelErrorCode=r.ModelErrorCode;
export const ModelFailureExceptionKind=r.ModelFailureExceptionKind;
export const ModelFailureReason=r.ModelFailureReason;
export const ModelRequestSessionType=r.ModelRequestSessionType;
export const ModelRetryBudget=r.ModelRetryBudget;
export const ModelRetryReason=r.ModelRetryReason;
export const ModelTransportKind=r.ModelTransportKind;
export const getCurrentModelInvocationContext=r.getCurrentModelInvocationContext;
export const createTraceId=()=>s.crypto.randomUUID();
export class ModelProtocolError extends Error{
 constructor(code,message,context){
  super(message);
  this.name="ModelProtocolError";
  this.code=code;
  if(context!==undefined)this.context=context;
 }
}
function attachmentText(mediaType,name){
 return name!==undefined&&name!==""?"[Attached "+mediaType+": "+name+"]":"[Attached "+mediaType+"]";
}
export function modelMessageContentToText(content){
 if(typeof content==="string")return content;
 return content.map((block)=>{
  if(block.type==="text")return block.text;
  if(block.type==="reasoning")return "";
  if(block.type==="image"||block.type==="video"){
   return attachmentText(block.mediaType,block.source?.placeholder);
  }
  if(block.type==="file"){
   if(block.text!==undefined&&block.text!=="")return block.text;
   return attachmentText(block.mediaType,block.name??block.source?.placeholder);
  }
  return "[Resource: "+(block.title??block.name??block.uri)+"]";
 }).filter((text)=>text!=="").join("\\n\\n");
}
function isProviderVisiblePdfModelInputBlock(block){
 return block.type==="file"&&
  block.mediaType.trim().toLowerCase().split(";",1)[0]==="application/pdf"&&
  block.dataUrl!==undefined&&(block.text===undefined||block.text==="");
}
function isProviderVisibleVideoModelInputBlock(block){
 return (block.type==="video"||block.type==="file")&&
  block.mediaType.toLowerCase().startsWith("video/")&&block.dataUrl!==undefined;
}
export function getUnsupportedModelInputMediaKind(block,inputFormat){
 if(block?.type==="image"&&!inputFormat.supportsImage)return "image input";
 if(isProviderVisiblePdfModelInputBlock(block)&&!inputFormat.supportsPdf)return "PDF input";
 if(isProviderVisibleVideoModelInputBlock(block)&&!inputFormat.supportsVideo)return "video input";
 return undefined;
}
export function createUnsupportedModelInputMediaText(block,unsupportedKind){
 const projected=modelMessageContentToText([block])||"[Attached media]";
 return projected+"\\n[Media omitted from provider request because the selected model does not support "+unsupportedKind+".]";
}
export function resolveModelApiCallObservation(querySource,observation){
 const source=querySource?.trim();
 const defaults={
  main_turn:["agent_step","main"],
  subagent:["agent_step","subagent"],
  workflow_child:["agent_step","workflow_child"],
  compact:["context_compaction","system"],
  session_title:["session_title_generation","system"],
  goal_summary_title:["goal_title_generation","system"],
  target_completion_verification:["goal_completion_verification","system"],
  git_commit_message:["workspace_git_commit_message","system"],
  web_search_tool:["web_search","tool"],
  web_fetch_processing:["web_fetch_processing","tool"],
  read_session_context:["read_session_context_extract","tool"],
  project_memory_extract:["project_memory_extract","system"]
 }[source]??["tool_internal_model_call","system"];
 const logicalCallId=observation?.logicalCallId?.trim()||s.crypto.randomUUID();
 return {
  ...observation,
  operation:observation?.operation??defaults[0],
  actorKind:observation?.actorKind??defaults[1],
  logicalCallId
 };
}`;
    case "@knorvia/model-option-map":
      return `${runtime}export const compileModelOptionMaps=r.compileModelOptionMaps;`;
    case "@knorvia/cua/frame-contract":
      return `${runtime}export const containsOfficialCuaImageRefCredentialText=r.containsOfficialCuaImageRefCredentialText;`;
    case "@knorvia/shared":
      return `${runtime}
export const KNORVIA_RUNTIME_ENV_KEY="KNORVIA_RUNTIME_ENV";
export const BUILTIN_MODEL_PROVIDER_IDS={
 zaiIndividualCodingPlan:"account:zai-individual-coding-plan",
 zaiTeamCodingPlan:"account:zai-team-coding-plan",
 zaiStartPlan:"account:zai-start-plan",
 bigmodelIndividualCodingPlan:"account:bigmodel-individual-coding-plan",
 bigmodelTeamCodingPlan:"account:bigmodel-team-coding-plan",
 bigmodelStartPlan:"account:bigmodel-start-plan"
};
export const normalizeKnorviaRuntimeEnv=r.normalizeKnorviaRuntimeEnv;
export const withOpenRouterAttributionHeaders=r.withOpenRouterAttributionHeaders;`;
    case "@knorvia/shared/node":
      return `${runtime}export const resolveKnorviaDataRoot=r.resolveKnorviaDataRoot;`;
    case "@knorvia/provider":
      return "export {};";
    case "ai":
      return `${runtime}
export const APICallError=r.APICallError;
export const Output=r.Output;
export const RetryError=r.RetryError;
export const generateText=r.generateText;
export const jsonSchema=r.jsonSchema;
export const streamText=r.streamText;
export const tool=r.tool;`;
    case "@ai-sdk/anthropic":
      return `${runtime}export const anthropic=r.anthropic;export const createAnthropic=r.createAnthropic;`;
    case "@ai-sdk/openai":
      return `${runtime}export const createOpenAI=r.createOpenAI;`;
    case "@ai-sdk/openai-compatible":
      return `${runtime}export const createOpenAICompatible=r.createOpenAICompatible;`;
    case "node:crypto":
    case "crypto":
      return `${prefix}
export const getRandomValues=s.crypto.getRandomValues;
export const randomUUID=s.crypto.randomUUID;
export const webcrypto=s.crypto;
export default s.crypto;`;
    case "node:fs/promises":
    case "fs/promises":
      return fsPromisesModule(prefix);
    case "node:fs":
    case "fs":
      return fsModule(prefix);
    case "node:os":
    case "os":
      return `${prefix}
export const homedir=s.os.homedir;
export const platform=s.os.platform;
export const tmpdir=s.os.tmpdir;
export default s.os;`;
    case "node:process":
    case "process":
      return `${prefix}
export const cwd=s.process.cwd;
export const env=s.process.env;
export const platform=s.process.platform;
export const versions=s.process.versions;
export default s.process;`;
    case "node:timers":
    case "timers":
      return timerModule(prefix);
    case "node:timers/promises":
    case "timers/promises":
      return `${prefix}export const setTimeout=s.clock.delay.bind(s.clock);`;
    case "retained:proxy-fetch":
      return `${runtime}export const createNetworkProxyFetch=r.createNetworkProxyFetch;`;
    case "retained:device-mid":
      return `${runtime}export const ensureCliDeviceMid=r.ensureCliDeviceMid;`;
    default:
      return undefined;
  }
}

function fsPromisesModule(prefix: string): string {
  return `${prefix}
export const access=s.fs.access.bind(s.fs);
export const appendFile=s.fs.appendFile.bind(s.fs);
export const mkdir=s.fs.mkdir.bind(s.fs);
export const readFile=s.fs.readFile.bind(s.fs);
export const readdir=s.fs.readdir.bind(s.fs);
export const rename=s.fs.rename.bind(s.fs);
export const rm=s.fs.rm.bind(s.fs);
export const stat=s.fs.stat.bind(s.fs);
export const unlink=s.fs.unlink.bind(s.fs);
export const writeFile=s.fs.writeFile.bind(s.fs);
export default {access,appendFile,mkdir,readFile,readdir,rename,rm,stat,unlink,writeFile};`;
}

function fsModule(prefix: string): string {
  return `${prefix}
const p={
 access:s.fs.access.bind(s.fs),appendFile:s.fs.appendFile.bind(s.fs),mkdir:s.fs.mkdir.bind(s.fs),
 readFile:s.fs.readFile.bind(s.fs),readdir:s.fs.readdir.bind(s.fs),rename:s.fs.rename.bind(s.fs),
 rm:s.fs.rm.bind(s.fs),stat:s.fs.stat.bind(s.fs),unlink:s.fs.unlink.bind(s.fs),writeFile:s.fs.writeFile.bind(s.fs)
};
export const appendFileSync=s.fs.appendFileSync.bind(s.fs);
export const existsSync=s.fs.existsSync.bind(s.fs);
export const mkdirSync=s.fs.mkdirSync.bind(s.fs);
export const readdirSync=s.fs.readdirSync.bind(s.fs);
export const rmSync=s.fs.rmSync.bind(s.fs);
export const statSync=s.fs.statSync.bind(s.fs);
export const writeFileSync=s.fs.writeFileSync.bind(s.fs);
export const promises=p;
export default {appendFileSync,existsSync,mkdirSync,promises:p,readdirSync,rmSync,statSync,writeFileSync};`;
}

function timerModule(prefix: string): string {
  return `${prefix}
export const clearInterval=s.clock.clearInterval.bind(s.clock);
export const clearTimeout=s.clock.clearTimeout.bind(s.clock);
export const setInterval=s.clock.setInterval.bind(s.clock);
export const setTimeout=s.clock.setTimeout.bind(s.clock);`;
}
