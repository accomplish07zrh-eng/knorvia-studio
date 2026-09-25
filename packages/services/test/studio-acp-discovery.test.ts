import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type {
  StudioKernelConfig,
  StudioKernelEvent,
  StudioKernelId,
  StudioKernelTurn,
} from "../src/studio-runtime/kernelTypes.js";
import { createStudioKernelRegistry } from "../src/studio-runtime/adapters/kernels/kernelRegistry.js";
import { BUILTIN_KERNELS } from "../src/studio-runtime/adapters/kernels/acpCatalog.js";
import { projectAcpMcpServers } from "../src/studio-runtime/adapters/kernels/acpMcp.js";
import { resolveExecutable } from "../src/studio-runtime/adapters/kernels/executable.js";

const fixture = String.raw`
const fs=require('node:fs'); const readline=require('node:readline');
const args=process.argv.slice(2); if(args.includes('--version')){console.log('fixture 1.2.3');process.exit(0)}
const wire='wire-acp.jsonl'; let session='fixture-session', pending, model='fixture-model', effort='low';
const send=(m)=>process.stdout.write(JSON.stringify(m)+'\n');
const state=()=>({sessionId:session,configOptions:[
  {id:'model',category:'model',type:'select',currentValue:model,options:[{value:'fixture-model',name:'Fixture'},{value:'other-model',name:'Other'}]},
  {id:'reasoning_effort',category:'thought_level',type:'select',currentValue:effort,options:[{value:'low',name:'Low'},{value:'high',name:'High'}]}
]});
readline.createInterface({input:process.stdin}).on('line',(line)=>{
 const m=JSON.parse(line);fs.appendFileSync(wire,JSON.stringify({args,m})+'\n');
 if(m.method==='initialize') return send({id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true,mcpCapabilities:{http:true}}}});
 if(m.method==='session/new') return send({id:m.id,result:state()});
 if(m.method==='session/load') {send({method:'session/update',params:{sessionId:session,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'OLD'}}}});return send({id:m.id,result:state()})}
 if(m.method==='session/set_config_option') {if(m.params.configId==='model')model=m.params.value;else effort=m.params.value;return send({id:m.id,result:state()})}
 if(m.method==='session/prompt') {pending=m.id;send({method:'session/update',params:{sessionId:session,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'reply'}}}});return send({id:'permission',method:'session/request_permission',params:{sessionId:session,toolCall:{title:'Fixture tool'},options:[{kind:'allow_once',optionId:'yes'},{kind:'reject_once',optionId:'no'}]}})}
 if(m.id==='permission') {if(m.result?.outcome?.optionId!=='yes')throw new Error('wrong permission');return send({id:pending,result:{stopReason:'end_turn'}})}
 if(m.method==='session/cancel') return send({id:pending,result:{stopReason:'cancelled'}});
 if(m.id!==undefined) send({id:m.id,error:{code:-32601,message:'unsupported'}});
});
`;

const added = [
  "opencode",
  "qoder",
  "qoder-cn",
  "gemini-cli",
  "goose",
  "kimi-cli",
  "copilot",
  "hermes",
  "qwen-code",
  "mistral-vibe",
  "deepseek-harness",
] as const;
const builtin = {
  async run() {
    return { status: "succeeded" as const, text: "", resultKnown: true };
  },
};
const config = (path: string): StudioKernelConfig => ({ executablePath: path, permission: "ask" });

async function context() {
  const directory = await mkdtemp(join(tmpdir(), "knorvia-acp-"));
  const executable = join(directory, "agent.cjs");
  await writeFile(executable, fixture);
  const dataDir = join(directory, "data");
  const registry = createStudioKernelRegistry({ dataDir, builtin });
  const turn = (
    kernel: StudioKernelId,
    selection: Partial<StudioKernelTurn> = {},
  ): StudioKernelTurn => ({
    runId: "run",
    turnId: "turn",
    conversationId: "chat",
    kernel,
    workspacePath: directory,
    executablePath: executable,
    permission: "ask",
    text: "test",
    ...selection,
  });
  return {
    directory,
    dataDir,
    executable,
    registry,
    turn,
    async wire() {
      const entries = await Promise.all(
        [directory, dataDir].map(async (cwd) => {
          try {
            return (await readFile(join(cwd, "wire-acp.jsonl"), "utf8"))
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((line) => JSON.parse(line));
          } catch {
            return [];
          }
        }),
      );
      return entries.flat();
    },
    async close() {
      await registry.dispose();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test("eleven official ACP descriptors use documented stdio launch args and require a real handshake", async () => {
  assert.deepEqual(
    BUILTIN_KERNELS.filter((item) => item.protocol === "acp").map((item) => item.id),
    [...added],
  );
  const f = await context();
  try {
    const configs = Object.fromEntries(added.map((id) => [id, config(f.executable)])) as Record<
      StudioKernelId,
      StudioKernelConfig
    >;
    const statuses = await f.registry.inspect(configs);
    for (const id of added) {
      const status = statuses.find((item) => item.id === id);
      assert.equal(status?.installed, true, `${id}: ${status?.error}`);
      assert.equal(status?.origin, "external");
      assert.equal(status?.management, "external");
      assert.equal(status?.capabilities.resume, true);
    }
    const wires = await f.wire();
    for (const id of added) {
      const entry = BUILTIN_KERNELS.find((item) => item.id === id)!;
      if (id === "qoder-cn" || id === "deepseek-harness") {
        assert.deepEqual(entry.args, id === "qoder-cn" ? ["--acp"] : ["--profile", "acp"]);
        continue; // Their read-only handshake runs in a disposable home, which is removed.
      }
      assert.ok(
        wires.some(
          (wire) =>
            wire.m.method === "initialize" && entry.args.every((arg) => wire.args.includes(arg)),
        ),
      );
    }
    assert.equal(
      wires.some((wire) => wire.m.method === "session/prompt"),
      false,
    );
  } finally {
    await f.close();
  }
});

test("ACP model and effort use native selectors; reply, approval and cold resume share the normal run contract", async () => {
  const f = await context();
  try {
    const events: StudioKernelEvent[] = [];
    const sink = {
      async emit(value: StudioKernelEvent) {
        events.push(value);
      },
      async ask() {
        return { decision: "allow-once" as const };
      },
    };
    const choices = await f.registry.options!({
      kernel: "opencode",
      workspacePath: f.directory,
      config: config(f.executable),
    });
    assert.equal(choices.defaultModel, "fixture-model");
    assert.deepEqual(
      choices.models[0]?.reasoning.map((item) => item.id),
      ["low", "high"],
    );
    const first = await f.registry
      .adapter("opencode")
      .run(
        f.turn("opencode", { model: "fixture-model", reasoningEffort: "low" }),
        sink,
        new AbortController().signal,
      );
    assert.equal(first.status, "succeeded", first.error);
    assert.equal(first.text, "reply");
    const second = await f.registry
      .adapter("opencode")
      .run(
        f.turn("opencode", { nativeSessionId: first.nativeSessionId }),
        sink,
        new AbortController().signal,
      );
    assert.equal(second.status, "succeeded", second.error);
    assert.equal(second.text, "reply");
    assert.ok(events.some((event) => event.type === "text"));
    const wire = await f.wire();
    assert.ok(wire.some((item) => item.m.method === "session/load"));
    assert.ok(
      wire.some(
        (item) =>
          item.m.method === "session/set_config_option" &&
          item.m.params.configId === "reasoning_effort",
      ),
    );
    assert.equal(wire.filter((item) => item.m.method === "session/prompt").length, 2);
  } finally {
    await f.close();
  }
});

test("custom ACP manifests are opt-in; malformed files surface diagnostics and cannot run", async () => {
  const f = await context();
  try {
    const folder = join(f.dataDir, "kernels", "acp");
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, "local-tool.json"),
      JSON.stringify({ displayName: "Local tool", command: f.executable, args: [] }),
    );
    await writeFile(join(folder, "broken.json"), "{");
    const statuses = await f.registry.inspect({} as Record<StudioKernelId, StudioKernelConfig>);
    assert.equal(statuses.find((item) => item.id === "acp:local-tool")?.installed, true);
    assert.match(statuses.find((item) => item.id === "acp:broken")?.error ?? "", /JSON/);
    const result = await f.registry.adapter("acp:local-tool").run(
      f.turn("acp:local-tool"),
      {
        async emit() {},
        async ask() {
          return { decision: "allow-once" as const };
        },
      },
      new AbortController().signal,
    );
    assert.equal(result.status, "succeeded", result.error);
    const rejected = await f.registry
      .adapter("acp:broken")
      .run(
        f.turn("acp:broken"),
        {
          async emit() {},
          async ask() {
            throw new Error("unexpected");
          },
        },
        new AbortController().signal,
      )
      .catch((error: unknown) => error);
    assert.ok(rejected instanceof Error || rejected.status === "failed");
  } finally {
    await f.close();
  }
});

test("selected ACP model probes its own native thought options without prompting", async () => {
  const f = await context();
  try {
    const options = await f.registry.options!({
      kernel: "opencode",
      workspacePath: f.directory,
      config: config(f.executable),
      model: "other-model",
    });
    assert.equal(options.defaultModel, "other-model");
    assert.deepEqual(
      options.models.find((item) => item.id === "other-model")?.reasoning.map((item) => item.id),
      ["low", "high"],
    );
    const wire = await f.wire();
    assert.ok(
      wire.some(
        (item) =>
          item.m.method === "session/set_config_option" && item.m.params.value === "other-model",
      ),
    );
    assert.equal(
      wire.some((item) => item.m.method === "session/prompt"),
      false,
    );
  } finally {
    await f.close();
  }
});

test("ACP shared MCP is passed per session, and unsupported transport fails before prompt", async () => {
  const f = await context();
  try {
    const sink = {
      async emit() {},
      async ask() {
        return { decision: "allow-once" as const };
      },
    };
    const result = await f.registry.adapter("opencode").run(
      f.turn("opencode", {
        sharedMcpServers: [
          {
            name: "local",
            type: "stdio",
            command: process.execPath,
            args: ["server.cjs"],
            env: { TOKEN: "fixture" },
          },
          {
            name: "remote",
            type: "http",
            url: "https://example.test/mcp",
            headers: { Authorization: "test" },
          },
        ],
      }),
      sink,
      new AbortController().signal,
    );
    assert.equal(result.status, "succeeded", result.error);
    const opened = (await f.wire()).find((item) => item.m.method === "session/new").m.params
      .mcpServers;
    assert.deepEqual(opened[0].env, [{ name: "TOKEN", value: "fixture" }]);
    assert.deepEqual(opened[1].headers, [{ name: "Authorization", value: "test" }]);
    const denied = await f.registry.adapter("opencode").run(
      f.turn("opencode", {
        sharedMcpServers: [
          { name: "sse", type: "sse", url: "https://example.test/events", headers: {} },
        ],
      }),
      sink,
      new AbortController().signal,
    );
    assert.equal(denied.status, "failed");
    assert.match(denied.error ?? "", /SSE MCP/);
    assert.equal((await f.wire()).filter((item) => item.m.method === "session/prompt").length, 1);
  } finally {
    await f.close();
  }
});

test("version alone cannot make a non-ACP executable connectable", async () => {
  const f = await context();
  try {
    const fake = join(f.directory, "fake.cjs");
    await writeFile(
      fake,
      "if(process.argv.includes('--version')){console.log('fake 1.2.3')}else{console.log(JSON.stringify({id:'knorvia-1',result:{protocolVersion:2}}))}",
    );
    const statuses = await f.registry.inspect({ opencode: config(fake) } as Record<
      StudioKernelId,
      StudioKernelConfig
    >);
    const status = statuses.find((item) => item.id === "opencode");
    assert.equal(status?.installed, false);
    assert.match(status?.error ?? "", /ACP v1/);
  } finally {
    await f.close();
  }
});

test("ACP resolves an enabled Studio MCP PATH command to an absolute executable", async () => {
  const f = await context();
  const previous = process.env.PATH;
  try {
    process.env.PATH = f.directory + delimiter + (previous ?? "");
    const projected = await projectAcpMcpServers(
      [{ name: "fixture", type: "stdio", command: "agent.cjs", args: ["server"], env: {} }],
      { protocolVersion: 1, agentCapabilities: {} },
    );
    // 解析结果是 realpath；Windows 临时目录常为 8.3 短名，期望值同样取 realpath。
    assert.equal(projected[0]?.command, await realpath(f.executable));
    assert.deepEqual(projected[0]?.args, ["server"]);
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
    await f.close();
  }
});

test("ACP rejects a missing absolute Studio MCP command before the prompt", async () => {
  const f = await context();
  try {
    await assert.rejects(
      projectAcpMcpServers(
        [
          {
            name: "missing",
            type: "stdio",
            command: join(f.directory, "missing.exe"),
            args: [],
            env: {},
          },
        ],
        { protocolVersion: 1, agentCapabilities: {} },
      ),
      /MCP 程序.*不存在/,
    );
  } finally {
    await f.close();
  }
});

test("DeepSeek Harness resolves only the existing verified profile package, without npx", async () => {
  const f = await context();
  const priorHome = process.env.USERPROFILE;
  // os.homedir() 在 POSIX 上读取 HOME、在 Windows 上读取 USERPROFILE，两者都指向夹具目录。
  const priorPosixHome = process.env.HOME;
  const priorPath = process.env.PATH;
  try {
    const root = join(f.directory, ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh");
    await mkdir(join(root, "lib"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "@deepseek-ai/dsh",
        version: "1.2.3",
        bin: { dsh: "lib/bin.js" },
      }),
    );
    await writeFile(join(root, "lib", "bin.js"), "console.log('fixture 1.2.3')");
    process.env.USERPROFILE = f.directory;
    process.env.HOME = f.directory;
    process.env.PATH = f.directory;
    const resolved = await resolveExecutable("deepseek-harness");
    assert.equal(resolved.path, await realpath(join(root, "lib", "bin.js")));
    assert.deepEqual(resolved.args, [resolved.path]);
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "unrelated",
        version: "1.2.3",
        bin: { dsh: "lib/bin.js" },
      }),
    );
    await assert.rejects(resolveExecutable("deepseek-harness"), /未安装/);
  } finally {
    if (priorHome === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = priorHome;
    if (priorPosixHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorPosixHome;
    if (priorPath === undefined) delete process.env.PATH;
    else process.env.PATH = priorPath;
    await f.close();
  }
});
