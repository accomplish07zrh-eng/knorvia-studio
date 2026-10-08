import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  StudioKernelEvent,
  StudioKernelInteraction,
  StudioKernelSink,
  StudioKernelTurn,
} from "../src/studio-runtime/contract.js";
import { createStudioKernelRegistry } from "../src/studio-runtime/adapters/kernels/kernelRegistry.js";

// 集成门禁保留根线程 fence：不能通过接纳任何 thread 来修复原生 child 审批。
// 独立假 CLI 只交换合成 stdio 协议，既不读原生 profile，也不调用模型。
const protocolFixture = String.raw`
const fs = require('node:fs/promises');
const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const notice = (method,params) => send({method,params});
const respond = (id,result) => send({id,result});
const threadId = 'native-root-current';
const turnId = 'native-turn-current';
let chain = Promise.resolve();
readline.createInterface({input:process.stdin}).on('line',line => {
  chain = chain.then(async () => {
    const frame = JSON.parse(line);
    await fs.appendFile('integration-wire.jsonl',JSON.stringify(frame)+'\n');
    const {id,method,params} = frame;
    if (method === 'initialize') return respond(id,{});
    if (method === 'config/read') return respond(id,{config:{model:'fixture-root',model_reasoning_effort:'low'}});
    if (method === 'model/list') return respond(id,{data:[{model:'fixture-root',displayName:'Fixture',supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low'}],nextCursor:null});
    if (method === 'thread/start') return respond(id,{thread:{id:threadId}});
    if (method === 'turn/start') {
      respond(id,{turn:{id:turnId}});
      notice('item/agentMessage/delta',{threadId:'unowned-thread',turnId,itemId:'foreign-text',delta:'FOREIGN-TEXT'});
      notice('item/completed',{threadId:'unowned-thread',turnId,item:{id:'foreign-tool',type:'commandExecution',status:'completed',command:'foreign-command',aggregatedOutput:'FOREIGN-OUTPUT'}});
      notice('thread/tokenUsage/updated',{threadId:'unowned-thread',tokenUsage:{last:{inputTokens:999,outputTokens:999}}});
      notice('turn/completed',{threadId:'unowned-thread',turn:{id:turnId,status:'interrupted'}});
      send({id:'foreign-approval',method:'item/commandExecution/requestApproval',params:{threadId:'unowned-thread',turnId,command:'foreign-command',availableDecisions:['accept','decline']}});
      notice('item/agentMessage/delta',{threadId,turnId,itemId:'root-text',delta:'Root awaiting explicit decision.'});
      send({id:'root-approval',method:'item/commandExecution/requestApproval',params:{threadId,turnId,command:'fixture-root-command',availableDecisions:['accept','decline']}});
      return;
    }
    if (id === 'root-approval' && !method) {
      if (frame.result?.decision !== 'decline') throw new Error('Unexpected root approval');
      notice('item/agentMessage/delta',{threadId,turnId,itemId:'root-text',delta:' Root denied.'});
      notice('turn/completed',{threadId,turn:{id:turnId,status:'completed'}});
      return;
    }
    if (method === 'turn/interrupt') {
      respond(id,{});
      notice('turn/completed',{threadId,turn:{id:turnId,status:'interrupted'}});
    }
  }).catch(error => { process.stderr.write(String(error)+'\n'); process.exitCode=2; process.stdin.destroy(); });
});
`;

async function context(permission: StudioKernelTurn["permission"]) {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-adapter-image-integration-"));
  const executablePath = join(directory, "fixture.cjs");
  await writeFile(executablePath, protocolFixture);
  const registry = createStudioKernelRegistry({
    dataDir: join(directory, "data"),
    builtin: {
      async run() {
        throw new Error("The native protocol gate must never call the builtin provider.");
      },
    },
  });
  const controller = new AbortController();
  const turn: StudioKernelTurn = {
    runId: "studio-run-original",
    turnId: "studio-turn-original",
    conversationId: "studio-conversation-original",
    kernel: "codex",
    workspacePath: directory,
    executablePath,
    permission,
    text: "Synthetic original-session gate",
  };
  return {
    directory,
    registry,
    controller,
    turn,
    async wire() {
      return (await readFile(join(directory, "integration-wire.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { id?: unknown; method?: string; result?: unknown });
    },
    async close() {
      controller.abort();
      await registry.dispose();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test(
  "unowned native threads cannot finish, approve or contribute output to the original turn",
  { timeout: 15_000 },
  async () => {
    const fixture = await context("ask");
    let release!: (answer: { decision: "deny" }) => void;
    let shown!: () => void;
    const decision = new Promise<{ decision: "deny" }>((resolve) => {
      release = resolve;
    });
    const visible = new Promise<void>((resolve) => {
      shown = resolve;
    });
    const events: StudioKernelEvent[] = [];
    const interactions: StudioKernelInteraction[] = [];
    const sink: StudioKernelSink = {
      async emit(event) {
        events.push(event);
      },
      async ask(interaction) {
        interactions.push(interaction);
        shown();
        return decision;
      },
    };
    try {
      const running = fixture.registry
        .adapter("codex")
        .run(fixture.turn, sink, fixture.controller.signal);
      await Promise.race([
        visible,
        running.then(() => {
          throw new Error("The original turn finished before its root decision.");
        }),
      ]);
      assert.deepEqual(
        interactions.map((item) => item.id),
        ["root-approval"],
      );
      assert.equal(
        events.some((event) => event.type === "tool" || event.type === "usage"),
        false,
      );
      assert.equal(
        events.some((event) => event.type === "text" && event.text.includes("FOREIGN")),
        false,
      );
      assert.equal(
        (await fixture.wire()).some((frame) => frame.id === "root-approval" && !frame.method),
        false,
      );
      release({ decision: "deny" });
      const result = await running;
      assert.equal(result.status, "succeeded", result.error);
      assert.equal(result.nativeSessionId, "native-root-current");
      assert.equal(result.text, "Root awaiting explicit decision. Root denied.");
      assert.equal(result.resultKnown, true);
      assert.equal(
        (await fixture.wire()).filter((frame) => frame.id === "root-approval" && !frame.method)
          .length,
        1,
      );
    } finally {
      release({ decision: "deny" });
      await fixture.close();
    }
  },
);

test(
  "the existing read-only owner declines native command approval without opening an interaction",
  { timeout: 15_000 },
  async () => {
    const fixture = await context("read-only");
    const interactions: StudioKernelInteraction[] = [];
    try {
      const result = await fixture.registry.adapter("codex").run(
        fixture.turn,
        {
          async emit() {},
          async ask(interaction) {
            interactions.push(interaction);
            throw new Error("Read-only must never request execution permission.");
          },
        },
        fixture.controller.signal,
      );
      assert.equal(result.status, "succeeded", result.error);
      assert.equal(result.nativeSessionId, "native-root-current");
      assert.deepEqual(interactions, []);
      const response = (await fixture.wire()).find(
        (frame) => frame.id === "root-approval" && !frame.method,
      );
      assert.deepEqual(response?.result, { decision: "decline" });
      assert.equal(
        (await fixture.wire()).filter((frame) => frame.method === "turn/start").length,
        1,
      );
    } finally {
      await fixture.close();
    }
  },
);
