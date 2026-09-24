import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  StudioKernelEvent,
  StudioKernelId,
  StudioKernelInteraction,
  StudioKernelTurn,
} from "../src/studio-runtime/kernelTypes.js";
import { createStudioKernelRegistry } from "../src/studio-runtime/adapters/kernels/kernelRegistry.js";

const fixture = String.raw`
const fs = require('node:fs');
const readline = require('node:readline');
const crypto = require('node:crypto');
if (process.argv.includes('--version')) { console.log('fixture 1.2.3'); process.exit(0); }
const args = process.argv.slice(2);
const kind = args.includes('app-server') ? 'codex' : args.includes('agent') ? 'grok' : 'claude';
const saved = 'session-' + kind + '.json';
let session = '', request = null, input = '', waiting = null, count = 0;
function send(value) { process.stdout.write(JSON.stringify(value) + '\n'); }
function notice(method, params) { send({method, params}); }
function respond(id, value) {
 if (kind === 'claude') send({type:'control_response',response:{subtype:'success',request_id:id,response:value}});
 else send({id,result:value});
}
function fail(message) { console.error(message); process.exit(2); }
function emitText(value) {
 if (kind === 'codex') notice('item/agentMessage/delta',{threadId:session,itemId:'a',delta:value});
 if (kind === 'grok') notice('session/update',{sessionId:session,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:value}}});
 if (kind === 'claude') send({type:'stream_event',session_id:session,event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:value}}});
}
function end(cancelled = false) {
 if (kind === 'codex') {
  notice('item/completed',{threadId:session,item:{id:'a',type:'agentMessage',text:cancelled?'':'你好：'+count}});
  notice('item/started',{threadId:session,item:{id:'tool',type:'commandExecution',command:'echo fixture'}});
  notice('item/completed',{threadId:session,item:{id:'tool',type:'commandExecution',status:'completed',aggregatedOutput:'fixture'}});
  notice('thread/tokenUsage/updated',{threadId:session,tokenUsage:{last:{inputTokens:10,outputTokens:4}}});
  notice('turn/completed',{threadId:session,turn:{id:'turn',status:cancelled?'interrupted':'completed'}});
 } else if (kind === 'grok') {
  notice('session/update',{sessionId:session,update:{sessionUpdate:'tool_call',toolCallId:'tool',title:'fixture',status:'pending'}});
  notice('session/update',{sessionId:session,update:{sessionUpdate:'tool_call_update',toolCallId:'tool',title:'fixture',status:'completed'}});
  notice('session/update',{sessionId:session,update:{sessionUpdate:'usage_update',inputTokens:10,outputTokens:4}});
  respond(request,{stopReason:cancelled?'cancelled':'end_turn'});
 } else {
  send({type:'assistant',session_id:session,message:{id:'a',content:[{type:'text',text:cancelled?'':'你好：'+count},{type:'tool_use',id:'tool',name:'Read',input:{file_path:'fixture'}}]}});
  send({type:'user',session_id:session,message:{content:[{type:'tool_result',tool_use_id:'tool',content:'fixture'}]}});
  send({type:'result',session_id:session,subtype:cancelled?'error_during_execution':'success',is_error:cancelled,usage:{input_tokens:10,output_tokens:4},result:cancelled?'':'你好：'+count});
 }
}
function askQuestion() {
 waiting = 'question';
 if (kind === 'codex') send({id:'q',method:'item/tool/requestUserInput',params:{threadId:session,questions:[{id:'color',question:'Which color?',options:[{label:'blue'}]}]}});
 if (kind === 'grok') send({id:'q',method:'_x.ai/ask_user_question',params:{sessionId:session,toolCallId:'q',questions:[{question:'Which color?',options:[{label:'blue'}]}]}});
 if (kind === 'claude') send({type:'control_request',request_id:'q',request:{subtype:'can_use_tool',tool_name:'AskUserQuestion',input:{questions:[{question:'Which color?',options:[{label:'blue'}]}]}}});
}
function prompt(value, id) {
 input = value; request = id; count++; fs.writeFileSync(saved,JSON.stringify({session,count}));
 if (kind === 'claude') { send({type:'system',subtype:'init',session_id:session}); send({type:'stream_event',session_id:session,event:{type:'message_start',message:{id:'a'}}}); }
 if (input === 'error') { send({id,error:{code:402,message:'usage balance exhausted'}}); return; }
 emitText('你好：'+count);
 if (input === 'disconnect') { setTimeout(() => process.exit(9),20); return; }
 if (input === 'hang') return;
 waiting = 'approval';
 if (kind === 'codex') send({id:'p',method:'item/commandExecution/requestApproval',params:{threadId:session,command:'echo fixture',availableDecisions:['accept','decline']}});
 if (kind === 'grok') send({id:'p',method:'session/request_permission',params:{sessionId:session,toolCall:{title:'fixture'},options:[{kind:'allow_once',optionId:'once'},{kind:'reject_once',optionId:'no'}]}});
 if (kind === 'claude') send({type:'control_request',request_id:'p',request:{subtype:'can_use_tool',tool_name:'Read',input:{file_path:'fixture'},tool_use_id:'tool'}});
}
readline.createInterface({input:process.stdin}).on('line', line => {
 const m=JSON.parse(line); fs.appendFileSync('wire-'+kind+'.jsonl',JSON.stringify(m)+'\n');
 const method = kind === 'claude' ? m.request?.subtype : m.method;
 const id = kind === 'claude' ? m.request_id : m.id;
 if (m.type === 'control_response' || (!method && m.id)) {
  const r = kind === 'claude' ? m.response.response : m.result;
  if (waiting === 'approval') {
   if (kind === 'codex' && r.decision !== 'accept') fail('approval mismatch');
   if (kind === 'grok' && r.outcome?.optionId !== 'once') fail('approval mismatch');
   if (kind === 'claude' && (r.behavior !== 'allow' || r.updatedInput.file_path !== 'fixture')) fail('approval mismatch');
   askQuestion(); return;
  }
  if (waiting === 'question') {
   const answer = kind === 'codex' ? r.answers.color.answers[0] : kind === 'claude' ? r.updatedInput.answers['Which color?'] : r.answers['Which color?'][0];
   if (answer !== 'blue') fail('answer mismatch'); waiting=null; end(); return;
  }
 }
 if (method === 'initialize') return respond(id,kind==='grok'?{protocolVersion:1,agentCapabilities:{loadSession:true},authMethods:[],_meta:{modelState:{currentModelId:'fixture-grok',availableModels:[{modelId:'fixture-grok',name:'Fixture',_meta:{supportsReasoningEffort:false}}]}}}:{});
 if (method === 'config/read') return respond(id,{config:{model:'fixture-codex',model_reasoning_effort:'low'}});
 if (method === 'model/list') return respond(id,{data:[{model:'fixture-codex',displayName:'Fixture',supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low'}],nextCursor:null});
 if (['set_model','apply_flag_settings'].includes(method)) return respond(id,{});
 if (method === 'thread/start' || method === 'session/new') { session=crypto.randomUUID(); count=0; return respond(id,kind==='codex'?{thread:{id:session}}:{sessionId:session}); }
 if (method === 'thread/resume' || method === 'session/load') {
  const old=JSON.parse(fs.readFileSync(saved)); session=old.session; count=old.count;
  if ((m.params.threadId||m.params.sessionId)!==session) fail('resume mismatch');
  if (kind==='grok') emitText('DO NOT REPLAY');
  return respond(id,kind==='codex'?{thread:{id:session}}:{});
 }
 if (method === 'turn/start') { respond(id,{turn:{id:'turn'}}); return prompt(m.params.input[0].text,id); }
 if (method === 'session/prompt') return prompt(m.params.prompt[0].text,id);
 if (m.type === 'user') {
  const resume=args.find(v=>v.startsWith('--resume='));
  if (resume) { const old=JSON.parse(fs.readFileSync(saved)); session=old.session; count=old.count; if(resume.slice(9)!==session) fail('resume mismatch'); }
  else session=args.find(v=>v.startsWith('--session-id=')).slice(13);
  return prompt(m.message.content,null);
 }
 if (method === 'session/set_model') return respond(id,{});
 if (['turn/interrupt','session/cancel','interrupt'].includes(method)) { waiting=null; if(kind!=='grok')respond(id,{}); end(true); }
});
`;

const builtin = {
  async run() {
    return { status: "succeeded" as const, text: "builtin", resultKnown: true };
  },
};
const kernels = ["codex", "claude-code", "grok-build"] as const;
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-kernels-"));
  const executablePath = join(directory, "fixture.cjs");
  await writeFile(executablePath, fixture);
  const registry = createStudioKernelRegistry({ dataDir: join(directory, "data"), builtin });
  const turn = (kernel: StudioKernelId, text: string): StudioKernelTurn => ({
    runId: "run",
    turnId: "turn",
    conversationId: "conversation",
    kernel,
    workspacePath: directory,
    executablePath,
    permission: "ask",
    text,
  });
  return {
    directory,
    executablePath,
    registry,
    turn,
    async cleanup() {
      await registry.dispose();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

for (const kernel of kernels) {
  test(
    `${kernel}: duplex approval, question, streamed output and cold native resume`,
    { timeout: 15_000 },
    async () => {
      const context = await setup();
      try {
        const interactions: StudioKernelInteraction[] = [];
        const events: StudioKernelEvent[] = [];
        const sink = {
          async emit(event: StudioKernelEvent) {
            await new Promise((resolve) => setTimeout(resolve, 5));
            events.push(event);
          },
          async ask(interaction: StudioKernelInteraction) {
            assert.ok(
              events.some((event) => event.type === "text"),
              "earlier output must be durable before displaying interaction",
            );
            interactions.push(interaction);
            return {
              decision: "allow-once" as const,
              answers: Object.fromEntries(
                (interaction.questions ?? []).map((q) => [q.id, ["blue"]]),
              ),
            };
          },
        };
        const first = await context.registry
          .adapter(kernel)
          .run(context.turn(kernel, "first"), sink, new AbortController().signal);
        assert.equal(first.status, "succeeded", first.error);
        assert.equal(first.text, "你好：1");
        assert.ok(first.nativeSessionId);
        const second = await context.registry
          .adapter(kernel)
          .run(
            { ...context.turn(kernel, "second"), nativeSessionId: first.nativeSessionId },
            sink,
            new AbortController().signal,
          );
        assert.equal(second.status, "succeeded", second.error);
        assert.equal(second.text, "你好：2");
        assert.equal(second.nativeSessionId, first.nativeSessionId);
        assert.deepEqual(
          interactions.map((i) => i.kind),
          ["approval", "question", "approval", "question"],
        );
        assert.ok(events.some((e) => e.type === "tool" && e.state === "succeeded"));
        assert.ok(events.some((e) => e.type === "usage" && e.inputTokens === 10));
        const wire = await readFile(
          join(
            context.directory,
            `wire-${kernel === "claude-code" ? "claude" : kernel === "grok-build" ? "grok" : kernel}.jsonl`,
          ),
          "utf8",
        );
        const frames = wire
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        if (kernel === "codex") {
          assert.equal(
            frames.find((frame) => frame.method === "thread/start").params.model,
            undefined,
          );
          assert.equal(
            frames.find((frame) => frame.method === "thread/resume").params.model,
            "fixture-codex",
          );
        } else if (kernel === "grok-build") {
          assert.equal(frames.filter((frame) => frame.method === "session/set_model").length, 1);
          assert.equal(
            frames.find((frame) => frame.method === "session/set_model").params.modelId,
            "fixture-grok",
          );
        } else {
          assert.deepEqual(frames.find((frame) => frame.request?.subtype === "set_model").request, {
            subtype: "set_model",
          });
        }
      } finally {
        await context.cleanup();
      }
    },
  );
  test(
    `${kernel}: cancellation settles a pending native interaction`,
    { timeout: 10_000 },
    async () => {
      const context = await setup();
      const controller = new AbortController();
      try {
        const result = await context.registry.adapter(kernel).run(
          context.turn(kernel, "cancel"),
          {
            async emit() {},
            async ask() {
              controller.abort();
              return new Promise(() => {});
            },
          },
          controller.signal,
        );
        assert.equal(result.status, "cancelled", result.error);
        assert.equal(result.resultKnown, true);
      } finally {
        await context.cleanup();
      }
    },
  );
  test(
    `${kernel}: transport loss after submission is not a known failure`,
    { timeout: 10_000 },
    async () => {
      const context = await setup();
      try {
        const result = await context.registry.adapter(kernel).run(
          context.turn(kernel, "disconnect"),
          {
            async emit() {},
            async ask() {
              throw new Error("Unexpected question");
            },
          },
          new AbortController().signal,
        );
        assert.equal(result.status, "interrupted");
        assert.equal(result.resultKnown, false);
        assert.equal(result.retryable, false);
        assert.ok(result.nativeSessionId);
      } finally {
        await context.cleanup();
      }
    },
  );
}

test("Grok reports a definite 402 response without pretending success or transport uncertainty", async () => {
  const context = await setup();
  try {
    const result = await context.registry.adapter("grok-build").run(
      context.turn("grok-build", "error"),
      {
        async emit() {},
        async ask() {
          throw new Error("Unexpected question");
        },
      },
      new AbortController().signal,
    );
    assert.equal(result.status, "failed");
    assert.equal(result.resultKnown, true);
    assert.match(result.error!, /402/);
  } finally {
    await context.cleanup();
  }
});

test("unsupported read-only mode fails before starting Claude/Grok; supplied paths cannot be shell snippets", async () => {
  const context = await setup();
  try {
    for (const kernel of ["claude-code", "grok-build"] as const) {
      const result = await context.registry.adapter(kernel).run(
        { ...context.turn(kernel, "test"), permission: "read-only" },
        {
          async emit() {},
          async ask() {
            throw new Error("Unexpected question");
          },
        },
        new AbortController().signal,
      );
      assert.equal(result.status, "failed");
      assert.equal(result.resultKnown, true);
      assert.match(result.error!, /只读/);
    }
    const result = await context.registry.adapter("codex").run(
      { ...context.turn("codex", "test"), executablePath: "codex; echo unsafe" },
      {
        async emit() {},
        async ask() {
          throw new Error("Unexpected question");
        },
      },
      new AbortController().signal,
    );
    assert.equal(result.status, "failed");
    assert.match(result.error!, /绝对文件路径/);
  } finally {
    await context.cleanup();
  }
});
