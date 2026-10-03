// Read only: parse bounded source bodies; no Program, emit, typecheck or product execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = process.cwd();
const temp = path.resolve(process.argv[2] || '/tmp/knorvia-services-provenance-five-20261003');
const upstream = (name) => path.join(temp, 'upstream-' + name + '.ts');
const current = (name) => path.join(root, 'packages/services/src/' + name);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
function body(file, name, range) {
  const text = fs.readFileSync(file, 'utf8');
  if (range) return { text: text.split('\n').slice(range[0]-1, range[1]).join('\n'), lines: range, fileSha256: hash(text) };
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found;
  function walk(node) {
    if (!found && node.name?.getText(tree) === name) {
      const value = node.body || node.initializer?.body;
      if (value) found = { node, value };
    }
    ts.forEachChild(node, walk);
  }
  walk(tree);
  if (!found) throw new Error('Cannot read named body ' + file + ':' + name);
  return { text: found.value.getText(tree), lines: [tree.getLineAndCharacterOfPosition(found.node.getStart(tree)).line+1, tree.getLineAndCharacterOfPosition(found.node.end).line+1], fileSha256: hash(text) };
}
function canonical(text, fragment) {
  const wrapped = 'async function source_read() ' + (fragment ? '{\n' + text + '\n}' : text);
  const tree = ts.createSourceFile('source-read.ts', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isBlock(node) && ts.isIfStatement(node.parent) && node.statements.length === 1) return visit(node.statements[0]);
    const children=[];
    ts.forEachChild(node, child => { children.push(visit(child)); });
    return children.length ? [ts.SyntaxKind[node.kind], children] : [ts.SyntaxKind[node.kind],node.getText(tree)];
  }
  return JSON.stringify(visit(tree.statements[0].body));
}
const projection = [
 ['taskIndexRepo','ports.repo'],['logger','ports.logger'],['emitWorkspaceTaskListChanged','ports.emit'],
 ['broadcastTargetFrom','broadcastTarget'],['resyncTaskIndexRowFromAgent','readback'],
];
const cases = [
 ['scope spelling',current('git/commitMessageFileScope.ts'),'scopeSpelling',upstream('commitMessageFileScope'),'normalizeCommitMessageScopePath',[]],
 ['conditional draft close',current('agent-session/sessionService.ts'),'closeDeferredDraftSession',upstream('sessionService'),'closeDeferredDraftSession',[['deferredDraftSessions','drafts']]],
 ['snapshot diagnostics',current('agent-session/sessionPreparation.ts'),'sessionSnapshotDiagnostics',upstream('sessionService'),'getSessionSnapshotDiagnostics',[['pendingRequestIds','pending']]],
 ['summary readback',current('agent/task-index-ingestion/sessionIndexProjection.ts'),'readback',upstream('taskIndexSyncer'),'resyncTaskIndexRowFromAgent',[['agentService','ports.agent'],['syncSnapshotAndBroadcast','ports.sync'],['logger','ports.logger']]],
 ['terminal projection',current('agent/task-index-ingestion/sessionIndexProjection.ts'),'complete',upstream('taskIndexSyncer'),'applyTerminalTransition',projection.concat([['emitTerminalAndReady','ports.terminal'],['resolveTerminalUnreadSignal','unread'],['summary','next']])],
 ['title projection',current('agent/task-index-ingestion/sessionIndexProjection.ts'),'titleChanged',upstream('taskIndexSyncer'),'applyTitleChange',projection],
 ['model-only projection',current('agent/task-index-ingestion/snapshotProjection.ts'),'model',upstream('taskIndexSyncer'),'syncTaskModel',[['taskIndexRepo','repo'],['normalizedModel','normalized']]],
 ['visible-content predicate',current('agent/task-index-ingestion/snapshotProjection.ts'),'visible',upstream('taskIndexSyncer'),'hasUserVisibleContent',[]],
 ['terminal unread predicate',current('agent/task-index-ingestion/sessionIndexProjection.ts'),'unread',upstream('taskIndexSyncer'),'resolveTerminalUnreadSignal',[]],
 ['lock wait fragment',current('session/tasksDatabase/startup.ts'),null,upstream('startup'),null,[['deadline','this.expiresAt'],['waiting','announced'],['resolve','resume']],[83,92],[58,66]],
];
const result=[];
for (const [label, cfile, cname, ufile, uname, identifiers, crange, urange] of cases) {
  const c=body(cfile,cname,crange), u=body(ufile,uname,urange);
  let adapted=u.text.replaceAll('ZCODE','KNORVIA').replaceAll('ZCode','Knorvia').replaceAll('zcode','agent');
  const expressions=[];
  if (label==='terminal projection') {
    adapted=adapted.replaceAll('options?.moveGroupedTaskToTop','moveToTop');
    expressions.push(['options?.moveGroupedTaskToTop','moveToTop']);
  }
  if (label==='lock wait fragment') {
    adapted=adapted.replaceAll('report("waiting_for_lock", migration)','this.blocked()');
    expressions.push(['report("waiting_for_lock", migration)','this.blocked()']);
  }
  for (const [before,after] of identifiers) adapted=adapted.replace(new RegExp('(?<![.\\w])'+before+'\\b','g'),after);
  const cc=canonical(c.text,Boolean(crange)), uc=canonical(adapted,Boolean(urange));
  result.push({label,current:{path:path.relative(root,cfile),name:cname,lines:c.lines,fileSha256:c.fileSha256,rawBodySha256:hash(c.text)},upstream:{path:path.basename(ufile),name:uname,lines:u.lines,fileSha256:u.fileSha256,rawBodySha256:hash(u.text)},explicitIdentifierMappings:identifiers,identifierMappingQualification:'Mappings apply to the named free/local references, excluding member names preceded by a dot; no property-field renaming.',explicitExpressionMappings:expressions,diagnosticBrandMapping:'ZCODE→KNORVIA; ZCode→Knorvia; zcode→agent (only bodies; logger tags for session)',comparisonIgnores:'comments/whitespace, NodeArray trailing commas, and only single-statement if/else block wrappers',normalizedBodyStructureEqual:cc===uc,currentCanonicalSha256:hash(cc),adaptedUpstreamCanonicalSha256:hash(uc),qualification:'Bounded source-structure correspondence after the listed adaptations. No independent-origin, behavioral or copyright/permission adjudication; no tests or typecheck.'});
}
fs.writeFileSync(path.join(temp,'residual-body-read.json'),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify(result.map(({label,current,upstream,normalizedBodyStructureEqual})=>({label,currentLines:current.lines,upstreamLines:upstream.lines,normalizedBodyStructureEqual})),null,2)+'\n');
