// Body-free declaration/static data extraction, no dependency runtime or project compilation.
const fs = require('fs'), crypto = require('crypto');
const ts = require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const dir = 'docs/evidence/core-prompt-attachment-owner-packet-20261003';
const r = JSON.parse(fs.readFileSync(dir + '/reservation.json'));
const all = new Map(), printer = ts.createPrinter({ removeComments: true });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const bind = (path, b) => ({ path, bytes: b.length, sha256: hash(b) });
function parse(file) {
  if (all.has(file)) return all.get(file);
  const b = fs.readFileSync(file), d = ts.transpileDeclaration(b.toString(), { fileName: file, compilerOptions: { removeComments: true } });
  const p = { b, src: ts.createSourceFile(file, b.toString(), ts.ScriptTarget.Latest, true), decl: ts.createSourceFile(file + '.d.ts', d.outputText, ts.ScriptTarget.Latest, true), output: d.outputText, diagnostics: (d.diagnostics ?? []).map(x => ({ code: x.code, message: ts.flattenDiagnosticMessageText(x.messageText, '\n') })) };
  all.set(file, p); return p;
}
function selected(file, names) {
  const p = parse(file), nodes = new Map(p.decl.statements.filter(n => n.name).map(n => [n.name.text, n])), keep = new Set(names);
  function visit(name) {
    const node = nodes.get(name); if (!node) throw Error('Missing public declaration ' + name);
    function walk(t) { const ref = ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) ? t.typeName.text : undefined; if (ref && nodes.has(ref) && !keep.has(ref)) { keep.add(ref); visit(ref); } ts.forEachChild(t, walk); }
    walk(node);
  }
  for (const name of names) visit(name);
  return '// Original public type owner: ' + file + '\n' + p.decl.statements.filter(n => ts.isImportDeclaration(n) || keep.has(n.name?.text)).map(n => printer.printNode(ts.EmitHint.Unspecified, n, p.decl)).join('\n') + '\n';
}
const source = r.selectedSource.path, p = parse(source), out = dir + '/attachment';
if (hash(p.b) !== r.selectedSource.sha256) throw Error('Reserved source changed');
fs.writeFileSync(out + '/public-api.d.ts', p.output);
fs.writeFileSync(out + '/public-shapes.d.ts', selected('apps/cli/packages/contracts/src/model/index.ts', ['ModelMessageContentBlock']) + '\n' + selected('apps/cli/packages/contracts/src/tools/read.ts', ['ReadTextOutput']));
const readPort = selected('apps/cli/packages/core/src/tool/handlers/read-text.ts', ['formatReadTextOutput']);
const sourcePort = parse('apps/cli/packages/core/src/system-reminder/source.ts').output;
fs.writeFileSync(out + '/dependency-api.d.ts', readPort + '\n// Original source-wrapper public declarations (no descriptor implementation table).\n' + sourcePort);
const readContracts = parse('apps/cli/packages/contracts/src/tools/read.ts');
const value = readContracts.src.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(readContracts.src) === 'READ_DEFAULT_MAX_LINES'));
fs.writeFileSync(out + '/dependency-data.json', JSON.stringify({ READ_DEFAULT_MAX_LINES: Number(value.declarationList.declarations[0].initializer.getText(readContracts.src).replaceAll('_', '')), qualification: 'Exact original public constant data only; no dependency execution.' }, null, 2) + '\n');
fs.writeFileSync(out + '/imports.json', JSON.stringify(p.src.statements.filter(ts.isImportDeclaration).map(n => ({ module: n.moduleSpecifier.text, clause: n.importClause?.getText(p.src) })), null, 2) + '\n');
const strings = [], regex = [], numericLiterals = []; let ordinal = 0;
function walk(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) strings.push({ kind: 'text', text: n.text });
  else if (ts.isTemplateExpression(n)) strings.push({ kind: 'template', head: n.head.text, spans: n.templateSpans.map(s => ({ placeholder: 'VALUE_' + (++ordinal), text: s.literal.text })) });
  else if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) regex.push(n.getText(p.src));
  else if (ts.isNumericLiteral(n)) numericLiterals.push(n.text);
  ts.forEachChild(n, walk);
}
walk(p.src);
fs.writeFileSync(out + '/output-data.json', JSON.stringify({ strings, regex, numericLiterals, qualification: 'Required protocol/prompt/template/regex/numeric/static data retained honestly; generic placeholders omit private expression identities, no predecessor helper names/bodies/decomposition.' }, null, 2) + '\n');
const boundaries = [...all].filter(([file]) => file !== source).map(([file, x]) => bind(file, x.b));
for (const file of ['apps/cli/packages/core/src/system-reminder/incoming-message.ts', 'apps/cli/packages/core/package.json', 'pnpm-lock.yaml']) boundaries.push(bind(file, fs.readFileSync(file)));
fs.writeFileSync(dir + '/untouched-boundary-bindings.json', JSON.stringify(boundaries, null, 2) + '\n');
fs.writeFileSync(dir + '/public-extraction-record.json', JSON.stringify({ typescript: ts.version, mechanicalDeclarations: [...all].map(([file, x]) => ({ ...bind(file, x.b), diagnostics: x.diagnostics })), qualification: 'Source-exposed curator mechanically strips public declaration/static data, no semantic/project compilation or dependency execution. Prior source/tool/dependency exposure and repaired scratch-write breach remain; instruction-only/no OS access audit.' }, null, 2) + '\n');
console.log(JSON.stringify({ target: source, diagnostics: p.diagnostics, boundaries: boundaries.length }));
