// Static declaration/data extraction only. Never evaluate desktop, settings, filesystem or Electron modules.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ts=require('/tmp/knorvia-exact-type-review-20261002/packages/typescript@6.0.2/package/lib/typescript.js');
const root='docs/evidence/desktop-startup-deeplink-root-packet-20261003';
const reservation=JSON.parse(fs.readFileSync(root+'/reservation.json'));
const printer=ts.createPrinter({removeComments:true}),records=[],imports={},data={};
const bind=(file,b)=>({path:file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});
function declaration(file){
 const b=fs.readFileSync(file),result=ts.transpileDeclaration(b.toString(),{fileName:file,compilerOptions:{removeComments:true}});
 records.push({...bind(file,b),diagnostics:(result.diagnostics??[]).map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}))});
 return{b,text:result.outputText,source:ts.createSourceFile(file,b.toString(),ts.ScriptTarget.Latest,true),decl:ts.createSourceFile(file+'.d.ts',result.outputText,ts.ScriptTarget.Latest,true)};
}
for(const target of reservation.targets){
 const {b,text,source}=declaration(target.path);if(bind(target.path,b).sha256!==target.sha256)throw Error('Target changed');
 fs.writeFileSync(`${root}/${path.basename(target.path,'.ts')}-public-api.d.ts`,text);
 imports[target.path]=source.statements.filter(ts.isImportDeclaration).map(n=>({module:n.moduleSpecifier.text,clause:n.importClause?.getText(source)}));
 const literals=[];function walk(n){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))literals.push({kind:'text',text:n.text});else if(ts.isTemplateExpression(n))literals.push({kind:'template',head:n.head.text,spans:n.templateSpans.map(s=>({placeholder:s.expression.getText(source),text:s.literal.text}))});ts.forEachChild(n,walk)}walk(source);data[target.path]=literals;
}
const selected={
 'packages/desktop/src/main/desktopDeepLinkUrl.ts':['isWorkspaceOpenUrl','extractWorkspaceOpenPath'],
 'packages/shared/src/workspaceSessionRestore.ts':['resolveStartupLocalWorkspaceSessionIndex'],
 'packages/shared/src/validation.ts':['formatZodError'],
 'packages/shared/src/workspacePurpose.ts':['WorkspacePurpose'],
 'packages/shared/src/protocol.ts':['Locale','LocalWorkspaceSessionEntry','RemoteWorkspaceSessionEntry','RemoteWorkspaceSessionSnapshot','PersistedWorkspaceSessionEntry','RemoteTargetSnapshot','SSHRemoteTargetSnapshot','WSLRemoteTargetSnapshot','DockerRemoteTargetSnapshot'],
};
let deps='// Body-free selected original declarations; not standalone compilation units.\n';
for(const [file,names]of Object.entries(selected)){
 const {decl}=declaration(file);deps+=`\n// Original owner ${file}\n`;
 for(const name of names){const node=decl.statements.find(n=>n.name?.text===name);if(!node)throw Error('Missing declaration '+name);deps+=printer.printNode(ts.EmitHint.Unspecified,node,decl)+'\n';}
}
deps+=`\n// Authoritative opaque modules, preserving imports and overloads rather than replacement implementations.\nimport type { RemoteAssetInstallMode } from "@knorvia/shared";\nimport type { RemoteResourcePackageSelection } from "@knorvia/shared";\nimport type { z } from "zod";\nexport declare const appSettingsSchema: typeof import("@knorvia/shared").appSettingsSchema;\nexport type StartupSettings = ReturnType<typeof appSettingsSchema.parse>;\nexport type StartupSettingsUsedFields = Pick<StartupSettings, "recentProjects" | "lastWorkspaceSession" | "lastActiveTabIndex">;\nexport declare const PlatformChannels: typeof import("@knorvia/shared").PlatformChannels;\nexport declare const desktopProfile: typeof import("../../../packages/desktop/src/main/desktopEarlyDataBaseDirBootstrap.js").desktopProfile;\nexport declare const app: typeof import("electron").app;\nexport declare const BrowserWindow: typeof import("electron").BrowserWindow;\nexport declare const dialog: typeof import("electron").dialog;\nexport type BrowserWindow = import("electron").BrowserWindow;\nexport type WebContents = import("electron").WebContents;\nexport declare const constants: typeof import("node:fs").constants;\nexport declare const statSync: typeof import("node:fs").statSync;\nexport declare const access: typeof import("node:fs/promises").access;\nexport declare const mkdir: typeof import("node:fs/promises").mkdir;\nexport declare const readFile: typeof import("node:fs/promises").readFile;\nexport declare const stat: typeof import("node:fs/promises").stat;\nexport declare const isAbsolute: typeof import("node:path").isAbsolute;\nexport declare const resolve: typeof import("node:path").resolve;\nexport declare const process: typeof globalThis.process;\n`;
fs.writeFileSync(root+'/dependency-api.d.ts',deps);
// Parse schema/early bootstrap/profile for selected declarative data/types only; no bodies printed/executed.
const settings=declaration('packages/shared/src/validationAppSettings.ts');
const schemaData={};
function scan(n){if(ts.isPropertyAssignment(n)&&['recentProjects','lastWorkspaceSession','lastActiveTabIndex'].includes(n.name.getText(settings.source))){const key=n.name.getText(settings.source);(schemaData[key]??=[]).push(n.initializer.getText(settings.source));}ts.forEachChild(n,scan)}scan(settings.source);
fs.writeFileSync(root+'/settings-schema-fields.json',JSON.stringify(schemaData,null,2)+'\n');
for(const file of ['packages/desktop/src/main/desktopEarlyDataBaseDirBootstrap.ts','packages/desktop/src/main/desktopProfile.ts','packages/shared/src/channels.ts','packages/shared/src/remoteAssetInstallMode.ts','packages/shared/src/remoteResourcePackages.ts'])declaration(file);
fs.writeFileSync(root+'/imports.json',JSON.stringify(imports,null,2)+'\n');
fs.writeFileSync(root+'/retained-literal-data.json',JSON.stringify(data,null,2)+'\n');
fs.writeFileSync(root+'/public-extraction-record.json',JSON.stringify({typescript:ts.version,records,bodyExecution:false,projectTypecheck:false,qualification:'Raw isolated diagnostics retained. Opaque authoritative Node/Electron/schema/profile types are not standalone compilation; dependencies parsed for stripped declarations/selected static fields, implementation bodies never delivered.'},null,2)+'\n');
console.log(JSON.stringify(records.map(r=>({path:r.path,diagnostics:r.diagnostics})),null,2));
