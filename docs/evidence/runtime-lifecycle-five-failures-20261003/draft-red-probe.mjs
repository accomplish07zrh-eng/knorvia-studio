import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  hash = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => fs.readFile(new URL(p, core), "utf8");
const baselines = {
    "background-notifications": "5b25e8078582481e7b9dc5062666761175b3d7016935508bd67f6aac16302378",
    hooks: "5fad4e0da8d5094fc9f6bfc4ef62a0824a07a93790926ec526c474c9eac02bc4",
    "title-generation-sidecar": "d442adbe18ab5cf8e11369319bba1fa364b413bc94e55aa675291f616d77294f",
    "session-title": "b9d3677033700714a8c06b6fe1183e2767988c0770b9d7e19572b657b9aad536",
    "workspace-generate-text": "59b4bc9bbff157c26cff543ac35d25a034addebf69304351a1610debda7a8d62",
  },
  old = {},
  urls = {};
const data = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64");
for (const [n, pin] of Object.entries(baselines)) {
  const text = await read("test/runtime-" + n + "-baseline-20261003.json");
  assert.equal(hash(text), pin);
  const f = JSON.parse(text).files[n];
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  const bind = (s) =>
    s.replace(
      /from "([^"]+)"/gu,
      (_, p) =>
        `from ${JSON.stringify(p.startsWith(".") ? (urls[p.replace("./", "").replace(".js", "")] ?? new URL("dist/runtime/methods/" + p, core).href) : import.meta.resolve(p))}`,
    );
  urls[n] = data(bind(f.compiled));
  old[n] = await import(urls[n]);
}
async function regressions(o){
const reads=[],trace={traceId:'owned'},attachment={get path(){reads.push('path');return 'owned'},get type(){reads.push('type');return 'text'}};
await o.hooks.runUserPromptSubmitHooks.call({config:{},workingDirectory:'owned',getMode:()=> 'build',sessionId:'owned',hookRunner:{async run(){return{additionalContexts:[]}}}},'Owned',[attachment],trace);
const calls=[],runtime={sessionTitleGenerationAttempted:false,config:{titleGeneration:{}},sessionStore:{async getSession(){return null}},turnNumber:0,agentTelemetry:{captureCausation(){return undefined}},trackResidencyBlockingWork(work){calls.push('track');return{catch(){calls.push('tracked-catch')}}}};
assert.equal(o['session-title'].maybeStartSessionTitleGeneration.call(runtime,'Owned title seed','owned',trace),true);
return{reads,calls};}
const draft={};
for(const n of ['hooks','session-title']){const code=await fs.readFile('/tmp/knorvia-runtime-lifecycle-five-20261003/'+n+'-draft.js','utf8');const bind=s=>s.replace(/from "([^"]+)"/gu,(_,p)=>`from ${JSON.stringify(p.startsWith('.')?new URL('dist/runtime/methods/'+p,core).href:import.meta.resolve(p))}`);draft[n]=await import(data(bind(code)));}
const baseline=await regressions(old),candidate=await regressions(draft);console.log(JSON.stringify({baseline,candidate}));assert.deepEqual(candidate,baseline);
