// Exact-byte installation bindings reuse completed scoped review; no runtime replay.
const fs=require('fs'),crypto=require('crypto'),cp=require('child_process');
const packet='docs/evidence/core-hydration-owner-packet-20261003',review='docs/evidence/core-hydration-owner-review-20261003';
const manifest=JSON.parse(fs.readFileSync(packet+'/curator-input-manifest.json'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const bind=p=>{const b=fs.readFileSync(p);return{path:p,bytes:b.length,lines:b.toString().split('\n').length-Number(b.at(-1)===10),sha256:hash(b)};};
const targets=[];
for(const [s,scope] of [['media','media-v2'],['history','history-v2']]){
  const r=manifest.scopes[scope],archive=packet+'/'+scope+'/'+r.source.split('/').at(-1)+'.txt',installed=bind(r.source),frozen=bind(archive);
  const staticPath=review+'/'+scope+'-static.json',dataPath=review+'/'+scope+'-retained-data.json',minimumPath=review+'/minimum-'+s+'-v2.json';
  const proofs=[staticPath,dataPath,minimumPath].map(p=>{const j=JSON.parse(fs.readFileSync(p));const sourceBound=p===staticPath?j.files.some(x=>x.target===r.source&&x.sha256===frozen.sha256&&x.bytes===frozen.bytes):p===dataPath?j.source.sha256===frozen.sha256&&j.source.bytes===frozen.bytes:j.bindings[s].sha256===frozen.sha256&&j.bindings[s].bytes===frozen.bytes;return{...bind(p),passed:j.passed,sourceBound,groups:j.groups?.length};});
  const inputs=r.inputs.map(x=>{const b=fs.readFileSync(x.path);return{path:x.path,unchanged:b.length===x.bytes&&hash(b)===x.sha256};});
  targets.push({scope,installed,frozen,exact:installed.bytes===frozen.bytes&&installed.sha256===frozen.sha256,below400:installed.lines<400,proofs,inputs});
}
const boundaries=JSON.parse(fs.readFileSync(packet+'/untouched-boundary-bindings.json')).map(x=>{const b=fs.readFileSync(x.path);return{path:x.path,unchanged:b.length===x.bytes&&hash(b)===x.sha256};});
const coreDiff=cp.execFileSync('git',['diff',manifest.baseline,'--name-only','--','apps/cli/packages/core/src'],{encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
const expectedDiff=targets.map(x=>x.installed.path).sort();
const originalArchives=[];
for(const [s,commit] of [['media','73d6e803'],['history','efeebc00']]){
  const a=JSON.parse(fs.readFileSync(packet+'/'+s+'/curator-draft-manifest.json'));
  for(const f of a.files){const p=packet+'/'+s+'/'+f.file,b=fs.readFileSync(p),prior=cp.execFileSync('git',['show',commit+':'+p]);originalArchives.push({...bind(p),frozenCommit:commit,unchanged:b.length===f.bytes&&hash(b)===f.sha256&&b.equals(prior)});}
}
const readState=bind('apps/cli/packages/core/src/agent/read-file-state-hydrator.ts');
const hold=JSON.parse(fs.readFileSync(packet+'/reservation.json')).holds[0];
const passed=targets.every(x=>x.exact&&x.below400&&x.proofs.every(p=>p.passed&&p.sourceBound)&&x.inputs.every(p=>p.unchanged))&&boundaries.every(x=>x.unchanged)&&JSON.stringify(coreDiff)===JSON.stringify(expectedDiff)&&originalArchives.every(x=>x.unchanged)&&readState.sha256===hold.localSha256;
console.log(JSON.stringify({baseline:manifest.baseline,targets,outsideBoundaries:{checked:boundaries.length,unchanged:boundaries.filter(x=>x.unchanged).length,failures:boundaries.filter(x=>!x.unchanged)},coreDiff,originalArchives,readStateHold:{local:readState,rootSha256:hold.rootSha256,rootEvidence:hold.rootEvidence,preservedDivergence:readState.sha256===hold.localSha256&&readState.sha256!==hold.rootSha256},distinctMinimumGroups:targets.flatMap(x=>x.proofs).reduce((n,x)=>n+(x.groups??0),0),passed,qualification:'Exact installed/archive/proof/input/outside-source bindings only; reuse final two media plus four history synthetic groups by exact source digests without replay. No project/semantic compile, suite/build/lint/business I/O/cross-lane source import. Original full drafts/receipts/failures retained. Source-exposed curator, instruction-only shared executor/no OS access audit; no separation/rights/material closure claim.'},null,2));if(!passed)process.exitCode=1;
