import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StudioKernelTurn } from "../src/studio-runtime/kernelTypes.js";
import type { ExternalKernel } from "../src/studio-runtime/domain/kernelPolicy.js";
import { runKernelProtocol } from "../src/studio-runtime/adapters/kernels/kernelRun.js";
import {
  codexArgs,
  codexMessage,
  startCodex,
} from "../src/studio-runtime/adapters/kernels/codexProtocol.js";
import {
  claudeArgs,
  claudeMessage,
  startClaude,
} from "../src/studio-runtime/adapters/kernels/claudeProtocol.js";
import {
  grokArgs,
  grokMessage,
  startGrok,
} from "../src/studio-runtime/adapters/kernels/grokProtocol.js";

const fixture = String.raw`
const fs=require('node:fs'), readline=require('node:readline');
const args=process.argv.slice(2), scenario=JSON.parse(fs.readFileSync('scenario.json','utf8'));
const kind=args.includes('app-server')?'codex':args.includes('agent')?'grok':'claude';
fs.appendFileSync('argv.jsonl',JSON.stringify(args)+'\n');
const send=(m)=>process.stdout.write(JSON.stringify(m)+'\n');
const reply=(id,result)=>send(kind==='claude'?{type:'control_response',response:{subtype:'success',request_id:id,response:result}}:{id,result});
let model=args.includes('--model')?args[args.indexOf('--model')+1]:'grok-4.7';
const grokModels=[{modelId:'grok-4.7',name:'Grok 4.7',_meta:{supportsReasoningEffort:true,reasoningEffort:'low',reasoningEfforts:[{id:'economy',value:'low',label:'Low',default:false},{id:'high',value:'high',label:'High',default:true}]}},{modelId:'grok-no-thought',name:'No thought',_meta:{supportsReasoningEffort:false}}];
grokModels.push({...grokModels[0],modelId:'grok-expensive',name:'Expensive'});
const claudeModels=[{value:'default',resolvedModel:'claude-opus-test',displayName:'Default',supportsEffort:true,supportedEffortLevels:['low','high']},{value:'sonnet',resolvedModel:'claude-sonnet-test',displayName:'Sonnet',supportsEffort:true,supportedEffortLevels:['low','high']},{value:'haiku',resolvedModel:'claude-haiku-test',displayName:'Haiku'}];
const codexModels=[{id:'catalog-id',model:'gpt-5.6-luna',displayName:'Luna',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'}],isDefault:true},{model:'internal-only',displayName:'Internal',hidden:true,supportedReasoningEfforts:[{reasoningEffort:'max'}]}];
const config=(effort)=>[{id:'model',name:'Model',type:'select',currentValue:scenario.reroute?'unexpected-expensive':model,options:grokModels.map(m=>({value:m.modelId,name:m.name}))},{id:'reasoning_effort',name:'Reasoning Effort',category:'thought_level',type:'select',currentValue:scenario.ignoreEffort?'high':effort,options:[{value:'economy',name:'Low'}]}];
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line); fs.appendFileSync('wire.jsonl',JSON.stringify(m)+'\n');
 const method=m.request?.subtype||m.method, id=m.request_id||m.id;
 if(method==='initialize') {
  if(scenario.hang) return;
  return reply(id,kind==='claude'?{models:scenario.empty?[]:claudeModels}:kind==='grok'?{protocolVersion:1,agentCapabilities:{loadSession:true},authMethods:[],_meta:{modelState:{currentModelId:'grok-4.7',availableModels:scenario.empty?[]:grokModels}}}:{});
 }
 if(method==='initialized') return;
 if(method==='config/read') return reply(id,{config:scenario.actualDefault?{model:'gpt-5.6-terra',model_reasoning_effort:'ultra',unrelated_secret:'must-not-leave-process'}:{}});
 if(method==='model/list') return reply(id,scenario.empty?{data:[],nextCursor:null}:m.params.cursor?{data:[{model:'gpt-5.6-terra',displayName:'Terra',supportedReasoningEfforts:[{reasoningEffort:'ultra'}]}],nextCursor:scenario.repeatCursor?'page2':null}:{data:codexModels,nextCursor:'page2'});
 if(method==='thread/start'||method==='thread/resume') return reply(id,{thread:{id:'native-session'},model:m.params.model||'gpt-5.6-luna'});
 if(method==='thread/read') return reply(id,{thread:{id:'native-session',cwd:process.cwd(),status:{type:'idle'}}});
 if(method==='thread/compact/start') {
  reply(id,{});
  send({method:'turn/started',params:{threadId:'native-session',turn:{id:'compact-turn'}}});
  return send({method:'turn/completed',params:{threadId:'native-session',turn:{id:'compact-turn',status:'completed'}}});
 }
 if(method==='turn/start') {
  reply(id,{turn:{id:'native-turn'}});
  send({method:'item/agentMessage/delta',params:{threadId:'native-session',itemId:'answer',delta:'fixture reply'}});
  return send({method:'turn/completed',params:{threadId:'native-session',turn:{id:'native-turn',status:'completed'}}});
 }
 if(method==='session/new'||method==='session/load') {
  reply(id,{sessionId:'native-session',models:{currentModelId:model},configOptions:config('high')});
  if(scenario.nativeCommands) send({method:'session/update',params:{sessionId:'native-session',update:{sessionUpdate:'available_commands_update',availableCommands:scenario.nativeCommands}}});
  return;
 }
 if(method==='session/set_model') {model=m.params.modelId;return reply(id,{});}
 if(method==='session/set_config_option') {
  if(m.params.configId!=='reasoning_effort'||!['economy','high'].includes(m.params.value)) return send({id,error:{code:-32602,message:'unsupported effort selector'}});
  return reply(id,{configOptions:config(m.params.value)});
 }
 if(method==='session/prompt') {
  send({method:'session/update',params:{sessionId:'native-session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'fixture reply'}}}});
  return reply(id,{stopReason:'end_turn'});
 }
 if(['set_model','apply_flag_settings'].includes(method)) return reply(id,{});
 if(m.type==='user') {
  const session=args.find(a=>a.startsWith('--resume='))?.slice(9)||args.find(a=>a.startsWith('--session-id='))?.slice(13);
  return send({type:'result',session_id:session,subtype:'success',is_error:false,result:'fixture reply'});
 }
 if(id) send({id,error:{code:-32601,message:'Unexpected method '+method}});
});
`;
export const kernels: ExternalKernel[] = ["codex", "claude-code", "grok-build"];
const selections = {
  codex: { model: "gpt-5.6-luna", reasoningEffort: "low" },
  "claude-code": { model: "sonnet", reasoningEffort: "low" },
  "grok-build": { model: "grok-4.7", reasoningEffort: "economy" },
};
export async function setup(scenario: Record<string, unknown> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-model-options-"));
  const path = join(directory, "fixture.cjs");
  await writeFile(path, fixture);
  await writeFile(join(directory, "scenario.json"), JSON.stringify(scenario));
  const executable = { command: process.execPath, args: [path], path };
  const readLines = async (name: string) => {
    try {
      return (await readFile(join(directory, name), "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  };
  const turn = (
    kernel: ExternalKernel,
    override: Partial<StudioKernelTurn> = {},
  ): StudioKernelTurn => ({
    runId: "run",
    turnId: "turn",
    conversationId: "conversation",
    kernel,
    workspacePath: directory,
    permission: "ask",
    text: "fixture task",
    ...selections[kernel],
    ...override,
  });
  const run = (kernel: ExternalKernel, override: Partial<StudioKernelTurn> = {}) => {
    const input = turn(kernel, override);
    return runKernelProtocol({
      kernel,
      turn: input,
      executable: async () => executable,
      signal: new AbortController().signal,
      sink: {
        async emit() {},
        async ask() {
          throw new Error("Unexpected interaction");
        },
      },
      mode: kernel === "codex" ? "codex" : kernel === "claude-code" ? "claude" : "acp",
      args:
        kernel === "codex"
          ? codexArgs()
          : kernel === "claude-code"
            ? claudeArgs(input)
            : grokArgs(input),
      message:
        kernel === "codex" ? codexMessage : kernel === "claude-code" ? claudeMessage : grokMessage,
      start: kernel === "codex" ? startCodex : kernel === "claude-code" ? startClaude : startGrok,
    });
  };
  return {
    directory,
    executable,
    readLines,
    run,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
export function inferenceMessages(messages: Array<Record<string, unknown>>) {
  return messages.filter(
    (message) =>
      message.type === "user" || ["turn/start", "session/prompt"].includes(String(message.method)),
  );
}
