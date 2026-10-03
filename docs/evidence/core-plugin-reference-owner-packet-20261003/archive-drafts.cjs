// Freeze/archive complete originals before source review; no candidate execution.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir='docs/evidence/core-plugin-reference-owner-packet-20261003',m=JSON.parse(fs.readFileSync(dir+'/curator-input-manifest.json'));
for(const scope of process.argv.slice(2)){
const r=m.scopes[scope],names=[path.basename(r.source),'author-record.json'],actual=fs.readdirSync(r.scratch).sort();if(JSON.stringify(actual)!==JSON.stringify(names.slice().sort()))throw Error('Unexpected scratch outputs '+scope+': '+actual);
const files=[];fs.chmodSync(dir+'/'+scope,0o755);
for(const name of names){const p=r.scratch+'/'+name,b=fs.readFileSync(p),stat=fs.statSync(p);if(stat.mode&0o222)throw Error('Not frozen '+p);const archived=name==='author-record.json'?name:name+'.txt';if(fs.existsSync(dir+'/'+scope+'/'+archived))throw Error('Already archived '+scope);fs.writeFileSync(dir+'/'+scope+'/'+archived,b,{mode:0o444});files.push({file:archived,scratch:p,...(name==='author-record.json'?{}:{target:r.source}),bytes:b.length,lines:b.toString().split('\n').length-1,sha256:crypto.createHash('sha256').update(b).digest('hex'),mode:(stat.mode&0o777).toString(8)});}
fs.writeFileSync(dir+'/'+scope+'/curator-draft-manifest.json',JSON.stringify({scope,utc:new Date().toISOString(),files,qualification:'Complete original source/author record copied byte-exactly from frozen two-output scratch before source rendering/review. Author receipt self-report, shared executor instruction-only; no OS/access audit or separation/licence proof.'},null,2)+'\n',{mode:0o444});fs.chmodSync(dir+'/'+scope,0o555);console.log(JSON.stringify({scope,files}));
}
