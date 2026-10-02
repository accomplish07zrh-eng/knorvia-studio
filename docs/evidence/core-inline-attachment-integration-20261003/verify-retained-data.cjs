// Static retained protocol/MIME/template/regex data review, not behavior or novelty proof.
const fs=require('fs'),crypto=require('crypto'),ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const p='docs/evidence/core-inline-attachment-owner-packet-20261003',m=JSON.parse(fs.readFileSync(p+'/curator-input-manifest.json')),results=[];
for(const [scope,r]of Object.entries(m.scopes)){
 const source=fs.readFileSync(p+'/'+scope+'/'+r.source.split('/').at(-1)+'.txt'),t=ts.createSourceFile(r.source,source.toString(),ts.ScriptTarget.Latest,true),strings=[],regex=[],numbers=[];
 function walk(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))strings.push({kind:'text',text:n.text});else if(ts.isTemplateExpression(n))strings.push({kind:'template',head:n.head.text,spans:n.templateSpans.map(s=>({placeholder:s.expression.getText(t),text:s.literal.text}))});else if(n.kind===ts.SyntaxKind.RegularExpressionLiteral)regex.push(n.getText(t));else if(ts.isNumericLiteral(n))numbers.push(n.text);ts.forEachChild(n,walk);}walk(t);
 const expected=JSON.parse(fs.readFileSync(p+'/'+scope+'/output-data.json')),canon=x=>JSON.stringify(x),has=(xs,x)=>xs.some(v=>canon(v)===canon(x));
 const requiredStringsRetained=expected.strings.every(x=>has(strings,x)),requiredRegexRetained=expected.regex.every(x=>regex.includes(x)),requiredNumericDataRetained=expected.numericLiterals.every(x=>numbers.includes(x));
 results.push({scope,source:{bytes:source.length,sha256:crypto.createHash('sha256').update(source).digest('hex')},requiredStringsRetained,requiredRegexRetained,requiredNumericDataRetained,strings,regex,numbers,passed:requiredStringsRetained&&requiredRegexRetained&&requiredNumericDataRetained});
}
const passed=results.every(x=>x.passed);console.log(JSON.stringify({kind:'Static retained literal/template/regex/numeric-data set containment, not evaluation/semantics/novelty or grant',results,passed},null,2));if(!passed)process.exitCode=1;
