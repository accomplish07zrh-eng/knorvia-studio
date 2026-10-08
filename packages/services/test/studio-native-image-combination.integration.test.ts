// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Event } from "@knorvia/rpc";
import type {
  StudioCommand,
  StudioRun,
  StudioTurnSnapshot,
} from "../src/studio-runtime/contract.js";
import { StudioRuntimeService } from "../src/studio-runtime/app/studioRuntimeService.js";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { studioImageCodec } from "../src/studio-runtime/adapters/imageCodec.js";
import { createStudioKernelRegistry } from "../src/studio-runtime/adapters/kernels/kernelRegistry.js";
import { connectStudioRpc } from "./fixtures/studio-rpc.integration.js";
import { seedLegacyStudioDatabase } from "./fixtures/studio-legacy-v010.integration.js";
import {
  independentImages,
  independentImageInput,
} from "./fixtures/studio-independent-images.integration.js";

// 旧原生 turn 终态不能结束当前含图输入；合成 stdio 只写本测试 wire，不连接模型或真实 profile。
const endpoint = String.raw`
const fs=require('node:fs/promises');const readline=require('node:readline');
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const respond=(id,result)=>send({id,result});const notice=(method,params)=>send({method,params});
const threadId='native-root-current',turnId='native-combination-current';let chain=Promise.resolve();
readline.createInterface({input:process.stdin}).on('line',line=>{chain=chain.then(async()=>{
 const frame=JSON.parse(line);await fs.appendFile('combined-wire.jsonl',JSON.stringify(frame)+'\n');
 const {id,method,params}=frame;
 if(method==='initialize')return respond(id,{});
 if(method==='config/read')return respond(id,{config:{model:'fixture-vision',model_reasoning_effort:'low'}});
 if(method==='model/list')return respond(id,{data:[{model:'fixture-vision',displayName:'Synthetic Vision',inputModalities:['text','image'],supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low'}],nextCursor:null});
 if(method==='thread/start'||method==='thread/resume')return respond(id,{thread:{id:threadId},model:'fixture-vision',sandbox:{type:'readOnly'}});
 if(method==='turn/start'){
  respond(id,{turn:{id:turnId}});
  notice('item/agentMessage/delta',{threadId,turnId:'native-combination-old',itemId:'old-text',delta:'FOREIGN-OLD-TURN'});
  notice('item/completed',{threadId,turnId:'native-combination-old',item:{id:'old-tool',type:'commandExecution',status:'completed',command:'old-command',aggregatedOutput:'FOREIGN-OUTPUT'}});
  notice('turn/completed',{threadId,turn:{id:'native-combination-old',status:'interrupted'}});
  send({id:'old-approval',method:'item/commandExecution/requestApproval',params:{threadId,turnId:'native-combination-old',command:'old-command',availableDecisions:['accept','decline']}});
  notice('item/agentMessage/delta',{threadId,turnId,itemId:'root-text',delta:'Owned image turn awaiting decision.'});
  notice('item/completed',{threadId,turnId,item:{id:'root-tool',type:'mcpToolCall',server:'fixture',tool:'inspect_pixels',arguments:{fixture:'synthetic-only'},status:'future-tool-state',result:{content:[{type:'text',text:'Owned synthetic output'}]}}});
  notice('thread/tokenUsage/updated',{threadId,tokenUsage:{last:{inputTokens:42,outputTokens:7,cachedInputTokens:2,reasoningOutputTokens:3}}});
  send({id:'root-approval',method:'item/commandExecution/requestApproval',params:{threadId,turnId,command:'synthetic-owned-command',availableDecisions:['accept','decline']}});return;
 }
 if(id==='root-approval'&&!method){
  if(frame.result?.decision!=='decline')throw new Error('Only the explicit current root denial is authorized');
  notice('item/agentMessage/delta',{threadId,turnId,itemId:'root-text',delta:' Denied without execution.'});
  notice('turn/completed',{threadId,turn:{id:turnId,status:'completed'}});return;
 }
 if(method==='turn/interrupt'){respond(id,{});notice('turn/completed',{threadId,turn:{id:turnId,status:'interrupted'}});}
}).catch(error=>{process.stderr.write(String(error)+'\n');process.exitCode=2;process.stdin.destroy();});});
`;

test(
  "frozen image input and faithful native events keep the original durable run and approval owner",
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "knorvia-native-image-combination-"));
    let owner: StudioRuntimeService | undefined;
    let connection: ReturnType<typeof connectStudioRpc> | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      const project = join(root, "project");
      await mkdir(project);
      const executable = join(root, "fixture.cjs");
      await writeFile(executable, endpoint);
      const path = join(root, "studio.sqlite");
      await seedLegacyStudioDatabase(path, project);
      const db = new StudioDatabase(path);
      const registry = createStudioKernelRegistry({
        dataDir: join(root, "kernels"),
        builtin: {
          run: async () => {
            throw new Error("Synthetic native acceptance must never call builtin provider");
          },
        },
      });
      owner = new StudioRuntimeService({
        db,
        kernels: registry,
        images: studioImageCodec,
        clock: {
          now: Date.now,
          id: randomUUID,
          delay: (ms, signal) => delay(ms, undefined, { signal }),
        },
        workspaces: {
          prepare: async ({ sourcePath }) => sourcePath,
          changes: async () => [],
          apply: async () => {},
        },
        onDidChange: Event.None,
        notify: () => {},
      });
      connection = connectStudioRpc(owner);
      const service = connection.service;
      const images = await independentImages();
      const attachments = [
        independentImageInput(images.baselinePng!, "combined-png", "合成截图.png"),
        independentImageInput(images.orientedJpeg!, "combined-jpeg", "orientation-six.jpg"),
      ];
      const request = {
        type: "send",
        kind: "chat",
        commandId: "combined-image-command",
        targetId: "legacy-chat",
        text: "Review these synthetic pixels",
        imageModel: "fixture-vision",
        selection: { model: "fixture-vision", reasoningEffort: "low" },
        kernelConfig: {
          executablePath: executable,
          permission: "ask",
          model: "fixture-vision",
          reasoningEffort: "low",
        },
        attachments,
      } satisfies StudioCommand;
      const accepted = await service.command(request);
      assert.equal(accepted.imageRejection, undefined, accepted.imageRejection);
      assert.ok(accepted.id);
      owner.tick();
      timer = setInterval(() => owner?.tick(), 25);
      let timeline = await service.timeline("legacy-chat", undefined, accepted.id);
      for (let attempt = 0; attempt < 200; attempt++) {
        timeline = await service.timeline("legacy-chat", undefined, accepted.id);
        if (timeline.interactions.some((item) => item.status === "pending")) break;
        assert.ok(
          ["queued", "running", "waiting"].includes(
            timeline.runs.find((run) => run.id === accepted.id)!.state,
          ),
          "An old native terminal must not finish the current run",
        );
        await delay(25);
      }
      const pending = timeline.interactions.filter((item) => item.status === "pending");
      assert.equal(pending.length, 1);
      const activeTurn = db.list<StudioTurnSnapshot>("turn", { scope: accepted.id })[0];
      assert.ok(activeTurn);
      assert.equal(db.read("interaction-link", `${activeTurn.id}:root-approval`), pending[0]!.id);
      assert.equal(db.read("interaction-link", `${activeTurn.id}:old-approval`), undefined);
      assert.equal(JSON.stringify(timeline).includes("FOREIGN"), false);
      assert.equal(JSON.stringify(timeline).includes("old-approval"), false);
      await service.command({
        type: "answer",
        commandId: "combined-explicit-deny",
        interactionId: pending[0]!.id,
        answer: { decision: "deny" },
      });
      let run: StudioRun | undefined;
      for (let attempt = 0; attempt < 200; attempt++) {
        timeline = await service.timeline("legacy-chat", undefined, accepted.id);
        run = timeline.runs.find((item) => item.id === accepted.id);
        assert.ok(run);
        if (!["queued", "running", "waiting"].includes(run.state)) break;
        await delay(25);
      }
      assert.ok(run);
      assert.equal(run.state, "succeeded", run.error);
      assert.equal(run.resultKnown, true);
      assert.equal(run.kernelConfig?.model, "fixture-vision");
      assert.equal(run.kernelConfig?.permission, "ask");
      assert.equal(run.kernelConfig?.reasoningEffort, "low");
      const tool = timeline.messages.find((message) => message.id.endsWith(":root-tool"));
      assert.ok(tool, "Faithful tool metadata must survive to the owned timeline");
      assert.equal(tool.state, "unknown");
      assert.equal(Reflect.get(tool, "statusDetail"), "future-tool-state");
      assert.match(String(Reflect.get(tool, "input")), /synthetic-only/);
      assert.match(String(Reflect.get(tool, "output")), /Owned synthetic output/);
      assert.equal(timeline.usage?.inputTokens, 42);
      assert.equal(timeline.usage?.outputTokens, 7);
      assert.equal(JSON.stringify(timeline).includes("dataBase64"), false);
      const wire = (await readFile(join(project, "combined-wire.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const turns = wire.filter((frame) => frame.method === "turn/start");
      assert.equal(turns.length, 1);
      assert.equal(turns[0].params.threadId, "native-root-current");
      assert.equal(turns[0].params.model, "fixture-vision");
      assert.equal(turns[0].params.effort, "low");
      assert.deepEqual(
        turns[0].params.input
          .filter((item: { type?: string; url?: string }) => item.type === "image")
          .map((item: { url?: string }) => item.url),
        attachments.map((image) => `data:${image.mimeType};base64,${image.dataBase64}`),
      );
      assert.deepEqual(
        wire
          .filter((frame) => frame.id === "root-approval" && !frame.method)
          .map((frame) => frame.result),
        [{ decision: "decline" }],
      );
      const staleReplies = wire.filter((frame) => frame.id === "old-approval" && !frame.method);
      assert.equal(staleReplies.length, 1, "The stale request must receive exactly one refusal");
      for (const reply of staleReplies) {
        // 原生未归属请求可用明确 JSON-RPC error 拒绝；不能把安全拒绝误判为必须消费当前答案。
        if (reply.error !== undefined) {
          assert.equal(reply.result, undefined);
          assert.ok(Number.isSafeInteger(reply.error.code));
          assert.equal(typeof reply.error.message, "string");
          assert.ok(reply.error.message.trim());
        } else assert.deepEqual(reply.result, { decision: "decline" });
      }
      assert.equal(
        wire.some((frame) => frame.method === "turn/interrupt"),
        false,
      );
      const stored = db.list<StudioTurnSnapshot>("turn", { scope: accepted.id });
      assert.equal(stored.length, 1);
      assert.equal(stored[0].nativeSessionId, "native-root-current");
      assert.equal(stored[0].runId, accepted.id);
      assert.equal(stored[0].workspacePath, project);
      clearInterval(timer);
      timer = undefined;
      connection.close();
      connection = undefined;
      await owner.disposeAllAndWait();
      owner = undefined;
      const reopenedDb = new StudioDatabase(path);
      const reopenedRegistry = createStudioKernelRegistry({
        dataDir: join(root, "kernels"),
        builtin: {
          run: async () => {
            throw new Error("A restart must not dispatch a provider");
          },
        },
      });
      owner = new StudioRuntimeService({
        db: reopenedDb,
        kernels: reopenedRegistry,
        images: studioImageCodec,
        clock: {
          now: Date.now,
          id: randomUUID,
          delay: (ms, signal) => delay(ms, undefined, { signal }),
        },
        workspaces: {
          prepare: async ({ sourcePath }) => sourcePath,
          changes: async () => [],
          apply: async () => {},
        },
        onDidChange: Event.None,
        notify: () => {},
      });
      connection = connectStudioRpc(owner);
      assert.deepEqual(await connection.service.command(request), accepted);
      assert.equal(
        (await connection.service.timeline("legacy-chat", undefined, accepted.id, "combined-png"))
          .image?.input?.dataBase64,
        attachments[0]!.dataBase64,
      );
      assert.equal(
        (await readFile(join(project, "combined-wire.jsonl"), "utf8"))
          .trim()
          .split("\n")
          .filter((line) => JSON.parse(line).method === "turn/start").length,
        1,
      );
    } finally {
      if (timer) clearInterval(timer);
      connection?.close();
      await owner?.disposeAllAndWait();
      await rm(root, { recursive: true, force: true });
    }
  },
);
