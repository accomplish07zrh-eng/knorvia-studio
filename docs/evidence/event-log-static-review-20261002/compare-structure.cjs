// Static source comparison only. Does not execute or install either owner.
const fs = require('node:fs');
const crypto = require('node:crypto');
const ts = require(process.argv[2]);
const sourcePath = 'apps/cli/packages/core/src/workflow/scheduler/events.ts';
const draftPath = 'docs/evidence/event-log-author-packet-20261002/draft-events.ts.txt';
const aliases = new Map([['#eventPort', 'appendEvent'], ['#graphPort', 'appendGraphRecord'], ['#clock', 'now'], ['#observer', 'onWorkflowEvent']]);
const printer = ts.createPrinter({removeComments: true, newLine: ts.NewLineKind.LineFeed});
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function inspect(path, normalizeEdgeCallback) {
  const data = fs.readFileSync(path);
  const tree = ts.createSourceFile(path + '.ts', data.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const transform = context => root => ts.visitNode(root, function visit(node) {
    if (ts.isPrivateIdentifier(node) && aliases.has(node.text)) return ts.factory.createIdentifier(aliases.get(node.text));
    if (normalizeEdgeCallback && ts.isArrowFunction(node) && node.parameters.length === 1 && node.parameters[0].name.getText(tree) === 'edge' && ts.isCallExpression(node.body) && node.body.expression.getText(tree) === 'edgeId' && node.body.arguments.length === 1 && node.body.arguments[0].getText(tree) === 'edge') return ts.factory.createIdentifier('edgeId');
    return ts.visitEachChild(node, visit, context);
  });
  const transformed = ts.transform(tree, [transform]);
  const owner = transformed.transformed[0].statements.find(node => ts.isClassDeclaration(node));
  const methods = Object.fromEntries(owner.members.filter(member => member.body).map(member => [ts.isConstructorDeclaration(member) ? 'constructor' : member.name.getText(tree), printer.printNode(ts.EmitHint.Unspecified, member.body, tree)]));
  transformed.dispose();
  return {path, bytes: data.length, sha256: hash(data), methods};
}
const baseline = inspect(sourcePath, false), draft = inspect(draftPath, false), adaptedDraft = inspect(draftPath, true);
const results = Object.keys(baseline.methods).map(name => ({method: name, afterOnlyPrivateStorageAliasesEqual: baseline.methods[name] === draft.methods[name], afterAlsoEquivalentCurrentEdgeCallbackEqual: baseline.methods[name] === adaptedDraft.methods[name], baselineNormalizedBodySha256: hash(baseline.methods[name]), draftPrivateAliasNormalizedBodySha256: hash(draft.methods[name])}));
console.log(JSON.stringify({kind:'static expression comparison, not runtime acceptance',typescript:ts.version,baseline:{path:baseline.path,bytes:baseline.bytes,sha256:baseline.sha256},draft:{path:draft.path,bytes:draft.bytes,sha256:draft.sha256},normalizations:['TypeScript printer removes formatting/comments','Only draft private-storage accesses renamed to corresponding baseline property names','Separately compare edge => edgeId(edge) with edgeId; current dependency consumes only its first argument, but this does not claim arbitrary replacement-callback equivalence'],methods:results},null,2));
