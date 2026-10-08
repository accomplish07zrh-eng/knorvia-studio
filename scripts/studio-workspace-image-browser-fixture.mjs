// SPDX-License-Identifier: Apache-2.0
// Compile the real review card and product Tailwind CSS for browser assertions.
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { build } from "esbuild";

export async function compileWorkspaceImageBrowser() {
  const uiRoot = resolve("packages/ui/src");
  const source = (
    await build({
      stdin: {
        resolveDir: process.cwd(),
        sourcefile: "workspace-image-browser.tsx",
        loader: "tsx",
        contents: `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {StudioWorkspaceReviewCard} from './packages/ui/src/studio/runtime/StudioWorkspaceReviewCard.tsx';
import {studioReviewedImageVersions} from './packages/ui/src/studio/runtime/studioWorkspaceImageVersions.ts';
import {KnorviaIntlProvider} from './packages/ui/src/i18n/IntlProvider.tsx';
const initial=await(await fetch('/initial')).json();
const services=Object.fromEntries(['one','two','three'].map(host=>[host,{async workspaceChanges(params){const response=await fetch('/changes?host='+host,{method:'POST',body:JSON.stringify(params)});const value=await response.json();if(!response.ok)throw new Error(value.error);return value;},async applyWorkspaceChanges(params){const response=await fetch('/apply?host='+host,{method:'POST',body:JSON.stringify(params)});const value=await response.json();if(!response.ok)throw new Error(value.error);return value;}}]));
window.__brokenImages=[];document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)window.__brokenImages.push({complete:event.target.complete,width:event.target.naturalWidth,height:event.target.naturalHeight});},true);
function App(){const[host,setHost]=useState('one');const[run,setRun]=useState('original');const[index,setIndex]=useState(0);const[data,setData]=useState(initial);const[error,setError]=useState('');const change=data[host][run].filter(item=>/\\.(png|jpg)$/.test(item.path))[index];const service=services[host];return <KnorviaIntlProvider initialLocale="en-US"><nav>{['images/sample.png','other/sample.png','added.png','deleted.png','broken.png','broken.jpg','decode-error.png','animated.png','oriented.jpg','huge.png','huge.jpg'].map(path=><button key={path} onClick={()=>{setHost('one');setRun('original');setIndex(data.one.original.filter(item=>/\\.(png|jpg)$/.test(item.path)).findIndex(item=>item.path===path));setError('');}}>{path}</button>)}<button onClick={()=>{setRun('second-run');setHost('one');setIndex(0);setError('');}}>Second run</button><button onClick={()=>{setHost('two');setRun('original');setIndex(0);setError('');}}>Other Host</button><button onClick={()=>{setHost('three');setRun('original');setIndex(0);setError('');}}>Matching Host</button><button onClick={()=>{setHost('one');setRun('original');setIndex(data.one.original.filter(item=>/\\.(png|jpg)$/.test(item.path)).findIndex(item=>item.path==='images/sample.png'));setError('');}}>Original run</button></nav>{error&&<p role="alert">{error}</p>}<StudioWorkspaceReviewCard key={change.path} change={change} zh={false} busy={false} applying={false} selected={false} onToggle={()=>{}} imageContext={{service,runId:run,stepId:'step'}} onApply={async()=>{try{await service.applyWorkspaceChanges({runId:run,stepId:'step',paths:[change.path],reviewedVersions:studioReviewedImageVersions([change],[change.path])});const changes=await service.workspaceChanges({runId:run,stepId:'step'});setData(previous=>({...previous,[host]:{...previous[host],[run]:changes}}));setError('');}catch(error){setError(error.message);}}}/></KnorviaIntlProvider>;}createRoot(document.getElementById('root')).render(<App/>);`,
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      jsx: "automatic",
      tsconfig: "packages/ui/tsconfig.json",
      logLevel: "silent",
      plugins: [
        {
          name: "image-platform-fixture",
          setup(builder) {
            builder.onResolve({ filter: /store\/StoreProvider\.js$/ }, () => ({
              path: "store",
              namespace: "image-fixture",
            }));
            builder.onLoad({ filter: /.*/, namespace: "image-fixture" }, () => ({
              contents: `export function useKnorviaStore(select){return select({theme:'dark',codePreviewSettings:{fontSizePx:12,lightTheme:'github-light',darkTheme:'github-dark'}});}`,
              loader: "js",
            }));
            builder.onResolve({ filter: /^@\// }, (args) =>
              builder.resolve(resolve(uiRoot, args.path.slice(2)), {
                kind: args.kind,
                resolveDir: uiRoot,
              }),
            );
          },
        },
      ],
    })
  ).outputFiles[0].text;
  const webRequire = createRequire(resolve("packages/web/package.json"));
  const tailwindRequire = createRequire(webRequire.resolve("@tailwindcss/vite"));
  const { compile } = await import(tailwindRequire.resolve("@tailwindcss/node"));
  const { Scanner } = await import(tailwindRequire.resolve("@tailwindcss/oxide"));
  const scanner = new Scanner({
    sources: [{ base: uiRoot, pattern: "**/*.{ts,tsx}", negated: false }],
  });
  const compiler = await compile(await fs.readFile(join(uiRoot, "styles.css"), "utf8"), {
    base: uiRoot,
    onDependency: () => {},
  });
  const css = compiler.build(scanner.scan());
  return { source, css };
}
