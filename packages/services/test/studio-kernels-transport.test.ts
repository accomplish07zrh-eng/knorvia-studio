import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ProtocolProcess,
  deferred,
} from "../src/studio-runtime/adapters/kernels/processTransport.js";
import { probeErrorCode } from "../src/studio-runtime/adapters/kernels/probeResult.js";

const fixture = String.raw`
const readline = require('node:readline');
readline.createInterface({input:process.stdin}).on('line', line => {
 const message=JSON.parse(line);
 if(message.method==='long') setTimeout(()=>{
  const frame=Buffer.from(JSON.stringify({method:'text',params:{text:'你好🌍'}})+'\n');
  const cut=frame.indexOf(Buffer.from('🌍'))+2;
  process.stdout.write(frame.subarray(0,cut));
  setTimeout(()=>{ process.stdout.write(frame.subarray(cut)); process.stdout.write(JSON.stringify({id:message.id,result:{stopReason:'end_turn'}})+'\n'); },20);
 },40);
});
`;

test(
  "unbounded prompt request survives latency and fragmented Unicode, while handshake timeout remains bounded",
  { timeout: 5000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "knorvia-wire-"));
    const file = join(directory, "fixture.cjs");
    await writeFile(file, fixture);
    const received = deferred<Record<string, unknown>>();
    const transport = new ProtocolProcess(
      { command: process.execPath, args: [file], path: file },
      [],
      directory,
      "acp",
      (message) => {
        received.resolve(message);
      },
    );
    try {
      assert.equal((await transport.request("long", {}, 0)).stopReason, "end_turn");
      assert.deepEqual((await received.promise).params, { text: "你好🌍" });
      await assert.rejects(transport.request("never", {}, 25), /等待响应超时/);
      // 握手超时必须带稳定代码，分层探测据此记成 protocol.timeout 而不是普通失败。
      const timeout = await transport.request("never", {}, 25).catch((error: unknown) => error);
      assert.equal(probeErrorCode(timeout), "protocol.timeout");
    } finally {
      await transport.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "transport closes its own uncooperative process and never relies on a global process name",
  { timeout: 7000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "knorvia-owned-"));
    const file = join(directory, "fixture.cjs");
    await writeFile(file, "process.stdin.resume();setInterval(()=>{},1000);");
    const transport = new ProtocolProcess(
      { command: process.execPath, args: [file], path: file },
      [],
      directory,
      "acp",
      () => {},
    );
    try {
      const pid = transport.child.pid;
      assert.ok(pid);
      await transport.close();
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    } finally {
      await transport.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
