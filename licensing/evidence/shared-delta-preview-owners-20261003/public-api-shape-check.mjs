import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from '/workspace/knorvia-studio/node_modules/typescript/lib/typescript.js';
const names=['protocol-v4/apply','protocol-v4/coalesce','streaming-tool-input-preview','tool-call-summary','permission-request-preview'];
const printer=ts.createPrinter({removeComments:true});
const has=(node,kind)=>node.modifiers?.some(m=>m.kind===kind)??false;
function shape(file){
 const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const txt=node=>node&&ts.isNumericLiteral(node)?String(Number(node.text)):node?printer.printNode(ts.EmitHint.Unspecified,node,sf).replace(/\s/g,'').replace(/'/g,'"'):null;
 function type(node){
  if(!node)return null;
  if(ts.isFunctionTypeNode(node))return {function:signature(node)};
  if(ts.isTypeLiteralNode(node))return {members:node.members.map(member)};
  if(ts.isUnionTypeNode(node))return {union:node.types.map(type)};
  if(ts.isTypeReferenceNode(node))return {ref:txt(node.typeName),args:node.typeArguments?.map(type)??[]};
  if(ts.isArrayTypeNode(node))return {array:type(node.elementType)};
  return txt(node);
 }
 const generics=node=>node.typeParameters?.map(p=>({name:txt(p.name),constraint:type(p.constraint),default:type(p.default)}))??[];
 const params=node=>node.parameters.map(p=>({type:type(p.type),optional:!!p.questionToken||!!p.initializer,rest:!!p.dotDotDotToken}));
 function signature(node){return {generics:generics(node),params:params(node),return:type(node.type)};}
 const inferred={onMessage:{ref:'Event',args:[{ref:'VSBuffer',args:[]}]},onFlowState:{ref:'Event',args:[{ref:'MessagePortFlowState',args:[]}]},event:{ref:'Event',args:[{ref:'T',args:[]}]}};
 function member(node){
  const base={name:txt(node.name),static:has(node,ts.SyntaxKind.StaticKeyword)};
  if(ts.isConstructorDeclaration(node))return {constructor:params(node),private:has(node,ts.SyntaxKind.PrivateKeyword)};
  if(ts.isMethodDeclaration(node)||ts.isMethodSignature(node))return {...base,method:signature(node),optional:!!node.questionToken};
  if(ts.isGetAccessorDeclaration(node))return {...base,get:type(node.type)};
  if(ts.isSetAccessorDeclaration(node))return {...base,set:params(node)};
  return {...base,readonly:has(node,ts.SyntaxKind.ReadonlyKeyword),optional:!!node.questionToken,type:type(node.type)??inferred[txt(node.name)]??null};
 }
 function decl(node){
  const name=txt(node.name);
  if(ts.isClassDeclaration(node)){
   const members=node.members.filter(n=>!has(n,ts.SyntaxKind.PrivateKeyword)||ts.isConstructorDeclaration(n)).map(member);
   for(const ctor of node.members.filter(ts.isConstructorDeclaration))for(const p of ctor.parameters)if(has(p,ts.SyntaxKind.PublicKeyword))members.push({name:txt(p.name),static:false,readonly:has(p,ts.SyntaxKind.ReadonlyKeyword),optional:!!p.questionToken,type:type(p.type)});
   return {name,class:true,generics:generics(node),heritage:node.heritageClauses?.map(txt)??[],members:members.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
  }
  if(ts.isInterfaceDeclaration(node))return {name,interface:true,generics:generics(node),heritage:node.heritageClauses?.map(txt)??[],members:node.members.map(member)};
  if(ts.isFunctionDeclaration(node))return {name,function:signature(node)};
  if(ts.isTypeAliasDeclaration(node))return {name,generics:generics(node),alias:type(node.type)};
  if(ts.isModuleDeclaration(node))return {name,namespace:node.body.statements.filter(n=>has(n,ts.SyntaxKind.ExportKeyword)).map(decl)};
  if(ts.isEnumDeclaration(node))return {name,enum:node.members.map(n=>[txt(n.name),txt(n.initializer)])};
  if(ts.isVariableStatement(node))return {vars:node.declarationList.declarations.map(n=>[txt(n.name),type(n.type),n.type?null:txt(n.initializer)])};
  throw new Error('Unsupported API declaration');
 }
 return sf.statements.filter(n=>has(n,ts.SyntaxKind.ExportKeyword)).map(decl).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
for(const name of names){
 const baseline=shape(`/tmp/knorvia-shared-delta-preview-baseline/${name}.ts`),candidate=shape(`/workspace/knorvia-studio/packages/shared/src/${name}.ts`);
 assert.deepEqual(candidate,baseline,`${name} API shape changed`);
 console.log(`${name}.ts: exported declarations and public member/type shapes match; parameter identifiers and private state excluded`);
}
console.log('AST-only shape comparison; no semantic typecheck or declaration emit.');
