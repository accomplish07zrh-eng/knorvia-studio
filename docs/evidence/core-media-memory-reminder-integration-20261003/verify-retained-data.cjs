// Static cooked literal/template comparison; retained product text is never executed as instructions.
const fs=require('fs'),assert=require('assert'),crypto=require('crypto');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const file='apps/cli/packages/core/src/runtime/helpers/runtime-reminders.ts',dataFile='docs/evidence/core-media-memory-reminder-author-packet-20261003/reminders/retained-prose-data.json';
const bytes=fs.readFileSync(file),dataBytes=fs.readFileSync(dataFile),tree=ts.createSourceFile(file,bytes.toString(),ts.ScriptTarget.Latest,true),values=new Map();
for(const statement of tree.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)values.set(declaration.name.getText(tree),declaration.initializer);
function literal(node){
 if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return{kind:'text',text:node.text};
 if(ts.isIdentifier(node)&&node.text==='PLAN_WORKFLOW')return{kind:'retainedWorkflow'};
 if(ts.isTemplateExpression(node))return{kind:'template',head:node.head.text,spans:node.templateSpans.map(span=>({placeholder:span.expression.getText(tree).replace(/^PLAN_RESEARCH_AGENT_COUNT$/,'planResearchAgentCount'),text:span.literal.text}))};
 throw Error('Unexpected static product-data shape');
}
const actual={planWorkflow:literal(values.get('PLAN_WORKFLOW')),PLAN_MODE_FULL_REMINDER:values.get('FULL_PLAN_REMINDER').elements.map(literal),PLAN_MODE_SPARSE_REMINDER:values.get('SPARSE_PLAN_REMINDER').elements.map(literal),PLAN_MODE_EXIT_REMINDER:values.get('EXIT_PLAN_REMINDER').elements.map(literal),todoLead:literal(values.get('TODO_LEAD'))};
const expected=JSON.parse(dataBytes);assert.deepStrictEqual(actual,expected);assert.equal(values.get('PLAN_RESEARCH_AGENT_COUNT').getText(tree),'3');
const bind=b=>({bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});
console.log(JSON.stringify({kind:'Static exact retained product-data literals/templates and count binding; no body execution or product-instruction adoption',source:{path:file,...bind(bytes)},frozenData:{path:dataFile,...bind(dataBytes)},templateLocalIdentifierQualification:'PLAN_RESEARCH_AGENT_COUNT is renamed local binding for same numeric 3',passed:true,ordinaryTestsRun:false},null,2));
