import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStudioKernelRegistry } from "../src/studio-runtime/adapters/kernels/kernelRegistry.js";
import { antigravityArgs } from "../src/studio-runtime/adapters/kernels/antigravityProtocol.js";
import type { StudioKernelEvent, StudioKernelTurn } from "../src/studio-runtime/kernelTypes.js";

const fixture = String.raw`
const fs=require('node:fs');const readline=require('node:readline');
const args=process.argv.slice(2);
if(args.includes('--version')){console.log('agy 1.2.2');process.exit(0)}
if(args.includes('models')){console.log('gemini-flash   Gemini Flash\nclaude-sonnet   Claude Sonnet');process.exit(0)}
fs.appendFileSync('agy-args.jsonl',JSON.stringify(args)+'\n');
const send=(m)=>process.stdout.write(JSON.stringify(m)+'\n');
const prior=args.indexOf('--conversation');const session=prior<0?'fixture-agy-session':args[prior+1];
send({event:'init',conversation_id:session,init:{permission_mode:'request-review'}});
readline.createInterface({input:process.stdin}).on('line',line=>{
 const input=JSON.parse(line);fs.appendFileSync('agy-input.jsonl',JSON.stringify(input)+'\n');
 send({event:'step_update',step_update:{conversation_id:session,step_index:1,state:'ACTIVE',step_type:'agent_response',text_delta:'fixture '}});
 send({event:'step_update',step_update:{conversation_id:session,step_index:1,state:'DONE',step_type:'agent_response',text_delta:'reply'}});
 send({event:'step_update',step_update:{conversation_id:session,step_index:2,state:'DONE',step_type:'tool',tool_name:'read_file',tool_info:{name:'read_file',parameters:{path:'sample'},output:'ok'}}});
 send({event:'result',result:{conversation_id:session,status:'SUCCESS',response:'fixture reply',usage:{input_tokens:3,output_tokens:2}}});
});
`;

test("Antigravity CLI discovery, native model list, streaming reply and explicit resume", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-agy-"));
  const entry = join(root, "agy.cjs");
  await writeFile(entry, fixture);
  const registry = createStudioKernelRegistry({
    dataDir: join(root, "data"),
    builtin: {
      async run() {
        return { status: "succeeded", text: "", resultKnown: true };
      },
    },
  });
  const turn = (selection: Partial<StudioKernelTurn> = {}): StudioKernelTurn => ({
    kernel: "antigravity",
    runId: "run",
    turnId: "turn",
    conversationId: "chat",
    workspacePath: root,
    executablePath: entry,
    permission: "ask",
    text: "hello",
    ...selection,
  });
  try {
    const status = (
      await registry.inspect({ antigravity: { executablePath: entry, permission: "ask" } })
    ).find((item) => item.id === "antigravity");
    assert.equal(status?.installed, true, status?.error);
    assert.equal(status.capabilities.resume, true);
    assert.equal(status.capabilities.approval, false);
    const options = await registry.options!({
      kernel: "antigravity",
      workspacePath: root,
      config: { executablePath: entry, permission: "ask" },
    });
    assert.deepEqual(
      options.models.map((item) => item.id),
      ["gemini-flash", "claude-sonnet"],
    );
    assert.deepEqual(
      options.models[0]?.reasoning.map((item) => item.id),
      ["low", "medium", "high"],
    );
    const events: StudioKernelEvent[] = [];
    const sink = {
      async emit(event: StudioKernelEvent) {
        events.push(event);
      },
      async ask() {
        throw new Error("headless AGY cannot request interactive approval");
      },
    };
    const first = await registry
      .adapter("antigravity")
      .run(
        turn({ model: "gemini-flash", reasoningEffort: "low" }),
        sink,
        new AbortController().signal,
      );
    assert.equal(first.status, "succeeded");
    assert.equal(first.text, "fixture reply");
    assert.equal(first.nativeSessionId, "fixture-agy-session");
    assert.ok(events.some((event) => event.type === "tool" && event.name === "read_file"));
    const second = await registry
      .adapter("antigravity")
      .run(turn({ nativeSessionId: first.nativeSessionId }), sink, new AbortController().signal);
    assert.equal(second.status, "succeeded");
    const args = (await readFile(join(root, "agy-args.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    assert.ok(args[0]?.includes("--model"));
    assert.ok(args[0]?.includes("--effort"));
    assert.deepEqual(
      args[1]?.slice(args[1].indexOf("--conversation"), args[1].indexOf("--conversation") + 2),
      ["--conversation", first.nativeSessionId],
    );
    assert.ok(!args.some((value) => value.includes("hello")));
    const inputs = (await readFile(join(root, "agy-input.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(inputs[0]?.message?.content, "hello");
  } finally {
    await registry.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("Antigravity full-access flag is explicit and read-only is never silently weakened", () => {
  const base: StudioKernelTurn = {
    kernel: "antigravity",
    runId: "r",
    turnId: "t",
    conversationId: "c",
    workspacePath: "C:\\workspace",
    permission: "ask",
    text: "text",
  };
  assert.equal(antigravityArgs(base).includes("--dangerously-skip-permissions"), false);
  assert.equal(
    antigravityArgs({ ...base, permission: "full-access" }).includes(
      "--dangerously-skip-permissions",
    ),
    true,
  );
});
