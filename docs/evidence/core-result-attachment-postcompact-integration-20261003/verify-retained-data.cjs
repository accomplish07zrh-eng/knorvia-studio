// Static retained data comparison only; local interpolation identifier names may differ.
const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const packet='docs/evidence/core-result-attachment-postcompact-author-packet-20261003',manifest=JSON.parse(fs.readFileSync(packet+'/curator-input-manifest.json')),results=[];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [scope,record]of Object.entries(manifest.scopes)){
 const b=fs.readFileSync(record.source),dataBytes=fs.readFileSync(`${packet}/${scope}/output-data.json`),data=JSON.parse(dataBytes),tree=ts.createSourceFile(record.source,b.toString(),ts.ScriptTarget.Latest,true),strings=[],templates=[],regex=[];
 function walk(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))strings.push(n.text);else if(ts.isTemplateExpression(n))templates.push({head:n.head.text,spans:n.templateSpans.map(s=>s.literal.text)});else if(n.kind===ts.SyntaxKind.RegularExpressionLiteral)regex.push(n.getText(tree));ts.forEachChild(n,walk)}walk(tree);
 const productStrings=data.strings.filter(s=>s.kind==='text'&&s.text.length>30&&!s.text.startsWith('.')).map(s=>s.text),productTemplates=data.strings.filter(s=>s.kind==='template').map(s=>({head:s.head,spans:s.spans.map(s=>s.text)}));
 assert(productStrings.every(s=>strings.includes(s)),'Missing retained product prose '+scope);assert(productTemplates.every(t=>templates.some(candidate=>JSON.stringify(candidate)===JSON.stringify(t))),'Missing retained literal template pieces '+scope);assert(data.regex.every(r=>regex.includes(r)),'Missing exact retained regex '+scope);
 results.push({scope,source:{path:record.source,bytes:b.length,sha256:hash(b)},data:{bytes:dataBytes.length,sha256:hash(dataBytes)},productTextCount:productStrings.length,templateCount:productTemplates.length,regexCount:data.regex.length,passed:true});
}
console.log(JSON.stringify({kind:'Static exact retained prose/template literal pieces/regex data only; no owner execution or interpolation semantic claim',typescript:ts.version,results,passed:true,placeholderQualification:'Dynamic expression identity/evaluation assessed separately against contracts; names are not originality proof',ordinaryTestsRun:false},null,2));
