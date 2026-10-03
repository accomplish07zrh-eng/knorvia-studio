import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  hash = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => fs.readFile(new URL(p, core), "utf8"),
  baselines = {
    background: "98f7010aa664a834bf79675d7ed83aa5ddd99955ee730d7558fd1241e59a594f",
    "model-status": "1589939e9229f7261046fa473f5be51ac38efeeffabc772b07ff6f13ded691e8",
    "usage-observability": "917c7909aabdd7753a4e3bd5744dea9b324c1b21cfa26982ccdc2c1dd3e13446",
  },
  old = {};
const data = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const bind = (s) =>
  s.replace(
    /from "([^"]+)"/gu,
    (_, p) =>
      `from ${JSON.stringify(p.startsWith(".") ? new URL("dist/runtime/methods/" + p, core).href : import.meta.resolve(p))}`,
  );
for (const [n, pin] of Object.entries(baselines)) {
  const t = await read("test/runtime-" + n + "-baseline-20261003.json");
  assert.equal(hash(t), pin);
  const f = JSON.parse(t).files[n];
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  old[n] = await import(data(bind(f.compiled)));
}
async function captureModelId(o){
 const rows=[],store={async recordModelUsage(row){rows.push(row)},async upsertTurnUsage(){},async upsertToolUsage(){},async pruneUsage(){}};
 const input={assistantMessageId:'owned-before',get querySource(){this.assistantMessageId='owned-after';return 'owned-query'},events:[],model:{providerId:'owned',modelId:'owned',options:{}},networkEventStartIndex:0,startedAt:10,status:'completed',traceContext:{traceId:'owned'}};
 await o['usage-observability'].recordModelUsageFact({sessionId:'owned',sessionStore:store,config:{}},input);
 return{modelId:rows[0].id,logicalRequestId:rows[0].logicalRequestId};
}
const code=await fs.readFile('/tmp/knorvia-runtime-attribution-three-20261003/usage-draft.js','utf8'); const draft={'usage-observability':await import(data(bind(code)))};const baseline=await captureModelId(old),candidate=await captureModelId(draft);console.log(JSON.stringify({baseline,candidate}));assert.deepEqual(candidate,baseline);
