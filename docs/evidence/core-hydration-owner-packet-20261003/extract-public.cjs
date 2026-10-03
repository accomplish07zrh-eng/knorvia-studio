// Metadata/public-declaration extraction only; no dependency execution or project compile.
const fs = require('fs'), crypto = require('crypto'), cp = require('child_process');
const ts = require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const dir = 'docs/evidence/core-hydration-owner-packet-20261003';
const baseline = 'f9bd59f6bad64590e6d854ddff62fbebd20a841c';
const targets = {
  media: ['apps/cli/packages/core/src/agent/file-part-hydration.ts', 'a90fe7f601a845ef1c603ce8a71552ffb458d71033cc1379420293e453b42cdc'],
  history: ['apps/cli/packages/core/src/agent/session-history-hydrator.ts', '20268df4afac2cf7f05cf41724709431f8fb8538057920bef08b6faf7c2c6a0d'],
};
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const bind = (path, b) => ({ path, bytes: b.length, lines: b.toString().split('\n').length - Number(b.at(-1) === 10), sha256: hash(b) });
const parsed = new Map(), printer = ts.createPrinter({ removeComments: true });
function parse(file) {
  if (parsed.has(file)) return parsed.get(file);
  const b = fs.readFileSync(file), d = ts.transpileDeclaration(b.toString(), { fileName: file, compilerOptions: { removeComments: true } });
  const p = { b, src: ts.createSourceFile(file, b.toString(), ts.ScriptTarget.Latest, true), decl: ts.createSourceFile(file + '.d.ts', d.outputText, ts.ScriptTarget.Latest, true), output: d.outputText, diagnostics: (d.diagnostics ?? []).map(x => ({ code: x.code, message: ts.flattenDiagnosticMessageText(x.messageText, '\n') })) };
  parsed.set(file, p); return p;
}
function selected(file, names) {
  const p = parse(file), nodes = new Map(p.decl.statements.filter(n => n.name).map(n => [n.name.text, n])), keep = new Set(names);
  function visit(name) {
    const n = nodes.get(name); if (!n) throw Error('Missing declaration ' + name);
    function walk(t) { const ref = ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) ? t.typeName.text : undefined; if (ref && nodes.has(ref) && !keep.has(ref)) { keep.add(ref); visit(ref); } ts.forEachChild(t, walk); }
    walk(n);
  }
  for (const name of names) visit(name);
  return '// Original public port/type owner: ' + file + '\n' + p.decl.statements.filter(n => ts.isImportDeclaration(n) || keep.has(n.name?.text)).map(n => printer.printNode(ts.EmitHint.Unspecified, n, p.decl)).join('\n') + '\n';
}
const model = 'apps/cli/packages/contracts/src/model/index.ts';
const session = 'apps/cli/packages/contracts/src/interfaces/session-store.port.ts';
const artifact = 'apps/cli/packages/contracts/src/interfaces/tool-artifact-store.port.ts';
const history = 'apps/cli/packages/core/src/agent/message-history.ts';
const modelShapes = selected(model, ['AttachmentRef', 'ModelMessageContent', 'ModelMessageContentBlock', 'ModelReasoningContentBlock']);
const mediaShapes = modelShapes + '\n' + selected(session, ['FilePart']) + '\n' + selected(artifact, ['ToolArtifactStorePort']);
const historyShapes = modelShapes + '\n' + selected(session, ['MessageWithParts', 'MessagePart', 'ToolPart', 'FilePart']) + '\n' + selected(artifact, ['ToolArtifactStorePort']) + '\n' + selected('apps/cli/packages/contracts/src/interfaces/shared.ts', ['MessageId']);
const dependencies = {
  media: selected('packages/shared/src/artifact-uri.ts', ['isArtifactUri']),
  history: [
    selected(model, ['modelMessageContentToText']),
    selected('apps/cli/packages/contracts/src/rewind/index.ts', ['selectActiveConversationBranch']),
    selected(history, ['MessageHistory', 'RuntimeMessageEntry', 'RuntimeMessageMetadata', 'RuntimeMessageSource', 'ToolCallInput', 'isKnownSystemReminderSource', 'legacySyntheticRuntimeMetadata', 'realUserRuntimeMetadata', 'systemReminderAttachmentEntry', 'systemReminderRuntimeMetadata', 'todoReminderRuntimeMetadata']),
    selected('apps/cli/packages/core/src/agent/runtime-input-presentation.ts', ['runtimeInputMetadata']),
    selected('apps/cli/packages/core/src/agent/message-history-usage.ts', ['persistedTokenUsageBaseline']),
    selected('apps/cli/packages/core/src/agent/compact-session.ts', ['compactActiveSessionMessages', 'isActiveCompactionBoundaryPart']),
    selected('apps/cli/packages/core/src/agent/tool-part-order.ts', ['selectToolPartsForHistory']),
    selected('apps/cli/packages/core/src/system-reminder/source.ts', ['SystemReminderSource', 'getSystemReminderDescriptor', 'wrapSystemReminderForSource']),
    selected('apps/cli/packages/core/src/system-reminder/prompt-attachment.ts', ['PromptAttachmentReminderInput', 'buildPromptAttachmentReminderBodies']),
    parse(targets.media[0]).output,
  ].join('\n'),
};
const scopes = {};
for (const [scope, [file, expected]] of Object.entries(targets)) {
  const p = parse(file); if (hash(p.b) !== expected) throw Error('Root allocation digest mismatch: ' + file);
  const out = dir + '/' + scope; fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(out + '/public-api.d.ts', p.output);
  fs.writeFileSync(out + '/public-shapes.d.ts', scope === 'media' ? mediaShapes : historyShapes);
  fs.writeFileSync(out + '/dependency-api.d.ts', dependencies[scope]);
  fs.writeFileSync(out + '/imports.json', JSON.stringify(p.src.statements.filter(ts.isImportDeclaration).map(n => ({ module: n.moduleSpecifier.text, clause: n.importClause?.getText(p.src) })), null, 2) + '\n');
  const strings = [], patterns = []; let ordinal = 0;
  function walk(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) strings.push({ kind: 'text', text: n.text });
    else if (ts.isTemplateExpression(n)) strings.push({ kind: 'template', head: n.head.text, spans: n.templateSpans.map(s => ({ placeholder: 'VALUE_' + (++ordinal), text: s.literal.text })) });
    else if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) patterns.push(n.getText(p.src));
    ts.forEachChild(n, walk);
  }
  walk(p.src);
  fs.writeFileSync(out + '/output-data.json', JSON.stringify({ strings, patterns, qualification: 'Exact source-derived required protocol/text/template/pattern material; generic template placeholders omit predecessor expressions/helper identities. Native language type-guard and import literals appear as retained data, not mandatory output literals. No predecessor bodies/decomposition supplied.' }, null, 2) + '\n');
  scopes[scope] = { source: file, original: bind(file, p.b), inputs: [] };
}
const coreFiles = cp.execFileSync('git', ['ls-files', 'apps/cli/packages/core/src'], { encoding: 'utf8' }).trim().split('\n').filter(p => p.endsWith('.ts'));
const outside = new Set([...coreFiles.filter(p => !Object.values(targets).some(([f]) => f === p)), ...parsed.keys()].filter(p => !Object.values(targets).some(([f]) => f === p)));
for (const p of ['apps/cli/packages/core/package.json', 'pnpm-lock.yaml']) outside.add(p);
fs.writeFileSync(dir + '/untouched-boundary-bindings.json', JSON.stringify([...outside].map(p => bind(p, fs.readFileSync(p))), null, 2) + '\n');
fs.writeFileSync(dir + '/public-extraction-record.json', JSON.stringify({ typescript: ts.version, declarations: [...parsed].map(([p, x]) => ({ ...bind(p, x.b), diagnostics: x.diagnostics })), metadataOnlyOutsideCoreFiles: coreFiles.length - 2, qualification: 'Full target bodies read by source-exposed curator before author inputs; full runtime-input-presentation.ts, first115 message-history.ts lines and full installed prompt-attachment.ts incidentally displayed during public-port discovery. Branch selector first25 implementation lines incidentally displayed to discover its public signature. Public model type slice incidentally included first2 modelMessageContentToText body lines. Initial shared path discovery used nonexistent apps/cli/packages/shared/src; corrected via metadata search to packages/shared/src/artifact-uri.ts before extraction. Other listed declarations mechanically extracted from full bytes without dependency execution/body display. All outside core bytes hashed for immutability only. Earlier source/tool/dependency exposure and repaired scratch-write breach remain. Shared executor instruction-only; no OS isolation/audit or rights claim. Ordinary/semantic checks deferred; prior missing-TypeScript architecture failure retained, not repeated.' }, null, 2) + '\n');
fs.writeFileSync(dir + '/reservation.json', JSON.stringify({ baseline, scopes, allocation: 'Root explicitly allocates exactly media and session-history owners at these hashes; A owns model/turn runtime. No other owner allocated.', holds: [{ path: 'apps/cli/packages/core/src/agent/read-file-state-hydrator.ts', localSha256: hash(fs.readFileSync('apps/cli/packages/core/src/agent/read-file-state-hydrator.ts')), rootSha256: '5acb4ca49c0fa4a42a4f057b4e475b67ac67175e0c0d7aec9f29d4eab23a3466', rootEvidence: 'licensing/evidence/read-state-hydration-20260930.json', decision: 'Preserve divergence for final combination; no reauthor/root source import.' }, { path: 'apps/cli/packages/core/src/runtime-task/registry.ts', decision: 'Held pending root historical receipt review; not authorized.' }], materialObligationsOpen: 21, ordinaryChecksDeferred: true }, null, 2) + '\n');
console.log(JSON.stringify({ scopes: Object.keys(scopes), outsideBindings: outside.size, diagnostics: Object.fromEntries(Object.entries(targets).map(([s, [p]]) => [s, parse(p).diagnostics])) }));
