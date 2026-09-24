import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Self-contained, offline review artifact; imports the production drawing and motion controller.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = process.argv[2];
if (!destination) throw new Error("Pass an output .html path");
const entry = `
import React, {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {KnorviaMark} from './packages/ui/src/components/knorvia/KnorviaMark.tsx';
import {useKnorviaMotion} from './packages/ui/src/components/knorvia/useKnorviaMotion.ts';
function LiveMark({mode,large=false}){
 const ref=useRef(null);
 const rig=useKnorviaMotion(ref,mode);
 return <button ref={ref} className={'bot '+(large?'large':'corner')} aria-label="和 Knorvia 打个招呼"
   onPointerDown={e=>e.preventDefault()}><KnorviaMark companion rig={rig}/></button>;
}
function Preview(){
 const [dark,setDark]=useState(false),[mode,setMode]=useState('animated'),[details,setDetails]=useState(false);
 return <main data-theme={dark?'dark':'light'}>
  <header><div><strong>Knorvia</strong><span>形象与动效预览 · 草案 03</span></div>
    <nav><button onClick={()=>setDetails(!details)}>{details?'返回布局':'看形象细节'}</button>
    <button onClick={()=>setMode(mode==='animated'?'still':'animated')}>{mode==='animated'?'暂停动效':'开启动效'}</button>
    <button onClick={()=>setDark(!dark)}>{dark?'浅色背景':'深色背景'}</button></nav></header>
  <div className="workspace">
   <aside><div className="back">← <span>→</span><span className="search">⌕</span></div>
    <div className="nav-item selected"><span>＋</span>新建任务<small>Ctrl+N</small></div>
    <div className="nav-item"><span>◷</span>自动化</div><div className="nav-item"><span>⌘</span>工作流</div>
    <div className="tabs"><span>单聊</span><span>群聊</span></div>
    <div className="kernel"><KnorviaMark/>Knorvia<span>⌄</span></div>
    <p className="empty">暂无任务</p><div className="brand">Knorvia Studio <span>⚙</span></div>
   </aside>
   <section className="stage" data-knorvia-scope="true">
    <div className="windowbar"><span>{details?'形象细节':'新建任务'}</span><span>···</span></div>
    {details ? <section className="details"><LiveMark mode={mode} large/>
      <h1>Knorvia</h1><p>柔和轮廓 · 白色眼睛 · 轻轻回应</p>
      <div className="icons"><span>应用内图标</span>{[20,32,48].map(size=><div key={size} style={{'--icon-size':size+'px'}}><KnorviaMark className="static"/><small>{size}px</small></div>)}</div>
     </section> : <>
      <div className="draft"><div className="chat"><h1>今天，我们来做点什么？</h1>
       <div className="composer" data-composer-surface="true">
        <div className="project"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h7l2 2h9v11H3z"/></svg> 选择项目 <span>⌄</span></div>
        <div className="input"><textarea aria-label="试着输入" placeholder="向 Knorvia Studio 提问…"/>
         <div className="toolbar"><span>＋</span><span>变更前确认⌄</span><span className="model">管理模型⌄</span><span className="send">↑</span></div>
        </div>
       </div>
      </div></div>
      <div className="companion-dock"><LiveMark mode={mode}/></div>
     </>}
   </section>
  </div>
  <footer>移动鼠标、输入文字，或点点右下角的小助手。预览中的文字不会发送；K 图标在形象确定后同步。</footer>
 </main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);`;
const output = await build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: "knorvia-mascot-preview.tsx",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  minify: true,
  jsx: "automatic",
  tsconfig: path.join(root, "packages/ui/tsconfig.json"),
  alias: { "@": path.join(root, "packages/ui/src") },
  define: { "process.env.NODE_ENV": '"production"' },
});
const css = `
*{box-sizing:border-box}body{margin:0;font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;color:#202124;background:#f5f5f5}button,textarea{font:inherit}button{cursor:pointer}button:focus-visible{outline:2px solid #757b87;outline-offset:4px}
main{--paper:#f7f7f8;--card:#fff;--side:#eeeeef;--ink:#242629;--muted:#888b91;--border:#e6e7e9;min-height:100dvh;background:var(--paper);color:var(--ink);padding:20px 24px 14px}
main[data-theme=dark]{--paper:#16171a;--card:#202125;--side:#1b1c20;--ink:#edeef0;--muted:#9297a1;--border:#33353c}
header{height:36px;display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:16px}header>div{display:flex;align-items:center;gap:14px}header strong{font-size:16px;font-weight:600}header span,footer{color:var(--muted)}nav{display:flex;gap:8px}nav button{border:1px solid var(--border);color:var(--ink);background:var(--card);padding:7px 10px;border-radius:7px;font-size:12px}
.workspace{display:flex;height:calc(100dvh - 122px);min-height:470px;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--card)}aside{width:196px;flex-shrink:0;background:var(--side);padding:18px 14px;display:flex;flex-direction:column;font-size:13px}.back{display:flex;gap:18px;font-size:18px;color:var(--muted);margin:0 4px 20px}.search{margin-left:auto}.nav-item{height:37px;display:flex;align-items:center;gap:10px;padding:0 6px}.nav-item>span{font-size:19px;font-weight:300;width:18px}.nav-item small{margin-left:auto;color:var(--muted);font-size:10px}.tabs{display:flex;border-radius:7px;background:var(--border);margin:16px 0 12px;padding:3px;gap:3px}.tabs span{width:50%;text-align:center;font-size:12px;padding:5px}.tabs span:first-child{background:var(--card);border-radius:5px}.kernel{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--card);border:1px solid var(--border);border-radius:7px}.kernel svg{width:19px;height:19px}.kernel>span{margin-left:auto;color:var(--muted)}.empty{color:var(--muted);font-size:12px;padding:6px}.brand{margin-top:auto;font-size:14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}.brand span{font-size:18px;font-weight:400}
.stage{position:relative;display:flex;flex-direction:column;flex:1;min-width:0;min-height:0}.windowbar{display:flex;justify-content:space-between;align-items:center;min-height:44px;padding:0 20px;font-size:12px}.windowbar>span:last-child{font-size:18px;color:var(--muted)}.draft{flex:1;min-height:0;overflow:auto;display:flex;align-items:center;padding:34px}.chat{width:min(100%,680px);margin:auto}.chat h1{text-align:center;font-size:24px;font-weight:400;margin:0 0 46px}.composer{position:relative;border-radius:17px;background:var(--paper);padding-top:1px;box-shadow:0 12px 26px #00000005}.project{display:flex;align-items:center;gap:7px;height:36px;padding:0 14px;font-size:12px}.project span{color:var(--muted)}.input{border:1px solid var(--border);border-radius:17px;background:var(--card);padding:14px}.input:focus-within{border-color:#abb1b7}textarea{display:block;width:100%;height:72px;background:transparent;color:var(--ink);resize:vertical;min-height:48px;max-height:150px;border:0;outline:0;font-size:14px;line-height:1.6}textarea::placeholder{color:var(--muted)}.toolbar{display:flex;align-items:center;gap:14px;font-size:12px;padding-top:4px}.toolbar>span:first-child{font-size:22px}.model{margin-left:auto}.send{display:grid;place-items:center;width:27px;height:27px;border-radius:7px;background:var(--muted);color:var(--card);font-size:20px}
.companion-dock{display:flex;justify-content:flex-end;align-items:flex-end;height:80px;flex-shrink:0;padding:0 16px 4px;pointer-events:none}.bot{border:0;background:transparent;padding:0;line-height:0;border-radius:12px;color:inherit;outline:none;pointer-events:auto}.bot svg{display:block;width:100%;overflow:visible;pointer-events:none}.corner{width:80px;flex-shrink:0}.details{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px}.large{width:210px;flex-shrink:0}.details h1{font-size:18px;letter-spacing:.02em;font-weight:500;margin:6px 0 8px}.details>p{font-size:12px;color:var(--muted);margin:0}.icons{display:flex;align-items:center;justify-content:center;gap:24px;margin:40px auto 12px}.icons>span{font-size:12px;color:var(--muted)}.icons>div{display:flex;align-items:center;gap:8px}.icons small{font-size:11px;color:var(--muted)}.static{display:block;width:var(--icon-size);height:var(--icon-size)}footer{text-align:center;font-size:11px;line-height:1.6;margin-top:14px}
@media(max-width:720px){main{padding:12px}header{height:auto;gap:8px;align-items:flex-start}header>div{display:block}header span{display:block;font-size:10px;margin-top:4px}nav{gap:4px}nav button{padding:6px;font-size:11px}aside{display:none}.workspace{height:calc(100dvh - 122px)}.draft{padding:22px}.chat h1{font-size:20px;margin-bottom:32px}.corner{width:72px}.icons{gap:14px}.icons>div{gap:5px}}
@media(prefers-reduced-motion:reduce){main{transition:none}}
`;
await fs.mkdir(path.dirname(path.resolve(destination)), { recursive: true });
await fs.writeFile(
  destination,
  `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Knorvia · 形象与动效预览</title><style>${css}</style><div id="root"></div><script>${output.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></html>`,
  "utf8",
);
console.log(
  JSON.stringify({
    destination: path.resolve(destination),
    offline: true,
    productionComponents: true,
  }),
);
